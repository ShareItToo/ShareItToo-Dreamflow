import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listSupportArticle18Candidates,
  recordSupportArticle18Assessment,
  rejectSupportArticle18ExternalDispatch,
} from '../src/support_article18_workflow.js';

const admin = { id: 'admin-1', role: 'admin' };
const now = new Date('2026-08-22T03:00:00.000Z');
const noRows = { rowCount: 0, rows: [] };

function request() {
  return {
    determination: 'reporting_path_required',
    routingBasis: 'concerned_member_state_identified',
    factualBasis:
      'Verified synthetic facts require the guarded authority referral preparation.',
    evidenceReferences: ['support-evidence:synthetic-1'],
    concernedMemberStates: ['DE'],
    informationScope: ['case_reference', 'evidence_digest'],
    reviewerAuthorizationEvidenceRef: 'internal-test:qualified-owner-evidence',
    humanReviewed: true,
    automationRole: 'none',
    noAutomatedDispatchConfirmed: true,
  };
}

function scriptedClient(steps) {
  const calls = [];
  return {
    calls,
    async query(statement, values = []) {
      calls.push({ statement, values });
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${statement}`);
      assert.match(statement, step.pattern);
      step.check?.({ statement, values });
      return typeof step.result === 'function'
        ? step.result({ statement, values })
        : step.result;
    },
    done() {
      assert.equal(steps.length, 0);
    },
  };
}

test('admin records a non-live human assessment without any external dispatch', async () => {
  const client = scriptedClient([
    { pattern: /FROM support_article18_assessments WHERE idempotency_key/u, result: noRows },
    {
      pattern: /FROM support_cases[\s\S]*FOR UPDATE/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'case-1',
          priority: 'p0',
          status: 'under_review',
          operating_mode: 'simulation',
          safety_flag: true,
          authority_flag: true,
          article18_candidate_flag: true,
        }],
      },
    },
    { pattern: /FROM support_article18_assessments[\s\S]*ORDER BY/u, result: noRows },
    {
      pattern: /INSERT INTO support_article18_assessments/u,
      check: ({ statement, values }) => {
        assert.doesNotMatch(statement, /sent|provider|https?:/iu);
        assert.equal(values[0], 'case-1');
        assert.equal(values[2], 'reporting_path_required');
        assert.deepEqual(values[6], ['DE']);
      },
      result: ({ values }) => ({
        rowCount: 1,
        rows: [{
          id: '11111111-1111-4111-8111-111111111111',
          case_id: values[0],
          supersedes_assessment_id: values[1],
          determination: values[2],
          routing_basis: values[3],
          factual_basis: values[4],
          evidence_references: values[5],
          concerned_member_states: values[6],
          information_scope: values[7],
          reviewer_authorization_evidence_ref: values[8],
          reviewer_id: values[9],
          human_reviewed: true,
          automation_role: 'none',
          external_delivery_allowed: false,
          external_delivery_status: 'disabled_not_configured',
          idempotency_key: values[12],
          created_at: values[13],
        }],
      }),
    },
    {
      pattern: /INSERT INTO support_case_events/u,
      check: ({ values }) => {
        const payload = JSON.parse(values[3]);
        assert.equal(payload.externalDeliveryAllowed, false);
        assert.equal(payload.automationRole, 'none');
        assert.equal(Object.hasOwn(payload, 'factualBasis'), false);
        assert.equal(Object.hasOwn(payload, 'evidenceReferences'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      pattern: /INSERT INTO audit_log/u,
      check: ({ values }) => {
        const metadata = JSON.parse(values[4]);
        assert.equal(metadata.externalDeliveryStatus, 'disabled_not_configured');
        assert.equal(Object.hasOwn(metadata, 'factualBasis'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);

  const result = await recordSupportArticle18Assessment(client, {
    actor: admin,
    sessionId: '22222222-2222-4222-8222-222222222222',
    staffElevationId: '33333333-3333-4333-8333-333333333333',
    caseId: 'case-1',
    raw: request(),
    idempotencyKey: 'article18-workflow-1',
    now,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.assessment.humanReviewed, true);
  assert.equal(result.assessment.externalDeliveryAllowed, false);
  assert.equal(result.assessment.externalDeliveryStatus, 'disabled_not_configured');
  client.done();
});

test('normal support cannot assess, list or dispatch to an authority', async () => {
  const support = { id: 'support-1', role: 'support' };
  const client = scriptedClient([]);
  await assert.rejects(
    recordSupportArticle18Assessment(client, {
      actor: support,
      caseId: 'case-1',
      raw: request(),
      idempotencyKey: 'article18-support-denied',
    }),
    (error) => error.status === 403 && error.code === 'support_article18_admin_required',
  );
  await assert.rejects(
    listSupportArticle18Candidates(client, { actor: support }),
    (error) => error.status === 403 && error.code === 'support_article18_admin_required',
  );
  assert.throws(
    () => rejectSupportArticle18ExternalDispatch({ actor: support }),
    (error) => error.status === 403
      && error.code === 'support_article18_dispatch_admin_required',
  );
  client.done();
});

test('even an administrator cannot dispatch while the external channel is unconfigured', () => {
  assert.throws(
    () => rejectSupportArticle18ExternalDispatch({ actor: admin }),
    (error) => error.status === 503
      && error.code === 'support_article18_external_dispatch_disabled',
  );
});

test('candidate queue is admin-only, minimal and explicitly non-live', async () => {
  const client = scriptedClient([{
    pattern: /FROM support_cases AS support_case/u,
    result: {
      rowCount: 1,
      rows: [{
        id: 'case-1',
        human_readable_case_number: 'SIT-BCDFGHJKLMNP',
        case_subtype: 'threat_or_violence',
        status: 'under_review',
        priority: 'p0',
        operating_mode: 'internal_testing',
        current_owner_role: 'trust_safety_owner',
        next_update_at: now,
        assessment_id: null,
      }],
    },
  }]);
  const result = await listSupportArticle18Candidates(client, { actor: admin });
  assert.equal(result[0].article18Candidate, true);
  assert.equal(result[0].operatingMode, 'internal_testing');
  assert.equal(result[0].latestAssessment, null);
  assert.doesNotMatch(JSON.stringify(result), /user_id|factual_basis|email/iu);
  client.done();
});
