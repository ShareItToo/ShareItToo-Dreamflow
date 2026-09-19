import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {
  claimListingAiAttempt,
  markListingAiAttemptFailed,
  markListingAiAttemptUnknown,
} from '../src/listing_ai_attempt_workflow.js';
import { createPostgresListingAiBudgetGuard } from '../src/listing_ai_budget_guard.js';

const { Client, Pool } = pg;

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
    const charged = await client.query(
      `SELECT spent_cents, reserved_cents, call_count, reserved_calls
         FROM listing_ai_budget_aggregates
        WHERE period_key = 'lifetime' AND provider = 'openai'`,
    );
    assert.deepEqual(charged.rows[0], {
      spent_cents: 4,
      reserved_cents: 2,
      call_count: 2,
      reserved_calls: 1,
    });
    const identicalFinalize = await markListingAiAttemptUnknown(client, {
      attemptId: first.attemptId,
      ownerId: userId,
      providerCallCount: 1,
      estimatedCostCents: null,
      billedCostCents: null,
      result: { status: 'unknown' },
    });
    assert.equal(identicalFinalize.status, 'unknown');
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

test('WP260-D independent clients prove one claim, bounded calls, lost COMMIT recovery and stale reclaim', async () => {
  const setup = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const poolA = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  const poolB = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const userId = `wp260d-concurrent-user-${suffix}`;
  const draftId = `listing_ai_draft_${suffix.slice(0, 8)}-1234-4123-8123-${suffix.slice(8, 20)}`;
  const images = [{ imageReference: 'listing_image_concurrent', sha256: 'c'.repeat(64), byteSize: 12 }];
  const consent = { accepted: true, disclosureVersion: 'listing-ai-image-disclosure-v1' };
  const base = { draftId, ownerId: userId, model: 'gpt-test', consent, images, budgetCents: 10000 };
  const generation = (letter) => letter.repeat(64);
  const aggregateLockKey = 'listing_ai_budget_aggregates:lifetime:openai:wp260d';
  let priorAggregate = null;
  let aggregateCreatedByTest = false;
  const committedClaim = async (pool, input) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await claimListingAiAttempt(client, input);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  const finalizeUnknown = async (pool, attemptId, result = { status: 'unknown' }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const value = await markListingAiAttemptUnknown(client, {
        attemptId, ownerId: userId, providerCallCount: 1,
        estimatedCostCents: null, billedCostCents: null, result,
      });
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  const finalizeFailed = async (pool, attemptId) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await markListingAiAttemptFailed(client, {
        attemptId, ownerId: userId, result: { status: 'failed' },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  try {
    await setup.connect();
    await setup.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [aggregateLockKey]);
    await setup.query('BEGIN');
    await setup.query(
      `INSERT INTO users (id, email, profile) VALUES ($1, $2, '{}'::jsonb)`,
      [userId, `${userId}@example.invalid`],
    );
    await setup.query(
      `INSERT INTO listing_ai_drafts (
         id, domain_version, schema_version, prompt_version, owner_id
       ) VALUES ($1, 'N2-2026-08-23.1', 'listing-ai-draft-v1',
                 'listing-ai-prompt-v1', $2)`,
      [draftId, userId],
    );
    priorAggregate = (await setup.query(
      `SELECT budget_cents, spent_cents, reserved_cents, call_count, reserved_calls,
              updated_at::text AS updated_at_text
         FROM listing_ai_budget_aggregates
        WHERE period_key = 'lifetime' AND provider = 'openai'`,
    )).rows[0];
    if (!priorAggregate) {
      aggregateCreatedByTest = true;
      await setup.query(
        `INSERT INTO listing_ai_budget_aggregates
          (period_key, provider, budget_cents, spent_cents, reserved_cents, call_count, reserved_calls)
         VALUES ('lifetime', 'openai', 10000, 0, 0, 0, 0)`,
      );
    }
    // Exercise the shared allowance from a deterministic baseline; restore
    // the exact prior row while the session-level advisory lock is held.
    await setup.query(
      `UPDATE listing_ai_budget_aggregates
          SET budget_cents = 10000, spent_cents = 0, reserved_cents = 0,
              call_count = 0, reserved_calls = 0, updated_at = now()
        WHERE period_key = 'lifetime' AND provider = 'openai'`,
    );
    await setup.query('COMMIT');

    const shared = { ...base, generationKey: generation('e'), maxCostCents: 4, maxCallCount: 2 };
    const concurrent = await Promise.all([
      committedClaim(poolA, shared),
      committedClaim(poolB, shared),
    ]);
    assert.equal(concurrent.filter((entry) => entry.claimed).length, 1);
    assert.equal(concurrent.filter((entry) => entry.pending).length, 1);
    const sharedAttempt = concurrent.find((entry) => entry.attemptId).attemptId;
    const sharedCounts = await setup.query(
      `SELECT count(*)::int AS attempts FROM listing_ai_analysis_attempts
        WHERE draft_id = $1 AND generation_key = $2`, [draftId, generation('e')],
    );
    assert.equal(sharedCounts.rows[0].attempts, 1);

    const bounded = await committedClaim(poolA, {
      ...base, generationKey: generation('f'), maxCostCents: 10, maxCallCount: 5,
    });
    assert.equal(bounded.claimed, true);
    const guardA = createPostgresListingAiBudgetGuard({ client: poolA, budgetCents: 10000 });
    const guardB = createPostgresListingAiBudgetGuard({ client: poolB, budgetCents: 10000 });
    const handles = await Promise.all(
      Array.from({ length: 5 }, (_, index) => (index % 2 === 0 ? guardA : guardB)
        .reserve(2, { attemptId: bounded.attemptId })),
    );
    await Promise.all(handles.map((handle) => handle.settle(2)));
    await assert.rejects(
      guardA.reserve(2, { attemptId: bounded.attemptId }),
      (error) => error.code === 'listing_ai_budget_exhausted',
    );
    const boundedReservation = await setup.query(
      `SELECT reserved_calls, consumed_calls, consumed_cents
         FROM listing_ai_budget_reservations WHERE attempt_id = $1`, [bounded.attemptId],
    );
    assert.deepEqual(boundedReservation.rows[0], {
      reserved_calls: 5, consumed_calls: 5, consumed_cents: 10,
    });

    const lost = await committedClaim(poolA, {
      ...base, generationKey: generation('a'), maxCostCents: 4, maxCallCount: 2,
    });
    assert.equal(lost.claimed, true);
    const lostCommitPool = {
      totalCount: 1,
      query(...args) { return poolB.query(...args); },
      async connect() {
        const client = await poolB.connect();
        const originalQuery = client.query.bind(client);
        const originalRelease = client.release.bind(client);
        let loseCommitResponse = true;
        client.query = async (sql, ...args) => {
          const result = await originalQuery(sql, ...args);
          if (loseCommitResponse && sql === 'COMMIT') {
            loseCommitResponse = false;
            throw new Error('simulated lost COMMIT response');
          }
          return result;
        };
        client.release = (...args) => {
          client.query = originalQuery;
          return originalRelease(...args);
        };
        return client;
      },
    };
    const lostGuard = createPostgresListingAiBudgetGuard({ client: lostCommitPool, budgetCents: 10000 });
    await assert.rejects(
      lostGuard.reserve(2, { attemptId: lost.attemptId }),
      (error) => error.code === 'listing_ai_attempt_reservation_commit_unknown',
    );
    const lostReadback = await setup.query(
      `SELECT attempt.status, reservation.status AS reservation_status,
              reservation.consumed_cents, reservation.consumed_calls
         FROM listing_ai_analysis_attempts AS attempt
         JOIN listing_ai_budget_reservations AS reservation ON reservation.attempt_id = attempt.id
        WHERE attempt.id = $1`, [lost.attemptId],
    );
    assert.deepEqual(lostReadback.rows[0], {
      status: 'egress_started', reservation_status: 'active', consumed_cents: 2, consumed_calls: 1,
    });
    const lostAggregateBeforeFinalize = (await setup.query(
      `SELECT spent_cents, reserved_cents, call_count, reserved_calls
         FROM listing_ai_budget_aggregates
        WHERE period_key = 'lifetime' AND provider = 'openai'`,
    )).rows[0];
    await finalizeUnknown(poolA, lost.attemptId);
    const lostAggregateAfterFinalize = (await setup.query(
      `SELECT spent_cents, reserved_cents, call_count, reserved_calls
         FROM listing_ai_budget_aggregates
        WHERE period_key = 'lifetime' AND provider = 'openai'`,
    )).rows[0];
    assert.deepEqual(lostAggregateAfterFinalize, {
      spent_cents: lostAggregateBeforeFinalize.spent_cents + 4,
      reserved_cents: lostAggregateBeforeFinalize.reserved_cents - 4,
      call_count: lostAggregateBeforeFinalize.call_count + 2,
      reserved_calls: lostAggregateBeforeFinalize.reserved_calls - 2,
    });
    const replay = await finalizeUnknown(poolB, lost.attemptId);
    assert.equal(replay.status, 'unknown');
    const lostAggregateAfterReplay = (await setup.query(
      `SELECT spent_cents, reserved_cents, call_count, reserved_calls
         FROM listing_ai_budget_aggregates
        WHERE period_key = 'lifetime' AND provider = 'openai'`,
    )).rows[0];
    assert.deepEqual(lostAggregateAfterReplay, lostAggregateAfterFinalize);

    const rollback = await committedClaim(poolA, {
      ...base, generationKey: generation('b'), maxCostCents: 4, maxCallCount: 2,
    });
    assert.equal(rollback.claimed, true);
    const rollbackPool = {
      totalCount: 1,
      query(...args) { return poolB.query(...args); },
      async connect() {
        const client = await poolB.connect();
        const originalQuery = client.query.bind(client);
        const originalRelease = client.release.bind(client);
        client.query = async (sql, ...args) => {
          if (sql.startsWith('UPDATE listing_ai_budget_reservations')) {
            throw new Error('simulated failure before COMMIT');
          }
          return originalQuery(sql, ...args);
        };
        client.release = (...args) => {
          client.query = originalQuery;
          return originalRelease(...args);
        };
        return client;
      },
    };
    const rollbackGuard = createPostgresListingAiBudgetGuard({ client: rollbackPool, budgetCents: 10000 });
    await assert.rejects(
      rollbackGuard.reserve(2, { attemptId: rollback.attemptId }),
      (error) => error.code === 'listing_ai_attempt_reservation_commit_unknown',
    );
    const rollbackReadback = await setup.query(
      `SELECT attempt.status, reservation.consumed_cents, reservation.consumed_calls
         FROM listing_ai_analysis_attempts AS attempt
         JOIN listing_ai_budget_reservations AS reservation ON reservation.attempt_id = attempt.id
        WHERE attempt.id = $1`, [rollback.attemptId],
    );
    assert.deepEqual(rollbackReadback.rows[0], {
      status: 'reserved', consumed_cents: 0, consumed_calls: 0,
    });
    await setup.query(
      `UPDATE listing_ai_analysis_attempts SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
      [rollback.attemptId],
    );
    const reclaimed = await committedClaim(poolB, {
      ...base, generationKey: generation('b'), maxCostCents: 4, maxCallCount: 2,
    });
    assert.equal(reclaimed.claimed, true);
    await finalizeFailed(poolA, rollback.attemptId);
  } finally {
    await setup.query('ROLLBACK').catch(() => {});
    await setup.query(
      `DELETE FROM listing_ai_cost_ledger
        WHERE provider = 'openai' AND generation_key = ANY($1::text[])`,
      [[generation('e'), generation('f'), generation('a'), generation('b')]],
    ).catch(() => {});
    await setup.query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
    if (priorAggregate) {
      await setup.query('BEGIN').catch(() => {});
      await setup.query(
        `UPDATE listing_ai_budget_aggregates
            SET budget_cents = $1, spent_cents = $2, reserved_cents = $3,
                call_count = $4, reserved_calls = $5, updated_at = $6
          WHERE period_key = 'lifetime' AND provider = 'openai'`,
        [priorAggregate.budget_cents, priorAggregate.spent_cents, priorAggregate.reserved_cents,
          priorAggregate.call_count, priorAggregate.reserved_calls, priorAggregate.updated_at_text],
      ).catch(() => {});
      await setup.query('COMMIT').catch(() => {});
    } else if (aggregateCreatedByTest) {
      await setup.query(
        `DELETE FROM listing_ai_budget_aggregates
          WHERE period_key = 'lifetime' AND provider = 'openai'`,
      ).catch(() => {});
    }
    await setup.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [aggregateLockKey]).catch(() => {});
    await setup.end().catch(() => {});
    await poolA.end().catch(() => {});
    await poolB.end().catch(() => {});
  }
});
