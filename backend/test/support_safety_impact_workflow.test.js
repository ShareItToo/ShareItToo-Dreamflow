import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import {
  classifySupportSafetyBookingScope,
  isProtectedSupportSafetyIntake,
  normalizeSupportSafetyImpactReview,
} from '../src/support_safety_impact_domain.js';
import {
  listSupportSafetyImpactReviews,
  recordSupportSafetyImpactReview,
} from '../src/support_safety_impact_workflow.js';
import { createSupportDecisionDraft } from '../src/support_decision_workflow.js';

const admin = { id: 'admin-1', role: 'admin' };
const now = new Date('2026-08-22T12:00:00.000Z');
const noRows = { rowCount: 0, rows: [] };

function request(expectedVersion = 7) {
  return {
    expectedVersion,
    scopeReviewed: true,
    proportionalityBoundaryConfirmed: true,
    noAutomatedActionConfirmed: true,
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

test('safety intake has an independent bounded rate class', () => {
  assert.equal(isProtectedSupportSafetyIntake({
    caseType: 'general_help',
    caseSubType: 'app_error_or_display',
  }), false);
  assert.equal(isProtectedSupportSafetyIntake({
    caseType: 'trust_safety',
    caseSubType: 'dangerous_item_or_injury',
  }), true);
  assert.equal(isProtectedSupportSafetyIntake({
    caseType: 'active_handover',
    caseSubType: 'unsafe_handover',
  }), true);
  assert.equal(isProtectedSupportSafetyIntake({
    caseType: 'general_help',
    safetyTriage: { immediateDanger: true },
  }), true);
});

test('impact input and booking scope are deterministic and fail closed', () => {
  assert.equal(
    normalizeSupportSafetyImpactReview(request(), 'impact-1').expectedVersion,
    7,
  );
  assert.throws(
    () => normalizeSupportSafetyImpactReview({
      ...request(),
      noAutomatedActionConfirmed: false,
    }, 'impact-1'),
    (error) => error.code === 'support_safety_impact_confirmations_required',
  );
  const scope = classifySupportSafetyBookingScope([
    { id: 'booking-z', workflow_status: 'completed' },
    { id: 'booking-a', workflow_status: 'confirmed' },
    { id: 'booking-b', workflow_status: 'active' },
  ]);
  assert.deepEqual(scope.actionRelevantBookingIds, ['booking-a', 'booking-b']);
  assert.deepEqual(scope.historicalBookingIds, ['booking-z']);
  assert.deepEqual(scope.bookings.map((entry) => entry.id), [
    'booking-a',
    'booking-b',
    'booking-z',
  ]);
});

test('admin records one immutable non-live listing and booking impact snapshot', async () => {
  const client = scriptedClient([
    { pattern: /FROM support_safety_impact_reviews WHERE idempotency_key/u, result: noRows },
    {
      pattern: /FROM support_cases[\s\S]*FOR UPDATE/u,
      result: {
        rowCount: 1,
        rows: [{
          id: '11111111-1111-4111-8111-111111111111',
          case_type: 'trust_safety',
          case_subtype: 'dangerous_item_or_injury',
          status: 'under_review',
          operating_mode: 'simulation',
          lock_version: 7,
          linked_listing_id: 'listing-1',
          safety_flag: true,
          approval_level: 'red_explicit_decision',
        }],
      },
    },
    {
      pattern: /FROM listings[\s\S]*FOR KEY SHARE/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'listing-1',
          status: 'active',
          is_active: true,
          moderation_status: 'active',
        }],
      },
    },
    {
      pattern: /FROM bookings[\s\S]*LIMIT 201/u,
      result: {
        rowCount: 2,
        rows: [
          { id: 'booking-live', workflow_status: 'confirmed' },
          { id: 'booking-old', workflow_status: 'completed' },
        ],
      },
    },
    {
      pattern: /INSERT INTO support_safety_impact_reviews/u,
      check: ({ statement, values }) => {
        assert.doesNotMatch(statement, /UPDATE listings|UPDATE bookings|provider|https?:/iu);
        assert.deepEqual(values[5], ['booking-live']);
        assert.deepEqual(values[6], ['booking-old']);
        const snapshot = JSON.parse(values[7]);
        assert.equal(snapshot.listing.id, 'listing-1');
        assert.equal(snapshot.automaticActionAllowed, false);
        assert.equal(snapshot.externalDeliveryAllowed, false);
        assert.equal(Object.hasOwn(snapshot, 'ownerId'), false);
        assert.equal(Object.hasOwn(snapshot, 'renterId'), false);
      },
      result: ({ values }) => ({
        rowCount: 1,
        rows: [{
          id: values[0],
          case_id: values[1],
          case_version: values[2],
          review_version: values[3],
          linked_listing_id: values[4],
          action_relevant_booking_ids: values[5],
          historical_booking_ids: values[6],
          impact_snapshot: JSON.parse(values[7]),
          reviewer_id: values[8],
          human_reviewed: true,
          decision_required: true,
          proportionality_required: true,
          action_executed: false,
          external_delivery_enabled: false,
          automation_role: 'none',
          snapshot_sha256: 'a'.repeat(64),
          created_at: values[12],
        }],
      }),
    },
    {
      pattern: /INSERT INTO support_case_events/u,
      check: ({ values }) => {
        const payload = JSON.parse(values[3]);
        assert.equal(payload.actionRelevantBookingCount, 1);
        assert.equal(payload.actionExecuted, false);
        assert.equal(Object.hasOwn(payload, 'bookings'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
    {
      pattern: /INSERT INTO audit_log/u,
      check: ({ values }) => {
        const metadata = JSON.parse(values[3]);
        assert.equal(metadata.actionRelevantBookingCount, 1);
        assert.equal(Object.hasOwn(metadata, 'bookingIds'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  const result = await recordSupportSafetyImpactReview(client, {
    actor: admin,
    sessionId: '22222222-2222-4222-8222-222222222222',
    staffElevationId: '33333333-3333-4333-8333-333333333333',
    caseId: '11111111-1111-4111-8111-111111111111',
    raw: request(),
    idempotencyKey: 'impact-1',
    now,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.review.decisionRequired, true);
  assert.equal(result.review.actionExecuted, false);
  assert.deepEqual(result.review.actionRelevantBookingIds, ['booking-live']);
  client.done();
});

test('support role cannot record or list restricted impact reviews', async () => {
  const support = { id: 'support-1', role: 'support' };
  const client = scriptedClient([]);
  await assert.rejects(
    recordSupportSafetyImpactReview(client, {
      actor: support,
      sessionId: '22222222-2222-4222-8222-222222222222',
      staffElevationId: '33333333-3333-4333-8333-333333333333',
      caseId: 'case-1',
      raw: request(),
      idempotencyKey: 'impact-support-denied',
    }),
    (error) => error.code === 'support_safety_impact_admin_required',
  );
  await assert.rejects(
    listSupportSafetyImpactReviews(client, { actor: support, caseId: 'case-1' }),
    (error) => error.code === 'support_safety_impact_admin_required',
  );
  client.done();
});

test('safety decision must bind the current review and every action-relevant object', async () => {
  const reviewId = '44444444-4444-4444-8444-444444444444';
  const policyId = '55555555-5555-4555-8555-555555555555';
  const rawDecision = {
    decisionCode: 'safety.scope.review',
    decisionScope: 'Synthetic non-live proportional safety scope review.',
    confirmedFactsConsidered: ['The current listing and booking states were read from the server.'],
    materialUncertainties: ['No technical safety or legal finding is made.'],
    policySnapshotId: policyId,
    ruleReference: 'support-packet-v1:safety-impact',
    measureType: 'temporary_safety_review',
    affectedEntityIds: ['listing:listing-1', 'booking:booking-live'],
    unaffectedAreas: ['All unrelated listings and account functions remain outside scope.'],
    implementationPlan: 'Record simulation-only review evidence; execute no listing or booking mutation.',
    automationUsed: false,
    recommendationId: reviewId,
    userFacingDecision: 'Die Sicherheitsprüfung bleibt offen.',
    userFacingEffect: 'Es wurde keine reale Maßnahme ausgeführt.',
    userFacingReason: 'Der Umfang muss vor einer Entscheidung menschlich geprüft werden.',
    userFacingImplementationResult: 'Nur eine interne Simulation wurde dokumentiert.',
    internalReason: 'Exact current scope is bound to the immutable impact snapshot.',
    redressRoute: 'Eine Überprüfung bleibt über den Supportfall möglich.',
  };
  const client = scriptedClient([
    { pattern: /FROM support_decisions AS decision[\s\S]*idempotency_key/u, result: noRows },
    {
      pattern: /SELECT \* FROM support_cases[\s\S]*FOR UPDATE/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'case-1',
          case_type: 'trust_safety',
          case_subtype: 'dangerous_item_or_injury',
          status: 'under_review',
          approval_level: 'red_explicit_decision',
          lock_version: 7,
          linked_listing_id: 'listing-1',
        }],
      },
    },
    {
      pattern: /FROM support_safety_impact_reviews/u,
      result: {
        rowCount: 1,
        rows: [{
          id: reviewId,
          case_version: 7,
          action_relevant_booking_ids: ['booking-live'],
          impact_snapshot: {
            listing: {
              status: 'active',
              isActive: true,
              moderationStatus: 'active',
            },
          },
        }],
      },
    },
    {
      pattern: /SELECT status, is_active, moderation_status[\s\S]*FROM listings/u,
      result: {
        rowCount: 1,
        rows: [{ status: 'active', is_active: true, moderation_status: 'active' }],
      },
    },
    {
      pattern: /SELECT id FROM bookings[\s\S]*workflow_status IN/u,
      result: { rowCount: 1, rows: [{ id: 'booking-live' }] },
    },
    { pattern: /FROM support_decisions WHERE idempotency_key/u, result: noRows },
    { pattern: /FROM support_decisions[\s\S]*approval_status IN/u, result: noRows },
    { pattern: /FROM support_policy_snapshots/u, result: { rowCount: 1, rows: [{ id: policyId }] } },
    {
      pattern: /INSERT INTO support_decisions/u,
      result: ({ values }) => ({
        rowCount: 1,
        rows: [{
          id: values[0],
          case_id: values[1],
          decision_code: values[2],
          decision_scope: values[3],
          confirmed_facts_considered: JSON.parse(values[4]),
          material_uncertainties: JSON.parse(values[5]),
          policy_snapshot_id: values[6],
          rule_reference: values[7],
          measure_type: values[8],
          amount_minor: values[9],
          currency: values[10],
          duration: values[11],
          affected_entity_ids: values[12],
          unaffected_areas: JSON.parse(values[13]),
          implementation_plan: values[14],
          automation_used: false,
          recommendation_id: values[15],
          decided_by: values[16],
          approved_by: values[17],
          approved_at: values[18],
          approval_payload_sha256: values[19],
          user_facing_decision: values[20],
          user_facing_effect: values[21],
          user_facing_reason: values[22],
          user_facing_implementation_result: values[23],
          internal_reason: values[24],
          redress_route: values[25],
          idempotency_key: values[26],
          approval_status: values[27],
          approval_path: values[28],
          payload_sha256: values[29],
          implementation_status: 'not_started',
          lock_version: 1,
          decided_at: values[30],
          updated_at: values[30],
        }],
      }),
    },
    { pattern: /INSERT INTO support_case_events/u, result: { rowCount: 1, rows: [] } },
    { pattern: /INSERT INTO audit_log/u, result: { rowCount: 1, rows: [] } },
  ]);
  const result = await createSupportDecisionDraft(client, {
    actor: admin,
    caseId: 'case-1',
    raw: rawDecision,
    idempotencyKey: 'safety-decision-1',
    now,
  });
  assert.equal(result.decision.recommendationId, reviewId);
  assert.deepEqual(result.decision.affectedEntityIds, [
    'listing:listing-1',
    'booking:booking-live',
  ]);
  client.done();
});

test('migration enforces active admin step-up, append-only review and guarded rollback', async () => {
  const up = await fs.readFile(
    new URL('../sql/migrations/052_support_safety_impact_review.up.sql', import.meta.url),
    'utf8',
  );
  const down = await fs.readFile(
    new URL('../sql/migrations/052_support_safety_impact_review.down.sql', import.meta.url),
    'utf8',
  );
  assert.match(up, /support_safety_impact_active_admin_step_up_required/u);
  assert.match(up, /support_safety_impact_reviews_append_only/u);
  assert.match(up, /CHECK \(NOT action_executed\)/u);
  assert.match(up, /CHECK \(NOT external_delivery_enabled\)/u);
  assert.match(down, /rollback blocked: support safety impact reviews exist/u);
});
