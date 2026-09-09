#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  evaluateInvitedSyntheticPilotReadinessGate,
  invitedSyntheticPilotPrerequisiteIds,
} from '../backend/src/invited_synthetic_pilot_readiness_gate.js';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = 'docs/evidence/p0b-next/invited-synthetic-pilot-spiegelberg-cat8-readiness.json';

const expectedRepoSources = Object.freeze([
  Object.freeze(['docs/evidence/p0b/pilot-go-no-go-dossier.json', '3566a46c018b7685adfe0f9df296c2060294f811deb5b61dd79ec818c25f27dd']),
  Object.freeze(['assets/legal/de/legal_review_intake_p0b_20260821.json', '2ce69106a3ea06ad6fa08a365a22716bf1342c44b107fa03cdda5a399e165696']),
  Object.freeze(['docs/operations/p0b-ops-role-delegate-absence-gate.json', 'eb5cd54c3894f74534d21d04c079c942b276aa553324cd581b0d6519ae8800ff']),
  Object.freeze(['docs/evidence/p0b-next/signed-device-evidence.json', '9c7ec43fe113177095220514a07b238d0a2ed4177aaecb623590447fecce23aa']),
  Object.freeze(['docs/evidence/p0b-next/psp-sandbox-e2e-evidence.json', '769650b9d4fb633c053ecfa7df9aaf05a324a239d59e4ca8bc729feb658c4097']),
  Object.freeze(['backend/src/config.js', '90922f999317f81e466f6d120a4655d775587552e52d2004372e36687ad73966']),
  Object.freeze(['backend/src/private_pilot_domain.js', 'bcc1f29927c15a29f4027b0ad731349bedced0bc445e0ce19aeff808d6fcbeee']),
  Object.freeze(['backend/src/invited_synthetic_pilot_readiness_gate.js', 'f8567c4293283a0e2b547a8d1fb758f8fc7b5bdf90df8ecffd7e0afc38991032']),
  Object.freeze(['backend/test/invited_synthetic_pilot_readiness_gate.test.js', '1690af0ff93075891ebf0ccb7b675fd7049f725f0162fea3d7660a935a3cd8d0']),
  Object.freeze(['docs/operations/P0B_INVITED_SYNTHETIC_PILOT_SPIEGELBERG_CAT8_RUNBOOK.md', '297df8cdb8fa649af3ef1450ed8c21bd47935593dde4bea29979a350c6e3f24b']),
]);

const expectedDriveSources = Object.freeze([
  Object.freeze(['1HQR2EWJg6FUcU41l5uwditfFzNoCe6Zx', '01_V5.2_CORE_SPECIFICATION.md', '2026-08-18T17:51:27.257Z']),
  Object.freeze(['1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2', '02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf', '2026-08-18T17:51:36.056Z']),
  Object.freeze(['1z9GdNlilUrpq1P34lrXdqv6RmJHYSQfJ', '01_SIT_MASTER_V2_DEUTSCHLAND_ZU_GLOBAL.pdf', '2026-08-18T17:52:13.985Z']),
  Object.freeze(['1R_JeRkFXTsFVusKlqeM5wS2-MZAV0fdx', '02_SIT_Growth_Product_Projektkorb_und_SIT_Planer.docx', '2026-08-18T13:41:16.606Z']),
  Object.freeze(['1UdwK9GB79Zlt1jIKcWoG43J8LQezJDdE', '04_SIT_BUSINESS_PRODUKTSTRATEGIE_UND_WACHSTUMSGATE.pdf', '2026-08-18T17:53:25.006Z']),
]);

