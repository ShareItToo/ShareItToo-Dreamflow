import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN23PixelGoogleSocialAuthPrincipalEpoch,
} from '../../tool/validate_n23_pixel_google_social_auth_principal_epoch.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n23-pixel-google-social-auth-principal-epoch-2026090306.json',
), 'utf8'));

test('accepts the sanitized N23 Pixel Google social-auth closure', () => {
  assert.equal(validateN23PixelGoogleSocialAuthPrincipalEpoch(evidence), evidence);
});

test('rejects a weakened principal epoch or generic-result boundary', () => {
  for (const key of [
    'captureBeforeFirstAwait',
    'recheckBeforeRemoteExchange',
    'recheckExactPersistedSessionBeforePresentation',
    'genericCatchCannotCollapsePrincipalChanged',
    'newerPrincipalSessionPreserved',
  ]) {
    const changed = structuredClone(evidence);
    changed.principalEpochInvariant[key] = false;
    assert.throws(() => validateN23PixelGoogleSocialAuthPrincipalEpoch(changed));
  }
});

test('rejects incomplete Google repeat, persistence or duplicate-account truth', () => {
  for (const mutate of [
    (value) => { value.pixel.firstExactGoogleLogin = 'pending'; },
    (value) => { value.pixel.coldStartSessionPersistence = 'pending'; },
    (value) => { value.pixel.repeatExactGoogleLogin = 'pending'; },
    (value) => { value.pixel.sameStagingProfileAcrossAllObservations = false; },
    (value) => { value.pixel.duplicateAccountObserved = true; },
    (value) => { value.pixel.accountCreationVersusExistingLinkage = 'created'; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN23PixelGoogleSocialAuthPrincipalEpoch(changed));
  }
});

test('rejects ratchet, CI, Play, Production, identity or money overclaims', () => {
  for (const mutate of [
    (value) => { value.ratchetRepair.privacySemanticsChanged = true; },
    (value) => { value.ratchetRepair.temporaryWorkaroundRetained = true; },
    (value) => { value.qa.githubCodeql = 'pending'; },
    (value) => { value.boundaries.googlePlayChanged = true; },
    (value) => { value.boundaries.productionChanged = true; },
    (value) => { value.boundaries.realMoneyUsed = true; },
    (value) => { value.boundaries.accountIdentityRecorded = true; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN23PixelGoogleSocialAuthPrincipalEpoch(changed));
  }
});
