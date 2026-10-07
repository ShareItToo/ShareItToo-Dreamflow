import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp64StagingSecurityParityAndPixelCandidate,
} from '../../tool/validate_wp64_staging_security_parity_and_pixel_candidate.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidenceFixture = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp64-staging-security-parity-and-pixel-candidate-20260909.json',
), 'utf8'));
const rolloverFixture = JSON.parse(readFileSync(resolve(
  root,
  'store/google-play/rollover-candidate-2026090902.json',
), 'utf8'));

function fixtures() {
  return {
    evidence: structuredClone(evidenceFixture),
    rollover: structuredClone(rolloverFixture),
  };
}

test('accepts the exact WP64 Staging and Pixel closure', () => {
  const result = validateWp64StagingSecurityParityAndPixelCandidate(fixtures());
  assert.equal(result.stagingDeployed, true);
  assert.equal(result.pixelVerified, true);
  assert.equal(result.playInternalUploadPending, true);
});

test('rejects candidate or deployed runtime drift', () => {
  const candidateDrift = fixtures();
  candidateDrift.evidence.candidate.versionCode = '2026090903';
  assert.throws(
    () => validateWp64StagingSecurityParityAndPixelCandidate(candidateDrift),
    /candidate\.versionCode has drifted/u,
  );

  const runtimeDrift = fixtures();
  runtimeDrift.evidence.staging.deployedSourceHead = '0'.repeat(40);
  assert.throws(
    () => validateWp64StagingSecurityParityAndPixelCandidate(runtimeDrift),
    /staging\.deployedSourceHead has drifted/u,
  );
});

test('rejects a false claim that private registry delivery debt is closed', () => {
  const input = fixtures();
  input.evidence.registryDeliveryDebt.serverPulledPublishedImage = true;
  input.evidence.registryDeliveryDebt.status = 'closed';
  assert.throws(
    () => validateWp64StagingSecurityParityAndPixelCandidate(input),
    /registryDeliveryDebt\.status has drifted/u,
  );
});

test('requires privacy-sensitive notification evidence to be deleted', () => {
  const retained = fixtures();
  retained.evidence.notificationEvidence.retained = true;
  retained.evidence.notificationEvidence.deletedImmediatelyAfterReview = false;
  assert.throws(
    () => validateWp64StagingSecurityParityAndPixelCandidate(retained),
    /notificationEvidence\.retained has drifted/u,
  );

  const privatePath = fixtures();
  privatePath.evidence.notificationEvidence.screenshotPath =
    '/Users/example/private-notification.png';
  assert.throws(
    () => validateWp64StagingSecurityParityAndPixelCandidate(privatePath),
    /forbidden private identity or path field/u,
  );
});

test('rejects tester identity and raw device identity', () => {
  const testerIdentity = fixtures();
  testerIdentity.evidence.pixel.accountEmail = 'tester@example.invalid';
  assert.throws(
    () => validateWp64StagingSecurityParityAndPixelCandidate(testerIdentity),
    /forbidden private identity or path field/u,
  );

  const deviceIdentity = fixtures();
  deviceIdentity.evidence.pixel.deviceSerial = 'private-device-identifier';
  assert.throws(
    () => validateWp64StagingSecurityParityAndPixelCandidate(deviceIdentity),
    /forbidden private identity or path field/u,
  );
});

test('rejects rollover drift that could point installation at stale evidence', () => {
  const input = fixtures();
  input.rollover.stagingStateAtReadback.sourceHead = '0'.repeat(40);
  assert.throws(
    () => validateWp64StagingSecurityParityAndPixelCandidate(input),
    /rollover\.stagingStateAtReadback\.sourceHead has drifted/u,
  );
});
