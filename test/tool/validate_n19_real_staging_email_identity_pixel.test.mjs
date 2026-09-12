import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN19RealStagingEmailIdentityPixel,
} from '../../tool/validate_n19_real_staging_email_identity_pixel.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n19-real-staging-email-identity-pixel-2026090305.json',
), 'utf8'));

test('accepts the sanitized N19 email identity evidence', () => {
  assert.equal(validateN19RealStagingEmailIdentityPixel(evidence), evidence);
});

test('rejects missing delivery, confirmation or login evidence', () => {
  for (const [group, key, value, pattern] of [
    ['emailIdentity', 'gmailVerificationMessagesFound', 1, /Gmail messages/u],
    ['emailIdentity', 'singleUseVerificationLinksConfirmed', 1, /confirmed links/u],
    ['pixel', 'ownerLoginThroughAppUi', 'pending', /owner login/u],
    ['pixel', 'previousPrincipalAbsentAfterEachSwitch', false, /principal isolation/u],
  ]) {
    const changed = structuredClone(evidence);
    changed[group][key] = value;
    assert.throws(() => validateN19RealStagingEmailIdentityPixel(changed), pattern);
  }
});

test('keeps the unobserved Pixel registration submission explicit', () => {
  const changed = structuredClone(evidence);
  changed.emailIdentity.pixelRegistrationFormSubmissionObserved = true;
  assert.throws(
    () => validateN19RealStagingEmailIdentityPixel(changed),
    /Pixel registration form truth/u,
  );
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
    assert.throws(() => validateN19RealStagingEmailIdentityPixel(changed), new RegExp(key));
  }
});
