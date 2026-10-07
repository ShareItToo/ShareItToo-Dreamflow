import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSupportDecisionDraft,
  listSupportDecisions,
  recordSupportDecisionCommunication,
  recordSupportDecisionImplementation,
  reviewSupportDecision,
} from '../src/support_decision_workflow.js';

const now = new Date('2026-08-21T15:00:00.000Z');
const policySnapshotId = '11111111-1111-4111-8111-111111111111';
const decisionId = '22222222-2222-4222-8222-222222222222';

function decisionInput(overrides = {}) {
  return {
    decisionCode: 'support.information_only',
    decisionScope: 'Nur der konkrete interne Testfall.',
    confirmedFactsConsidered: ['Der technische Status ist bestätigt.'],
    materialUncertainties: ['Keine externe Freigabe liegt vor.'],
    policySnapshotId,
    ruleReference: 'Support Packet V1',
    measureType: 'information_only',
    affectedEntityIds: ['booking-1'],
    unaffectedAreas: ['Keine Zahlung und keine Kontomaßnahme.'],
    implementationPlan: 'Interne Information nachvollziehbar dokumentieren.',
    automationUsed: false,
    userFacingDecision: 'Die interne Prüfung ist abgeschlossen.',
    userFacingEffect: 'Dein Konto und deine Zahlung bleiben unverändert.',
    userFacingReason: 'Der bestätigte technische Stand wurde geprüft.',
    userFacingImplementationResult:
      'Das bestätigte Ergebnis wurde im internen Testfall dokumentiert.',
    internalReason: 'Reine Simulation ohne Außenwirkung.',
    redressRoute: 'Menschliche Prüfung kann angefordert werden.',
    ...overrides,
  };
}

function caseRow(overrides = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    status: 'under_review',
    approval_level: 'red_explicit_decision',
    operating_mode: 'simulation',
    current_owner_id: 'support-1',
    ...overrides,
  };
}

function decisionRow(overrides = {}) {
  return {
    id: decisionId,
    case_id: caseRow().id,
    case_status: 'decision_pending_approval',
    decision_code: 'support.information_only',
    decision_scope: 'Nur der konkrete interne Testfall.',
    confirmed_facts_considered: ['Der technische Status ist bestätigt.'],
    material_uncertainties: ['Keine externe Freigabe liegt vor.'],
    policy_snapshot_id: policySnapshotId,
    rule_reference: 'Support Packet V1',
    measure_type: 'information_only',
    amount_minor: null,
    currency: null,
    duration: null,
    affected_entity_ids: ['booking-1'],
    unaffected_areas: ['Keine Zahlung und keine Kontomaßnahme.'],
    implementation_plan: 'Interne Information nachvollziehbar dokumentieren.',
    automation_used: false,
    recommendation_id: null,
    decided_by: 'support-1',
    approved_by: null,
    rejected_by: null,
    user_facing_decision: 'Die interne Prüfung ist abgeschlossen.',
    user_facing_effect: 'Dein Konto und deine Zahlung bleiben unverändert.',
    user_facing_reason: 'Der bestätigte technische Stand wurde geprüft.',
    user_facing_implementation_result:
      'Das bestätigte Ergebnis wurde im internen Testfall dokumentiert.',
    internal_reason: 'Reine Simulation ohne Außenwirkung.',
    redress_route: 'Menschliche Prüfung kann angefordert werden.',
    approval_path: 'separate_review',
    approval_status: 'pending',
    approval_payload_sha256: null,
    implementation_status: 'not_started',
    implementation_reference: null,
    implementation_failure_reason: null,
    implementation_verified_by: null,
    communicated_by: null,
    communication_payload_sha256: null,
    communicated_at: null,
    payload_sha256: 'a'.repeat(64),
    lock_version: 1,
    decided_at: now,
    approved_at: null,
    rejected_at: null,
    implementation_verified_at: null,
    updated_at: now,
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
    assert.equal(this.steps.length, 0);
  }
}

const noRows = { rowCount: 0, rows: [] };

test('support decision-list access outside the assignment is blocked and audited', async () => {
  const client = new ScriptedClient([
    {
      match: /FROM support_cases/,
      result: {
        rowCount: 1,
        rows: [{ id: caseRow().id, current_owner_id: 'support-2' }],
      },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        assert.deepEqual(params.slice(0, 5), [
          'support-1',
          'support',
          'support.case_access_denied',
          'support_case',
          caseRow().id,
        ]);
        assert.deepEqual(JSON.parse(params[5]), {
          accessPath: 'decision_list',
          reason: 'not_assigned_or_not_found',
        });
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  await assert.rejects(
    listSupportDecisions(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: caseRow().id,
    }),
    /support_case_not_found/,
  );
  client.done();
});

test('missing and unassigned decision lists return the same audited support response', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_cases/, result: noRows },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        assert.equal(params[4], caseRow().id);
        assert.deepEqual(JSON.parse(params[5]), {
          accessPath: 'decision_list',
          reason: 'not_assigned_or_not_found',
        });
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  await assert.rejects(
    listSupportDecisions(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: caseRow().id,
    }),
    (error) => error.status === 404 && error.code === 'support_case_not_found',
  );
  client.done();
});

