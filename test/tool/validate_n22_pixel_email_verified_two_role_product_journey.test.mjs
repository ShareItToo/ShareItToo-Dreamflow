import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN22PixelEmailVerifiedTwoRoleProductJourney,
} from '../../tool/validate_n22_pixel_email_verified_two_role_product_journey.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n22-pixel-email-verified-two-role-product-journey-2026090305.json',
), 'utf8'));

test('accepts the sanitized N22 Pixel email-verified two-role journey evidence', () => {
  assert.equal(validateN22PixelEmailVerifiedTwoRoleProductJourney(evidence), evidence);
});

test('rejects incomplete publish, discovery, chat, isolation or cleanup proof', () => {
  for (const [key, value, pattern] of [
    ['ownerDraftPublishThroughPixelUi', 'pending', /ownerDraftPublishThroughPixelUi/u],
    ['renterPublicDiscovery', 'pending', /renterPublicDiscovery/u],
    ['chatVisibility', 'pending', /chatVisibility/u],
    ['principalSwitchIsolation', 'pending', /principalSwitchIsolation/u],
    ['cleanup', 'pending', /cleanup/u],
  ]) {
    const changed = structuredClone(evidence);
    changed.journey[key] = value;
    assert.throws(() => validateN22PixelEmailVerifiedTwoRoleProductJourney(changed), pattern);
  }
});

test('rejects binding, payment, availability or active-fixture drift', () => {
  for (const mutate of [
    (value) => { value.resultSemantics.paymentEndpointCalled = true; },
    (value) => { value.resultSemantics.contractCreated = true; },
    (value) => { value.resultSemantics.reservationCreated = true; },
    (value) => { value.resultSemantics.availabilityAffected = true; },
    (value) => { value.resultSemantics.monetaryEffectMinor = 1; },
    (value) => { value.journey.listingLeftActive = true; },
    (value) => { value.journey.testBookingLeftActive = true; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN22PixelEmailVerifiedTwoRoleProductJourney(changed));
  }
});

test('rejects CI, harness, credential, Play, Production or money boundary drift', () => {
  for (const mutate of [
    (value) => { value.qa.n22ImplementationGithubRegression = 'pending'; },
    (value) => { value.diagnosticHardening.temporaryWorkaroundRetained = true; },
    (value) => { value.diagnosticHardening.fixturesFromFailedAttemptsRetired = false; },
    (value) => { value.privateVault.accountIdentityFixtureOrTokenCommitted = true; },
    (value) => { value.boundaries.containsCredential = true; },
    (value) => { value.boundaries.googlePlayChanged = true; },
    (value) => { value.boundaries.productionChanged = true; },
    (value) => { value.boundaries.realMoneyUsed = true; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN22PixelEmailVerifiedTwoRoleProductJourney(changed));
  }
});
