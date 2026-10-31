import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWp91PixelColdStartStability } from '../../tool/validate_wp91_pixel_cold_start_stability.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(root, 'docs/evidence/release-readiness/wp91-pixel-cold-start-stability-20260910.json');
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');
const evidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('binds three stable cold starts without promoting the permission lifecycle', () => {
  assert.deepEqual(validateWp91PixelColdStartStability(), {
    status: 'complete-three-bounded-cold-start-navigation-observations',
    candidateVersionCode: '2026090905',
    coldStarts: 'three-navigation-visible',
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp91_pixel_cold_start_stability\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp91_pixel_cold_start_stability\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp91_pixel_cold_start_stability\.mjs/u);
});

test('rejects a false explanation or sensitive data', () => {
  const promoted = evidence();
  promoted.scope.inCycleRestartConditionExplained = true;
  assert.throws(() => validateWp91PixelColdStartStability({ evidence: promoted }), /scope/u);
  const privateValue = evidence();
  privateValue.note = 'contact@example.test';
  assert.throws(() => validateWp91PixelColdStartStability({ evidence: privateValue }), /private or secret-shaped/u);
});
