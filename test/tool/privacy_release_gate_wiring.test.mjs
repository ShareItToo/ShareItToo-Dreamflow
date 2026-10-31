import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

test('release preflight always validates the privacy draft and requires approval for Store mode', () => {
  const source = readFileSync(resolve(repositoryRoot, 'scripts/release_candidate_preflight.sh'), 'utf8');
  assert.match(source, /node --check tool\/validate_privacy_disclosures\.mjs/);
  assert.match(source, /node tool\/validate_privacy_disclosures\.mjs\n/);
  assert.match(
    source,
    /if \[\[ "\$\{SIT_REQUIRE_STORE_SUBMISSION:-0\}" == "1" \]\]; then[\s\S]*node tool\/validate_privacy_disclosures\.mjs --require-approved/,
  );
  assert.ok(
    source.indexOf('node tool/validate_privacy_disclosures.mjs --require-approved')
      < source.indexOf('dart run tool/validate_store_metadata.dart --require-submittable'),
  );
});

test('technical regression runs syntax, tests, and the honest privacy draft validator', () => {
  const source = readFileSync(resolve(repositoryRoot, 'scripts/technical_regression_check.sh'), 'utf8');
  for (const command of [
    'node --check tool/validate_privacy_disclosures.mjs',
    'node --test test/tool/validate_privacy_disclosures.test.mjs',
    'node tool/validate_privacy_disclosures.mjs',
  ]) {
    assert.ok(source.includes(command), `technical regression is missing: ${command}`);
  }
});

test('signed binary privacy scan requires the backend Maps proxy and rejects direct client calls', () => {
  const source = readFileSync(resolve(repositoryRoot, 'tool/verify_android_binary_privacy.mjs'), 'utf8');
  for (const labels of [
    ['nominatim', 'openstreetmap', 'org'],
    ['tile', 'openstreetmap', 'org'],
    ['maps', 'googleapis', 'com'],
  ]) {
    assert.equal(source.includes(labels.join('.')), true);
  }
  assert.match(source, /Google Maps Platform/);
  assert.match(source, /!googleMapsEndpointPresent/);
  assert.match(source, /googleMapsProxyEndpointPresent/);
  assert.match(source, /codeEndpointPresent: googleMapsEndpointPresent/);
  assert.match(source, /serverCredentialVerification: 'backend-deployment-gate'/);
  assert.match(source, /googleMapsServerCredentialApiAndIpRestrictions/);
  assert.equal(source.includes(['api', 'openai', 'com'].join('.')), true);
  assert.match(source, /FirebaseAuthRegistrar/);
  assert.match(source, /Facebook automatic app events must be explicitly disabled/);
  assert.match(source, /Facebook advertiser ID collection must be explicitly disabled/);
});

test('release builder refuses to embed a Google Maps client credential', () => {
  const source = readFileSync(
    resolve(repositoryRoot, 'scripts/build_android_release_candidate.sh'),
    'utf8',
  );
  assert.match(source, /if \[\[ -n "\$\{GOOGLE_MAPS_API_KEY:-\}" \]\]; then/);
  assert.match(source, /must not be embedded in an app build/);
  assert.doesNotMatch(source, /--dart-define=GOOGLE_MAPS_API_KEY=/);
});

test('Store preflight refuses placeholder Meta login configuration', () => {
  const source = readFileSync(
    resolve(repositoryRoot, 'scripts/release_candidate_preflight.sh'),
    'utf8',
  );
  assert.match(source, /Store submission requires the real public Meta App ID/);
  assert.match(source, /Store submission requires the real public Meta Client Token/);
});
