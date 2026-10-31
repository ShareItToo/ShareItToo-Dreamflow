#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const evidenceReference =
  'docs/evidence/release-readiness/oneplus-play-internal-2026090204-read-only.json';
const candidateReference =
  'docs/evidence/release-readiness/full-pilot-candidate-2026090204.json';
const forbiddenKey = /(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|serial|android.?id|imei)$/iu;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} has drifted.`);
}

function readJson(root, reference, label) {
  try {
    return JSON.parse(readFileSync(resolve(root, reference), 'utf8'));
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
  }
}

function assertSanitized(value, path = 'evidence') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitized(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKey.test(key)) fail(`${path}.${key} is private-identifier-shaped.`);
      assertSanitized(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== 'string') return;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)) {
    fail(`${path} contains an email address.`);
  }
  if (/(?:^|\s)\/(?:Users|home)\/|[A-Z]:\\/u.test(value)) {
    fail(`${path} contains a private filesystem path.`);
  }
  if (/(?:\d{1,3}\.){3}\d{1,3}/u.test(value)) {
    fail(`${path} contains a network address.`);
  }
}

const exactPassChecks = Object.freeze({
  guest: [
    'exploreLoadedWithoutError',
    'truthfulEmptyCatalogStateShown',
    'forceStopFreshRestartPassed',
  ],
  owner: [
    'syntheticSessionRestorePassed',
    'principalBindingPassed',
    'profilePassed',
    'myListingsPassed',
    'exactVaultListingVisible',
    'forceStopFreshRestartPassed',
    'sessionPersistencePassed',
  ],
  roleTransition: [
    'ownerToGuestPassed',
    'guestToRenterPassed',
    'renterPrincipalBindingPassed',
    'ownerDataAbsentUnderRenter',
    'staleOwnerUiAbsentUnderRenter',
    'renterForceStopFreshRestartPassed',
    'renterSessionPersistencePassed',
    'finalGuestRestorePassed',
  ],
});

export function validateOnePlusPlayInternal2026090204ReadOnly({
  root = defaultRoot,
  evidence = readJson(root, evidenceReference, 'OnePlus evidence'),
  candidate = readJson(root, candidateReference, 'full-pilot candidate'),
} = {}) {
  assertSanitized(evidence);
  same(evidence.schemaVersion, 1, 'schemaVersion');
  same(evidence.kind, 'oneplus-play-internal-candidate-read-only-evidence', 'kind');
  same(evidence.status,
    'passed-bounded-read-only-account-isolation-with-open-fixture-drift', 'status');

  const observation = object(evidence.observation, 'observation');
  same(observation.capturedAt, null, 'observation.capturedAt');
  same(observation.captureTimeStatus, 'exact-time-not-recorded',
    'observation.captureTimeStatus');
  same(observation.observedFromHostClass, 'MacBook Pro',
    'observation.observedFromHostClass');
  same(observation.directUsbDeviceConnection, true,
    'observation.directUsbDeviceConnection');

  const expectedCandidate = object(candidate.android, 'full-pilot candidate.android');
  const observedCandidate = object(evidence.candidate, 'candidate');
  for (const [key, expected] of Object.entries({
    applicationId: expectedCandidate.applicationId,
    versionName: expectedCandidate.versionName,
    versionCode: expectedCandidate.versionCode,
    artifactSourceHead: candidate.source?.artifactSourceHead,
    aabSha256: expectedCandidate.aabSha256,
  })) same(observedCandidate[key], expected, `candidate.${key}`);
  same(observedCandidate.releaseChannel, 'internal', 'candidate.releaseChannel');
  same(observedCandidate.apiBaseUrlClass, 'staging', 'candidate.apiBaseUrlClass');
  same(observedCandidate.paymentMode, 'memory', 'candidate.paymentMode');
  same(observedCandidate.stripeLivemode, false, 'candidate.stripeLivemode');

  const device = object(evidence.device, 'device');
  for (const [key, expected] of Object.entries({
    manufacturer: 'OnePlus',
    model: 'CPH2581',
    androidVersion: '16',
    apiLevel: '36',
    packageName: expectedCandidate.applicationId,
    delivery: 'google-play-split',
    splitCount: 4,
    installer: 'com.android.vending',
    playAppSigningCertificateMatched: true,
  })) same(device[key], expected, `device.${key}`);

  const checks = object(evidence.checks, 'checks');
  for (const [group, names] of Object.entries(exactPassChecks)) {
    const values = object(checks[group], `checks.${group}`);
    for (const name of names) same(values[name], true, `checks.${group}.${name}`);
  }
  same(checks.guest.crashOrAnrObserved, false, 'checks.guest.crashOrAnrObserved');

  const findings = object(evidence.openFindings, 'openFindings');
  same(findings.publicCatalogContainsFixture, false,
    'openFindings.publicCatalogContainsFixture');
  same(findings.catalogFilterCause, 'not-proven-by-owner-or-public-api',
    'openFindings.catalogFilterCause');
  same(findings.historicalBookingFixtureDrift, 'OPEN',
    'openFindings.historicalBookingFixtureDrift');
  same(findings.fullBindingBusinessJourney, 'NOT_RUN_V52_LEGAL_GATE',
    'openFindings.fullBindingBusinessJourney');
  const expectedUnknowns = [
    'catalog-version',
    'moderation-status',
    'owner-private-use-confirmation',
    'owner-marketplace-review-status',
  ];
  if (JSON.stringify(findings.catalogFilterUnknownFields) !== JSON.stringify(expectedUnknowns)) {
    fail('openFindings.catalogFilterUnknownFields has drifted.');
  }

  const tooling = object(evidence.tooling, 'tooling');
  same(tooling.remoteSnapshotRequiredTransientLabelMapping, true,
    'tooling.remoteSnapshotRequiredTransientLabelMapping');
  same(tooling.canonicalRepositorySupportsBothLabelGenerations, true,
    'tooling.canonicalRepositorySupportsBothLabelGenerations');
  same(tooling.canonicalRepositoryChangeRequired, false,
    'tooling.canonicalRepositoryChangeRequired');
  same(tooling.retainedWorkaround, false, 'tooling.retainedWorkaround');

  const boundaries = object(evidence.boundaries, 'boundaries');
  if (!Object.values(boundaries).every((value) => value === false)) {
    fail('The bounded device run must not claim a mutation.');
  }
  for (const key of [
    'containsSecrets',
    'containsTesterIdentity',
    'containsRawDeviceIdentifier',
    'containsNetworkData',
  ]) same(evidence[key], false, key);

  return Object.freeze({
    status: evidence.status,
    versionCode: observedCandidate.versionCode,
    physicalDevice: `${device.manufacturer} ${device.model}`,
    guestReadOnlyPassed: true,
    twoRoleIsolationPassed: true,
    fullBindingBusinessJourneyPassed: false,
    legalGateRemainsOpen: true,
  });
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateOnePlusPlayInternal2026090204ReadOnly(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'OnePlus evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
