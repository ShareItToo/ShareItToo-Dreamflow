import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateWp148AndroidSocialProviderActivationGuard } from
  '../../tool/validate_wp148_android_social_provider_activation_guard.mjs';

const evidenceUrl = new URL(
  '../../docs/evidence/release-readiness/wp148-android-social-provider-activation-guard-20260914.json',
  import.meta.url,
);

function fixture() {
  return JSON.parse(readFileSync(evidenceUrl, 'utf8'));
}

test('accepts the exact fail-closed social-provider closure', () => {
  const result = validateWp148AndroidSocialProviderActivationGuard({ evidence: fixture() });
  assert.equal(result.status, 'technical-closure-provider-gates-hold');
  assert.deepEqual(result.portfolio, { pass: 22, partial: 5, open: 5 });
  assert.equal(result.facebook, false);
  assert.equal(result.apple, false);
});

for (const mutate of [
  (value) => { value.pilotAuthentication.facebook = 'PASS'; },
  (value) => { value.facebook.activationReady = true; },
  (value) => { value.apple.tokenRevocationImplemented = true; },
  (value) => { value.verification.candidateRefreshRequiredBeforeNextReleaseArtifact = false; },
  (value) => { value.boundaries.firebaseConsoleChanged = true; },
]) {
  test('rejects provider readiness or mutation overstatement', () => {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp148AndroidSocialProviderActivationGuard({ evidence: value }),
      /WP148/u,
    );
  });
}

test('rejects source-integrity drift', () => {
  const value = fixture();
  value.sourceInventory['scripts/build_android_release_candidate.sh'] = '0'.repeat(64);
  assert.throws(
    () => validateWp148AndroidSocialProviderActivationGuard({ evidence: value }),
    /source inventory/u,
  );
});
