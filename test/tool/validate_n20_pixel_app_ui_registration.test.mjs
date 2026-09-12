import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN20PixelAppUiRegistration,
} from '../../tool/validate_n20_pixel_app_ui_registration.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n20-pixel-app-ui-registration-2026090305.json',
), 'utf8'));

test('accepts the sanitized N20 Pixel app registration evidence', () => {
  assert.equal(validateN20PixelAppUiRegistration(evidence), evidence);
});

test('rejects an incomplete form, email confirmation, login or cold start', () => {
  for (const [group, key, value, pattern] of [
    ['registration', 'pixelRegistrationFormSubmissionObserved', false, /pixelRegistrationFormSubmissionObserved/u],
    ['registration', 'singleUseVerificationLinksConfirmed', 0, /confirmed links/u],
    ['pixel', 'newAccountLoginThroughAppUi', 'pending', /new-account login/u],
    ['pixel', 'coldStartSessionPersistence', 'pending', /cold start/u],
  ]) {
    const changed = structuredClone(evidence);
    changed[group][key] = value;
    assert.throws(() => validateN20PixelAppUiRegistration(changed), pattern);
  }
});

test('rejects candidate, CI or private-evidence drift', () => {
  for (const [group, key, value, pattern] of [
    ['candidate', 'apkSha256', '0'.repeat(64), /apkSha256/u],
    ['qa', 'n20DiagnosticGithubRegression', 'pending', /diagnostic regression state/u],
    ['qa', 'openCodeScanningAlerts', 1, /open code-scanning alerts/u],
    ['pixel', 'installedApkHashVerified', false, /installed APK hash/u],
  ]) {
    const changed = structuredClone(evidence);
    changed[group][key] = value;
    assert.throws(() => validateN20PixelAppUiRegistration(changed), pattern);
  }
});

test('rejects credential, identity, payment, Play or Production boundary drift', () => {
  for (const key of [
    'containsAccountIdentity',
    'containsCredential',
    'containsVerificationLink',
    'stripeSandboxUsed',
    'googlePlayChanged',
    'productionChanged',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[key] = true;
    assert.throws(() => validateN20PixelAppUiRegistration(changed), new RegExp(key));
  }
});
