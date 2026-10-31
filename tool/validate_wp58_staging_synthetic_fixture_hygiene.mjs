#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp58-staging-synthetic-fixture-hygiene-20260908.json',
);

function fail(message) {
  throw new Error(message);
}

function exact(value, expected, label) {
  if (value !== expected) fail(`${label} is not the verified WP58 value.`);
}

export function validateWp58StagingSyntheticFixtureHygiene({
  evidence = JSON.parse(readFileSync(evidencePath, 'utf8')),
  repositoryRoot = root,
} = {}) {
  exact(evidence?.schemaVersion, 1, 'schema version');
  exact(evidence?.kind, 'sit-wp58-staging-synthetic-fixture-hygiene', 'kind');
  exact(evidence?.status, 'complete-public-feed-clean-hidden-legacy-fixtures-held', 'status');
  exact(evidence?.repository?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(evidence?.candidate?.buildNumber, '2026090711', 'candidate build');
  exact(evidence?.candidate?.environment, 'staging', 'environment');

  for (const [label, value] of [
    ['exact simulation guard', evidence?.implementation?.exactSimulationRequired],
    ['active booking protection', evidence?.implementation?.activeBookingProtectionRequired],
    ['rollback guard', evidence?.implementation?.rollbackOnFeedFailure],
    ['simulation cancelled', evidence?.stagingResult?.nonBindingSimulationCancelled],
    ['simulation listing paused', evidence?.stagingResult?.simulationListingPaused],
    ['public absence', evidence?.stagingResult?.simulationPublicEntryRemoved],
  ]) exact(value, true, label);

  exact(evidence?.implementation?.listingDeletionAllowed, false, 'listing deletion');
  exact(evidence?.implementation?.paymentEndpointAllowed, false, 'payment endpoint');
  exact(evidence?.stagingResult?.contractCreated, false, 'contract creation');
  exact(evidence?.stagingResult?.reservationCreated, false, 'reservation creation');
  exact(evidence?.stagingResult?.paymentEndpointCalled, false, 'payment call');
  exact(evidence?.stagingResult?.stripeLivemode, false, 'Stripe live mode');
  exact(evidence?.stagingResult?.monetaryEffectMinor, 0, 'monetary effect');
  exact(evidence?.stagingResult?.additionalPublicOrphansPaused, 4, 'paused orphans');
  exact(evidence?.stagingResult?.publicActiveListingCount, 0, 'public listing count');
  exact(evidence?.stagingResult?.publicTechnicalListingCount, 0, 'technical listing count');
  exact(evidence?.stagingResult?.hiddenLegacyTechnicalListingCount, 3, 'hidden legacy count');
  exact(evidence?.stagingResult?.hiddenLegacyListingsWithActiveBookingCount, 0, 'hidden active bookings');
  exact(evidence?.stagingResult?.foreignKeyConstraintCount, 354, 'foreign keys');
  exact(evidence?.stagingResult?.foreignKeyIntegrity, 'passed', 'foreign-key integrity');
  exact(evidence?.heldBoundary?.hiddenLegacyListingsMutated, false, 'legacy mutation');
  exact(evidence?.heldBoundary?.directDatabaseCleanupAllowed, false, 'database cleanup');

  const simulationSource = readFileSync(
    resolve(repositoryRoot, evidence.implementation.simulationRetirementPath),
    'utf8',
  );
  const cleanupSource = readFileSync(
    resolve(repositoryRoot, evidence.implementation.technicalFeedCleanupPath),
    'utf8',
  );
  for (const marker of [
    'retireStagingNonBindingSimulation',
    "validateSimulationBooking(cancelled?.booking, 'cancelled')",
    "body: { status: 'paused' }",
  ]) {
    if (!simulationSource.includes(marker)) fail(`Simulation source marker missing: ${marker}`);
  }
  for (const marker of [
    'retireOrphanedStagingTechnicalListings',
    'isStrictSyntheticRoleFixture',
    'terminalBookingStatuses',
    'await rollback(fetchImpl, mutations)',
  ]) {
    if (!cleanupSource.includes(marker)) fail(`Cleanup source marker missing: ${marker}`);
  }

  if (!Number.isInteger(evidence?.qa?.focusedTestsPassed)
      || evidence.qa.focusedTestsPassed < 14) fail('Focused verification is incomplete.');
  if (!['passed', 'pending'].includes(evidence?.qa?.fullLocalRegression)
      || !['passed', 'pending'].includes(evidence?.qa?.githubRegression)
      || !['passed', 'pending'].includes(evidence?.qa?.githubCodeql)) {
    fail('QA state is invalid.');
  }
  if (Object.values(evidence?.boundaries ?? {}).some((value) => value !== false)) {
    fail('WP58 records a forbidden boundary change.');
  }
  const serialized = JSON.stringify(evidence);
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(serialized)) {
    fail('WP58 evidence contains private or credential-shaped material.');
  }
  return evidence;
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    validateWp58StagingSyntheticFixtureHygiene();
    process.stdout.write('WP58 Staging synthetic fixture hygiene evidence: PASS\n');
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP58 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
