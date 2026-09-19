import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {
  claimListingAiAttempt,
  markListingAiAttemptUnknown,
} from '../src/listing_ai_attempt_workflow.js';
import { createPostgresListingAiBudgetGuard } from '../src/listing_ai_budget_guard.js';

const { Client } = pg;

test('WP260-D PostgreSQL attempt, reservation and unknown replay are owner-bound', async () => {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const userId = `wp260d-user-${suffix}`;
  const draftId = `listing_ai_draft_${suffix.slice(0, 8)}-1234-4123-8123-${suffix.slice(8, 20)}`;
  const generationKey = 'a'.repeat(64);
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (id, email, profile) VALUES ($1, $2, '{}'::jsonb)`,
      [userId, `${userId}@example.invalid`],
    );
    await client.query(
      `INSERT INTO listing_ai_drafts (
         id, domain_version, schema_version, prompt_version, owner_id
       ) VALUES ($1, 'N2-2026-08-23.1', 'listing-ai-draft-v1',
                 'listing-ai-prompt-v1', $2)`,
      [draftId, userId],
    );
    await client.query(
      `INSERT INTO listing_ai_budget_aggregates
        (period_key, provider, budget_cents, spent_cents, reserved_cents,
         call_count, reserved_calls)
       VALUES ('lifetime', 'openai', 10000, 0, 0, 0, 0)`,
    );
    const images = [{ imageReference: 'listing_image_12345678', sha256: 'b'.repeat(64), byteSize: 12 }];
    await assert.rejects(
      claimListingAiAttempt(client, {
        draftId,
        ownerId: userId,
        generationKey: 'c'.repeat(64),
        model: 'gpt-test',
        consent: { accepted: true, disclosureVersion: 'listing-ai-image-disclosure-v1' },
        images,
        maxCostCents: 12,
        maxCallCount: 6,
        budgetCents: 10000,
      }),
      (error) => error.code === 'listing_ai_attempt_cost_bound_invalid',
    );
    const first = await claimListingAiAttempt(client, {
      draftId,
      ownerId: userId,
      generationKey,
      model: 'gpt-test',
      consent: { accepted: true, disclosureVersion: 'listing-ai-image-disclosure-v1' },
      images,
      maxCostCents: 4,
      maxCallCount: 2,
      budgetCents: 10000,
    });
    assert.equal(first.claimed, true);
    assert.equal(first.status, 'reserved');
    const aggregate = await client.query(
      `SELECT reserved_cents, reserved_calls FROM listing_ai_budget_aggregates
        WHERE period_key = 'lifetime' AND provider = 'openai'`,
    );
    assert.deepEqual(aggregate.rows[0], { reserved_cents: 4, reserved_calls: 2 });
    const staleKey = 'd'.repeat(64);
    const staleFirst = await claimListingAiAttempt(client, {
      draftId,
      ownerId: userId,
      generationKey: staleKey,
      model: 'gpt-test',
      consent: { accepted: true, disclosureVersion: 'listing-ai-image-disclosure-v1' },
      images,
      maxCostCents: 2,
      maxCallCount: 1,
      budgetCents: 10000,
      leaseMs: 1,
    });
    await client.query(
      `UPDATE listing_ai_analysis_attempts SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
      [staleFirst.attemptId],
    );
    const staleReclaimed = await claimListingAiAttempt(client, {
      draftId,
      ownerId: userId,
      generationKey: staleKey,
      model: 'gpt-test',
      consent: { accepted: true, disclosureVersion: 'listing-ai-image-disclosure-v1' },
      images,
      maxCostCents: 2,
      maxCallCount: 1,
      budgetCents: 10000,
    });
    assert.equal(staleReclaimed.claimed, true);
    const guard = createPostgresListingAiBudgetGuard({ client, budgetCents: 10000 });
    const held = await guard.reserve(2, { attemptId: first.attemptId });
    await held.settle(2);
    const duplicate = await claimListingAiAttempt(client, {
      draftId, ownerId: userId, generationKey, model: 'gpt-test',
      consent: { accepted: true, disclosureVersion: 'listing-ai-image-disclosure-v1' },
      images, maxCostCents: 4, maxCallCount: 2, budgetCents: 10000,
    });
    assert.equal(duplicate.pending, true);
    await assert.rejects(
      claimListingAiAttempt(client, {
        draftId, ownerId: 'foreign-owner', generationKey, model: 'gpt-test',
        consent: { accepted: true, disclosureVersion: 'listing-ai-image-disclosure-v1' },
        images, maxCostCents: 4, maxCallCount: 2, budgetCents: 10000,
      }),
      (error) => error.code === 'listing_ai_attempt_payload_conflict',
    );
    await markListingAiAttemptUnknown(client, {
      attemptId: first.attemptId,
      ownerId: userId,
      providerCallCount: 1,
      estimatedCostCents: null,
      billedCostCents: null,
      result: { status: 'unknown' },
    });
    const blocked = await claimListingAiAttempt(client, {
      draftId, ownerId: userId, generationKey, model: 'gpt-test',
      consent: { accepted: true, disclosureVersion: 'listing-ai-image-disclosure-v1' },
      images, maxCostCents: 4, maxCallCount: 2, budgetCents: 10000,
    });
    assert.equal(blocked.retryBlocked, true);
    await assert.rejects(
      markListingAiAttemptUnknown(client, {
        attemptId: first.attemptId, ownerId: userId, providerCallCount: 1,
        estimatedCostCents: null, billedCostCents: null, result: { status: 'different' },
      }),
      (error) => error.code === 'listing_ai_attempt_finalize_conflict',
    );
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
});
