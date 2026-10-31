import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildRegistrationConsentBundle,
  registrationConsentActionText,
  registrationBundleType,
  registrationActionLabelForProvider,
} from '../src/registration_consent_bundle.js';

test('registration bundle preserves one action and four named facts', () => {
  const bundle = buildRegistrationConsentBundle({
    actionLabel: 'Mit Google registrieren',
    appVersion: 'test-build',
  });
  assert.equal(bundle.type, registrationBundleType);
  assert.equal(bundle.localTestOnly, false);
  assert.equal(bundle.exactCtaText, registrationConsentActionText('Mit Google registrieren'));
  assert.deepEqual(bundle.facts, {
    minimumAge18: true,
    privateUseOnly: true,
    termsAccepted: true,
    privacyAcknowledged: true,
  });
  assert.equal(bundle.documents.terms.version, 'V5.2-2026-08-16');
  assert.equal(bundle.documents.privacy.version, 'V5.2-2026-08-16');
  assert.equal(Object.hasOwn(bundle, 'ip'), false);
});

test('registration bundle migration is forward-only append-only and rollback-safe', () => {
  const up = fs.readFileSync(new URL('../sql/migrations/097_registration_consent_bundle.up.sql', import.meta.url), 'utf8');
  const down = fs.readFileSync(new URL('../sql/migrations/097_registration_consent_bundle.down.sql', import.meta.url), 'utf8');
  assert.match(up, /account_registration_bundle/u);
  assert.match(up, /metadata JSONB/u);
  assert.match(up, /CREATE UNIQUE INDEX/u);
  assert.match(up, /accepted = TRUE/u);
  assert.match(up, /declaredAt/u);
  assert.match(down, /registration_consent_bundles_active_rows/u);
  assert.match(down, /DROP COLUMN IF EXISTS metadata/u);
});

test('provider action labels are derived, not client-chosen', () => {
  assert.equal(
    registrationActionLabelForProvider('google'),
    'Mit Google registrieren',
  );
  assert.throws(
    () => registrationActionLabelForProvider('unknown'),
    /registration_provider_invalid/u,
  );
});
