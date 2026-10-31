import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWp92PixelPermissionMatrixFinalRestart } from '../../tool/validate_wp92_pixel_permission_matrix_final_restart.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(root, 'docs/evidence/release-readiness/wp92-pixel-permission-matrix-final-restart-20260910.json');
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');
const evidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts only the three-group matrix with final restart still unproven', () => {
  assert.deepEqual(validateWp92PixelPermissionMatrixFinalRestart(), {
    status: 'partial-complete-permission-matrix-restored-final-restart-unproven',
    candidateVersionCode: '2026090905',
    matrix: 'three-groups-passed-final-restart-unproven',
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp92_pixel_permission_matrix_final_restart\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp92_pixel_permission_matrix_final_restart\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp92_pixel_permission_matrix_final_restart\.mjs/u);
});

test('rejects a complete lifecycle or final-restart explanation claim', () => {
  const promoted = evidence();
  promoted.permissionMatrix.fullLifecycleAccepted = true;
  assert.throws(() => validateWp92PixelPermissionMatrixFinalRestart({ evidence: promoted }), /permission matrix/u);
  const privateValue = evidence();
  privateValue.note = 'contact@example.test';
  assert.throws(() => validateWp92PixelPermissionMatrixFinalRestart({ evidence: privateValue }), /private or secret-shaped/u);
});
