import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateInvitedSyntheticPilotReadinessGate,
  invitedSyntheticPilotPrerequisiteIds,
} from '../src/invited_synthetic_pilot_readiness_gate.js';

const scope = Object.freeze({
  pilotType: 'invited-private-synthetic-payment-flow-pilot',
  invitedAdultPrivateUsers: 30,
  minimumAge: 18,
  privateUseOnly: true,
  targetCompleteFlowRunsMinimum: 30,
  targetCompleteFlowRunsMaximum: 50,
  countryCode: 'DE',
  regionLabel: 'Spiegelberg, Rems-Murr-Kreis',
  allowedRegionCode: 'spiegelberg',
  catalog: Object.freeze([
    Object.freeze({ categoryId: 'cat8', subcategory: 'Elektrowerkzeuge' }),
    Object.freeze({ categoryId: 'cat8', subcategory: 'Bohrmaschinen' }),
    Object.freeze({ categoryId: 'cat8', subcategory: 'Schleifer' }),
  ]),
  enabledProductScope: Object.freeze([
    'v52-single-item-only',
    'g2-navigation-cart-and-gemerkt-non-reserving',
  ]),
  disabledProductScope: Object.freeze([
    'g3-booking-groups',
    'g4-planner-inventory',
    'g5-supply-enrichment',
    'g5-listing-sets',
    'sit-business',
    'multi-provider-projects',
    'external-ai',
    'public-registration',
    'real-money',
  ]),
  publicRegistration: false,
  realMoney: false,
  liveProviderTraffic: false,
});

const noExecution = Object.freeze({
  regionConfigured: false,
  runtimePilotModeChanged: false,
  catalogMutationPerformed: false,
  cohortRosterCreated: false,
  personalDataCollected: false,
  testAccountsProvisioned: false,
  invitesSent: false,
  syntheticFlowRuns: 0,
  productionChanged: false,
  cloudChanged: false,
  paymentProviderChanged: false,
  storeChanged: false,
  publicRegistrationEnabled: false,
  realMoneyUsed: false,
});

function prerequisites(passed) {
  return invitedSyntheticPilotPrerequisiteIds.map((id) => ({ id, passed }));
}

test('keeps the authorized exact scope on hold while prerequisite gates are open', () => {
  const result = evaluateInvitedSyntheticPilotReadinessGate({
    orderedTokenAuthorized: true,
    prerequisites: prerequisites(false),
    scope,
    execution: noExecution,
  });
  assert.equal(result.state, 'prepared-hold-prerequisite-gates-open');
  assert.equal(result.passedPrerequisiteCount, 0);
  assert.equal(result.exactScopeValid, true);
  assert.equal(result.conditionalAuthorizationEffective, false);
  assert.equal(result.controlledPilotEligible, false);
});

test('recognizes eligibility only when every prerequisite is green and scope is exact', () => {
  const result = evaluateInvitedSyntheticPilotReadinessGate({
    orderedTokenAuthorized: true,
    prerequisites: prerequisites(true),
    scope,
    execution: noExecution,
  });
  assert.equal(result.state, 'ready-for-separate-controlled-non-live-execution');
  assert.equal(result.prerequisiteGatesGreen, true);
  assert.equal(result.conditionalAuthorizationEffective, true);
  assert.equal(result.controlledPilotEligible, true);
  assert.equal(result.publicLaunchReady, false);
  assert.equal(result.realMoneyReady, false);
});

test('rejects scope expansion to public registration, real money or another catalog', () => {
  const result = evaluateInvitedSyntheticPilotReadinessGate({
    orderedTokenAuthorized: true,
    prerequisites: prerequisites(true),
    scope: { ...scope, publicRegistration: true, realMoney: true, catalog: [] },
    execution: noExecution,
  });
  assert.equal(result.exactScopeValid, false);
  assert.equal(result.controlledPilotEligible, false);
});

test('detects any activation or personal-data claim in a preparation snapshot', () => {
  const result = evaluateInvitedSyntheticPilotReadinessGate({
    orderedTokenAuthorized: true,
    prerequisites: prerequisites(false),
    scope,
    execution: { ...noExecution, regionConfigured: true, invitesSent: true },
  });
  assert.equal(result.executionMutationClaimed, true);
  assert.equal(result.controlledPilotEligible, false);
});
