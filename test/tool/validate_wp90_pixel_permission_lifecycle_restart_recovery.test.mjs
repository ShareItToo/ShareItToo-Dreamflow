import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWp90PixelPermissionLifecycleRestartRecovery } from '../../tool/validate_wp90_pixel_permission_lifecycle_restart_recovery.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(root, 'docs/evidence/release-readiness/wp90-pixel-permission-lifecycle-restart-recovery-20260910.json');
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');
const evidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('binds exact restoration without accepting an incomplete permission lifecycle', () => {
  assert.deepEqual(validateWp90PixelPermissionLifecycleRestartRecovery(), {
    status: 'partial-permission-restored-navigation-absent-after-restart',
    candidateVersionCode: '2026090905',
    recovery: 'exact-permission-restoration-after-navigation-absence',
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp90_pixel_permission_lifecycle_restart_recovery\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp90_pixel_permission_lifecycle_restart_recovery\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp90_pixel_permission_lifecycle_restart_recovery\.mjs/u);
});

test('rejects a premature root-cause or lifecycle-success claim', () => {
  const promoted = evidence();
  promoted.failureAndRecovery.fullPermissionMatrixAccepted = true;
  assert.throws(() => validateWp90PixelPermissionLifecycleRestartRecovery({ evidence: promoted }), /recovery/u);
  const privateValue = evidence();
  privateValue.note = 'contact@example.test';
  assert.throws(() => validateWp90PixelPermissionLifecycleRestartRecovery({ evidence: privateValue }), /private or secret-shaped/u);
});