test('green and yellow direct decisions require an admin reviewer', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_decisions/, result: noRows },
    { match: /FROM support_cases/, result: { rowCount: 1, rows: [caseRow({ approval_level: 'green_automatic' })] } },
  ]);
  await assert.rejects(
    createSupportDecisionDraft(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: caseRow().id,
      raw: decisionInput(),
      idempotencyKey: 'draft-green',
      now,
    }),
    /support_direct_decision_requires_admin/,
  );
  client.done();
});

test('admin records a green decision through the canonical direct-review path', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_decisions/, result: noRows },
    {
      match: /FROM support_cases/,
      result: {
        rowCount: 1,
        rows: [caseRow({ approval_level: 'green_automatic', current_owner_id: null })],
      },
    },
    { match: /FROM support_decisions/, result: noRows },
    { match: /approval_status IN \('pending', 'approved'\)/, result: noRows },
    { match: /FROM support_policy_snapshots/, result: { rowCount: 1, rows: [{ id: policySnapshotId }] } },
    {
      match: /INSERT INTO support_decisions/,
      check: ({ params }) => {
        assert.equal(params[16], 'admin-1');
        assert.equal(params[17], 'admin-1');
        assert.equal(params[18], now);
        assert.match(params[19], /^[0-9a-f]{64}$/u);
        assert.equal(params[27], 'approved');
        assert.equal(params[28], 'direct_single_reviewer');
        assert.equal(params[29], params[19]);
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [decisionRow({
          id: params[0],
          case_id: params[1],
          decided_by: params[16],
          approved_by: params[17],
          approved_at: params[18],
          approval_payload_sha256: params[19],
          approval_status: params[27],
          approval_path: params[28],
          payload_sha256: params[29],
          decided_at: params[30],
          updated_at: params[30],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        assert.equal(params[1], 'decision.direct_approved');
        assert.equal(JSON.parse(params[5]).approvalPath, 'direct_single_reviewer');
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => assert.equal(params[2], 'support.decision_direct_approved'),
      result: { rowCount: 1, rows: [] },
    },
  ]);
  const result = await createSupportDecisionDraft(client, {
    actor: { id: 'admin-1', role: 'admin' },
    caseId: caseRow().id,
    raw: decisionInput(),
    idempotencyKey: 'direct-green-1',
    now,
  });
  assert.equal(result.decision.approvalPath, 'direct_single_reviewer');
  assert.equal(result.decision.approvalStatus, 'approved');
  assert.equal(result.decision.approvedBy, 'admin-1');
  client.done();
});

test('support cannot draft a decision outside an explicitly assigned case', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_decisions/, result: noRows },
    {
      match: /FROM support_cases/,
      result: { rowCount: 1, rows: [caseRow({ current_owner_id: null })] },
    },
  ]);
  await assert.rejects(
    createSupportDecisionDraft(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: caseRow().id,
      raw: decisionInput(),
      idempotencyKey: 'draft-unassigned',
      now,
    }),
    /support_case_assignment_required/,
  );
  client.done();
});

test('support cannot replay a draft after the case leaves its assignment', async () => {
  const client = new ScriptedClient([{
    match: /FROM support_decisions/,
    result: {
      rowCount: 1,
      rows: [decisionRow({ case_current_owner_id: 'support-2' })],
    },
  }]);
  await assert.rejects(
    createSupportDecisionDraft(client, {
      actor: { id: 'support-1', role: 'support' },
      caseId: caseRow().id,
      raw: null,
      idempotencyKey: 'draft-reassigned',
      now,
    }),
    /support_case_assignment_required/,
  );
  client.done();
});

