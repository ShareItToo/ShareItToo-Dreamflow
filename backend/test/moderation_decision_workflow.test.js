import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ModerationDomainError,
  moderationReviewDeadline,
  normalizeModerationDecisionInput,
} from '../src/moderation_domain.js';
import {
  claimModerationReviewRequest,
  resolveModerationReviewRequest,
  setPrivateMarketplaceReviewStatus,
  submitModerationReviewRequest,
} from '../src/moderation_decision_workflow.js';
import { applyModerationReviewCorrection } from '../src/moderation_review_correction_workflow.js';

test('moderation review deadline is six calendar months with end-of-month clamping', () => {
  assert.equal(
    moderationReviewDeadline('2026-08-31T12:30:00Z').toISOString(),
    '2027-02-28T12:30:00.000Z',
  );
  assert.equal(
    moderationReviewDeadline('2026-10-30T08:00:00Z').toISOString(),
    '2027-04-30T08:00:00.000Z',
  );
});

test('reasoned decisions disclose human or automated detection truthfully', () => {
  assert.deepEqual(normalizeModerationDecisionInput({
    facts: 'Der dokumentierte Testfall wurde geprüft.',
    basis: 'Community-Regel 4.2',
    reasoning: 'Die protokollierten Tatsachen erfüllen die Regel.',
    detectionMethod: 'human',
  }), {
    facts: 'Der dokumentierte Testfall wurde geprüft.',
    basis: 'Community-Regel 4.2',
    reasoning: 'Die protokollierten Tatsachen erfüllen die Regel.',
    detectionMethod: 'human',
    automatedMeans: null,
  });
  assert.throws(
    () => normalizeModerationDecisionInput({
      facts: 'Dokumentierter Testfall',
      basis: 'Community-Regel 4.2',
      reasoning: 'Regel wurde erfüllt.',
      detectionMethod: 'automated',
    }),
    (error) => error instanceof ModerationDomainError
      && error.code === 'moderation_automated_means_required',
  );
});

