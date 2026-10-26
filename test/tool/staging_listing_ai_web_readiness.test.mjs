import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LISTING_AI_WEB_PROFILE,
  bindListingAiWebReadiness,
  readListingAiWebReadiness,
} from '../../tool/staging_listing_ai_web_readiness.mjs';
import { profile, sealArtifact, validateArtifact } from '../../tool/staging_web_contract.mjs';
import { buildArchive } from '../../tool/staging_web_archive.mjs';
import { syntheticListingAiWebEvidence } from './staging_listing_ai_web_readiness_fixture.mjs';
import { syntheticGoogleBinding } from './staging_google_web_readiness_fixture.mjs';
import { bindGoogleWebCurrentReadback, GOOGLE_WEB_PROFILE_V3 } from '../../tool/staging_google_web_current_readback.mjs';
import { syntheticGoogleCurrentEvidence } from './staging_google_web_current_readback_fixture.mjs';
import { syntheticAppleBinding } from './staging_apple_web_readiness_fixture.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const source = 'a'.repeat(40);
const version = '1.0.0+2026092905';
function refreshEvidence(evidence) {
  evidence.configurationSha256 = sha(JSON.stringify(evidence.configuration));
  evidence.capability.configurationSha256 = evidence.configurationSha256;
  evidence.capabilitySha256 = sha(JSON.stringify(evidence.capability));
  evidence.geminiDecision.configurationSha256 = evidence.configurationSha256;
  evidence.geminiDecision.capabilitySha256 = evidence.capabilitySha256;
  evidence.geminiDecisionSha256 = sha(JSON.stringify(evidence.geminiDecision));
  return sha(JSON.stringify(evidence));
}

