import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp115CurrentCandidatePixelOnDeviceListingAi,
} from '../../tool/validate_wp115_current_candidate_pixel_on_device_listing_ai.mjs';

const evidencePath = new URL(
  '../../docs/evidence/release-readiness/wp115-current-candidate-pixel-on-device-listing-ai-20260911.json',
  import.meta.url,
);
const rolloverPath = new URL(
  '../../store/google-play/rollover-candidate-2026091110.json',
  import.meta.url,
);

function fixture() {
  return {
    evidence: JSON.parse(readFileSync(evidencePath, 'utf8')),
    rollover: JSON.parse(readFileSync(rolloverPath, 'utf8')),
  };
}

test('accepts the exact current-candidate physical Pixel Listing-AI replay', () => {
  const result = validateWp115CurrentCandidatePixelOnDeviceListingAi();
  assert.equal(result.versionCode, '2026091110');
  assert.equal(result.physicalInferencePassed, true);
  assert.equal(result.cleanupPassed, true);
});

test('rejects candidate, device, inference and cost drift', () => {
  for (const mutate of [
    (value) => { value.evidence.candidate.versionCode = '2026091109'; },
    (value) => { value.evidence.device.model = 'emulator'; },
    (value) => { value.evidence.tests.physicalAndroidMlKitExecuted = false; },
    (value) => { value.evidence.runtime.billedCostCents = 1; },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp115CurrentCandidatePixelOnDeviceListingAi({
        ...value,
        checkGitState: false,
      }),
      /WP115/u,
    );
  }
});

test('rejects cleanup, publication and rollover promotion', () => {
  for (const mutate of [
    (value) => { value.evidence.cleanup.controlledMediaRemoved = false; },
    (value) => { value.evidence.boundaries.listingPublished = true; },
    (value) => {
      value.rollover.deviceVerification.onDeviceListingAiPhysicalInference =
        'not-replayed-on-2026091110';
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp115CurrentCandidatePixelOnDeviceListingAi({
        ...value,
        checkGitState: false,
      }),
      /WP115/u,
    );
  }
});

test('rejects private or secret-shaped evidence', () => {
  const value = fixture();
  value.evidence.privateIdentity = 'person@example.invalid';
  assert.throws(
    () => validateWp115CurrentCandidatePixelOnDeviceListingAi({
      ...value,
      checkGitState: false,
    }),
    /private or secret-shaped/u,
  );
});
