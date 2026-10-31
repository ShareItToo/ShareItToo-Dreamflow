import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp128CurrentCandidatePixelVisualPermission,
} from '../../tool/validate_wp128_current_candidate_pixel_visual_permission.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp128-current-candidate-pixel-visual-permission-20260912.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));
const validate = (evidence = readEvidence()) => (
  validateWp128CurrentCandidatePixelVisualPermission({
    repositoryRoot: root,
    evidence,
    checkGitState: false,
  })
);

test('accepts exact-current visual closure while retaining the permission hold', () => {
  assert.deepEqual(validateWp128CurrentCandidatePixelVisualPermission({ repositoryRoot: root }), {
    status: 'partial-visual-text-complete-permission-settlement-open',
    versionCode: '2026091201',
    visualRequirement: 'PASS',
    permissionRequirement: 'PARTIAL',
    passCount: 13,
    partialCount: 11,
    openCount: 8,
  });
});

test('rejects candidate, visual, permission and portfolio overclaims', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026091202'; },
    (value) => { value.largeTextAndRestart.exactFontScaleRestored = false; },
    (value) => { value.visualTheme.backgroundChoices['light-2'] = '0'.repeat(64); },
    (value) => { value.permissionLifecycle.finalLifecycleAccepted = true; },
    (value) => { value.permissionLifecycle.broadcastBarrierConfirmedDuringLifecycle = true; },
    (value) => { value.permissionLifecycle.applicationCrashClaimed = true; },
    (value) => { value.diagnosticCorrection.runtimeOrProductBehaviorChanged = true; },
    (value) => { value.portfolioEffect.passCount = 14; },
  ]) {
    const invalid = readEvidence();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects source, boundary and private-content drift', () => {
  const source = readEvidence();
  source.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source digest/u);

  const sourceSubstitution = readEvidence();
  sourceSubstitution.sourceInventory[0].path = 'pubspec.yaml';
  assert.throws(() => validate(sourceSubstitution), /source inventory/u);

  const boundary = readEvidence();
  boundary.boundaries.onePlusContacted = true;
  assert.throws(() => validate(boundary), /authorization boundary/u);

  const omittedBoundary = readEvidence();
  delete omittedBoundary.boundaries.onePlusContacted;
  assert.throws(() => validate(omittedBoundary), /authorization boundary/u);

  const privateEvidence = readEvidence();
  privateEvidence.privatePath = '/Users/owner/private.png';
  assert.throws(() => validate(privateEvidence), /private or secret-shaped/u);
});
