import assert from 'node:assert/strict';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { diagnoseStoreReviewDisposableDeletion } from '../../tool/diagnose_store_review_disposable_deletion.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

function vaults() {
  const root = tempFixtures.makeSync('sit-review-delete-');
  chmodSync(root, 0o700);
  const accounts = [
    { role: 'owner', registrationStatus: 'accepted', verificationStatus: 'email-link-verified', email: 'owner@example.test', password: `owner-${'x'.repeat(24)}` },
    { role: 'renter', registrationStatus: 'accepted', verificationStatus: 'email-link-verified', email: 'renter@example.test', password: `renter-${'y'.repeat(24)}` },
  ];
  const common = { schemaVersion: 1, kind: 'sit-staging-synthetic-account-vault', apiBaseUrl: 'https://staging.shareittoo.com/api/v1', stripeLivemode: false, accounts };
  const protectedPath = resolve(root, 'protected.json');
  writeFileSync(protectedPath, JSON.stringify({ ...common, status: 'synthetic-booking-active', syntheticBooking: { listingId: 'current-listing', bookingId: 'current-booking', threadId: 'current-thread', workflowStatus: 'accepted', paymentMode: 'memory', stripeLivemode: false, paymentEndpointCalled: false } }), { mode: 0o600 });
  const disposablePath = resolve(root, 'disposable.json');
  writeFileSync(disposablePath, JSON.stringify({ ...common, accounts: structuredClone(accounts), status: 'synthetic-booking-completed', syntheticBooking: { workflowStatus: 'completed', paymentMode: 'memory', stripeLivemode: false, paymentEndpointCalled: false } }), { mode: 0o600 });
  chmodSync(protectedPath, 0o600); chmodSync(disposablePath, 0o600);
  return { protectedPath, disposablePath };
}

function response(status, value) {
  return new Response(value === null ? null : JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

test('requires explicit confirmation before any deletion request', async () => {
  const { protectedPath, disposablePath } = vaults();
  let called = false;
  await assert.rejects(diagnoseStoreReviewDisposableDeletion({
    vaultFile: disposablePath, protectedVaultFile: protectedPath, fetchImpl: async () => { called = true; },
  }), /Explicit confirmation/);
  assert.equal(called, false);
});

test('deletes only the distinct disposable role and scrubs its private credentials', async () => {
  const { protectedPath, disposablePath } = vaults();
  let loginCount = 0;
  const calls = [];
  const result = await diagnoseStoreReviewDisposableDeletion({
    vaultFile: disposablePath,
    protectedVaultFile: protectedPath,
    role: 'renter',
    confirmSyntheticDeletion: true,
    capturedAt: new Date('2026-08-11T03:00:00Z'),
    fetchImpl: async (url, options = {}) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path, method: options.method ?? 'GET', body });
      if (path === '/auth/login') {
        loginCount += 1;
        return loginCount === 1
          ? response(200, { accessToken: `session-${'t'.repeat(40)}` })
          : response(401, { error: 'invalid_credentials' });
      }
      if (path === '/account/deletion-preflight') return response(200, { canDelete: true, blockers: [] });
      if (path === '/account/deletion' && body.currentPassword.endsWith('-intentional-mismatch')) return response(401, { error: 'invalid_credentials' });
      if (path === '/account/deletion') return response(200, { deleted: true });
      return response(404, { error: 'unexpected_test_path' });
    },
  });
  assert.equal(result.status, 'passed-disposable-account-deletion');
  assert.equal(result.boundaries.reviewerAccountsDeleted, false);
  assert.doesNotMatch(JSON.stringify(result), /example\.test|renter-y|current-listing/);
  const saved = JSON.parse(readFileSync(disposablePath, 'utf8'));
  const deleted = saved.accounts.find((entry) => entry.role === 'renter');
  assert.equal(deleted.email, undefined);
  assert.equal(deleted.password, undefined);
  assert.equal(deleted.deletionStatus, 'confirmed-erased');
  const protectedVault = JSON.parse(readFileSync(protectedPath, 'utf8'));
  assert.equal(protectedVault.status, 'synthetic-booking-active');
  assert.equal(calls.filter((entry) => entry.path === '/account/deletion').length, 2);
});

test('refuses to delete from the protected active reviewer vault', async () => {
  const { protectedPath } = vaults();
  await assert.rejects(diagnoseStoreReviewDisposableDeletion({
    vaultFile: protectedPath,
    protectedVaultFile: protectedPath,
    confirmSyntheticDeletion: true,
    fetchImpl: async () => response(500, {}),
  }), /not an isolated disposable|can never be a deletion target/);
});
