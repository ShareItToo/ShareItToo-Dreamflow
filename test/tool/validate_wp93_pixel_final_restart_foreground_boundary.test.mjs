import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWp93PixelFinalRestartForegroundBoundary } from '../../tool/validate_wp93_pixel_final_restart_foreground_boundary.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(root, 'docs/evidence/release-readiness/wp93-pixel-final-restart-foreground-boundary-20260910.json');
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');
const evidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('preserves the unclassified final-restart boundary without accepting the lifecycle', () => {
  assert.deepEqual(validateWp93PixelFinalRestartForegroundBoundary(), {
    status: 'partial-permission-matrix-restored-final-restart-foreground-unclassified',
    candidateVersionCode: '2026090905',
    boundary: 'final-restart-foreground-unclassified',
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp93_pixel_final_restart_foreground_boundary\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp93_pixel_final_restart_foreground_boundary\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp93_pixel_final_restart_foreground_boundary\.mjs/u);
});

test('rejects another replay permission or a private value', () => {
  const promoted = evidence();
  promoted.scope.furtherPermissionLifecycleRepeatsAllowedByThisEvidence = true;
  assert.throws(() => validateWp93PixelFinalRestartForegroundBoundary({ evidence: promoted }), /scope/u);
  const privateValue = evidence();
  privateValue.note = 'contact@example.test';
  assert.throws(() => validateWp93PixelFinalRestartForegroundBoundary({ evidence: privateValue }), /private or secret-shaped/u);
});
