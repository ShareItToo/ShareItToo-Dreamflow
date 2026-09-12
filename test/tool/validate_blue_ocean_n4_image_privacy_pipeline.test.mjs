import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN4ImagePrivacyPipeline } from '../../tool/validate_blue_ocean_n4_image_privacy_pipeline.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n4-image-privacy-pipeline-20260823.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN4ImagePrivacyPipeline({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact isolated N4 image privacy pipeline', () => {
  assert.deepEqual(validate(), {
    status: 'verified-ready-for-n5',
    visualSignalTypeCount: 6,
    nextPackage: 'N5',
  });
});

test('rejects weakened metadata, naming, cleanup or retry controls', () => {
  for (const [section, key, value] of [
    ['pipeline', 'memoryOnly', false],
    ['pipeline', 'automaticRetryAllowed', true],
    ['privacyAndLifecycle', 'exifGpsIccIptcXmpRetained', true],
    ['privacyAndLifecycle', 'originalFilenameRetained', true],
    ['privacyAndLifecycle', 'cleanupOnTimeout', false],
  ]) {
    const changed = structuredClone(evidence);
    changed[section][key] = value;
    assert.throws(() => validate(changed), /pipeline contract|privacy or lifecycle/u);
  }
});

test('rejects a weakened sensitive-content or local-screening boundary', () => {
  const missingSignal = structuredClone(evidence);
  missingSignal.sensitiveContentPreflight.visualSignalTypes.pop();
  assert.throws(() => validate(missingSignal), /sensitive-content preflight/u);

  const uncertain = structuredClone(evidence);
  uncertain.sensitiveContentPreflight.incompleteVisualScanProviderEligible = true;
  assert.throws(() => validate(uncertain), /sensitive-content preflight/u);
});

test('rejects weakened explicit disclosure, consent or publication controls', () => {
  for (const [key, value] of [
    ['explicitInitiationRequired', false],
    ['acceptanceRequired', false],
    ['automaticPublicationAllowed', true],
  ]) {
    const changed = structuredClone(evidence);
    changed.consent[key] = value;
    assert.throws(() => validate(changed), /disclosure and consent/u);
  }
});

test('rejects invented regression completion or a forbidden mutation', () => {
  const regression = structuredClone(evidence);
  regression.targetedVerification.backendSuite = 'pending';
  assert.throws(() => validate(regression), /verification record/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.applicationRouteAdded = true;
  assert.throws(() => validate(mutation), /mutation boundary/u);
});

test('rejects an invalid exact GitHub verification binding', () => {
  const changed = structuredClone(evidence);
  changed.exactGitHubVerification.headSha = '0000000000000000000000000000000000000000';
  assert.throws(() => validate(changed), /exact GitHub verification/u);
});

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = '/Users/example/private';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
