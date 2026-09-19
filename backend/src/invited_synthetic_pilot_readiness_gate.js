export const invitedSyntheticPilotPrerequisiteIds = Object.freeze([
  'professionalLegalApproval',
  'operationsReady',
  'signedDeviceGateReady',
  'pspSandboxE2ePassed',
]);

const expectedCatalog = Object.freeze([
  Object.freeze({ categoryId: 'cat8', subcategory: 'Elektrowerkzeuge' }),
  Object.freeze({ categoryId: 'cat8', subcategory: 'Bohrmaschinen' }),
  Object.freeze({ categoryId: 'cat8', subcategory: 'Schleifer' }),
]);

const expectedEnabledScope = Object.freeze([
  'v52-single-item-only',
  'g2-navigation-cart-and-gemerkt-non-reserving',
]);

const expectedDisabledScope = Object.freeze([
  'g3-booking-groups',
  'g4-planner-inventory',
  'g5-supply-enrichment',
  'g5-listing-sets',
  'sit-business',
  'multi-provider-projects',
  'external-ai',
  'public-registration',
  'real-money',
]);

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function scopeValid(scope) {
  return scope?.pilotType === 'invited-private-synthetic-payment-flow-pilot'
    && scope?.invitedAdultPrivateUsers === 30
    && scope?.minimumAge === 18
    && scope?.privateUseOnly === true
    && scope?.targetCompleteFlowRunsMinimum === 30
    && scope?.targetCompleteFlowRunsMaximum === 50
    && scope?.countryCode === 'DE'
    && scope?.regionLabel === 'Spiegelberg, Rems-Murr-Kreis'
    && scope?.allowedRegionCode === 'spiegelberg'
    && exact(scope?.catalog, expectedCatalog)
    && exact(scope?.enabledProductScope, expectedEnabledScope)
    && exact(scope?.disabledProductScope, expectedDisabledScope)
    && scope?.publicRegistration === false
    && scope?.realMoney === false
    && scope?.liveProviderTraffic === false;
}

function executionClaimed(execution) {
  return execution?.regionConfigured === true
    || execution?.runtimePilotModeChanged === true
    || execution?.catalogMutationPerformed === true
    || execution?.cohortRosterCreated === true
    || execution?.personalDataCollected === true
    || execution?.testAccountsProvisioned === true
    || execution?.invitesSent === true
    || Number(execution?.syntheticFlowRuns ?? 0) !== 0
    || execution?.productionChanged === true
    || execution?.cloudChanged === true
    || execution?.paymentProviderChanged === true
    || execution?.storeChanged === true
    || execution?.publicRegistrationEnabled === true
    || execution?.realMoneyUsed === true;
}

export function evaluateInvitedSyntheticPilotReadinessGate({
  orderedTokenAuthorized = false,
  prerequisites = [],
  scope = {},
  execution = {},
} = {}) {
  const gateMap = new Map(prerequisites.map((gate) => [gate?.id, gate]));
  const passedPrerequisiteCount = invitedSyntheticPilotPrerequisiteIds.reduce(
    (count, id) => count + (gateMap.get(id)?.passed === true ? 1 : 0),
    0,
  );
  const missingPrerequisiteIds = invitedSyntheticPilotPrerequisiteIds.filter(
    (id) => !gateMap.has(id),
  );
  const duplicatePrerequisiteIds = prerequisites.length !== gateMap.size;
  const prerequisiteGatesGreen = missingPrerequisiteIds.length === 0
    && duplicatePrerequisiteIds === false
    && prerequisites.length === invitedSyntheticPilotPrerequisiteIds.length
    && passedPrerequisiteCount === invitedSyntheticPilotPrerequisiteIds.length;
  const exactScopeValid = scopeValid(scope);
  const executionMutationClaimed = executionClaimed(execution);
  const conditionalAuthorizationEffective = orderedTokenAuthorized === true
    && prerequisiteGatesGreen;
  const controlledPilotEligible = conditionalAuthorizationEffective
    && exactScopeValid
    && executionMutationClaimed === false;

  return Object.freeze({
    state: controlledPilotEligible
      ? 'ready-for-separate-controlled-non-live-execution'
      : 'prepared-hold-prerequisite-gates-open',
    requiredPrerequisiteCount: invitedSyntheticPilotPrerequisiteIds.length,
    passedPrerequisiteCount,
    missingPrerequisiteIds: Object.freeze(missingPrerequisiteIds),
    duplicatePrerequisiteIds,
    prerequisiteGatesGreen,
    exactScopeValid,
    orderedTokenAuthorized: orderedTokenAuthorized === true,
    conditionalAuthorizationEffective,
    executionMutationClaimed,
    controlledPilotEligible,
    publicLaunchReady: false,
    realMoneyReady: false,
  });
}
