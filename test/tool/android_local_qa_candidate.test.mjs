import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateAndroidLocalQaCandidate } from '../../tool/validate_android_local_qa_candidate.mjs';
import { canonicalAndroidSigningCertificateSha256 } from '../../tool/validate_current_head_android_release_archive.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();
const commit = 'b'.repeat(40);
const defaultBuildNumber = '2026082303';

function fixture(buildNumber = defaultBuildNumber) {
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

function runnerFor(buildNumber = defaultBuildNumber) {
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
    commandRunner: runner,
    apksignerPath: 'apksigner',
    aaptPath: 'aapt',
    includePrivateArtifact: true,
  });
  assert.equal(result.applicationId, 'com.shareittoo.app');
  assert.equal(result.buildNumber, '2026082303');
  assert.equal(result.apkPath, resolve(value.directory, value.manifest.artifact.fileName));
  assert.equal(result.signingCertificateSha256, canonicalAndroidSigningCertificateSha256);
  assert.equal(result.apiBaseUrl, 'http://127.0.0.1:18080/api/v1');
  assert.equal(result.firebaseConfigured, false);
});

test('accepts an explicitly newer local QA build without changing the R2 default', async () => {
  const buildNumber = '2026082401';
  const value = fixture(buildNumber);
  const result = await validateAndroidLocalQaCandidate({
    root: value.root,
    candidateDirectory: value.directory,
    expectedCommit: commit,
    expectedBuildNumber: buildNumber,
    commandRunner: runnerFor(buildNumber),
    apksignerPath: 'apksigner',
    aaptPath: 'aapt',
  });
  assert.equal(result.buildNumber, buildNumber);
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
      commandRunner: runner,
      apksignerPath: 'apksigner',
      aaptPath: 'aapt',
    }),
    /artifact or mutation boundary/u,
  );
});
