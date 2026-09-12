import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSupportAppealForCase,
  submitSupportAppeal,
} from '../src/support_appeal_workflow.js';

const now = new Date('2026-08-21T10:00:00.000Z');
const caseId = '11111111-1111-4111-8111-111111111111';
const decisionId = '22222222-2222-4222-8222-222222222222';
const appealId = '33333333-3333-4333-8333-333333333333';

function caseRow(overrides = {}) {
  return {
    id: caseId,
    human_readable_case_number: 'SIT-ABCDEFGHJKLM',
    reporter_user_id: 'user-1',
    status: 'closed',
    priority: 'p1',
    operating_mode: 'simulation',
    decision_id: decisionId,
    appeal_available: true,
    appeal_deadline: new Date('2026-09-15T18:00:00.000Z'),
    appeal_id: null,
    appeal_configured_at: new Date('2026-08-21T09:00:00.000Z'),
    appeal_configured_by: 'admin-1',
    lock_version: 7,
    ...overrides,
  };
}

function appealRow(overrides = {}) {
  return {
    id: appealId,
    original_decision_id: decisionId,
    case_id: caseId,
    case_number: 'SIT-ABCDEFGHJKLM',
    grounds: 'Bitte anhand der neuen Begründung erneut prüfen.',
    new_evidence_ids: [],
    submitted_by: 'user-1',
    submitted_at: now,
    reviewer_id: null,
    independence_flag: null,
    status: 'submitted',
    outcome: null,
    outcome_reason: null,
    implementation_changes: [],
    communicated_at: null,
    idempotency_key: 'support.appeal.submit:appeal-1',
    human_readable_appeal_number: 'SIT-R-ABCDEFGHJKLM',
    next_update_at: new Date('2026-08-21T11:00:00.000Z'),
    ...overrides,
  };
}

class ScriptedClient {
  constructor(steps) {
    this.steps = [...steps];
  }

  async query(sql, params = []) {
    const step = this.steps.shift();
    assert.ok(step, `unexpected query: ${sql}`);
    if (step.match) assert.match(sql, step.match);
    if (step.check) step.check({ sql, params });
    return typeof step.result === 'function' ? step.result({ sql, params }) : step.result;
  }

  done() {
    assert.equal(this.steps.length, 0, 'not all scripted queries were used');
  }
}

const noRows = { rowCount: 0, rows: [] };

test('appeal replay is bound to the same reporter and case', async () => {
  const client = new ScriptedClient([{
    match: /appeal\.idempotency_key = \$1/u,
    result: { rowCount: 1, rows: [appealRow()] },
  }]);
  const result = await submitSupportAppeal(client, {
    actor: { id: 'user-1', role: 'user' },
    caseId,
    raw: null,
    idempotencyKey: 'appeal-1',
    now,
  });
  assert.equal(result.replayed, true);
  assert.equal(result.appeal.reviewNumber, 'SIT-R-ABCDEFGHJKLM');
  assert.equal(result.appeal.originalCaseNumber, 'SIT-ABCDEFGHJKLM');
  assert.equal(result.appeal.externalMessageSent, false);
  client.done();
});

