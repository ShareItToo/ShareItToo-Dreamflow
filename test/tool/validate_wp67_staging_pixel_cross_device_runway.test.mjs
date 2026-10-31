import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp67StagingPixelCrossDeviceRunway,
} from '../../tool/validate_wp67_staging_pixel_cross_device_runway.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidenceFixture = JSON.parse(readFileSync(resolve(root,
  'docs/evidence/release-readiness/wp67-staging-pixel-cross-device-runway-20260909.json'), 'utf8'));
const candidateFixture = JSON.parse(readFileSync(resolve(root,
  'store/google-play/rollover-candidate-2026090904.json'), 'utf8'));
const diagnosticFixture = readFileSync(resolve(root,
  'tool/diagnose_android_rental_cart_project_lifecycle.mjs'), 'utf8');

function fixtures() {
  return {
    evidence: structuredClone(evidenceFixture),
    candidate: structuredClone(candidateFixture),
    diagnostic: diagnosticFixture,
  };
}

test('accepts the exact WP67 Staging and Pixel runway with OnePlus pending', () => {
  const result = validateWp67StagingPixelCrossDeviceRunway(fixtures());
  assert.equal(result.versionCode, '2026090904');
  assert.equal(result.pixelComplete, true);
  assert.equal(result.onePlusPending, true);
  assert.equal(result.legalHoldClosed, true);
});

test('rejects a false OnePlus or binding-contract completion claim', () => {
  const onePlus = fixtures();
  onePlus.evidence.onePlus.candidateInstalled = true;
  assert.throws(
    () => validateWp67StagingPixelCrossDeviceRunway(onePlus),
    /onePlus\.candidateInstalled has drifted/u,
  );
  const legal = fixtures();
  legal.evidence.legalGate.bindingContractBypassed = true;
  assert.throws(
    () => validateWp67StagingPixelCrossDeviceRunway(legal),
    /legalGate\.bindingContractBypassed has drifted/u,
  );
});

test('rejects candidate and deterministic measurement drift', () => {
  const candidate = fixtures();
  candidate.candidate.artifact.apkSha256 = '0'.repeat(64);
  assert.throws(
    () => validateWp67StagingPixelCrossDeviceRunway(candidate),
    /candidate\.apkSha256 has drifted/u,
  );
  const diagnostic = fixtures();
  diagnostic.diagnostic = diagnostic.diagnostic.replace('intervalMs: 75', 'intervalMs: 650');
  assert.throws(
    () => validateWp67StagingPixelCrossDeviceRunway(diagnostic),
    /deterministic cart acknowledgement probe has drifted/u,
  );
});

test('rejects private identity or path material', () => {
  const input = fixtures();
  input.evidence.privatePath = '/Users/example/private';
  assert.throws(
    () => validateWp67StagingPixelCrossDeviceRunway(input),
    /private path, identity or credential marker/u,
  );
});
