import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateR7ImagePrivacyAiContract,
} from '../../tool/validate_r7_image_privacy_ai_contract.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r7-image-privacy-ai-contract-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR7ImagePrivacyAiContract({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact GitHub-verified R7 adversarial evidence', () => {
  assert.deepEqual(validate(), {
    status: 'verified-r7-regression-and-codeql-passed',
    adversarialCases: 26,
    nextPackage: 'R8',
  });
});

test('rejects missing image privacy or output attack coverage', () => {
  const image = structuredClone(evidence);
  image.syntheticAdversarialMatrix.gpsRemoval = false;
  assert.throws(() => validate(image), /adversarial matrix/u);

  const output = structuredClone(evidence);
  output.syntheticAdversarialMatrix.hallucinatedOwnershipRejected = false;
  assert.throws(() => validate(output), /adversarial matrix/u);
});

test('rejects weakened privacy, publication or price authority', () => {
  const bytes = structuredClone(evidence);
  bytes.privacyAndAuthority.rawImageBytesRetainedAfterConsumption = true;
  assert.throws(() => validate(bytes), /privacy or authority/u);

  const publish = structuredClone(evidence);
  publish.privacyAndAuthority.publicationAllowed = true;
  assert.throws(() => validate(publish), /privacy or authority/u);

  const price = structuredClone(evidence);
  price.privacyAndAuthority.authoritativePriceAllowed = true;
  assert.throws(() => validate(price), /privacy or authority/u);
});

test('rejects erased red-first evidence or a permanent workaround', () => {
  const finding = structuredClone(evidence);
  finding.redFirstFinding.marketPriceClaimPreviouslyAccepted = false;
  assert.throws(() => validate(finding), /red-first finding/u);

  const workaround = structuredClone(evidence);
  workaround.permanentCorrections.workaroundIntroduced = true;
  assert.throws(() => validate(workaround), /permanent-correction/u);
});

test('rejects premature GitHub claims and any live boundary', () => {
  const github = structuredClone(evidence);
  github.status = 'verified-local-r7-regression-passed-ci-pending';
  github.verification.githubRegression = 'pending';
  github.verification.githubCodeql = 'pending';
  github.githubVerification = {};
  assert.throws(() => validate(github), /must not claim GitHub/u);

  const changed = structuredClone(evidence);
  changed.githubVerification.codeql.newAlerts = 1;
  assert.throws(() => validate(changed), /exact GitHub verification/u);

  const live = structuredClone(evidence);
  live.boundaries.externalAiProviderCalled = true;
  assert.throws(() => validate(live), /live, provider or data boundary/u);
});

test('rejects detector overclaim and secret-shaped evidence', () => {
  const detector = structuredClone(evidence);
  detector.limitations.realOcrOrVisualDetectorEvaluated = true;
  assert.throws(() => validate(detector), /limitation record/u);

  const secret = structuredClone(evidence);
  secret.note = '/Users/example/private';
  assert.throws(() => validate(secret), /private or secret-shaped/u);
});
