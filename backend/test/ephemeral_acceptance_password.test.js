import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createEphemeralAcceptancePassword } from '../ops/ephemeral_acceptance_password.mjs';
import { assertClosedPilotLegalReadiness } from '../ops/closed_pilot_acceptance.mjs';
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
