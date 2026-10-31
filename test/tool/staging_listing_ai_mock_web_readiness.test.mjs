import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LISTING_AI_MOCK_WEB_PROFILE, bindListingAiMockWebReadiness,
  readListingAiMockWebReadiness } from '../../tool/staging_listing_ai_mock_web_readiness.mjs';
import { profile, sealArtifact, validateArtifact } from '../../tool/staging_web_contract.mjs';
import { syntheticListingAiMockWebEvidence } from './staging_listing_ai_mock_web_readiness_fixture.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const source = 'a'.repeat(40); const version = '1.0.0+2026092905';

test('fresh authenticated staging mock capability binds synthetic-only profile and sealed artifact', (t) => {
  const now = new Date(); const fixture = syntheticListingAiMockWebEvidence(source, version, { now });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-mock-web-')));
  fs.chmodSync(root, 0o700); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'readiness.json');
  fs.writeFileSync(file, JSON.stringify(fixture.evidence), { mode: 0o600, flag: 'wx' });
  const binding = readListingAiMockWebReadiness(file, fixture.digest, { now, expectedSource: source, expectedVersion: version });
  assert.equal(binding.profileVersion, LISTING_AI_MOCK_WEB_PROFILE);
  const p = profile(source, version, null, null, null, null, binding);
  assert.equal(p.SIT_BLUE_OCEAN_LISTING_ASSISTANT, 'true');
  assert.match(p.SIT_BLUE_OCEAN_LISTING_ASSISTANT_READINESS_JSON, /synthetische KI-Antwort/u);
  assert.equal(p.SIT_BACKEND_ENABLED, 'true'); assert.equal(p.SIT_API_BASE_URL, 'https://staging.shareittoo.com/api/v1');
  assert.equal(p.SIT_STAGE_A_NON_BINDING_PILOT, 'false');
  const artifact = path.join(root, 'artifact'); fs.mkdirSync(path.join(artifact, 'web'), { recursive: true });
  for (const [name, bytes] of Object.entries({ 'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'synthetic compiled fixture', 'manifest.json': '{}', 'flutter_bootstrap.js': '_flutter.loader.load();' })) {
    fs.writeFileSync(path.join(artifact, 'web', name), bytes);
  }
  const digest = sealArtifact({ directory: artifact, source, version,
    flutterVersion: { frameworkVersion: 'fixture' }, builderDigest: 'c'.repeat(64), listingAiWeb: binding });
  const manifest = validateArtifact(artifact, digest, source);
  assert.equal(manifest.listingAiWebProfileVersion, LISTING_AI_MOCK_WEB_PROFILE);
  assert.equal(manifest.listingAiWebReadinessDigest, fixture.digest);
  assert.equal(manifest.profile.SIT_BLUE_OCEAN_LISTING_ASSISTANT, 'true');
});

test('mock readiness rejects drift, unsafe modes, external-provider eligibility, missing disclosure, and stale evidence', (t) => {
  const now = new Date(); const base = syntheticListingAiMockWebEvidence(source, version, { now });
  const changed = (mutate) => { const e = structuredClone(base.evidence); mutate(e); e.configurationSha256 = sha(JSON.stringify(e.configuration));
    e.capability.configurationSha256 = e.configurationSha256; e.capabilitySha256 = sha(JSON.stringify(e.capability));
    return { evidence: e, digest: sha(JSON.stringify(e)) }; };
  for (const mutate of [
    (e) => { e.configuration.provider = 'openai'; },
    (e) => { e.configuration.budgetCents = 1; },
    (e) => { e.configuration.externalProviderExecutionAllowed = true; },
    (e) => { e.configuration.automaticPublicationAllowed = true; },
    (e) => { e.configuration.productionEligible = true; },
    (e) => { e.capability.disclosureText = 'AI-generated result'; },
    (e) => { e.runtime.runtimeCommit = 'd'.repeat(40); },
  ]) {
    const bad = changed(mutate);
    assert.throws(() => bindListingAiMockWebReadiness(bad.evidence, bad.digest, { now, expectedSource: source, expectedVersion: version }));
  }
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-mock-mode-')));
  fs.chmodSync(temp, 0o700); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'readiness.json');
  fs.writeFileSync(file, JSON.stringify(base.evidence), { mode: 0o644, flag: 'wx' });
  assert.throws(() => readListingAiMockWebReadiness(file, base.digest, { now, expectedSource: source, expectedVersion: version }), /listing_ai_mock_web_file/u);
  assert.throws(() => bindListingAiMockWebReadiness(base.evidence, base.digest, { now: new Date(Date.now() + 20 * 60_000), expectedSource: source, expectedVersion: version }), /listing_ai_mock_web_stale/u);
});