test('draft stores immutable proposal hash, internal event and sanitized audit', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_decisions/, result: noRows },
    { match: /FROM support_cases/, result: { rowCount: 1, rows: [caseRow()] } },
    { match: /FROM support_decisions/, result: noRows },
    { match: /approval_status IN \('pending', 'approved'\)/, result: noRows },
    { match: /FROM support_policy_snapshots/, result: { rowCount: 1, rows: [{ id: policySnapshotId }] } },
    {
      match: /INSERT INTO support_decisions/,
      check: ({ params }) => {
        assert.equal(params[16], 'support-1');
        assert.equal(params[20], decisionInput().userFacingDecision);
        assert.equal(params[21], decisionInput().userFacingEffect);
        assert.equal(params[23], decisionInput().userFacingImplementationResult);
        assert.equal(params[27], 'pending');
        assert.equal(params[28], 'separate_review');
        assert.match(params[29], /^[0-9a-f]{64}$/);
      },
      result: ({ params }) => ({
        rowCount: 1,
        rows: [decisionRow({
          id: params[0],
          case_id: params[1],
          payload_sha256: params[29],
          decided_at: params[30],
          updated_at: params[30],
        })],
      }),
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        assert.equal(params[1], 'decision.drafted');
        assert.equal(JSON.parse(params[5]).implementationStatus, 'not_started');
      },
      result: { rowCount: 1, rows: [] },
    },
    { match: /INSERT INTO audit_log/, result: { rowCount: 1, rows: [] } },
  ]);
  const result = await createSupportDecisionDraft(client, {
    actor: { id: 'support-1', role: 'support' },
    caseId: caseRow().id,
    raw: decisionInput(),
    idempotencyKey: 'draft-1',
    now,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.decision.approvalStatus, 'pending');
  assert.equal(result.decision.automationUsed, false);
  assert.match(result.decision.payloadSha256, /^[0-9a-f]{64}$/);
  client.done();
});

test('review requires admin, four eyes and the exact immutable payload hash', async () => {
  const denied = new ScriptedClient([]);
  await assert.rejects(
    reviewSupportDecision(denied, {
      actor: { id: 'support-2', role: 'support' },
      caseId: caseRow().id,
      decisionId,
      raw: {},
      idempotencyKey: 'review-denied',
      now,
    }),
    /support_decision_review_requires_admin/,
  );
  denied.done();

  const fourEyes = new ScriptedClient([
    { match: /FROM support_case_events/, result: noRows },
    {
      match: /FOR UPDATE OF decision/,
      result: { rowCount: 1, rows: [decisionRow({ decided_by: 'admin-1' })] },
    },
    { match: /FROM support_case_events/, result: noRows },
  ]);
  await assert.rejects(
    reviewSupportDecision(fourEyes, {
      actor: { id: 'admin-1', role: 'admin' },
      caseId: caseRow().id,
      decisionId,
      raw: {
        outcome: 'approved',
        expectedVersion: 1,
        expectedPayloadSha256: 'a'.repeat(64),
      },
      idempotencyKey: 'review-four-eyes',
      now,
    }),
    /support_decision_four_eyes_required/,
  );
  fourEyes.done();
});

test('review cannot finalize a proposal before the case enters approval', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_case_events/, result: noRows },
    {
      match: /FOR UPDATE OF decision/,
      result: { rowCount: 1, rows: [decisionRow({ case_status: 'under_review' })] },
    },
    { match: /FROM support_case_events/, result: noRows },
  ]);
  await assert.rejects(
    reviewSupportDecision(client, {
      actor: { id: 'admin-1', role: 'admin' },
      caseId: caseRow().id,
      decisionId,
      raw: {
        outcome: 'approved',
        expectedVersion: 1,
        expectedPayloadSha256: 'a'.repeat(64),
      },
      idempotencyKey: 'review-too-early',
      now,
    }),
    /support_decision_case_not_pending_approval/,
  );
  client.done();
});

test('admin approval binds the exact hash but performs no implementation', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_case_events/, result: noRows },
    { match: /FOR UPDATE OF decision/, result: { rowCount: 1, rows: [decisionRow()] } },
    { match: /FROM support_case_events/, result: noRows },
    {
      match: /UPDATE support_decisions/,
      check: ({ params }) => {
        assert.equal(params[1], 'approved');
        assert.equal(params[2], 'admin-1');
      },
      result: {
        rowCount: 1,
        rows: [decisionRow({
          approval_status: 'approved',
          approved_by: 'admin-1',
          approved_at: now,
          lock_version: 2,
        })],
      },
    },
    { match: /INSERT INTO support_case_events/, result: { rowCount: 1, rows: [] } },
    { match: /INSERT INTO audit_log/, result: { rowCount: 1, rows: [] } },
  ]);
  const result = await reviewSupportDecision(client, {
    actor: { id: 'admin-1', role: 'admin' },
    caseId: caseRow().id,
    decisionId,
    raw: {
      outcome: 'approved',
      expectedVersion: 1,
      expectedPayloadSha256: 'a'.repeat(64),
    },
    idempotencyKey: 'review-approve',
    now,
  });
  assert.equal(result.decision.approvalStatus, 'approved');
  assert.equal(result.decision.implementationStatus, 'not_started');
  client.done();
});

