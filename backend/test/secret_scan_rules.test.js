import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectHighConfidenceSecretRules,
  detectSensitivePathRules,
} from '../ops/secret_scan_rules.mjs';

test('detects additional provider secret formats without returning their values', () => {
  const values = [
    `sk_test_${'A'.repeat(24)}`,
    `SG.${'B'.repeat(16)}.${'C'.repeat(24)}`,
    `SK${'d'.repeat(32)}`,
    `sk-svcacct-${'E'.repeat(32)}`,
  ];
  const rules = detectHighConfidenceSecretRules(values.join('\n'), 'config.txt');
  assert.deepEqual(rules.sort(), [
    'openai_key',
    'sendgrid_key',
    'stripe_test_key',
    'twilio_key',
  ]);
  assert.equal(rules.some((rule) => values.includes(rule)), false);
});

test('detects common private-key headers including encrypted and PGP material', () => {
  const prefix = '-----BEGIN ';
  const suffix = '-----';
  for (const label of [
    'PRIVATE KEY',
    'OPENSSH PRIVATE KEY',
    'ENCRYPTED PRIVATE KEY',
    'PGP PRIVATE KEY BLOCK',
  ]) {
    const header = `${prefix}${label}${suffix}`;
    assert.deepEqual(detectHighConfidenceSecretRules(header, 'fixture.txt'), [
      'private_key',
    ]);
  }
});

test('flags sensitive credential filenames while allowing templates', () => {
  assert.deepEqual(detectSensitivePathRules('backend/.env.production'), [
    'tracked_environment_file',
  ]);
  assert.deepEqual(detectSensitivePathRules('backend/.env.staging.example'), []);
  assert.deepEqual(detectSensitivePathRules('secrets/firebase-service-account.json'), [
    'tracked_service_account_file',
  ]);
  assert.deepEqual(detectSensitivePathRules('android/upload-keystore.jks'), [
    'tracked_private_key_file',
  ]);
});
