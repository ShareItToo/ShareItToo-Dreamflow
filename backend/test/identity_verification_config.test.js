import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeIdentityVerificationTransport,
} from '../src/identity_verification_config.js';

test('memory identity transport is restricted to staging and test', () => {
  assert.equal(normalizeIdentityVerificationTransport('memory', 'staging'), 'memory');
  assert.equal(normalizeIdentityVerificationTransport('memory', 'test'), 'memory');
  assert.throws(
    () => normalizeIdentityVerificationTransport('memory', 'development'),
    /restricted to staging or test/u,
  );
  assert.throws(
    () => normalizeIdentityVerificationTransport('memory', 'production'),
    /restricted to staging or test/u,
  );
});

test('identity transport defaults to disabled and rejects unknown values', () => {
  assert.equal(normalizeIdentityVerificationTransport(undefined, 'staging'), 'disabled');
  assert.equal(normalizeIdentityVerificationTransport(' disabled ', 'production'), 'disabled');
  assert.throws(
    () => normalizeIdentityVerificationTransport('provider', 'staging'),
    /must be disabled, memory, or stripe/u,
  );
});