test('implementation record is admin-only, simulation-bound and separately verified', async () => {
  const client = new ScriptedClient([
    { match: /FROM support_case_events/, result: noRows },
    {
      match: /FOR UPDATE OF decision/,
      result: { rowCount: 1, rows: [decisionRow({
        approval_status: 'approved',
        approved_by: 'admin-1',
        case_status: 'decided',
        case_operating_mode: 'simulation',
        implementation_status: 'pending',
        lock_version: 2,
      })] },
    },
    { match: /FROM support_case_events/, result: noRows },
    {
      match: /UPDATE support_decisions/,
      result: {
        rowCount: 1,
        rows: [decisionRow({
          approval_status: 'approved',
          approved_by: 'admin-1',
          implementation_status: 'succeeded',
          implementation_reference: 'Interne Simulation wurde verifiziert.',
          implementation_verified_at: now,
          lock_version: 3,
        })],
      },
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        const payload = JSON.parse(params[5]);
        assert.equal(payload.implementationStatus, 'succeeded');
        assert.equal(payload.implementationReference, 'Interne Simulation wurde verifiziert.');
        assert.equal(payload.implementationFailureReason, null);
      },
      result: { rowCount: 1, rows: [] },
    },
    { match: /INSERT INTO audit_log/, result: { rowCount: 1, rows: [] } },
  ]);
  const result = await recordSupportDecisionImplementation(client, {
    actor: { id: 'admin-2', role: 'admin' },
    caseId: caseRow().id,
    decisionId,
    raw: {
      status: 'succeeded',
      expectedVersion: 2,
      expectedPayloadSha256: 'a'.repeat(64),
      implementationReference: 'Interne Simulation wurde verifiziert.',
    },
    idempotencyKey: 'implementation-1',
    now,
  });
  assert.equal(result.decision.implementationStatus, 'succeeded');
  assert.equal(result.decision.approvalStatus, 'approved');
  client.done();
});

test('final communication is explicit, admin-only and bound to approved implementation truth', async () => {
  const denied = new ScriptedClient([]);
  await assert.rejects(
    recordSupportDecisionCommunication(denied, {
      actor: { id: 'support-1', role: 'support' },
      caseId: caseRow().id,
      decisionId,
      raw: {},
      idempotencyKey: 'communication-denied',
      now,
    }),
    /support_decision_communication_requires_admin/,
  );
  denied.done();

  const approvedImplementation = decisionRow({
    approval_status: 'approved',
    approved_by: 'admin-1',
    approval_payload_sha256: 'a'.repeat(64),
    implementation_status: 'succeeded',
    implementation_reference: 'Interne Simulation wurde verifiziert.',
    implementation_verified_by: 'admin-2',
    implementation_verified_at: now,
    implemented_at: now,
    case_status: 'decided',
    case_operating_mode: 'simulation',
    lock_version: 3,
  });
  const client = new ScriptedClient([
    { match: /FROM support_case_events/, result: noRows },
    { match: /FOR UPDATE OF decision/, result: { rowCount: 1, rows: [approvedImplementation] } },
    { match: /FROM support_case_events/, result: noRows },
    {
      match: /communicated_at = \$2/,
      check: ({ params }) => assert.deepEqual(params, [decisionId, now, 'admin-3', 3]),
      result: {
        rowCount: 1,
        rows: [decisionRow({
          ...approvedImplementation,
          communicated_by: 'admin-3',
          communication_payload_sha256: 'a'.repeat(64),
          communicated_at: now,
          lock_version: 4,
        })],
      },
    },
    {
      match: /INSERT INTO support_case_events/,
      check: ({ params }) => {
        const payload = JSON.parse(params[5]);
        assert.equal(payload.externalMessageSent, false);
        assert.equal(payload.payloadSha256, 'a'.repeat(64));
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      match: /INSERT INTO audit_log/,
      check: ({ params }) => {
        assert.equal(params[2], 'support.decision_communicated');
        assert.equal(JSON.parse(params[5]).externalMessageSent, false);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  const result = await recordSupportDecisionCommunication(client, {
    actor: { id: 'admin-3', role: 'admin' },
    caseId: caseRow().id,
    decisionId,
    raw: {
      expectedVersion: 3,
      expectedPayloadSha256: 'a'.repeat(64),
    },
    idempotencyKey: 'communication-1',
    now,
  });
  assert.equal(result.decision.communicatedBy, 'admin-3');
  assert.equal(result.decision.communicationPayloadSha256, 'a'.repeat(64));
  assert.equal(result.decision.communicatedAt, now.toISOString());
  client.done();
});