function scriptedClient(steps) {
  return {
    async query(statement, values = []) {
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${statement}`);
      assert.match(statement, step.pattern);
      if (step.assertValues) step.assertValues(values);
      return step.result;
    },
  };
}

test('only the recipient may request one reasoned review inside the six-month window', async () => {
  const decision = {
    id: 'decision-1',
    recipient_user_id: 'user-1',
    review_available: true,
    review_deadline_at: '2099-02-28T12:30:00Z',
  };
  const submittedAt = new Date('2026-08-20T12:00:00Z');
  const client = scriptedClient([
    { pattern: /WHERE idempotency_key = \$1/u, result: { rowCount: 0, rows: [] } },
    { pattern: /FROM moderation_decisions WHERE id::text = \$1 FOR UPDATE/u, result: { rowCount: 1, rows: [decision] } },
    { pattern: /FROM moderation_review_requests WHERE decision_id = \$1/u, result: { rowCount: 0, rows: [] } },
    {
      pattern: /INSERT INTO moderation_review_requests/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'review-1', decision_id: decision.id, status: 'submitted',
          reason: 'Bitte berücksichtigen Sie den beigefügten Kontext.',
          submitted_at: submittedAt, resolved_at: null, resolution: null,
        }],
      },
    },
    { pattern: /INSERT INTO moderation_review_events/u, result: { rowCount: 1, rows: [] } },
    { pattern: /INSERT INTO audit_log/u, result: { rowCount: 1, rows: [] } },
  ]);
  const result = await submitModerationReviewRequest(client, {
    actor: { id: 'user-1', role: 'user' },
    decisionId: decision.id,
    raw: { reason: 'Bitte berücksichtigen Sie den beigefügten Kontext.' },
    idempotencyKey: 'review-1',
  });
  assert.equal(result.reviewRequest.decisionId, decision.id);
  assert.equal(result.reviewRequest.status, 'submitted');

  const forbiddenClient = scriptedClient([
    { pattern: /WHERE idempotency_key = \$1/u, result: { rowCount: 0, rows: [] } },
    { pattern: /FROM moderation_decisions WHERE id::text = \$1 FOR UPDATE/u, result: { rowCount: 1, rows: [decision] } },
  ]);
  await assert.rejects(
    submitModerationReviewRequest(forbiddenClient, {
      actor: { id: 'user-2', role: 'user' },
      decisionId: decision.id,
      raw: { reason: 'Unzulässiger fremder Prüfungsantrag.' },
      idempotencyKey: 'review-2',
    }),
    (error) => error.code === 'moderation_decision_forbidden',
  );
});

test('moderation persistence is user-bound, append-only and never auto-mutates a measure', () => {
  const migration = readFileSync(
    new URL('../sql/migrations/026_v52_categories_moderation_operator.up.sql', import.meta.url),
    'utf8',
  );
  const workflow = readFileSync(
    new URL('../src/moderation_decision_workflow.js', import.meta.url),
    'utf8',
  );
  for (const table of [
    'private_marketplace_review_events',
    'moderation_decisions',
    'moderation_review_events',
  ]) {
    assert.match(
      migration,
      new RegExp(`CREATE TRIGGER ${table}_append_only[\\s\\S]*?ON ${table}`, 'u'),
    );
  }
  assert.match(migration, /recipient_user_id TEXT NOT NULL/u);
  assert.match(migration, /review_deadline_at TIMESTAMPTZ/u);
  assert.match(workflow, /moderation_review_correction_not_applied/u);
  assert.match(workflow, /WHERE decision\.recipient_user_id = \$1/u);
});

test('private marketplace review replay returns the status recorded by the idempotent event', async () => {
  const client = scriptedClient([
    {
      pattern: /SELECT user_id, to_status[\s\S]*private_marketplace_review_events/u,
      result: { rowCount: 1, rows: [{ user_id: 'user-1', to_status: 'blocked' }] },
    },
    {
      pattern: /FROM users WHERE id = \$1[\s\S]*FOR UPDATE/u,
      result: {
        rowCount: 1,
        rows: [{ id: 'user-1', role: 'user', private_marketplace_review_status: 'clear' }],
      },
    },
  ]);
  const result = await setPrivateMarketplaceReviewStatus(client, {
    actor: { id: 'admin-1', role: 'admin' },
    userId: 'user-1',
    raw: {
      status: 'blocked',
      reasonCode: 'risk.review',
      decision: {},
    },
    idempotencyKey: 'review-event-1',
  });
  assert.deepEqual(result, {
    userId: 'user-1',
    status: 'blocked',
    replayed: true,
  });
});

test('an admin may claim a review only independently from the original issuer', async () => {
  const submittedAt = new Date('2026-08-22T01:00:00Z');
  const client = scriptedClient([
    {
      pattern: /FOR UPDATE OF review/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'review-1',
          decision_id: 'decision-1',
          status: 'submitted',
          assigned_to: null,
          original_issued_by: 'admin-original',
          reason: 'Bitte neu prüfen.',
          submitted_at: submittedAt,
          resolved_at: null,
          resolution: null,
        }],
      },
    },
    { pattern: /FROM moderation_review_events/u, result: { rowCount: 0, rows: [] } },
    {
      pattern: /UPDATE moderation_review_requests/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'review-1',
          decision_id: 'decision-1',
          status: 'in_review',
          assigned_to: 'admin-reviewer',
          reason: 'Bitte neu prüfen.',
          submitted_at: submittedAt,
          resolved_at: null,
          resolution: null,
        }],
      },
    },
    { pattern: /INSERT INTO moderation_review_events/u, result: { rowCount: 1, rows: [] } },
    { pattern: /INSERT INTO audit_log/u, result: { rowCount: 1, rows: [] } },
  ]);
  const result = await claimModerationReviewRequest(client, {
    actor: { id: 'admin-reviewer', role: 'admin' },
    reviewRequestId: 'review-1',
    idempotencyKey: 'claim-1',
  });
  assert.equal(result.reviewRequest.status, 'in_review');
  assert.equal(result.replayed, false);

  const forbidden = scriptedClient([
    {
      pattern: /FOR UPDATE OF review/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'review-2',
          decision_id: 'decision-2',
          status: 'submitted',
          assigned_to: null,
          original_issued_by: 'admin-original',
          reason: 'Bitte neu prüfen.',
          submitted_at: submittedAt,
          resolved_at: null,
          resolution: null,
        }],
      },
    },
    { pattern: /FROM moderation_review_events/u, result: { rowCount: 0, rows: [] } },
  ]);
  await assert.rejects(
    claimModerationReviewRequest(forbidden, {
      actor: { id: 'admin-original', role: 'admin' },
      reviewRequestId: 'review-2',
      idempotencyKey: 'claim-2',
    }),
    (error) => error.code === 'moderation_review_independent_reviewer_required',
  );
});

test('independent human resolution records evidence and requires a real correction', async () => {
  const submittedAt = new Date('2026-08-22T01:00:00Z');
  const resolvedAt = new Date('2026-08-22T02:00:00Z');
  const lockedRow = {
    id: 'review-1',
    decision_id: 'decision-1',
    status: 'in_review',
    assigned_to: 'admin-reviewer',
    original_issued_by: 'admin-original',
    recipient_user_id: 'user-1',
    target_type: 'listing',
    target_id: 'listing-1',
    measure_type: 'listing_restriction',
    measure_state: 'hidden',
    original_idempotency_key: 'moderation.decision:listing.moderation:one:decision',
    decision_created_at: new Date('2026-08-21T23:00:00Z'),
    reason: 'Bitte neu prüfen.',
    submitted_at: submittedAt,
    resolved_at: null,
    resolution: null,
  };
  const client = scriptedClient([
    { pattern: /FROM moderation_review_resolutions AS resolution/u, result: { rowCount: 0, rows: [] } },
    { pattern: /FOR UPDATE OF review/u, result: { rowCount: 1, rows: [lockedRow] } },
    {
      pattern: /INSERT INTO moderation_review_resolutions/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'resolution-1',
          outcome: 'reversed',
          user_facing_reason: 'Die Anzeige wurde nach erneuter Prüfung wiederhergestellt.',
          human_reviewed: true,
          independence_verified: true,
          automation_role: 'none',
          measure_changed: true,
          communicated_at: resolvedAt,
        }],
      },
    },
    {
      pattern: /UPDATE moderation_review_requests/u,
      result: {
        rowCount: 1,
        rows: [{
          ...lockedRow,
          status: 'reversed',
          resolution: 'Die Anzeige wurde nach erneuter Prüfung wiederhergestellt.',
          resolved_at: resolvedAt,
        }],
      },
    },
    { pattern: /INSERT INTO moderation_review_events/u, result: { rowCount: 1, rows: [] } },
    { pattern: /INSERT INTO audit_log/u, result: { rowCount: 1, rows: [] } },
  ]);
  let correctionCalls = 0;
  const result = await resolveModerationReviewRequest(client, {
    actor: { id: 'admin-reviewer', role: 'admin' },
    reviewRequestId: 'review-1',
    raw: {
      status: 'reversed',
      userFacingReason:
        'Die Anzeige wurde nach erneuter Prüfung wiederhergestellt.',
      correction: { targetStatus: 'active' },
    },
    idempotencyKey: 'resolve-1',
    now: resolvedAt,
    applyCorrection: async (_client, correction) => {
      correctionCalls += 1;
      assert.equal(correction.originalDecision.id, 'decision-1');
      return {
        correctionDecisionId: 'decision-correction-1',
        measureChanged: true,
        targetType: 'listing',
        targetId: 'listing-1',
        targetState: 'active',
      };
    },
  });
  assert.equal(correctionCalls, 1);
  assert.equal(result.reviewRequest.resolutionDetails.independent, true);
  assert.equal(result.reviewRequest.resolutionDetails.automationRole, 'none');
  assert.equal(result.measureChanged, true);
  assert.equal(result.correction.targetState, 'active');
});

test('a superseded restriction cannot be corrected through a stale review', async () => {
  const client = scriptedClient([
    {
      pattern: /SELECT moderation_status FROM listings/u,
      result: { rowCount: 1, rows: [{ moderation_status: 'hidden' }] },
    },
    {
      pattern: /SELECT newer\.id/u,
      result: { rowCount: 1, rows: [{ id: 'newer-decision' }] },
    },
  ]);
  await assert.rejects(
    applyModerationReviewCorrection(client, {
      actor: { id: 'admin-reviewer', role: 'admin' },
      outcome: 'reversed',
      originalDecision: {
        id: 'original-decision',
        targetType: 'listing',
        targetId: 'listing-1',
        measureType: 'listing_restriction',
        measureState: 'hidden',
      },
      raw: {
        targetStatus: 'active',
        decision: {
          detectionMethod: 'human',
          automatedMeans: null,
          statementOfReasons: { automationRole: 'none' },
        },
      },
      idempotencyKey: 'moderation.review.resolve:stale:correction',
      issuedAt: new Date('2026-08-22T02:00:00Z'),
    }),
    (error) => error.code === 'moderation_review_measure_state_changed',
  );
});
