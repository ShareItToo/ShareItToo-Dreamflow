import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { archiveAndroidReleaseCandidate } from '../../tool/archive_android_release_candidate.mjs';

const versionName = '1.0.0';
const buildNumber = '2026081403';
const commit = 'a'.repeat(40);
const certificate = '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4';
const releaseBuilder = await readFile(
  new URL('../../scripts/build_android_release_candidate.sh', import.meta.url),
  'utf8',
);
const technicalRegression = await readFile(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture(mutate = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'sit-archive-candidate-'));
  const sourceDirectory = join(root, 'source');
  const archiveRoot = join(root, 'private-archive');
  await mkdir(sourceDirectory);
  const aabName = `shareittoo-${versionName}-${buildNumber}-${commit}.aab`;
  const apkName = `shareittoo-${versionName}-${buildNumber}-${commit}.apk`;
  const aab = Buffer.from('exact-aab');
  const apk = Buffer.from('exact-apk');
  const privacy = Buffer.from('{"status":"passed"}\n');
  const manifest = {
    platform: 'android',
    applicationId: 'com.shareittoo.app',
    versionName,
    versionCode: buildNumber,
    commit,
    channel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    clientBuild: `${versionName}+${buildNumber}`,
    blueOceanListingAssistantEnabled: false,
    listingAiExecutionLocation: 'disabled',
    listingAiModel: '',
    listingAiExternalImageProviderEnabled: false,
    stageANonBindingPilotEnabled: false,
    closedPilotEnvelopeEnabled: false,
    stageAPilotId: '',
    g3TechnicalUiEnabled: false,
    g4TechnicalUiEnabled: false,
    g5SupplyEnrichmentTechnicalUiEnabled: false,
    g5ListingSetsTechnicalUiEnabled: false,
    firebaseConfigured: true,
    signingCertificateSha256: certificate,
    androidBinaryPrivacyScan: 'passed',
    androidBinaryPrivacyReport: 'privacy-scan.json',
    androidBinaryPrivacyReportSha256: digest(privacy),
    aabSha256: digest(aab),
    apkSha256: digest(apk),
  };
  await mutate({ sourceDirectory, manifest, aabName, apkName, aab, apk, privacy });
  await writeFile(join(sourceDirectory, aabName), aab);
  await writeFile(join(sourceDirectory, apkName), apk);
  await writeFile(join(sourceDirectory, 'privacy-scan.json'), privacy);
  await writeFile(join(sourceDirectory, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  return { root, sourceDirectory, archiveRoot, manifest, aabName, apkName };
}

function archive(data) {
  return archiveAndroidReleaseCandidate({
    sourceDirectory: data.sourceDirectory,
    archiveRoot: data.archiveRoot,
    expectedVersionName: versionName,
    expectedBuildNumber: buildNumber,
    expectedCommit: commit,
  });
}

function enableOnDeviceListingAi(manifest) {
  manifest.blueOceanListingAssistantEnabled = true;
  manifest.listingAiExecutionLocation = 'android_on_device';
  manifest.listingAiModel =
    'mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1';
}

test('archives and verifies the exact candidate without exposing its path', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const result = archive(data);
  assert.equal(result.status, 'archived-and-verified');
  assert.equal(result.archiveDirectoryName, `${buildNumber}-${commit}`);
  assert.equal(result.boundaries.overwriteAllowed, false);
  assert.equal(result.boundaries.externalUploadPerformed, false);
  assert.equal(result.candidate.blueOceanListingAssistantEnabled, false);
  assert.equal(result.candidate.listingAiExecutionLocation, 'disabled');
  assert.equal(result.candidate.listingAiExternalImageProviderEnabled, false);
  assert.equal(result.candidate.stageANonBindingPilotEnabled, false);
  assert.equal(result.candidate.closedPilotEnvelopeEnabled, false);
  assert.equal(JSON.stringify(result).includes(data.root), false);
  const archived = join(data.archiveRoot, result.archiveDirectoryName, data.aabName);
  assert.deepEqual(await readFile(archived), Buffer.from('exact-aab'));
  assert.equal((await stat(archived)).mode & 0o777, 0o600);
});

