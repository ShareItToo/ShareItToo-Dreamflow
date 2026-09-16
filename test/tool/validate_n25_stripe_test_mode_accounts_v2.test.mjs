import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN25StripeTestModeAccountsV2,
} from '../../tool/validate_n25_stripe_test_mode_accounts_v2.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n25-stripe-test-mode-accounts-v2-20260903.json',
), 'utf8'));

test('accepts the sanitized N25 Stripe Accounts v2 technical closure', () => {
  assert.equal(validateN25StripeTestModeAccountsV2(evidence), evidence);
});

test('rejects a weakened connected-account readiness boundary', () => {
  for (const key of [
    'requiresAccountApiV2',
    'requiresAppliedRecipient',
    'requiresActiveStripeTransfers',
    'requiresApplicationLossesCollector',
    'legacyV1CannotAuthorizePayout',
    'responsibilityDriftFailsClosed',
  ]) {
    const changed = structuredClone(evidence);
    changed.readinessInvariant[key] = false;
    assert.throws(() => validateN25StripeTestModeAccountsV2(changed));
  }
});

test('rejects provider E2E, identity, credential or live-money overclaims', () => {
  for (const mutate of [
    (value) => { value.providerObservation.platformIdentityVerified = true; },
    (value) => { value.providerObservation.providerObjectsCreated = 1; },
    (value) => { value.providerObservation.p0bProviderScenariosPassed = 1; },
    (value) => { value.configuration.serverCredentialConfiguredInStaging = true; },
    (value) => { value.boundaries.stripeLiveModeUsed = true; },
    (value) => { value.boundaries.realMoneyUsed = true; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN25StripeTestModeAccountsV2(changed));
  }
});

test('rejects SDK, migration, CI, refund-model or privacy drift', () => {
  for (const mutate of [
    (value) => { value.provider.sdkVersion = 'latest'; },
    (value) => { value.database.latestMigration = '070_stage_a_non_binding_simulation_guard.up.sql'; },
    (value) => { value.refundAndPayoutInvariant.destinationRefundFlagsAbsent = false; },
    (value) => { value.qa.githubRegression = 'pending'; },
    (value) => { value.qa.cleanCheckoutReproducibility = 'pending'; },
    (value) => { value.boundaries.containsCredential = true; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN25StripeTestModeAccountsV2(changed));
  }
});