test('appeal submission verifies publication, records receipt truth and does not reopen', async () => {
  const client = new ScriptedClient([
    { match: /appeal\.idempotency_key = \$1/u, result: noRows },
    { match: /FROM support_cases WHERE id::text = \$1 FOR UPDATE/u, result: { rowCount: 1, rows: [caseRow()] } },
    { match: /appeal\.idempotency_key = \$1/u, result: noRows },
    { match: /FROM support_decisions/u, result: { rowCount: 1, rows: [{ id: decisionId }] } },
    { match: /appeal\.original_decision_id = \$1/u, result: noRows },
    {
      match: /INSERT INTO support_appeals/u,
      check: ({ sql, params }) => {
        assert.match(sql, /'\{\}'::uuid\[\]/u);
        assert.equal(params[2], 'Bitte erneut menschlich prüfen.');
        assert.match(params[6], /^SIT-R-[A-HJ-NP-Z2-9]{12}$/u);
        assert.equal(params[7].toISOString(), '2026-08-21T11:00:00.000Z');
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [appealRow({
          grounds: params[2],
          submitted_at: params[4],
          idempotency_key: params[5],
          human_readable_appeal_number: params[6],
          next_update_at: params[7],
        })],
      }),
    },
    {
      match: /UPDATE support_cases/u,
      check: ({ sql, params }) => {
        assert.match(sql, /appeal_available = false/u);
        assert.doesNotMatch(sql, /status = 'reopened'/u);
        assert.deepEqual(params, [caseId, appealId, now, 7]);
      },
      result: { rowCount: 1, rows: [{ id: caseId }] },
    },
    {
      match: /INSERT INTO support_case_events/u,
      check: ({ params }) => {
        assert.equal(params[1], 'user-1');
        const payload = JSON.parse(params[3]);
        assert.equal(payload.externalMessageSent, false);
        assert.equal(payload.automaticReopen, false);
        assert.doesNotMatch(JSON.stringify(payload), /menschlich prüfen/u);
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/u,
      check: ({ params }) => {
        assert.deepEqual(params.slice(0, 3), ['user-1', 'user', appealId]);
        const metadata = JSON.parse(params[3]);
        assert.equal(metadata.externalMessageSent, false);
        assert.equal(metadata.evidenceUploadUsed, false);
        assert.doesNotMatch(JSON.stringify(metadata), /menschlich prüfen/u);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  const result = await submitSupportAppeal(client, {
    actor: { id: 'user-1', role: 'user' },
    caseId,
    raw: { expectedVersion: 7, grounds: 'Bitte erneut menschlich prüfen.' },
    idempotencyKey: 'appeal-1',
    now,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.appeal.status, 'submitted');
  assert.match(result.appeal.nextUpdateDisplay, /21\.08\.2026/u);
  assert.match(result.appeal.nextUpdateDisplay, /13:00/u);
  client.done();
});

test('appeal submission is reporter-only and fails before decision lookup', async () => {
  const client = new ScriptedClient([
    { match: /appeal\.idempotency_key = \$1/u, result: noRows },
    { match: /FOR UPDATE/u, result: { rowCount: 1, rows: [caseRow()] } },
    { match: /appeal\.idempotency_key = \$1/u, result: noRows },
  ]);
  await assert.rejects(
    submitSupportAppeal(client, {
      actor: { id: 'affected-user', role: 'user' },
      caseId,
      raw: { expectedVersion: 7, grounds: 'Nicht der Reporter.' },
      idempotencyKey: 'appeal-other',
      now,
    }),
    /support_appeal_reporter_required/u,
  );
  client.done();
});

test('expired or unconfigured appeal window fails closed', async () => {
  for (const row of [
    caseRow({ appeal_deadline: new Date('2026-08-21T09:59:59.000Z') }),
    caseRow({ appeal_configured_at: null, appeal_configured_by: null }),
  ]) {
    const client = new ScriptedClient([
      { match: /appeal\.idempotency_key = \$1/u, result: noRows },
      { match: /FOR UPDATE/u, result: { rowCount: 1, rows: [row] } },
      { match: /appeal\.idempotency_key = \$1/u, result: noRows },
    ]);
    await assert.rejects(
      submitSupportAppeal(client, {
        actor: { id: 'user-1', role: 'user' },
        caseId,
        raw: { expectedVersion: 7, grounds: 'Bitte erneut prüfen.' },
        idempotencyKey: 'appeal-closed-window',
        now,
      }),
      /support_appeal_window_closed/u,
    );
    client.done();
  }
});

test('appeal rechecks idempotency after waiting for the case lock', async () => {
  const client = new ScriptedClient([
    { match: /appeal\.idempotency_key = \$1/u, result: noRows },
    {
      match: /FOR UPDATE/u,
      result: {
        rowCount: 1,
        rows: [caseRow({ appeal_available: false, appeal_id: appealId, lock_version: 8 })],
      },
    },
    {
      match: /appeal\.idempotency_key = \$1/u,
      result: { rowCount: 1, rows: [appealRow()] },
    },
  ]);
  const result = await submitSupportAppeal(client, {
    actor: { id: 'user-1', role: 'user' },
    caseId,
    raw: null,
    idempotencyKey: 'appeal-1',
    now,
  });
  assert.equal(result.replayed, true);
  assert.equal(result.appeal.id, appealId);
  client.done();
});

test('case detail receipt is bound to the exact appeal and hides submitted grounds', async () => {
  const client = new ScriptedClient([{
    match: /WHERE appeal\.id = \$1 AND appeal\.case_id = \$2/u,
    result: { rowCount: 1, rows: [appealRow()] },
  }]);
  const result = await getSupportAppealForCase(client, {
    actor: { id: 'user-1', role: 'user' },
    supportCase: caseRow({ appeal_id: appealId, appeal_available: false }),
  });
  assert.equal(result.reviewNumber, 'SIT-R-ABCDEFGHJKLM');
  assert.equal(result.materialSummary, 'Deine Begründung wurde vollständig und sicher aufgenommen.');
  assert.equal('grounds' in result, false);
  client.done();
});
