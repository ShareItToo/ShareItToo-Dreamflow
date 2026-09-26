import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp126ExactSuccessorPixelPushClosure,
} from '../../tool/validate_wp126_exact_successor_pixel_push_closure.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp126-exact-successor-pixel-push-closure-20260912.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));
const readRollover = () => JSON.parse(execFileSync('git', [
  'show',
  'd68770b95554183e531b46b93d55eccb723d1844:store/google-play/current-rollover-candidate.json',
], { cwd: root, encoding: 'utf8' }));

test('accepts the exact successor Pixel push closure', () => {
  const result = validateWp126ExactSuccessorPixelPushClosure({ repositoryRoot: root });
  assert.equal(result.versionCode, '2026091201');
  assert.equal(result.pixelInstalled, '1.0.0+2026091201');
  assert.equal(result.onePlusContacted, false);
});

test('rejects candidate, physical, CI, cleanup or live-boundary overclaims', () => {
  const candidate = readEvidence();
  candidate.candidate.apkSha256 = '0'.repeat(64);
  assert.throws(
    () => validateWp126ExactSuccessorPixelPushClosure({
      repositoryRoot: root, evidence: candidate, checkGitState: false,
    }),
    /candidate contract/u,
  );

  const physical = readEvidence();
  physical.controlledFcm.physicalTransportResponseLossInjected = true;
  assert.throws(
    () => validateWp126ExactSuccessorPixelPushClosure({
      repositoryRoot: root, evidence: physical, checkGitState: false,
    }),
    /controlled FCM/u,
  );

  const ci = readEvidence();
  ci.github.diagnosticCorrectionRegression.conclusion = 'pending';
  assert.throws(
    () => validateWp126ExactSuccessorPixelPushClosure({
      repositoryRoot: root, evidence: ci, checkGitState: false,
    }),
    /GitHub verification/u,
  );

  const cleanup = readEvidence();
  cleanup.cleanup.onePlusContacted = true;
  assert.throws(
    () => validateWp126ExactSuccessorPixelPushClosure({
      repositoryRoot: root, evidence: cleanup, checkGitState: false,
    }),
    /cleanup contract/u,
  );

  const rollover = readRollover();
  rollover.playStateAtReadback.candidateUploaded = true;
  assert.throws(
    () => validateWp126ExactSuccessorPixelPushClosure({
      repositoryRoot: root, rollover, checkGitState: false,
    }),
    /boundary or pointer/u,
  );
});
