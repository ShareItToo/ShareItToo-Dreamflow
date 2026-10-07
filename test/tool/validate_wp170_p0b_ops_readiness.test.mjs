import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateWP170P0BOpsReadiness } from '../../tool/validate_wp170_p0b_ops_readiness.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const manifest = JSON.parse(readFileSync(resolve(root, 'docs/operations/p0b-ops-role-delegate-absence-gate-wp170.json'), 'utf8'));

test('accepts the WP170 successor while retaining the external hold', () => {
  assert.deepEqual(validateWP170P0BOpsReadiness({ root, manifest }), {
    version: 'P0B-OPS-2026-09-16.170',
    state: 'hold-external-assignments-and-human-absence-tests',
    requiredRoles: 6,
    assignedRoles: 0,
    technicalRehearsalsPassed: 4,
    humanAbsenceTestsPassed: 0,
    operationsReady: false,
  });
});

test('rejects historical P0B source drift', () => {
  assert.throws(
    () => validateWP170P0BOpsReadiness({
      root,
      manifest,
      sourceOverrides: {
        'docs/operations/p0b-ops-role-delegate-absence-gate.json': '{}',
      },
    }),
    /Historical P0B manifest changed/u,
  );
});

test('rejects runtime source drift', () => {
  assert.throws(
    () => validateWP170P0BOpsReadiness({
      root,
      manifest,
      sourceOverrides: { 'backend/src/operational_readiness_gate.js': 'changed' },
    }),
    /successor source drift: backend\/src\/operational_readiness_gate\.js/u,
  );
});

test('rejects a weakened measured-window invariant', () => {
  const changed = structuredClone(manifest);
  changed.invariant.minimumWindowHours = 1;
  assert.throws(
    () => validateWP170P0BOpsReadiness({ root, manifest: changed }),
    /measured-window invariant is missing or weakened/u,
  );
});

test('rejects synthetic fixture provenance drift', () => {
  const changed = structuredClone(manifest);
  changed.syntheticFixtureProvenance.realEvidence = true;
  assert.throws(
    () => validateWP170P0BOpsReadiness({ root, manifest: changed }),
    /synthetic fixture provenance is missing, overstated or drifted/u,
  );
});
