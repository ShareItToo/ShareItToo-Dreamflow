import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createEphemeralAcceptancePassword } from '../ops/ephemeral_acceptance_password.mjs';
import {
  assertClosedPilotLegalReadiness,
  closedPilotListingPhotoTruth,
  resolveClosedPilotClientBuild,
} from '../ops/closed_pilot_acceptance.mjs';
import {
  listingPhotoTruthPolicyText,
  listingPhotoTruthPolicyVersion,
} from '../src/listing_photo_truth_policy.js';
import { detectHighConfidenceSecretRules } from '../ops/secret_scan_rules.mjs';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acceptanceFiles = [
  'ops/closed_pilot_acceptance.mjs',
  'ops/staging_b7_acceptance.mjs',
  'ops/staging_b8_acceptance.mjs',
  'ops/staging_b9_acceptance.mjs',
  'ops/staging_b10_acceptance.mjs',
  'test/postgres_foundation.integration.test.js',
];
test('ephemeral acceptance passwords are strong and unique', () => {
  const values = new Set();
  for (let index = 0; index < 32; index += 1) {
    const password = createEphemeralAcceptancePassword();
    assert.ok(password.length >= 32);
    assert.match(password, /[a-z]/u);
    assert.match(password, /[A-Z]/u);
    assert.match(password, /[0-9]/u);
    assert.match(password, /[^A-Za-z0-9]/u);
    values.add(password);
  }
  assert.equal(values.size, 32);
});

test('acceptance sources do not contain static password literals', async () => {
  for (const relativePath of acceptanceFiles) {
    const contents = await fs.readFile(path.join(backendRoot, relativePath), 'utf8');
    const findings = detectHighConfidenceSecretRules(contents, relativePath);
    assert.deepEqual(findings, [], relativePath);
  }
});

test('staging acceptance fixtures satisfy the closed-pilot declarations', async () => {
  for (const relativePath of acceptanceFiles.slice(1, 5)) {
    const contents = await fs.readFile(path.join(backendRoot, relativePath), 'utf8');
    assert.match(contents, /private_use_confirmed_at/u, relativePath);
    assert.match(contents, /privateStatusConfirmed:\s*true/u, relativePath);
    assert.match(contents, /\.\.\.closedPilotListingCategory/u, relativePath);
    assert.match(contents, /\.\.\.closedPilotLocation/u, relativePath);
    assert.match(contents, /closedPilotBookingBody\(/u, relativePath);
    assert.match(contents, /closedPilotOwnerAcceptanceBody\(\)/u, relativePath);
    assert.match(contents, /assertClosedPilotLegalReadiness\(pool\)/u, relativePath);
  }
});

test('B8 and B9 listing fixtures use the canonical safe photo-truth declaration', async () => {
  assert.deepEqual(closedPilotListingPhotoTruth, {
    photoTruthPolicyVersion: listingPhotoTruthPolicyVersion,
    photoTruthAttestation: listingPhotoTruthPolicyText,
    photoTruthClassifications: ['unknown'],
  });
  for (const relativePath of [
    'ops/staging_b8_acceptance.mjs',
    'ops/staging_b9_acceptance.mjs',
  ]) {
    const contents = await fs.readFile(path.join(backendRoot, relativePath), 'utf8');
    assert.match(contents, /\.\.\.closedPilotListingPhotoTruth/u, relativePath);
    assert.doesNotMatch(contents, /['"](?:generated|materially_altered)['"]/u, relativePath);
  }
});

test('closed-pilot client build preflight is strict and reusable before mutation', async () => {
  assert.equal(
    resolveClosedPilotClientBuild({ ACCEPTANCE_CLIENT_BUILD: '1.0.0+2026092205' }),
    '1.0.0+2026092205',
  );
  for (const value of [undefined, '', '1.0.0+20260922', '1.0.1+2026092205', ' 1.0.0+2026092205']) {
    assert.throws(
      () => resolveClosedPilotClientBuild({ ACCEPTANCE_CLIENT_BUILD: value }),
      /ACCEPTANCE_CLIENT_BUILD must bind the exact closed-pilot Android candidate/u,
    );
  }
  for (const relativePath of [
    'ops/staging_b8_acceptance.mjs',
    'ops/staging_b9_acceptance.mjs',
  ]) {
    const contents = await fs.readFile(path.join(backendRoot, relativePath), 'utf8');
    assert.ok(
      contents.indexOf('resolveClosedPilotClientBuild();')
        < contents.indexOf('INSERT INTO users'),
      relativePath,
    );
  }
});

test('closed-pilot acceptance fails before fixtures when V5.2 snapshots are unavailable', async () => {
  await assert.rejects(
    assertClosedPilotLegalReadiness({ query: async () => ({ rows: [] }) }),
    /closed_pilot_v52_legal_snapshots_not_ready/u,
  );
});

test('secret scan catches bare password names and mostly-static templates', () => {
  const directAssignment = ['const password = "', 'static-value-123', '";'].join('');
  const mostlyStaticTemplate = [
    'const password = `',
    'static-prefix-',
    '${suffix}`;',
  ].join('');

  assert.deepEqual(
    detectHighConfidenceSecretRules(directAssignment, 'fixture.mjs'),
    ['static_password_assignment'],
  );
  assert.deepEqual(
    detectHighConfidenceSecretRules(mostlyStaticTemplate, 'fixture.mjs'),
    ['static_password_template_assignment'],
  );
});

test('secret scan allows a short policy prefix with cryptographic randomness', () => {
  const runtimeGeneratedTemplate = [
    'const password = `',
    'Aa9!',
    '${crypto.randomBytes(24).toString("base64url")}`;',
  ].join('');

  assert.deepEqual(
    detectHighConfidenceSecretRules(runtimeGeneratedTemplate, 'fixture.mjs'),
    [],
  );
});
