import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWp89PixelExplicitCandidateNavigation } from '../../tool/validate_wp89_pixel_explicit_candidate_navigation.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(root, 'docs/evidence/release-readiness/wp89-pixel-explicit-candidate-navigation-20260910.json');
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('binds five explicit-candidate navigation surfaces without promoting other flows', () => {
  assert.deepEqual(validateWp89PixelExplicitCandidateNavigation(), {
    status: 'complete-explicit-candidate-physical-navigation-diagnostic',
    candidateVersionCode: '2026090905',
    navigation: 'five-read-only-destinations-passed',
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp89_pixel_explicit_candidate_navigation\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp89_pixel_explicit_candidate_navigation\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp89_pixel_explicit_candidate_navigation\.mjs/u);
});

test('rejects a permission-lifecycle promotion or sensitive evidence', () => {
  const promoted = evidence();
  promoted.scope.permissionLifecycleAccepted = true;
  assert.throws(() => validateWp89PixelExplicitCandidateNavigation({ evidence: promoted }), /scope/u);

  const privateValue = evidence();
  privateValue.note = 'contact@example.test';
  assert.throws(() => validateWp89PixelExplicitCandidateNavigation({ evidence: privateValue }), /private or secret-shaped/u);
});
