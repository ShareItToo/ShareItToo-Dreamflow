import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { validateManifest } from '../../tool/validate_sit_pilot_feature_scope_20260917.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(
  root,
  'store/google-play/sit-pilot-feature-scope-20260917.json',
), 'utf8'));
const releasePreflight = readFileSync(resolve(
  root,
  'scripts/release_candidate_preflight.sh',
), 'utf8');

test('accepts a complete private-pilot inventory when every path is allowed', () => {
  const allowed = structuredClone(manifest);
  allowed.reachablePaths = allowed.reachablePaths
    .filter((entry) => entry.pilot === 'allowed')
    .map((entry) => ({ ...entry }));
  allowed.expectedReachableGroups = allowed.expectedReachableGroups
    .filter((id) => allowed.reachablePaths.some((entry) => entry.id === id));
  const result = validateManifest(allowed, { repositoryRoot: root });
  assert.equal(result.status, 'PASS');
  assert.equal(result.blockerCount, 0);
  assert.equal(result.inventoryCount, result.allowedCount);
});

test('accepts the reachable identity and MFA status/action surfaces with explicit runtime parity', () => {
  const result = validateManifest(manifest, { repositoryRoot: root });
  assert.equal(result.status, 'PASS');
  assert.equal(result.blockerCount, 0);
  assert.equal(result.allowedCount, 23);
  assert.equal(manifest.reachablePaths.find((entry) => entry.id === 'identity_verification')?.pilot, 'allowed');
  assert.equal(manifest.reachablePaths.find((entry) => entry.id === 'mfa')?.pilot, 'allowed');
});

test('rejects deceptive placeholder or no-op effects even on an otherwise allowed path', () => {
  const changed = structuredClone(manifest);
  changed.reachablePaths = changed.reachablePaths.filter((entry) => entry.id === 'discover');
  changed.reachablePaths[0].effect = 'toast-only-placeholder';
  assert.throws(
    () => validateManifest(changed, { repositoryRoot: root }),
    /unsafe_or_deceptive_effect:discover/u,
  );
});

test('rejects missing focused proof or reachability markers', () => {
  const changed = structuredClone(manifest);
  changed.reachablePaths = changed.reachablePaths.filter((entry) => entry.id === 'discover');
  changed.reachablePaths[0].proof = [];
  assert.throws(
    () => validateManifest(changed, { repositoryRoot: root }),
    /proof_missing:discover/u,
  );
});

test('runs the feature-scope gate in the release candidate preflight', () => {
  assert.match(releasePreflight, /node --check tool\/validate_sit_pilot_feature_scope_20260917\.mjs/u);
  assert.match(releasePreflight, /node tool\/validate_sit_pilot_feature_scope_20260917\.mjs/u);
});

test('rejects stale or optimistic runtime parity claims', () => {
  const changed = structuredClone(manifest);
  changed.runtimeEvidence.mfa.statusHttp = 200;
  assert.throws(
    () => validateManifest(changed, { repositoryRoot: root }),
    /runtime_evidence_manifest_drift/u,
  );
});

test('rejects runtime evidence drift from the bound readback artifact', () => {
  const changed = structuredClone(manifest);
  changed.runtimeEvidence.payment.mode = 'test';
  assert.throws(
    () => validateManifest(changed, { repositoryRoot: root }),
    /runtime_evidence_manifest_drift/u,
  );
});
