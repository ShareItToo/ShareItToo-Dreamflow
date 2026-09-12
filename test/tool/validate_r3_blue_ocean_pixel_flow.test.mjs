import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateR3BlueOceanPixelFlow,
} from '../../tool/validate_r3_blue_ocean_pixel_flow.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r3-blue-ocean-pixel-flow-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR3BlueOceanPixelFlow({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact non-live physical Pixel listing flow', () => {
  assert.deepEqual(validate(), {
    status: 'verified-pixel-flow-regression-and-codeql-passed',
    buildNumber: '2026082404',
    device: 'Pixel 7 Pro',
    firstReady: 'READY_TO_PUBLISH',
    staleEditState: 'NEEDS_REVIEW',
    published: false,
    nextPackage: 'R4_ANDROID_LIFECYCLE_FAILURE_MATRIX',
  });
});

test('rejects publication, external AI and real money overclaims', () => {
  const publication = structuredClone(evidence);
  publication.observedFlow.explicitPublicationActionPerformed = true;
  assert.throws(() => validate(publication), /observed listing flow/u);

  const provider = structuredClone(evidence);
  provider.boundaries.externalAiProviderCalled = true;
  assert.throws(() => validate(provider), /live boundary/u);

  const money = structuredClone(evidence);
  money.boundaries.realMoneyUsed = true;
  assert.throws(() => validate(money), /live boundary/u);
});

test('rejects destructive or unverifiable device updates', () => {
  const uninstall = structuredClone(evidence);
  uninstall.installation.uninstallUsed = true;
  assert.throws(() => validate(uninstall), /installation evidence/u);

  const identity = structuredClone(evidence);
  identity.installation.ceDataInodePreserved = false;
  assert.throws(() => validate(identity), /installation evidence/u);
});

test('rejects stale READY state or missing confirmation invalidation', () => {
  const stale = structuredClone(evidence);
  stale.staleReviewRegression.staleReadyPresentationHidden = false;
  assert.throws(() => validate(stale), /stale-review regression/u);

  const confirmation = structuredClone(evidence);
  confirmation.staleReviewRegression.finalPublicationConfirmationReset = false;
  assert.throws(() => validate(confirmation), /stale-review regression/u);
});

test('rejects private media or incomplete cleanup claims', () => {
  const media = structuredClone(evidence);
  media.syntheticFixture.privateGalleryImageSelectedOrAnalyzed = true;
  assert.throws(() => validate(media), /synthetic fixture/u);

  const cleanup = structuredClone(evidence);
  cleanup.cleanup.transientSessionRemoved = false;
  assert.throws(() => validate(cleanup), /cleanup evidence/u);
});

test('rejects premature CI claims and secret-shaped evidence', () => {
  const ci = structuredClone(evidence);
  ci.status = 'verified-pixel-flow-and-regression-passed-ci-pending';
  ci.verification.githubRegression = 'pending';
  ci.verification.githubCodeql = 'pending';
  ci.githubVerification = { implementationCommit };
  assert.throws(() => validate(ci), /must not claim GitHub/u);

  const secret = structuredClone(evidence);
  secret.note = 'owner@example.test';
  assert.throws(() => validate(secret), /private or secret-shaped/u);
});

const implementationCommit =
  '19fc3221bc3879788db9c48b70a89a33656116b6';