test('fresh exact Web/runtime capability plus independent Gemini decision enables only the assistant flag', (t) => {
  const now = new Date();
  const { evidence, digest } = syntheticListingAiWebEvidence(source, version, { now });
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-web-')));
  fs.chmodSync(temp, 0o700);
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'readiness.json');
  fs.writeFileSync(file, JSON.stringify(evidence), { mode: 0o600, flag: 'wx' });
  const binding = readListingAiWebReadiness(file, digest, {
    now, expectedSource: source, expectedVersion: version,
  });
  const buildProfile = profile(source, version, null, null, null, null, binding);
  assert.equal(binding.profileVersion, LISTING_AI_WEB_PROFILE);
  assert.equal(buildProfile.SIT_BLUE_OCEAN_LISTING_ASSISTANT, 'true');
  assert.equal(buildProfile.SIT_STAGE_A_NON_BINDING_PILOT, 'false');
  assert.equal(buildProfile.SIT_STAGE_A_PILOT_ID, '');
  assert.equal(buildProfile.SIT_BACKEND_ENABLED, 'true');
  assert.equal(buildProfile.SIT_API_BASE_URL, 'https://staging.shareittoo.com/api/v1');
  for (const key of ['SIT_SOCIAL_GOOGLE_ENABLED', 'SIT_SOCIAL_APPLE_ENABLED',
    'SIT_SOCIAL_FACEBOOK_ENABLED', 'SIT_SYNTHETIC_CLONE_BOOKING_LANE',
    'SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE']) assert.equal(buildProfile[key], 'false');

  const artifact = path.join(temp, 'artifact');
  fs.mkdirSync(path.join(artifact, 'web'), { recursive: true });
  for (const [name, bytes] of Object.entries({
    'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'synthetic compiled fixture',
    'manifest.json': '{"name":"ShareItToo"}',
    'flutter_bootstrap.js': '_flutter.loader.load();',
  })) fs.writeFileSync(path.join(artifact, 'web', name), bytes);
  const manifestHash = sealArtifact({ directory: artifact, source, version,
    flutterVersion: { frameworkVersion: 'fixture' }, builderDigest: 'c'.repeat(64),
    listingAiWeb: binding });
  const manifest = validateArtifact(artifact, manifestHash, source);
  assert.equal(manifest.profile.SIT_BLUE_OCEAN_LISTING_ASSISTANT, 'true');
  assert.equal(manifest.schemaVersion, 8);
  assert.equal(manifest.listingAiWebProfileVersion, LISTING_AI_WEB_PROFILE);
  assert.equal(manifest.listingAiWebProviderSchemaVersion, 1);
  assert.equal(manifest.listingAiWebReadinessDigest, digest);
  assert.equal(manifest.listingAiWebConfigurationDigest, binding.configurationDigest);
  assert.equal(manifest.listingAiWebCapabilityDigest, binding.capabilityDigest);
  assert.equal(manifest.listingAiWebDecisionDigest, binding.decisionDigest);
  assert.equal(manifest.listingAiWebValidatedAtUtc, now.toISOString());
  const archive = path.join(temp, 'listing-ai-web.tar');
  const archiveProof = buildArchive(artifact, manifestHash, archive);
  assert.equal(archiveProof.manifestHash, manifestHash);
  assert.equal(archiveProof.archiveHash, sha(fs.readFileSync(archive)));
  const tamperedPath = path.join(artifact, 'staging-web-manifest.json');
  const tampered = JSON.parse(fs.readFileSync(tamperedPath, 'utf8'));
  tampered.listingAiWebDecisionDigest = 'e'.repeat(64);
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`);
  const tamperedHash = sha(fs.readFileSync(tamperedPath));
  fs.writeFileSync(path.join(artifact, 'SHA256SUMS'), `${tamperedHash}  staging-web-manifest.json\n${Object.entries(tampered.files).map(([file, hash]) => `${hash}  web/${file}\n`).join('')}`);
  assert.throws(() => validateArtifact(artifact, tamperedHash, source),
    /listing_ai_web_binding_mismatch/u);
});

test('schema 8 composes listing-AI readiness with Google and Apple Web profiles', (t) => {
  const now = new Date();
  const { evidence, digest } = syntheticListingAiWebEvidence(source, version, { now });
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-web-combined-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const readiness = path.join(temp, 'readiness.json'); fs.mkdirSync(readiness, { mode: 0o700 });
  fs.chmodSync(readiness, 0o700);
  const readinessFile = path.join(readiness, 'listing-ai.json');
  fs.writeFileSync(readinessFile, JSON.stringify(evidence), { mode: 0o600, flag: 'wx' });
  const listingAiWeb = readListingAiWebReadiness(readinessFile, digest, {
    now, expectedSource: source, expectedVersion: version,
  });
  for (const [name, provider, expectedProviderSchemaVersion] of [
    ['google', { googleWeb: syntheticGoogleBinding(source, { now }) }, 6],
    ['apple', { appleWeb: syntheticAppleBinding(source, { now }) }, 7],
  ]) {
    const artifact = path.join(temp, name);
    fs.mkdirSync(path.join(artifact, 'web'), { recursive: true });
    for (const [file, bytes] of Object.entries({
      'index.html': '<script src="flutter_bootstrap.js" async></script>',
      'main.dart.js': 'synthetic compiled fixture', 'manifest.json': '{}',
      'flutter_bootstrap.js': 'bootstrap();',
    })) fs.writeFileSync(path.join(artifact, 'web', file), bytes);
    const manifestHash = sealArtifact({ directory: artifact, source, version,
      flutterVersion: { frameworkVersion: 'fixture' }, builderDigest: 'd'.repeat(64),
      ...provider, listingAiWeb });
    const manifest = validateArtifact(artifact, manifestHash, source);
    assert.equal(manifest.schemaVersion, 8);
    assert.equal(manifest.listingAiWebProviderSchemaVersion, expectedProviderSchemaVersion);
    assert.equal(manifest.profile.SIT_BLUE_OCEAN_LISTING_ASSISTANT, 'true');
    assert.equal(manifest.profile.SIT_SOCIAL_GOOGLE_ENABLED, name === 'google' ? 'true' : 'false');
    assert.equal(manifest.profile.SIT_SOCIAL_APPLE_ENABLED, name === 'apple' ? 'true' : 'false');
  }
});

test('schema 10 composes Listing-AI readiness with Google current-readback v3', (t) => {
  const now = new Date();
  const { evidence, digest } = syntheticListingAiWebEvidence(source, version, { now });
  const googleEvidence = syntheticGoogleCurrentEvidence(source, version);
  const googleWeb = bindGoogleWebCurrentReadback(googleEvidence.envelope, googleEvidence.digest,
    { now: googleEvidence.now, expectedSource: source, expectedVersion: version });
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-google-v3-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const readiness = path.join(temp, 'readiness');
  fs.mkdirSync(readiness, { mode: 0o700 }); fs.chmodSync(readiness, 0o700);
  const readinessFile = path.join(readiness, 'listing-ai.json');
  fs.writeFileSync(readinessFile, JSON.stringify(evidence), { mode: 0o600, flag: 'wx' });
  const listingAiWeb = readListingAiWebReadiness(readinessFile, digest,
    { now, expectedSource: source, expectedVersion: version });
  const artifact = path.join(temp, 'artifact');
  fs.mkdirSync(path.join(artifact, 'web'), { recursive: true });
  for (const [file, bytes] of Object.entries({
    'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'synthetic compiled fixture', 'manifest.json': '{}',
    'flutter_bootstrap.js': 'bootstrap();',
  })) fs.writeFileSync(path.join(artifact, 'web', file), bytes);
  const manifestHash = sealArtifact({ directory: artifact, source, version,
    flutterVersion: { frameworkVersion: 'fixture' }, builderDigest: 'f'.repeat(64),
    googleWeb, listingAiWeb });
  const manifest = validateArtifact(artifact, manifestHash, source);
  assert.equal(manifest.schemaVersion, 10);
  assert.equal(manifest.profileContractVersion, GOOGLE_WEB_PROFILE_V3);
  assert.equal(manifest.listingAiWebProviderSchemaVersion, 9);
  assert.equal(manifest.profile.SIT_SOCIAL_GOOGLE_ENABLED, 'true');
  assert.equal(manifest.profile.SIT_BLUE_OCEAN_LISTING_ASSISTANT, 'true');
  assert.equal(manifest.profile.SIT_SOCIAL_APPLE_ENABLED, 'false');
  assert.equal(manifest.profile.SIT_SOCIAL_FACEBOOK_ENABLED, 'false');
  assert.equal(manifest.googleWebServiceAccountReadbackSha256,
    googleEvidence.envelope.serviceAccountReadbackSha256);
  assert.equal(manifest.googleWebCloudConsoleReadbackSha256,
    googleEvidence.envelope.cloudConsoleReadbackSha256);
  assert.equal(manifest.listingAiWebReadinessDigest, digest);
});

test('rejects unsupported client, expired evidence, and a widened external boundary', () => {
  const now = new Date();
  const fixture = syntheticListingAiWebEvidence(source, version, { now });
  assert.throws(() => bindListingAiWebReadiness(fixture.evidence, fixture.digest, {
    now, expectedSource: 'd'.repeat(40), expectedVersion: version,
  }), /listing_ai_web_source_binding/u);
  assert.throws(() => bindListingAiWebReadiness(fixture.evidence, fixture.digest, {
    now: new Date(now.getTime() + 31 * 60_000), expectedSource: source,
    expectedVersion: version,
  }), /listing_ai_web_readiness_stale/u);
  const widened = structuredClone(fixture.evidence);
  widened.configuration.automaticPublicationAllowed = true;
  widened.configurationSha256 = sha(JSON.stringify(widened.configuration));
  widened.capability.configurationSha256 = widened.configurationSha256;
  widened.capabilitySha256 = sha(JSON.stringify(widened.capability));
  widened.geminiDecision.configurationSha256 = widened.configurationSha256;
  widened.geminiDecision.capabilitySha256 = widened.capabilitySha256;
  widened.geminiDecisionSha256 = sha(JSON.stringify(widened.geminiDecision));
  assert.throws(() => bindListingAiWebReadiness(widened, sha(JSON.stringify(widened)), {
    now, expectedSource: source, expectedVersion: version,
  }), /listing_ai_web_configuration_invalid/u);
  for (const [field, value] of [
    ['budgetCents', 500],
    ['stagingSmokeBudgetCents', 501],
    ['runMaxProviderCalls', 6],
  ]) {
    const changed = structuredClone(fixture.evidence);
    changed.configuration[field] = value;
    const changedDigest = refreshEvidence(changed);
    assert.throws(() => bindListingAiWebReadiness(changed, changedDigest, {
      now, expectedSource: source, expectedVersion: version,
    }), /listing_ai_web_configuration_invalid/u, field);
  }
  const mismatchedCapability = structuredClone(fixture.evidence);
  mismatchedCapability.capability.stagingSmokeActivationId =
    '22222222-2222-4222-8222-222222222222';
  assert.throws(() => bindListingAiWebReadiness(
    mismatchedCapability,
    refreshEvidence(mismatchedCapability),
    { now, expectedSource: source, expectedVersion: version },
  ), /listing_ai_web_capability_invalid/u);
  for (const [field, expectedError] of [
    ['providerSecretMetadataValidated', /listing_ai_web_secret_or_rollback_proof_invalid/u],
    ['rollbackToMockVerified', /listing_ai_web_secret_or_rollback_proof_invalid/u],
  ]) {
    const weakened = structuredClone(fixture.evidence);
    weakened.configuration[field] = false;
    const weakenedDigest = refreshEvidence(weakened);
    assert.throws(() => bindListingAiWebReadiness(weakened, weakenedDigest, {
      now, expectedSource: source, expectedVersion: version,
    }), expectedError);
  }
});
