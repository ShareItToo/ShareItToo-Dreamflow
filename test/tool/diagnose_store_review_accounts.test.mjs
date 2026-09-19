import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { diagnoseStoreReviewAccounts } from '../../tool/diagnose_store_review_accounts.mjs';

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sit-review-'));
  const vaultFile = join(root, 'vault.json');
  const vault = {
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
    status: 'synthetic-booking-active',
    accounts: [
      { role: 'owner', email: 'owner@example.test', password: `owner-${'x'.repeat(24)}`, registrationStatus: 'accepted', verificationStatus: 'fixture-verified' },
      { role: 'renter', email: 'renter@example.test', password: `renter-${'y'.repeat(24)}`, registrationStatus: 'accepted', verificationStatus: 'fixture-verified' },
    ],
    syntheticBooking: {
      listingId: 'private-listing',
      bookingId: 'private-booking',
      threadId: 'private-thread',
      workflowStatus: 'accepted',
      paymentMode: 'memory',
      stripeLivemode: false,
      paymentEndpointCalled: false,
    },
    ...overrides,
  };
  writeFileSync(vaultFile, `${JSON.stringify(vault)}\n`, { mode: 0o600 });
  chmodSync(vaultFile, 0o600);
  return { root, vaultFile, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function nonBindingFixture() {
  return fixture({
    status: 'non-binding-simulation-active',
    syntheticBooking: undefined,
    nonBindingSimulation: {
      listingId: 'private-listing',
      bookingId: 'private-booking',
      threadId: 'private-thread',
      status: 'accepted-chat-ready',
      availabilityUnaffected: true,
      paymentReadRejected: true,
      inAppNotificationsVerified: true,
      stripeLivemode: false,
      paymentEndpointCalled: false,
    },
  });
}

function jsonResponse(value, status = 200) {
  return { status, text: async () => JSON.stringify(value) };
}

function happyFetch({ missing = null, challenge = false } = {}) {
  return async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/api/v1', '');
    const auth = options.headers?.Authorization ?? '';
    const owner = auth === 'Bearer owner-token-1234567890';
    if (path === '/auth/login') {
      const body = JSON.parse(options.body);
      const role = body.email.startsWith('owner') ? 'owner' : 'renter';
      if (challenge && role === 'renter') return jsonResponse({ mfaRequired: true });
      return jsonResponse({ accessToken: `${role}-token-1234567890` });
    }
    if (path === '/auth/me') return jsonResponse({ user: {
      accountStatus: 'active', isDeactivated: false, emailVerified: true,
      termsAccepted: true, privacyAccepted: true, minimumAgeConfirmed: true,
    } });
    if (path === '/listings/mine') return jsonResponse({ listings: missing === 'listing' ? [] : [{ id: 'private-listing', isActive: true }] });
    if (path === '/rental-requests') return jsonResponse({ requests: missing === 'booking' ? [] : [{ id: 'private-booking', workflowStatus: 'accepted' }] });
    if (path === '/message-threads') return jsonResponse({ threads: missing === 'thread' ? [] : [{ id: 'private-thread' }] });
    if (path === '/message-threads/private-thread/messages') return jsonResponse({ messages: owner ? [{ id: 'hidden' }] : [] });
    return jsonResponse({ error: 'unexpected' }, 404);
  };
}

function nonBindingFetch(options = {}) {
  const base = happyFetch(options);
  return async (url, requestOptions) => {
    const path = new URL(url).pathname.replace('/api/v1', '');
    if (path === '/rental-requests') {
      return jsonResponse({ requests: [{
        id: 'private-booking',
        workflowStatus: 'accepted',
        simulationOnly: true,
        platformContract: null,
        bindingExpiresAt: null,
        contractCreated: false,
        paymentCreated: false,
        reservationCreated: false,
        monetaryEffectMinor: 0,
      }] });
    }
    return base(url, requestOptions);
  };
}