test('refuses to overwrite an existing exact archive', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  archive(data);
  assert.throws(() => archive(data), /will not be overwritten/);
});

test('rejects a changed artifact hash', async (t) => {
  const data = await fixture(({ manifest }) => { manifest.aabSha256 = '0'.repeat(64); });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => archive(data), /hash verification/);
});

test('rejects extra candidate artifacts in the evidence directory', async (t) => {
  const data = await fixture(async ({ sourceDirectory }) => {
    await writeFile(join(sourceDirectory, 'unexpected.aab'), 'other');
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => archive(data), /exactly one \.aab/);
});

test('rejects a non-canonical upload certificate', async (t) => {
  const data = await fixture(({ manifest }) => {
    manifest.signingCertificateSha256 = 'f'.repeat(64);
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => archive(data), /exact internal Staging candidate/);
});

test('rejects a Blue Ocean candidate without the non-binding Stage-A gate', async (t) => {
  const data = await fixture(({ manifest }) => {
    enableOnDeviceListingAi(manifest);
    manifest.stageANonBindingPilotEnabled = false;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => archive(data), /exact internal Staging candidate/);
});

test('accepts only the exact fully bound closed heilbronn Wave-0 envelope', async (t) => {
  const data = await fixture(({ manifest }) => {
    enableOnDeviceListingAi(manifest);
    manifest.stageANonBindingPilotEnabled = true;
    manifest.closedPilotEnvelopeEnabled = true;
    manifest.stageAPilotId = 'heilbronn_wave0';
    manifest.g3TechnicalUiEnabled = true;
    manifest.g4TechnicalUiEnabled = true;
    manifest.g5SupplyEnrichmentTechnicalUiEnabled = true;
    manifest.g5ListingSetsTechnicalUiEnabled = true;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const result = archive(data);
  assert.equal(result.candidate.closedPilotEnvelopeEnabled, true);
  assert.equal(result.candidate.stageAPilotId, 'heilbronn_wave0');
  assert.equal(result.candidate.g3TechnicalUiEnabled, true);
  assert.equal(result.candidate.g4TechnicalUiEnabled, true);
  assert.equal(result.candidate.g5SupplyEnrichmentTechnicalUiEnabled, true);
  assert.equal(result.candidate.g5ListingSetsTechnicalUiEnabled, true);
  assert.equal(result.candidate.listingAiExecutionLocation, 'android_on_device');
  assert.equal(result.candidate.listingAiExternalImageProviderEnabled, false);
});

test('rejects a partial or differently identified closed pilot envelope', async (t) => {
  const data = await fixture(({ manifest }) => {
    enableOnDeviceListingAi(manifest);
    manifest.stageANonBindingPilotEnabled = true;
    manifest.closedPilotEnvelopeEnabled = true;
    manifest.stageAPilotId = 'other_wave';
    manifest.g3TechnicalUiEnabled = true;
    manifest.g4TechnicalUiEnabled = true;
    manifest.g5SupplyEnrichmentTechnicalUiEnabled = false;
    manifest.g5ListingSetsTechnicalUiEnabled = true;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => archive(data), /exact internal Staging candidate/);
});

test('release build archives only after candidate evidence is complete', () => {
  const archiveCommand = 'node tool/archive_android_release_candidate.mjs';
  assert.ok(releaseBuilder.includes(archiveCommand));
  assert.ok(releaseBuilder.indexOf('cp "$apk"') < releaseBuilder.indexOf(archiveCommand));
  assert.ok(technicalRegression.includes(
    'node --test test/tool/archive_android_release_candidate.test.mjs',
  ));
});
