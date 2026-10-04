import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  blueOceanSyntheticPilotHarnessVersion,
  blueOceanSyntheticPilotResultClassification,
  runBlueOceanSyntheticPilotHarness,
} from '../src/blue_ocean_synthetic_pilot_harness.js';

const expectedReplaySha256 = '1c95d0ace4b101bdf7c09c5ad7116abf749430b1f08d834ec4c6868504f8ecd0';

async function run() {
  return runBlueOceanSyntheticPilotHarness();
}

test('N8 executes 40 attempts with 30 synthetic participants and 37 complete flows', async () => {
  const result = await run();
  assert.equal(result.harnessVersion, blueOceanSyntheticPilotHarnessVersion);
  assert.equal(result.resultClassification, blueOceanSyntheticPilotResultClassification);
  assert.equal(result.executionScope, 'DETERMINISTIC_DOMAIN_SIMULATION_NOT_APP_OR_HUMAN_E2E');
  assert.equal(result.syntheticParticipantCount, 30);
  assert.equal(result.attemptedFlowCount, 40);
  assert.equal(result.completedFlowCount, 37);
  assert.deepEqual(result.requiredCompletedFlowRange, { minimum: 30, maximum: 50 });
});

test('N8 compares the exact CORE, GROWTH and BLUE OCEAN feature cohorts', async () => {
  const result = await run();
  assert.deepEqual(result.cohorts.map((cohort) => cohort.cohort), [
    'CORE', 'GROWTH', 'BLUE_OCEAN',
  ]);
  assert.deepEqual(result.cohorts.map((cohort) => cohort.attemptedFlowCount), [13, 13, 14]);
  assert.equal(result.cohorts[0].features.g3, false);
  assert.equal(result.cohorts[1].features.g3, true);
  assert.equal(result.cohorts[1].features.aiAssistedListing, false);
  assert.equal(result.cohorts[2].features.aiAssistedListing, true);
  assert.equal(result.cohorts[2].features.regionalPriceRecommendation, true);
});

test('N8 replay is byte-stable and bound to a fixed digest', async () => {
  const first = await run();
  const second = await run();
  assert.deepEqual(second, first);
  assert.equal(first.replaySha256, expectedReplaySha256);
});

test('N8 returns aggregate metrics only and no individual synthetic records', async () => {
  const result = await run();
  const serialized = JSON.stringify(result);
  assert.equal(result.invariants.individualRecordsReturned, false);
  assert.doesNotMatch(serialized, /synthetic_participant_/u);
  assert.doesNotMatch(serialized, /listing_ai_draft_/u);
  assert.doesNotMatch(serialized, /ownerId|participantId/u);
  for (const cohort of result.cohorts) {
    for (const metric of [
      'meanDraftTimeSeconds', 'meanPublishReadyTimeSeconds', 'fieldEditRateBasisPoints',
      'categoryAccuracyBasisPoints', 'brandModelPrecisionBasisPoints',
      'unsupportedClaimRateBasisPoints', 'clarificationCount', 'abandonedFlowCount',
      'manualFallbackCount', 'projectPlanCount', 'searchCount', 'cartCount',
      'requestCount', 'acceptedRequestCount', 'rejectedRequestCount',
      'simulatedRentalCompletionCount', 'distinctSyntheticOwnerCount',
      'ownerActionCount', 'handoverEventCount', 'supportNeedCount',
    ]) assert.ok(Object.hasOwn(cohort, metric), `${cohort.cohort}.${metric}`);
  }
});

test('N8 uses deterministic mock and refusal fallbacks without external calls', async () => {
  const result = await run();
  const blue = result.cohorts.find((cohort) => cohort.cohort === 'BLUE_OCEAN');
  assert.equal(blue.manualFallbackCount, 2);
  assert.equal(blue.priceRecommendationShownCount, 11);
  assert.equal(blue.g5FailureCount, 1);
  assert.equal(blue.g5FailurePreservedMainListingCount, 1);
  for (const invariant of [
    'externalProviderCallPerformed', 'externalScannerCallPerformed', 'paidCallPerformed',
    'realPersonDataUsed', 'realMoneyUsed', 'productionChanged', 'storeChanged',
    'firebaseChanged', 'automaticPublicationEnabled', 'syntheticLearningApplied',
  ]) assert.equal(result.invariants[invariant], false, invariant);
});

test('N8 records coherent simulated downstream funnel totals', async () => {
  const result = await run();
  for (const cohort of result.cohorts) {
    assert.equal(cohort.completedFlowCount + cohort.abandonedFlowCount, cohort.attemptedFlowCount);
    assert.equal(cohort.requestCount, cohort.completedFlowCount);
    assert.equal(
      cohort.acceptedRequestCount + cohort.rejectedRequestCount,
      cohort.requestCount,
    );
    assert.equal(cohort.handoverEventCount, cohort.acceptedRequestCount * 2);
    assert.ok(cohort.simulatedRentalCompletionCount <= cohort.acceptedRequestCount);
    assert.equal(cohort.unsupportedClaimRateBasisPoints, 0);
  }
});

test('N8 labels outputs as planning evidence and never as observed human results', async () => {
  const result = await run();
  assert.equal(result.invariants.humanResultsClaimed, false);
  assert.equal(result.invariants.planningTargetsClaimedAsObserved, false);
  assert.equal(result.invariants.configuredParticipantCount, 30);
  assert.equal(result.invariants.allParticipantsUsed, true);
  assert.equal(result.invariants.completeFlowRangeSatisfied, true);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.cohorts[0]));
});

test('N8 harness source has no network, environment, clock or random dependency', () => {
  const source = readFileSync(new URL(
    '../src/blue_ocean_synthetic_pilot_harness.js',
    import.meta.url,
  ), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|process\.env|Date\.now|Math\.random/u);
  assert.match(source, /SIT_LISTING_AI_PROVIDER: 'mock'/u);
  assert.match(source, /new Date\('2026-08-24T00:00:00\.000Z'\)/u);
});
