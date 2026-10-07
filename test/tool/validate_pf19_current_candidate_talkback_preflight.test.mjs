import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validatePf19CurrentCandidateTalkBackPreflight,
} from '../../tool/validate_pf19_current_candidate_talkback_preflight.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-candidate-talkback-preflight-2026082302.json',
), 'utf8'));

function validate(changed = evidence) {
  return validatePf19CurrentCandidateTalkBackPreflight({
    repositoryRoot: root,
    evidence: changed,
    checkGitCommit: false,
  });
}

test('accepts the exact blocked TalkBack runtime preflight and restored device state', () => {
  assert.deepEqual(validate(), {
    status: 'blocked-runtime-touch-exploration-not-requested',
    buildNumber: '2026082302',
    candidateCommit: '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b',
    exactInstalledApkVerified: true,
    officialAuthorizationCompleted: true,
    serviceBound: true,
    runtimeTouchExplorationEnabled: false,
    traversalAttempted: false,
    exactConfigurationRestored: true,
    automatedTalkBackMainNavigationPassed: false,
    manualTalkBackTraversalPassed: false,
    stageAReady: false,
    decision: 'hold-no-go',
  });
});

test('rejects candidate, installed APK and device drift', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.buildNumber = '2026082301';
  assert.throws(() => validate(candidate), /not bound to the exact current candidate/u);

  const installed = structuredClone(evidence);
  installed.installed.delivery = 'google-play-split';
  assert.throws(() => validate(installed), /overstates Store delivery/u);

  const device = structuredClone(evidence);
  device.device.osVersion = '16';
  assert.throws(() => validate(device), /physical-device summary/u);
});

test('rejects a fabricated runtime pass or traversal claim', () => {
  for (const [key, value] of [
    ['runtimeTouchExplorationEnabled', true],
    ['runtimeGestureContractSatisfied', true],
    ['traversalAttempted', true],
  ]) {
    const changed = structuredClone(evidence);
    changed.activation[key] = value;
    assert.throws(() => validate(changed), /exact blocked runtime/u);
  }
});

test('rejects incomplete restoration and any pass overclaim', () => {
  const restoration = structuredClone(evidence);
  restoration.activation.keyboardShortcutTargetCountAfterDiagnostic = 1;
  assert.throws(() => validate(restoration), /restored configuration truth/u);

  const overclaim = structuredClone(evidence);
  overclaim.boundaries.automatedTalkBackMainNavigationPassed = true;
  assert.throws(() => validate(overclaim), /must not claim/u);
});

test('rejects retained private identifiers', () => {
  const changed = structuredClone(evidence);
  changed.note = 'ssid=private-network';
  assert.throws(() => validate(changed), /private path, account, device or network/u);
});
