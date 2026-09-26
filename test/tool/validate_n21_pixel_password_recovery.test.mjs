import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN21PixelPasswordRecovery,
} from '../../tool/validate_n21_pixel_password_recovery.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n21-pixel-password-recovery-2026090305.json',
), 'utf8'));

test('accepts the sanitized N21 Pixel password-recovery evidence', () => {
  assert.equal(validateN21PixelPasswordRecovery(evidence), evidence);
});

test('rejects incomplete reset, single-use, old-rejection, login or cold-start proof', () => {
  for (const [group, key, value, pattern] of [
    ['recovery', 'requestSubmittedThroughAppUi', false, /requestSubmittedThroughAppUi/u],
    ['recovery', 'singleUseLinkConfirmed', false, /singleUseLinkConfirmed/u],
    ['recovery', 'oldPasswordErrorContract', null, /old-password contract/u],
    ['recovery', 'newPasswordLoginThroughAppUi', 'pending', /new-password login/u],
    ['recovery', 'coldStartSessionPersistence', 'pending', /cold start/u],
  ]) {
    const changed = structuredClone(evidence);
    changed[group][key] = value;
    assert.throws(() => validateN21PixelPasswordRecovery(changed), pattern);
  }
});

test('rejects 408, unstructured 4xx or transport ambiguity classified as rejection', () => {
  for (const [key, value, pattern] of [
    ['http408', 'rejected', /HTTP 408 semantics/u],
    ['intermediaryOrUnstructured4xx', 'rejected', /unstructured 4xx semantics/u],
    ['transportFailure', 'rejected', /transport semantics/u],
  ]) {
    const changed = structuredClone(evidence);
    changed.resultSemantics[key] = value;
    assert.throws(() => validateN21PixelPasswordRecovery(changed), pattern);
  }
});

test('rejects CI, ratchet, credential, Play, Production or money boundary drift', () => {
  for (const mutate of [
    (value) => { value.qa.n21FinalGithubRegression = 'pending'; },
    (value) => { value.ratchetFinding.secretScannerWeakened = true; },
    (value) => { value.ratchetFinding.remainingSourceInventoryHashMismatches = 1; },
    (value) => { value.privateVault.pendingPasswordRemoved = false; },
    (value) => { value.boundaries.containsCredential = true; },
    (value) => { value.boundaries.googlePlayChanged = true; },
    (value) => { value.boundaries.productionChanged = true; },
    (value) => { value.boundaries.realMoneyUsed = true; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN21PixelPasswordRecovery(changed));
  }
});
