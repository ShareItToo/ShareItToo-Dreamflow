import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp116CurrentCandidatePixelTalkBackRuntimeGate,
} from '../../tool/validate_wp116_current_candidate_pixel_talkback_runtime_gate.mjs';

const evidencePath = new URL(
  '../../docs/evidence/release-readiness/wp116-current-candidate-pixel-talkback-runtime-gate-20260911.json',
  import.meta.url,
);

function fixture() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('accepts the exact current-candidate fail-closed TalkBack runtime gate', () => {
  const result = validateWp116CurrentCandidatePixelTalkBackRuntimeGate();
  assert.equal(result.versionCode, '2026091110');
  assert.equal(result.runtimeTouchExplorationEnabled, false);
  assert.equal(result.exactRestorationPassed, true);
});

test('rejects candidate, device and runtime overstatement', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026091109'; },
    (value) => { value.device.model = 'emulator'; },
    (value) => { value.activation.runtimeTouchExplorationEnabled = true; },
    (value) => { value.tests.automatedTalkBackMainNavigationPassed = true; },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp116CurrentCandidatePixelTalkBackRuntimeGate({
        evidence: value,
        checkGitState: false,
      }),
      /WP116/u,
    );
  }
});

test('rejects incomplete restoration and softened blockers', () => {
  for (const mutate of [
    (value) => { value.restoration.exactPreviousAccessibilityConfigurationRestored = false; },
    (value) => { value.restoration.enabledServiceCountAfterDiagnostic = 1; },
    (value) => { value.blockers = []; },
    (value) => { value.boundaries.directSecureSettingBypassUsed = true; },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp116CurrentCandidatePixelTalkBackRuntimeGate({
        evidence: value,
        checkGitState: false,
      }),
      /WP116/u,
    );
  }
});

test('rejects private or secret-shaped evidence', () => {
  const value = fixture();
  value.privateIdentity = 'person@example.invalid';
  assert.throws(
    () => validateWp116CurrentCandidatePixelTalkBackRuntimeGate({
      evidence: value,
      checkGitState: false,
    }),
    /private or secret-shaped/u,
  );
});
