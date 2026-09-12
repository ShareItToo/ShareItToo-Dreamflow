import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN26PixelPhoneBackendGatePreflight,
} from '../../tool/validate_n26_pixel_phone_backend_gate_preflight.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n26-pixel-phone-backend-gate-preflight-2026090306.json',
), 'utf8'));

test('accepts the sanitized N26 Pixel phone backend-gate preflight', () => {
  assert.equal(validateN26PixelPhoneBackendGatePreflight(evidence), evidence);
});

test('rejects current-candidate SMS, console or persistence overclaims', () => {
  for (const key of [
    'firebaseConsoleReadbackPerformed',
    'smsRegionReadbackPerformed',
    'smsRequested',
    'realSmsDelivered',
    'validCodeAccepted',
    'verifiedStatePersistedAfterColdRestart',
  ]) {
    const changed = structuredClone(evidence);
    changed.currentCandidatePhoneProof[key] = true;
    assert.throws(() => validateN26PixelPhoneBackendGatePreflight(changed));
  }
});

test('rejects candidate, gate, cleanup or historical-scope drift', () => {
  for (const mutate of [
    (value) => { value.candidate.candidateIsAncestor = false; },
    (value) => { value.candidate.mobileSourceChangedAfterCandidate = true; },
    (value) => { value.backendGateObservation.enabled = false; },
    (value) => { value.backendGateObservation.diagnosticSessionRevoked = false; },
    (value) => { value.historicalEvidence.historicalEvidenceIsNotCurrentCandidateProof = false; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN26PixelPhoneBackendGatePreflight(changed));
  }
});

test('rejects CI, live-boundary or private-material drift', () => {
  for (const mutate of [
    (value) => { value.qa.githubRegression = 'pending'; },
    (value) => { value.qa.cleanCheckoutReproducibility = 'pending'; },
    (value) => { value.secretScanRatchet.scannerRuleUnchanged = false; },
    (value) => { value.secretScanRatchet.dependentInventoryChainRefreshedThroughRw20 = false; },
    (value) => { value.boundaries.smsSent = true; },
    (value) => { value.boundaries.containsPhoneNumber = true; },
    (value) => { value.remaining.currentCandidateValidCode = 'owner@example.invalid'; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN26PixelPhoneBackendGatePreflight(changed));
  }
});
