import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWp86StagingRolloutPixelFcm } from '../../tool/validate_wp86_staging_rollout_pixel_fcm.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(root, 'docs/evidence/release-readiness/wp86-staging-rollout-pixel-fcm-20260910.json');
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('binds controlled FCM to the exact Pixel candidate without accepting successor runtime paths', () => {
  assert.deepEqual(validateWp86StagingRolloutPixelFcm(), {
    status: 'complete-staging-rollout-and-controlled-pixel-fcm',
    candidateVersionCode: '2026090905',
    runtimeHead: '926a00c5fa7f6595069aed12119d2dde90935bc3',
    fcm: 'foreground-background-terminated-passed',
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp86_staging_rollout_pixel_fcm\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp86_staging_rollout_pixel_fcm\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp86_staging_rollout_pixel_fcm\.mjs/u);
});

test('rejects candidate-wide promotion and any sensitive evidence shape', () => {
  const promoted = evidence();
  promoted.candidateToRuntimeSeparation.exactCandidateWideAcceptanceTransferred = true;
  assert.throws(() => validateWp86StagingRolloutPixelFcm({ evidence: promoted }), /separation/u);

  const privateValue = evidence();
  privateValue.note = 'contact@example.test';
  assert.throws(() => validateWp86StagingRolloutPixelFcm({ evidence: privateValue }), /private or secret-shaped/u);
});
