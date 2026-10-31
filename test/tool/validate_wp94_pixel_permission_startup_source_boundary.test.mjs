import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWp94PixelPermissionStartupSourceBoundary } from '../../tool/validate_wp94_pixel_permission_startup_source_boundary.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(root, 'docs/evidence/release-readiness/wp94-pixel-permission-startup-source-boundary-20260910.json');
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');
const evidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('preserves the source boundary without accepting the physical lifecycle', () => {
  assert.deepEqual(validateWp94PixelPermissionStartupSourceBoundary(), {
    status: 'complete-source-audit-no-auto-permission-startup-trigger',
    candidateVersionCode: '2026090905',
    conclusion: 'startup-scheduling-or-runner-observation-boundary',
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp94_pixel_permission_startup_source_boundary\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp94_pixel_permission_startup_source_boundary\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp94_pixel_permission_startup_source_boundary\.mjs/u);
});

test('rejects lifecycle promotion or private data', () => {
  const promoted = evidence();
  promoted.scope.furtherPermissionLifecycleRepeatsAllowedByThisEvidence = true;
  assert.throws(() => validateWp94PixelPermissionStartupSourceBoundary({ evidence: promoted }), /scope/u);
  const privateValue = evidence();
  privateValue.note = 'contact@example.test';
  assert.throws(() => validateWp94PixelPermissionStartupSourceBoundary({ evidence: privateValue }), /private or secret-shaped/u);
});