test('passes read-only access for both roles without leaking private values', async () => {
  const item = fixture();
  try {
    const result = await diagnoseStoreReviewAccounts({ vaultFile: item.vaultFile, fetchImpl: happyFetch(), capturedAt: new Date('2026-08-11T01:00:00Z') });
    assert.equal(result.status, 'technical-review-access-passed-store-fields-pending');
    assert.equal(result.boundaries.productDataReadOnly, true);
    assert.equal(result.boundaries.businessDataMutations, false);
    assert.equal(result.boundaries.authenticationSessionsCreated, true);
    assert.equal(result.checks.sharedChatReadableByBothRoles, true);
    assert.deepEqual(result.clientCandidate, { scope: 'api-only', binding: 'not-performed' });
    const output = JSON.stringify(result);
    for (const forbidden of ['owner@example', 'renter@example', 'private-listing', 'private-booking', 'private-thread', 'password-long', 'token-123']) {
      assert.equal(output.includes(forbidden), false);
    }
  } finally { item.cleanup(); }
});

test('passes an explicitly non-binding simulation without misclassifying it as a contract', async () => {
  const item = nonBindingFixture();
  try {
    const result = await diagnoseStoreReviewAccounts({
      vaultFile: item.vaultFile,
      fetchImpl: nonBindingFetch(),
      capturedAt: new Date('2026-08-11T01:00:00Z'),
    });
    assert.equal(result.fixture.kind, 'non-binding-staging-simulation');
    assert.equal(result.checks.nonBindingSimulationSafety, true);
    assert.equal(result.boundaries.contractCreated, false);
    assert.equal(result.boundaries.reservationCreated, false);
  } finally { item.cleanup(); }
});

test('rejects a group-readable review vault', async () => {
  const item = fixture();
  try {
    chmodSync(item.vaultFile, 0o640);
    await assert.rejects(() => diagnoseStoreReviewAccounts({ vaultFile: item.vaultFile, fetchImpl: happyFetch() }), /private, regular file/);
  } finally { item.cleanup(); }
});

test('rejects a partial or non-verified role set', async () => {
  const item = fixture({ accounts: [
    { role: 'owner', email: 'owner@example.test', password: `owner-${'x'.repeat(24)}`, registrationStatus: 'accepted', verificationStatus: 'fixture-verified' },
    { role: 'renter', email: 'renter@example.test', password: `renter-${'y'.repeat(24)}`, registrationStatus: 'registration-partial', verificationStatus: 'pending' },
  ] });
  try {
    await assert.rejects(() => diagnoseStoreReviewAccounts({ vaultFile: item.vaultFile, fetchImpl: happyFetch() }), /exactly two verified/);
  } finally { item.cleanup(); }
});

test('rejects live payment or a non-Staging fixture', async () => {
  const item = fixture({ stripeLivemode: true });
  try {
    await assert.rejects(() => diagnoseStoreReviewAccounts({ vaultFile: item.vaultFile, fetchImpl: happyFetch() }), /eligible isolated Staging/);
  } finally { item.cleanup(); }
});

test('rejects an interactive login challenge', async () => {
  const item = fixture();
  try {
    await assert.rejects(() => diagnoseStoreReviewAccounts({ vaultFile: item.vaultFile, fetchImpl: happyFetch({ challenge: true }) }), /interactive challenge/);
  } finally { item.cleanup(); }
});

test('does not expose fixture identifiers in transport errors', async () => {
  const item = fixture();
  try {
    await assert.rejects(
      () => diagnoseStoreReviewAccounts({
        vaultFile: item.vaultFile,
        fetchImpl: async (url, options) => {
          const path = new URL(url).pathname.replace('/api/v1', '');
          if (path === '/auth/login') {
            const role = JSON.parse(options.body).email.startsWith('owner') ? 'owner' : 'renter';
            return jsonResponse({ accessToken: `${role}-token-1234567890` });
          }
          if (path === '/auth/me') return happyFetch()(url, options);
          if (path === '/listings/mine') return happyFetch()(url, options);
          if (path === '/rental-requests') return happyFetch()(url, options);
          if (path === '/message-threads') return happyFetch()(url, options);
          return jsonResponse({ error: 'closed' }, 409);
        },
      }),
      (error) => {
        assert.match(error.message, /HTTP 409/);
        assert.equal(error.message.includes('private-thread'), false);
        return true;
      },
    );
  } finally { item.cleanup(); }
});

for (const missing of ['listing', 'booking', 'thread']) {
  test(`rejects a missing prepared ${missing}`, async () => {
    const item = fixture();
    try {
      await assert.rejects(() => diagnoseStoreReviewAccounts({ vaultFile: item.vaultFile, fetchImpl: happyFetch({ missing }) }), /not visible/);
    } finally { item.cleanup(); }
  });
}
