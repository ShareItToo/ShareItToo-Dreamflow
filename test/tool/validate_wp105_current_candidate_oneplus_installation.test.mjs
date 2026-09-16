import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

import { validateWp105CurrentCandidateOnePlusInstallation } from '../../tool/validate_wp105_current_candidate_oneplus_installation.mjs';

const evidence = JSON.parse(readFileSync(resolve('docs/evidence/release-readiness/wp105-current-candidate-oneplus-installation-20260910.json'), 'utf8'));

test('WP105 exact OnePlus installation evidence passes', () => {
  assert.deepEqual(validateWp105CurrentCandidateOnePlusInstallation(evidence), {
    status: 'passed-wp105-current-candidate-oneplus-installation-evidence',
    evidenceBaseHead: 'f193a41f3904f96cfc0bcffd6d0a710f7a307c11',
    versionCode: '2026091002',
    containsPrivateState: false
  });
});

test('WP105 rejects hiding the local app-data reset', () => {
  const changed = structuredClone(evidence);
  changed.onePlus.replacement.localShareItTooDataReset = false;
  assert.throws(() => validateWp105CurrentCandidateOnePlusInstallation(changed), /local data reset truth is not exact/u);
});

test('WP105 rejects relabelling direct APK installation as Play delivery', () => {
  const changed = structuredClone(evidence);
  changed.candidate.googlePlaySplitDelivery = true;
  assert.throws(() => validateWp105CurrentCandidateOnePlusInstallation(changed), /Play delivery boundary is not exact/u);
});
