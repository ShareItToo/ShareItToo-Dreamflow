#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultHandoffPath =
  'store/google-play/rw20a-internal-draft-oneplus-handoff.json';
const forbiddenKey = /(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)$/iu;

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

function assertSanitized(value, path = 'handoff') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitized(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKey.test(key)) fail(`${path}.${key} is credential-shaped.`);
      assertSanitized(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== 'string') return;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)) {
    fail(`${path} contains an email address.`);
  }
  const normalizedValue = value.toLowerCase();
  if (normalizedValue.includes('http://') || normalizedValue.includes('https://')) {
    fail(`${path} contains an external URL.`);
  }
  if (/(?:^|\s)\/Users\/|[A-Z]:\\/u.test(value)) {
    fail(`${path} contains a private filesystem path.`);
  }
}

function readJson(root, reference, label) {
  if (typeof reference !== 'string'
      || !/^[a-zA-Z0-9_./-]+\.json$/u.test(reference)
      || reference.includes('..')) {
    fail(`${label} is not a safe repository JSON reference.`);
  }
  try {
    return JSON.parse(readFileSync(resolve(root, reference), 'utf8'));
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
  }
}

export function validateRw20aPlayInternalDraftOnePlusHandoff({
  root = defaultRoot,
  handoff = readJson(root, defaultHandoffPath, 'RW20A handoff'),
} = {}) {
  assertSanitized(handoff);
  same(handoff.schemaVersion, 1, 'schemaVersion');
  same(handoff.kind, 'rw20a-google-play-internal-draft-oneplus-handoff', 'kind');
  same(handoff.status, 'uploaded-draft-not-active-oneplus-install-only', 'status');

  const source = object(handoff.source, 'source');
  same(source.type, 'owner-provided-macbook-codex-handover', 'source.type');
  same(source.directConsoleReverificationFromThisWorktree, false,
    'source.directConsoleReverificationFromThisWorktree');
  same(source.directOnePlusAdbVerificationFromThisWorktree, false,
    'source.directOnePlusAdbVerificationFromThisWorktree');

  const manifest = readJson(root, handoff.candidateManifestRef, 'candidate manifest');
  const buildReady = readJson(root, handoff.buildReadyEvidenceRef, 'BUILD_READY evidence');
  const candidate = object(handoff.candidate, 'candidate');
  for (const [key, expected] of Object.entries({
    applicationId: manifest.candidate?.applicationId,
    versionName: manifest.candidate?.versionName,
    versionCode: manifest.candidate?.versionCode,
    artifactSourceHead: manifest.provenance?.artifactSourceHead,
    aabBytes: manifest.artifact?.aabBytes,
    aabSha256: manifest.artifact?.aabSha256,
    uploadCertificateSha256: manifest.artifact?.uploadCertificateSha256,
  })) same(candidate[key], expected, `candidate.${key}`);
  same(candidate.aabSha256, buildReady.artifact?.aabSha256,
    'candidate.aabSha256 BUILD_READY binding');

  const transfer = object(handoff.transferVerification, 'transferVerification');
  if (!Array.isArray(transfer.partBytes) || transfer.partBytes.length !== 2
      || !transfer.partBytes.every((entry) => Number.isSafeInteger(entry) && entry > 0)
      || transfer.partBytes.reduce((total, entry) => total + entry, 0) !== candidate.aabBytes) {
    fail('transferVerification.partBytes does not reassemble to the candidate size.');
  }
  same(transfer.reassembledBytes, candidate.aabBytes,
    'transferVerification.reassembledBytes');
  same(transfer.reassembledSha256MatchedCandidate, true,
    'transferVerification.reassembledSha256MatchedCandidate');
  same(transfer.zipStructureValidation, 'passed',
    'transferVerification.zipStructureValidation');
  same(transfer.credentialsOrTesterIdentityRecorded, false,
    'transferVerification.credentialsOrTesterIdentityRecorded');

  const play = object(handoff.playState, 'playState');
  for (const [key, expected] of Object.entries({
    track: 'internal',
    exactCandidateUploaded: true,
    bundleProcessed: true,
    draftSaved: true,
    nextStepOpened: false,
    releaseActivated: false,
    published: false,
    sentForReview: false,
  })) same(play[key], expected, `playState.${key}`);
  const active = object(play.activeInternalRelease, 'playState.activeInternalRelease');
  same(active.applicationVersionName, '1.0.0',
    'playState.activeInternalRelease.applicationVersionName');
  same(active.versionCode, manifest.versionSelection?.highestGooglePlayVersionCodeObserved,
    'playState.activeInternalRelease.versionCode');
  same(active.releaseName, `1.0.0-internal-${active.versionCode}`,
    'playState.activeInternalRelease.releaseName');
  same(active.unchanged, true, 'playState.activeInternalRelease.unchanged');
  if (BigInt(candidate.versionCode) <= BigInt(active.versionCode)) {
    fail('The uploaded draft must be strictly newer than the active Internal release.');
  }

  const testers = object(handoff.testerState, 'testerState');
  same(testers.accountCount, 2, 'testerState.accountCount');
  same(testers.ownerSelectedAccountAdded, true, 'testerState.ownerSelectedAccountAdded');
  same(testers.identitiesRecorded, false, 'testerState.identitiesRecorded');
  same(testers.privateOptInUrlRecorded, false, 'testerState.privateOptInUrlRecorded');
  same(testers.furtherChangesAuthorized, false, 'testerState.furtherChangesAuthorized');

  const device = object(handoff.secondAndroid, 'secondAndroid');
  same(device.manufacturerClass, 'OnePlus', 'secondAndroid.manufacturerClass');
  same(device.installationConfirmedByOwner, true,
    'secondAndroid.installationConfirmedByOwner');
  same(device.expectedInstalledVersionCode, active.versionCode,
    'secondAndroid.expectedInstalledVersionCode');
  same(device.newDraftCandidateInstalled, false,
    'secondAndroid.newDraftCandidateInstalled');
  same(device.functionalTestsPerformed, false,
    'secondAndroid.functionalTestsPerformed');
  same(device.wirelessAdbBaselinePerformed, false,
    'secondAndroid.wirelessAdbBaselinePerformed');
  same(device.fullDeviceValidationClaimed, false,
    'secondAndroid.fullDeviceValidationClaimed');

  same(handoff.gates?.PLAY_UPLOAD_APPROVED, 'consumed-for-exact-bound-aab',
    'gates.PLAY_UPLOAD_APPROVED');
  same(handoff.gates?.GOOGLE_PLAY_INTERNAL_RELEASE_GO, 'not-granted',
    'gates.GOOGLE_PLAY_INTERNAL_RELEASE_GO');
  same(handoff.gates?.ONEPLUS_WIRELESS_ADB_BASELINE, 'prepared-not-run',
    'gates.ONEPLUS_WIRELESS_ADB_BASELINE');
  same(handoff.gates?.HUMAN_PILOT_ACTIVATED, 'not-granted',
    'gates.HUMAN_PILOT_ACTIVATED');

  const boundaries = object(handoff.boundaries, 'boundaries');
  if (!Object.values(boundaries).every((value) => value === false)) {
    fail('RW20A boundaries must all remain false.');
  }

  const verification = object(handoff.verification, 'verification');
  same(verification.initialPackageHead,
    'dfc3d2e3297ab9d4c4fe3696c7dbbb9d8fbc4e3d',
    'verification.initialPackageHead');
  same(verification.implementationHead,
    '8dbe9b6071b79507eac6414096b8f45949d31d91',
    'verification.implementationHead');
  same(verification.focusedTestsPassed, 8, 'verification.focusedTestsPassed');
  same(verification.completeToolTestsPassed, 1965,
    'verification.completeToolTestsPassed');
  same(verification.localTechnicalRegression,
    'passed-standard-parallelism-no-workaround',
    'verification.localTechnicalRegression');
  for (const [key, expectedRunId] of [
    ['githubRegression', 33023774904],
    ['githubCodeql', 33023776568],
  ]) {
    const run = object(verification[key], `verification.${key}`);
    same(run.runId, expectedRunId, `verification.${key}.runId`);
    same(run.headSha, verification.implementationHead,
      `verification.${key}.headSha`);
    same(run.conclusion, 'success', `verification.${key}.conclusion`);
  }
  same(verification.openCodeScanningAlerts, 0,
    'verification.openCodeScanningAlerts');
  const ratchet = object(verification.securityRatchet,
    'verification.securityRatchet');
  same(ratchet.findingRule, 'js/regex/missing-regexp-anchor',
    'verification.securityRatchet.findingRule');
  same(ratchet.severity, 'high', 'verification.securityRatchet.severity');
  same(ratchet.scope, 'handoff-url-sanitizer',
    'verification.securityRatchet.scope');
  same(ratchet.resolution, 'all-http-and-https-urls-rejected',
    'verification.securityRatchet.resolution');
  same(ratchet.regressionTestAdded, true,
    'verification.securityRatchet.regressionTestAdded');
  same(ratchet.workaroundIntroduced, false,
    'verification.securityRatchet.workaroundIntroduced');

  for (const key of [
    'containsSecrets',
    'containsTesterIdentity',
    'containsOptInUrl',
    'containsRawDeviceIdentifier',
  ]) same(handoff[key], false, key);

  return {
    status: handoff.status,
    candidateVersionCode: candidate.versionCode,
    activeInternalVersionCode: active.versionCode,
    exactCandidateUploadedAsDraft: true,
    releaseActivated: false,
    onePlusBaselineReady: true,
    implementationHead: verification.implementationHead,
    openCodeScanningAlerts: verification.openCodeScanningAlerts,
  };
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.stdout.write(`${JSON.stringify(validateRw20aPlayInternalDraftOnePlusHandoff(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'RW20A handoff validation failed.'}\n`);
    process.exitCode = 1;
  }
}
