import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateAndroidLocalQaCandidate,
  validateLocalQaBuildOrdering,
} from '../../tool/validate_android_local_qa_candidate.mjs';
import { canonicalAndroidSigningCertificateSha256 } from '../../tool/validate_current_head_android_release_archive.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();
const commit = 'b'.repeat(40);
const explicitBuildNumber = '2099123101';
const installedPlayBuildNumber = '2099123001';
const finalPlaySuccessorBuildNumber = '2099123102';

function fixture(buildNumber = explicitBuildNumber) {
  const root = tempFixtures.makeSync('sit-r2-candidate-');
  const directory = resolve(root, 'candidate');
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
  const apk = Buffer.from('local qa apk');
  const apkName = `shareittoo-local-qa-1.0.0-${buildNumber}-${commit}.apk`;
  const manifest = {
    schemaVersion: 1,
    kind: 'sit-android-local-blue-ocean-qa-candidate',
    status: 'built-owner-only-not-installed',
    createdAt: '2026-08-24T10:00:00Z',
    source: {
      branch: 'codex/master-workflow-20260808',
      commit,
      applicationId: 'com.shareittoo.app',
      versionName: '1.0.0',
      buildNumber,
    },
    artifact: {
      fileName: apkName,
      apkSha256: createHash('sha256').update(apk).digest('hex'),
      ownerOnly: true,
      canonicalSigningRelationshipVerified: true,
      debuggable: true,
    },
    configuration: {
      buildType: 'debug-canonical-local-qa',
      releaseChannel: 'internal',
      apiBaseUrl: 'http://127.0.0.1:18080/api/v1',
      adbReverseRequired: 'tcp:18080',
      blueOceanMockUi: true,
      syntheticCloneBookingLane: true,
      syntheticCloneNotice: 'Synthetischer Test – keine vertragliche oder finanzielle Wirkung',
      syntheticCloneRequiredRoles: ['owner', 'renter'],
      buildOrdering: {
        installedPlayBuildNumber,
        localQaBuildNumber: buildNumber,
        finalPlaySuccessorBuildNumber,
      },
      requiredLocalBackendProvider: 'mock',
      g3TechnicalUi: true,
      g4TechnicalUi: true,
      g5TechnicalUi: true,
      externalProviderAllowed: false,
      realMoneyAllowed: false,
      productionAllowed: false,
      publicRegistrationAllowed: false,
      publicReleaseAllowed: false,
    },
    boundaries: {
      installed: false,
      aabCreated: false,
      storeUploaded: false,
      providerCallPerformed: false,
      apiBillingCreated: false,
      productionChanged: false,
      cloudChanged: false,
      paymentChanged: false,
    },
  };
  writeFileSync(resolve(directory, apkName), apk, { mode: 0o600 });
  writeFileSync(
    resolve(directory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { root, directory, manifest };
}

function runnerFor(buildNumber = explicitBuildNumber) {
  return (_file, args) => {
    if (args[0] === 'verify') {
      return `Signer #1 certificate SHA-256 digest: ${canonicalAndroidSigningCertificateSha256}\n`;
    }
    if (args[0] === 'dump') {
      return `package: name='com.shareittoo.app' versionCode='${buildNumber}' versionName='1.0.0'\n`;
    }
    throw new Error('Unexpected fake Android tool command.');
  };
}

const runner = runnerFor();

test('accepts the exact owner-only local QA candidate without exposing paths or signing digests', async () => {
  const value = fixture();
  const result = await validateAndroidLocalQaCandidate({
    root: value.root,
    candidateDirectory: value.directory,
    expectedCommit: commit,
    expectedBuildNumber: explicitBuildNumber,
    expectedInstalledPlayBuildNumber: installedPlayBuildNumber,
    expectedFinalPlaySuccessorBuildNumber: finalPlaySuccessorBuildNumber,
    commandRunner: runner,
    apksignerPath: 'apksigner',
    aaptPath: 'aapt',
  });
  assert.equal(result.status, 'verified-owner-only-not-installed');
  assert.equal(result.canonicalSigningRelationshipVerified, true);
  assert.equal(JSON.stringify(result).includes(canonicalAndroidSigningCertificateSha256), false);
  assert.equal(JSON.stringify(result).includes(value.directory), false);
});

test('returns private installation facts only behind the explicit in-process option', async () => {
  const value = fixture();
  const result = await validateAndroidLocalQaCandidate({
    root: value.root,
    candidateDirectory: value.directory,
    expectedCommit: commit,
    expectedBuildNumber: explicitBuildNumber,
    expectedInstalledPlayBuildNumber: installedPlayBuildNumber,
    expectedFinalPlaySuccessorBuildNumber: finalPlaySuccessorBuildNumber,
    commandRunner: runner,
    apksignerPath: 'apksigner',
    aaptPath: 'aapt',
    includePrivateArtifact: true,
  });
  assert.equal(result.applicationId, 'com.shareittoo.app');
  assert.equal(result.buildNumber, explicitBuildNumber);
  assert.equal(result.apkPath, resolve(value.directory, value.manifest.artifact.fileName));
  assert.equal(result.signingCertificateSha256, canonicalAndroidSigningCertificateSha256);
  assert.equal(result.apiBaseUrl, 'http://127.0.0.1:18080/api/v1');
  assert.equal(result.firebaseConfigured, false);
});

test('accepts any explicitly supplied local-QA build number', async () => {
  const buildNumber = '2099123002';
  const value = fixture(buildNumber);
  const result = await validateAndroidLocalQaCandidate({
    root: value.root,
    candidateDirectory: value.directory,
    expectedCommit: commit,
    expectedBuildNumber: buildNumber,
    expectedInstalledPlayBuildNumber: installedPlayBuildNumber,
    expectedFinalPlaySuccessorBuildNumber: finalPlaySuccessorBuildNumber,
    commandRunner: runnerFor(buildNumber),
    apksignerPath: 'apksigner',
    aaptPath: 'aapt',
  });
  assert.equal(result.buildNumber, buildNumber);
});

test('requires an explicit local-QA build number instead of an observed default', async () => {
  const value = fixture();
  const previous = process.env.SIT_LOCAL_QA_BUILD_NUMBER;
  delete process.env.SIT_LOCAL_QA_BUILD_NUMBER;
  try {
    await assert.rejects(
      () => validateAndroidLocalQaCandidate({
        root: value.root,
        candidateDirectory: value.directory,
        expectedCommit: commit,
        commandRunner: runner,
        apksignerPath: 'apksigner',
        aaptPath: 'aapt',
      }),
      /SIT_LOCAL_QA_BUILD_NUMBER is required/u,
    );
  } finally {
    if (previous === undefined) delete process.env.SIT_LOCAL_QA_BUILD_NUMBER;
    else process.env.SIT_LOCAL_QA_BUILD_NUMBER = previous;
  }
});

test('requires the exact two-role clone marker in the local-QA manifest', async () => {
  const value = fixture();
  value.manifest.configuration.syntheticCloneRequiredRoles = ['owner'];
  writeFileSync(
    resolve(value.directory, 'manifest.json'),
    `${JSON.stringify(value.manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  await assert.rejects(
    () => validateAndroidLocalQaCandidate({
      root: value.root,
      candidateDirectory: value.directory,
      expectedCommit: commit,
      expectedBuildNumber: explicitBuildNumber,
      expectedInstalledPlayBuildNumber: installedPlayBuildNumber,
      expectedFinalPlaySuccessorBuildNumber: finalPlaySuccessorBuildNumber,
      commandRunner: runner,
      apksignerPath: 'apksigner',
      aaptPath: 'aapt',
    }),
    /R2 candidate configuration is invalid/u,
  );
});

test('rejects a live boundary or noncanonical signature', async () => {
  const value = fixture();
  value.manifest.boundaries.providerCallPerformed = true;
  writeFileSync(
    resolve(value.directory, 'manifest.json'),
    `${JSON.stringify(value.manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  await assert.rejects(
    () => validateAndroidLocalQaCandidate({
      root: value.root,
      candidateDirectory: value.directory,
      expectedCommit: commit,
      expectedBuildNumber: explicitBuildNumber,
      expectedInstalledPlayBuildNumber: installedPlayBuildNumber,
      expectedFinalPlaySuccessorBuildNumber: finalPlaySuccessorBuildNumber,
      commandRunner: runner,
      apksignerPath: 'apksigner',
      aaptPath: 'aapt',
    }),
    /artifact or mutation boundary/u,
  );
});

test('enforces strict installed Play < local QA < final Play successor ordering', () => {
  assert.deepEqual(
    validateLocalQaBuildOrdering({
      installedPlayBuildNumber,
      localQaBuildNumber: explicitBuildNumber,
      finalPlaySuccessorBuildNumber,
    }),
    {
      installedPlayBuildNumber,
      localQaBuildNumber: explicitBuildNumber,
      finalPlaySuccessorBuildNumber,
    },
  );
  for (const ordering of [
    {
      installedPlayBuildNumber: explicitBuildNumber,
      localQaBuildNumber: explicitBuildNumber,
      finalPlaySuccessorBuildNumber,
    },
    {
      installedPlayBuildNumber,
      localQaBuildNumber: finalPlaySuccessorBuildNumber,
      finalPlaySuccessorBuildNumber,
    },
    {
      installedPlayBuildNumber: finalPlaySuccessorBuildNumber,
      localQaBuildNumber: explicitBuildNumber,
      finalPlaySuccessorBuildNumber,
    },
  ]) {
    assert.throws(
      () => validateLocalQaBuildOrdering(ordering),
      /Build ordering must be installed Play < local QA < final Play successor/u,
    );
  }
});
