import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validatePf21CurrentCandidateTalkBackSettingsPreflight,
} from '../../tool/validate_pf21_current_candidate_talkback_settings_preflight.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-candidate-talkback-settings-preflight-2026082302.json',
), 'utf8'));

function clone(value) {
  return structuredClone(value);
}

test('validates the exact blocked and restored PF21 Settings preflight', () => {
  const result = validatePf21CurrentCandidateTalkBackSettingsPreflight({
    evidence: clone(evidence),
    checkGitCommit: false,
  });
  assert.equal(result.buildNumber, '2026082302');
  assert.equal(result.settingsSurfaceOpened, true);
  assert.equal(result.settingsTogglePresent, true);
  assert.equal(result.confirmationAccepted, true);
  assert.equal(result.serviceBound, true);
  assert.equal(result.runtimeTouchExplorationEnabled, false);
  assert.equal(result.traversalAttempted, false);
  assert.equal(result.exactConfigurationRestored, true);
  assert.equal(result.automatedTalkBackMainNavigationPassed, false);
  assert.equal(result.stageAReady, false);
});

test('rejects runtime, traversal and restoration overclaims', () => {
  const runtime = clone(evidence);
  runtime.configuration.runtimeTouchExplorationEnabledDuringDiagnostic = true;
  assert.throws(
    () => validatePf21CurrentCandidateTalkBackSettingsPreflight({
      evidence: runtime,
      checkGitCommit: false,
    }),
    /exact blocked runtime/iu,
  );

  const traversal = clone(evidence);
  traversal.boundaries.automatedTalkBackMainNavigationPassed = true;
  assert.throws(
    () => validatePf21CurrentCandidateTalkBackSettingsPreflight({
      evidence: traversal,
      checkGitCommit: false,
    }),
    /must not claim/iu,
  );

  const restoration = clone(evidence);
  restoration.configuration.exactPreviousConfigurationRestored = false;
  assert.throws(
    () => validatePf21CurrentCandidateTalkBackSettingsPreflight({
      evidence: restoration,
      checkGitCommit: false,
    }),
    /exact blocked runtime/iu,
  );
});

test('rejects candidate, Settings-route and blocker drift', () => {
  const candidate = clone(evidence);
  candidate.candidate.buildNumber = '2026082303';
  assert.throws(
    () => validatePf21CurrentCandidateTalkBackSettingsPreflight({
      evidence: candidate,
      checkGitCommit: false,
    }),
    /exact current candidate/iu,
  );

  const route = clone(evidence);
  route.configuration.settingsTogglePresent = false;
  assert.throws(
    () => validatePf21CurrentCandidateTalkBackSettingsPreflight({
      evidence: route,
      checkGitCommit: false,
    }),
    /restored Settings truth/iu,
  );

  const blocker = clone(evidence);
  blocker.blockers = ['manual-review-passed'];
  assert.throws(
    () => validatePf21CurrentCandidateTalkBackSettingsPreflight({
      evidence: blocker,
      checkGitCommit: false,
    }),
    /blocker identity/iu,
  );
});

test('rejects private identifiers', () => {
  const value = clone(evidence);
  value.debug = '/Users/private/device';
  assert.throws(
    () => validatePf21CurrentCandidateTalkBackSettingsPreflight({
      evidence: value,
      checkGitCommit: false,
    }),
    /private path/iu,
  );
});