const expectedPrerequisites = Object.freeze([
  Object.freeze({
    id: 'professionalLegalApproval',
    passed: false,
    evidencePath: 'assets/legal/de/legal_review_intake_p0b_20260821.json',
    observedState: 'prepared-awaiting-independent-professional-review',
  }),
  Object.freeze({
    id: 'operationsReady',
    passed: false,
    evidencePath: 'docs/operations/p0b-ops-role-delegate-absence-gate.json',
    observedState: 'hold-external-assignments-and-human-absence-tests',
  }),
  Object.freeze({
    id: 'signedDeviceGateReady',
    passed: false,
    evidencePath: 'docs/evidence/p0b-next/signed-device-evidence.json',
    observedState: 'partial-android-passed-ios-blocked',
  }),
  Object.freeze({
    id: 'pspSandboxE2ePassed',
    passed: false,
    evidencePath: 'docs/evidence/p0b-next/psp-sandbox-e2e-evidence.json',
    observedState: 'hold-provider-contract-credentials-and-sandbox-e2e',
  }),
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(root, path, overrides) {
  if (Object.hasOwn(overrides, path)) return Buffer.from(String(overrides[path]), 'utf8');
  return readFileSync(resolve(root, path));
}

function jsonSource(root, path, overrides) {
  return JSON.parse(source(root, path, overrides));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIdentity(value) {
  if (value.schemaVersion !== 1
      || value.kind !== 'p0b-invited-synthetic-pilot-readiness'
      || value.version !== 'P0B-PILOT-2026-08-21.1'
      || value.authorizationToken !== 'P0B_NEXT_INVITED_SYNTHETIC_PILOT_SPIEGELBERG_CAT8_30'
      || value.orderedTokenAuthorized !== true
      || value.preparedOn !== '2026-08-21'
      || value.state !== 'prepared-hold-prerequisite-gates-open') {
    fail('P0B invited synthetic pilot identity or hold state is invalid.');
  }
}

function assertSourceBindings(root, value, overrides) {
  const repo = value.sourceBindings?.repository;
  if (!Array.isArray(repo) || repo.length !== expectedRepoSources.length) {
    fail('P0B invited pilot repository source set is incomplete.');
  }
  expectedRepoSources.forEach(([path, hash], index) => {
    if (!exact(repo[index], { path, sha256: hash })
        || sha256(source(root, path, overrides)) !== hash) {
      fail(`P0B invited pilot repository source drift: ${path}`);
    }
  });
  const drive = value.sourceBindings?.drive;
  if (!Array.isArray(drive) || drive.length !== expectedDriveSources.length) {
    fail('P0B invited pilot Drive source set is incomplete.');
  }
  expectedDriveSources.forEach(([fileId, title, modifiedTime], index) => {
    if (!exact(drive[index], { fileId, title, modifiedTime })) {
      fail(`P0B invited pilot Drive source binding drift: ${title}`);
    }
  });
}

function assertPrerequisiteTruth(root, value, overrides) {
  if (!exact(value.prerequisites, expectedPrerequisites)
      || !exact(value.prerequisites.map(({ id }) => id), invitedSyntheticPilotPrerequisiteIds)) {
    fail('P0B invited pilot prerequisite set must remain exact and open.');
  }
  const legal = jsonSource(root, expectedPrerequisites[0].evidencePath, overrides);
  const operations = jsonSource(root, expectedPrerequisites[1].evidencePath, overrides);
  const signedDevice = jsonSource(root, expectedPrerequisites[2].evidencePath, overrides);
  const psp = jsonSource(root, expectedPrerequisites[3].evidencePath, overrides);
  if (legal.professionallyReviewed !== false
      || operations.evaluation?.operationsReady !== false
      || signedDevice.releaseGate?.signedDeviceGateReady !== false
      || psp.evaluation?.sandboxE2ePassed !== false) {
    fail('P0B invited pilot source gates no longer match the recorded open state.');
  }
}

function assertScopeMatchesRecommendation(root, value, overrides) {
  const recommendation = jsonSource(
    root,
    'docs/evidence/p0b/pilot-go-no-go-dossier.json',
    overrides,
  ).recommendedFuturePilot;
  const expectedScope = {
    pilotType: recommendation.pilotType,
    invitedAdultPrivateUsers: recommendation.cohort.invitedAdultPrivateUsers,
    minimumAge: recommendation.cohort.minimumAge,
    privateUseOnly: recommendation.cohort.privateUseOnly,
    targetCompleteFlowRunsMinimum: recommendation.cohort.targetCompleteFlowRunsMinimum,
    targetCompleteFlowRunsMaximum: recommendation.cohort.targetCompleteFlowRunsMaximum,
    countryCode: recommendation.region.countryCode,
    regionLabel: recommendation.region.label,
    allowedRegionCode: recommendation.region.recommendedAllowedRegionCode,
    catalog: recommendation.catalog,
    enabledProductScope: recommendation.enabledProductScope,
    disabledProductScope: recommendation.disabledProductScope,
    publicRegistration: recommendation.publicRegistration,
    realMoney: recommendation.realMoney,
    liveProviderTraffic: recommendation.liveProviderTraffic,
  };
  if (!exact(value.scope, expectedScope)) {
    fail('P0B invited pilot scope drifted from the approved recommendation.');
  }
}

function assertTargetsAndExecution(value) {
  if (!exact(value.targetMetrics, {
    status: 'targets-not-observations',
    currency: 'EUR',
    aovMinimumMinor: 4500,
    aovMaximumMinor: 5500,
    successfulHandoverRateGreaterThan: 0.95,
    severeDisputeRateLessThan: 0.02,
    ninetyDayRepeatRateAtLeast: 0.25,
    observedAovMinor: null,
    observedSuccessfulHandoverRate: null,
    observedSevereDisputeRate: null,
    observedNinetyDayRepeatRate: null,
  })) {
    fail('P0B invited pilot targets must not be presented as observations.');
  }
  if (!exact(value.execution, {
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
  })) {
    fail('P0B invited pilot execution must remain completely inactive.');
  }
}

function assertEvaluation(value) {
  const evaluated = evaluateInvitedSyntheticPilotReadinessGate({
    orderedTokenAuthorized: value.orderedTokenAuthorized,
    prerequisites: value.prerequisites,
    scope: value.scope,
    execution: value.execution,
  });
  const { state: _state, ...expected } = evaluated;
  if (evaluated.state !== value.state || !exact(value.evaluation, expected)) {
    fail('P0B invited pilot recorded evaluation does not match the executable gate.');
  }
  if (evaluated.exactScopeValid !== true
      || evaluated.prerequisiteGatesGreen !== false
      || evaluated.conditionalAuthorizationEffective !== false
      || evaluated.controlledPilotEligible !== false
      || evaluated.publicLaunchReady !== false
      || evaluated.realMoneyReady !== false) {
    fail('P0B invited pilot eligibility is overstated.');
  }
  return evaluated;
}

function assertBoundaries(value) {
  for (const field of [
    'containsPersonalData',
    'containsCredentials',
    'containsPrivateFilesystemPaths',
    'regionOrCatalogConfigured',
    'participantOrAccountMutationPerformed',
    'productionChanged',
    'cloudChanged',
    'paymentProviderChanged',
    'storeChanged',
    'publicActivationChanged',
    'realMoneyUsed',
  ]) {
    if (value.boundaries?.[field] !== false) {
      fail(`P0B invited pilot boundary must remain false: ${field}`);
    }
  }
  if (/\/Users\/|sk_(?:test|live)_[A-Za-z0-9]|whsec_[A-Za-z0-9]|BEGIN PRIVATE KEY/u.test(JSON.stringify(value))) {
    fail('P0B invited pilot readiness contains a private path or credential.');
  }
}

export function validateP0BInvitedSyntheticPilotReadiness({
  root = defaultRoot,
  manifest = undefined,
  sourceOverrides = {},
} = {}) {
  const value = manifest ?? JSON.parse(source(root, manifestPath, sourceOverrides));
  assertIdentity(value);
  assertSourceBindings(root, value, sourceOverrides);
  assertPrerequisiteTruth(root, value, sourceOverrides);
  assertScopeMatchesRecommendation(root, value, sourceOverrides);
  assertTargetsAndExecution(value);
  const evaluated = assertEvaluation(value);
  assertBoundaries(value);
  return Object.freeze({
    version: value.version,
    state: value.state,
    repositorySources: value.sourceBindings.repository.length,
    driveSources: value.sourceBindings.drive.length,
    invitedAdults: value.scope.invitedAdultPrivateUsers,
    targetFlows: `${value.scope.targetCompleteFlowRunsMinimum}-${value.scope.targetCompleteFlowRunsMaximum}`,
    passedPrerequisites: evaluated.passedPrerequisiteCount,
    requiredPrerequisites: evaluated.requiredPrerequisiteCount,
    exactScopeValid: evaluated.exactScopeValid,
    controlledPilotEligible: evaluated.controlledPilotEligible,
    publicLaunchReady: evaluated.publicLaunchReady,
    realMoneyReady: evaluated.realMoneyReady,
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    const result = validateP0BInvitedSyntheticPilotReadiness();
    process.stdout.write(
      `P0B invited synthetic pilot readiness valid: version=${result.version}, state=${result.state}, invitedAdults=${result.invitedAdults}, targetFlows=${result.targetFlows}, prerequisites=${result.passedPrerequisites}/${result.requiredPrerequisites}, exactScope=${result.exactScopeValid}, eligible=${result.controlledPilotEligible}, publicLaunch=${result.publicLaunchReady}, realMoney=${result.realMoneyReady}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'P0B invited synthetic pilot validation failed.'}\n`);
    process.exitCode = 1;
  }
}
