import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSupportDecisionCommunication,
  normalizeSupportDecisionImplementation,
  normalizeSupportDecisionInput,
  normalizeSupportDecisionReview,
  supportDecisionPayloadHash,
} from '../src/support_decision_domain.js';

const policySnapshotId = '11111111-1111-4111-8111-111111111111';
const payloadHash = 'a'.repeat(64);

function decision(overrides = {}) {
  return {
    decisionCode: 'support.information_only',
    decisionScope: 'Nur die konkrete simulierte Supportentscheidung dieses Falls.',
    confirmedFactsConsidered: ['Der technische Status wurde serverseitig bestätigt.'],
    materialUncertainties: ['Eine externe fachliche Freigabe liegt nicht vor.'],
    policySnapshotId,
    ruleReference: 'Support Packet V1 / approval boundary',
    measureType: 'information_only',
    affectedEntityIds: ['booking-1'],
    unaffectedAreas: ['Keine Zahlung oder Kontomaßnahme.'],
    implementationPlan: 'Bestätigte Information im internen Testfall dokumentieren.',
    automationUsed: false,
    userFacingDecision: 'Die interne technische Prüfung ist abgeschlossen.',
    userFacingEffect: 'Für dein Konto und deine Zahlung ändert sich nichts.',
    userFacingReason: 'Wir haben den bestätigten technischen Stand geprüft.',
    userFacingImplementationResult:
      'Das bestätigte Ergebnis wurde im internen Testfall dokumentiert.',
    internalReason: 'Simulation ohne Außenwirkung oder technische Aktion.',
    redressRoute: 'Menschliche Prüfung kann angefordert werden.',
    ...overrides,
  };
}

test('decision proposal is normalized, immutable-hashed and automation-free', () => {
  const result = normalizeSupportDecisionInput(decision());
  assert.equal(result.measureType, 'information_only');
  assert.equal(result.amountMinor, null);
  assert.equal(result.currency, null);
  assert.equal(result.automationUsed, false);
  assert.match(result.payloadSha256, /^[0-9a-f]{64}$/);
  assert.equal(result.payloadSha256, supportDecisionPayloadHash(result));
  assert.equal(
    normalizeSupportDecisionInput(decision()).payloadSha256,
    result.payloadSha256,
  );
  assert.notEqual(
    normalizeSupportDecisionInput(decision({ internalReason: 'Geänderter interner Grund.' })).payloadSha256,
    result.payloadSha256,
  );
  assert.notEqual(
    normalizeSupportDecisionInput(decision({
      userFacingEffect: 'Eine andere freizugebende Auswirkung.',
    })).payloadSha256,
    result.payloadSha256,
  );
});

test('money proposals require an exact simulated type, integer minor units and EUR', () => {
  assert.throws(
    () => normalizeSupportDecisionInput(decision({ amountMinor: 100 })),
    /support_decision_amount_scope_invalid/,
  );
  assert.throws(
    () => normalizeSupportDecisionInput(decision({
      measureType: 'simulated_refund_review',
      amountMinor: 10.5,
      currency: 'EUR',
    })),
    /support_decision_amount_invalid/,
  );
  assert.throws(
    () => normalizeSupportDecisionInput(decision({
      measureType: 'simulated_refund_review',
      amountMinor: 100,
      currency: 'USD',
    })),
    /support_decision_currency_invalid/,
  );
  const result = normalizeSupportDecisionInput(decision({
    measureType: 'simulated_refund_review',
    amountMinor: 100,
    currency: 'eur',
  }));
  assert.equal(result.amountMinor, 100);
  assert.equal(result.currency, 'EUR');
});

test('proposal rejects automation, missing facts and non-allowlisted measures', () => {
  assert.throws(
    () => normalizeSupportDecisionInput(decision({ automationUsed: true })),
    /support_decision_automation_forbidden/,
  );
  assert.throws(
    () => normalizeSupportDecisionInput(decision({ confirmedFactsConsidered: [] })),
    /support_confirmed_facts_required/,
  );
  assert.throws(
    () => normalizeSupportDecisionInput(decision({ measureType: 'capture_money' })),
    /support_measure_type_invalid/,
  );
  assert.throws(
    () => normalizeSupportDecisionInput(decision({ userFacingDecision: '' })),
    /support_user_decision_required/,
  );
  assert.throws(
    () => normalizeSupportDecisionInput(decision({ userFacingEffect: '' })),
    /support_user_effect_required/,
  );
  assert.throws(
    () => normalizeSupportDecisionInput(decision({ userFacingImplementationResult: '' })),
    /support_user_implementation_result_required/,
  );
});

test('review binds outcome to exact proposal hash and optimistic version', () => {
  const approved = normalizeSupportDecisionReview({
    outcome: 'approved',
    expectedVersion: 1,
    expectedPayloadSha256: payloadHash,
  });
  assert.deepEqual(approved, {
    outcome: 'approved',
    expectedVersion: 1,
    expectedPayloadSha256: payloadHash,
    rejectionReason: null,
  });
  assert.throws(
    () => normalizeSupportDecisionReview({
      outcome: 'rejected',
      expectedVersion: 1,
      expectedPayloadSha256: payloadHash,
    }),
    /support_decision_rejection_reason_required/,
  );
  assert.throws(
    () => normalizeSupportDecisionReview({
      outcome: 'approved',
      expectedVersion: 1,
      expectedPayloadSha256: 'not-a-hash',
    }),
    /support_decision_payload_hash_required/,
  );
});

test('implementation ledger permits only explicit monotonic transitions', () => {
  const pending = normalizeSupportDecisionImplementation({
    status: 'pending',
    expectedVersion: 2,
    expectedPayloadSha256: payloadHash,
  }, 'not_started');
  assert.equal(pending.status, 'pending');
  const succeeded = normalizeSupportDecisionImplementation({
    status: 'succeeded',
    expectedVersion: 3,
    expectedPayloadSha256: payloadHash,
    implementationReference: 'Interne Simulation wurde nachvollziehbar verifiziert.',
  }, 'pending');
  assert.equal(succeeded.implementationReference, 'Interne Simulation wurde nachvollziehbar verifiziert.');
  assert.throws(
    () => normalizeSupportDecisionImplementation({
      status: 'not_started',
      expectedVersion: 3,
      expectedPayloadSha256: payloadHash,
    }, 'succeeded'),
    /support_implementation_transition_invalid/,
  );
  assert.throws(
    () => normalizeSupportDecisionImplementation({
      status: 'failed',
      expectedVersion: 3,
      expectedPayloadSha256: payloadHash,
    }, 'pending'),
    /support_implementation_failure_reason_required/,
  );
});

test('communication binds publication to the exact immutable payload and version', () => {
  assert.deepEqual(normalizeSupportDecisionCommunication({
    expectedVersion: 3,
    expectedPayloadSha256: payloadHash,
  }), {
    expectedVersion: 3,
    expectedPayloadSha256: payloadHash,
  });
  assert.throws(
    () => normalizeSupportDecisionCommunication({
      expectedVersion: 3,
      expectedPayloadSha256: 'changed',
    }),
    /support_decision_payload_hash_required/,
  );
});
