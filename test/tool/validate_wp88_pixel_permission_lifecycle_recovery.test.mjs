import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWp88PixelPermissionLifecycleRecovery } from '../../tool/validate_wp88_pixel_permission_lifecycle_recovery.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(root, 'docs/evidence/release-readiness/wp88-pixel-permission-lifecycle-recovery-20260910.json');
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('records exact restoration without promoting an unproven lifecycle', () => {
  assert.deepEqual(validateWp88PixelPermissionLifecycleRecovery(), {
    status: 'partial-pixel-permission-lifecycle-restored-ui-navigation-unproven',
    candidateVersionCode: '2026090905',
    recovery: 'exact-permission-state-restored-ui-navigation-unproven',
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp88_pixel_permission_lifecycle_recovery\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp88_pixel_permission_lifecycle_recovery\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp88_pixel_permission_lifecycle_recovery\.mjs/u);
});

test('rejects a false pass or sensitive evidence shape', () => {
  const promoted = evidence();
  promoted.scope.fullPermissionDenyAllowRestartMatrixAccepted = true;
  assert.throws(() => validateWp88PixelPermissionLifecycleRecovery({ evidence: promoted }), /scope/u);

  const privateValue = evidence();
  privateValue.note = 'contact@example.test';
  assert.throws(() => validateWp88PixelPermissionLifecycleRecovery({ evidence: privateValue }), /private or secret-shaped/u);
});
