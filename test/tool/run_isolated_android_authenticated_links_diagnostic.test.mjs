import assert from 'node:assert/strict';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { runIsolatedAndroidAuthenticatedLinksDiagnostic } from '../../tool/run_isolated_android_authenticated_links_diagnostic.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

function syntheticCredential(role) {
  return ['private', role, 'fixture'].join('-');
}

function fixture({ completedHistory = false, archivedHistory = false, withoutBooking = false } = {}) {
  const root = tempFixtures.makeSync('sit-protected-authenticated-links-');
  const vaultFile = resolve(root, 'accounts.json');
  writeFileSync(vaultFile, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
    status: withoutBooking ? 'fixture-verified-ready-for-login' : 'synthetic-booking-active',
    runId: 'private-review-run',
    accounts: [
      { role: 'owner', email: 'owner@example.invalid', password: syntheticCredential('owner') },
      { role: 'renter', email: 'renter@example.invalid', password: syntheticCredential('renter') },
    ],
    ...(withoutBooking ? {} : {
      syntheticBooking: {
        workflowStatus: 'active',
        paymentMode: 'memory',
        stripeLivemode: false,
        paymentEndpointCalled: false,
      },
    }),
    ...(completedHistory ? {
      syntheticBookingHistory: [{
        workflowStatus: 'completed',
        paymentMode: 'memory',
        stripeLivemode: false,
        paymentEndpointCalled: false,
        listingId: 'completed-listing',
        bookingId: 'completed-booking',
        title: 'Abgeschlossene Testbuchung',
        ...(archivedHistory ? { archivedAt: '2026-08-15T08:00:00.000Z' } : {}),
      }],
    } : {}),
  }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(vaultFile, 0o600);
  return vaultFile;
}

const passedEvidence = {
  status: 'passed-bounded-authenticated-deep-link-diagnostic',
  boundaries: {
    authenticatedDeepLinksPassed: true,
    containsSecrets: false,
    containsReviewCredentials: false,
  },
};

test('isolates completed deep-link fixture and restores the protected review session', async () => {
  const vaultFile = fixture();
  const before = readFileSync(vaultFile, 'utf8');
  const calls = [];
  const result = await runIsolatedAndroidAuthenticatedLinksDiagnostic({
    vaultFile,
    lifecycleRunner: async (isolatedVaultFile) => {
      const isolated = JSON.parse(readFileSync(isolatedVaultFile, 'utf8'));
      assert.equal(isolated.syntheticBooking, undefined);
      writeFileSync(isolatedVaultFile, `${JSON.stringify({
        ...isolated,
        status: 'synthetic-booking-completed',
        syntheticBooking: {
          workflowStatus: 'completed',
          paymentMode: 'memory',
          stripeLivemode: false,
          paymentEndpointCalled: false,
        },
      }, null, 2)}\n`, { mode: 0o600 });
      return {
        status: 'passed-bounded-synthetic-role-booking-lifecycle',
        paymentEndpointCalled: false,
        stripeLivemode: false,
      };
    },
    threadRunner: async (isolatedVaultFile) => {
      const isolated = JSON.parse(readFileSync(isolatedVaultFile, 'utf8'));
      isolated.syntheticBooking.threadId = 'private-thread-id';
      writeFileSync(isolatedVaultFile, `${JSON.stringify(isolated, null, 2)}\n`, { mode: 0o600 });
      return {
        status: 'synthetic-booking-thread-ready',
        workflowStatus: 'completed',
        paymentEndpointCalled: false,
        stripeLivemode: false,
      };
    },
    retirementRunner: async (isolatedVaultFile) => {
      const isolated = JSON.parse(readFileSync(isolatedVaultFile, 'utf8'));
      assert.equal(isolated.syntheticBooking.workflowStatus, 'completed');
      calls.push('retire');
      return {
        status: 'synthetic-booking-retired',
        bookingCompleted: true,
        listingPaused: true,
        listingDeleted: false,
        paymentEndpointCalled: false,
        stripeLivemode: false,
      };
    },
    ensureGuestRunner: async () => { calls.push('guest'); return true; },
    restoreSessionRunner: async (account) => { calls.push(`restore-${account.role}`); return true; },
    deepLinkRunner: async (isolatedVaultFile) => {
      const isolated = JSON.parse(readFileSync(isolatedVaultFile, 'utf8'));
      assert.equal(isolated.syntheticBooking.workflowStatus, 'completed');
      calls.push('links');
      return passedEvidence;
    },
  });

  assert.deepEqual(calls, ['guest', 'restore-owner', 'links', 'guest', 'restore-owner', 'retire']);
  assert.equal(result.isolation.protectedReviewFixtureUnchanged, true);
  assert.equal(result.isolation.protectedReviewSessionRestored, true);
  assert.equal(result.isolation.temporaryBookingCompleted, true);
  assert.equal(result.isolation.temporaryListingPaused, true);
  assert.equal(result.isolation.temporaryListingDeleted, false);
  assert.equal(readFileSync(vaultFile, 'utf8'), before);
});

test('accepts a login-ready protected vault without mutating it or requiring an active booking', async () => {
  const vaultFile = fixture({ withoutBooking: true });
  const before = readFileSync(vaultFile, 'utf8');
  let lifecycleCalls = 0;
  await runIsolatedAndroidAuthenticatedLinksDiagnostic({
    vaultFile,
    lifecycleRunner: async (isolatedVaultFile) => {
      lifecycleCalls += 1;
      const isolated = JSON.parse(readFileSync(isolatedVaultFile, 'utf8'));
      isolated.status = 'synthetic-booking-completed';
      isolated.syntheticBooking = {
        workflowStatus: 'completed',
        paymentMode: 'memory',
        stripeLivemode: false,
        paymentEndpointCalled: false,
      };
      writeFileSync(isolatedVaultFile, `${JSON.stringify(isolated, null, 2)}\n`, { mode: 0o600 });
      return {
        status: 'passed-bounded-synthetic-role-booking-lifecycle',
        paymentEndpointCalled: false,
        stripeLivemode: false,
      };
    },
    threadRunner: async () => ({
      status: 'synthetic-booking-thread-ready',
      workflowStatus: 'completed',
      paymentEndpointCalled: false,
      stripeLivemode: false,
    }),
    retirementRunner: async () => ({
      status: 'synthetic-booking-retired',
      bookingCompleted: true,
      listingPaused: true,
      listingDeleted: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
    }),
    ensureGuestRunner: async () => true,
    restoreSessionRunner: async () => true,
    deepLinkRunner: async () => passedEvidence,
  });

  assert.equal(lifecycleCalls, 1);
  assert.equal(readFileSync(vaultFile, 'utf8'), before);
});

test('reuses a safe completed history fixture without creating another booking', async () => {
  const vaultFile = fixture({ completedHistory: true });
  const before = readFileSync(vaultFile, 'utf8');
  let lifecycleCalls = 0;
  const result = await runIsolatedAndroidAuthenticatedLinksDiagnostic({
    vaultFile,
    lifecycleRunner: async () => { lifecycleCalls += 1; throw new Error('must not create'); },
    threadRunner: async (isolatedVaultFile) => {
      const isolated = JSON.parse(readFileSync(isolatedVaultFile, 'utf8'));
      assert.equal(isolated.status, 'synthetic-booking-completed');
      assert.equal(isolated.syntheticBooking.bookingId, 'completed-booking');
      isolated.syntheticBooking.threadId = 'completed-thread';
      writeFileSync(isolatedVaultFile, `${JSON.stringify(isolated, null, 2)}\n`, { mode: 0o600 });
      return {
        status: 'synthetic-booking-thread-ready',
        workflowStatus: 'completed',
        paymentEndpointCalled: false,
        stripeLivemode: false,
      };
    },
    retirementRunner: async () => ({
      status: 'synthetic-booking-retired',
      bookingCompleted: true,
      listingPaused: true,
      listingDeleted: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
    }),
    ensureGuestRunner: async () => true,
    restoreSessionRunner: async () => true,
    deepLinkRunner: async () => passedEvidence,
  });

  assert.equal(lifecycleCalls, 0);
  assert.equal(result.isolation.protectedReviewFixtureUnchanged, true);
  assert.equal(readFileSync(vaultFile, 'utf8'), before);
});

test('does not reuse an archived completed history fixture', async () => {
  const vaultFile = fixture({ completedHistory: true, archivedHistory: true });
  let lifecycleCalls = 0;
  await runIsolatedAndroidAuthenticatedLinksDiagnostic({
    vaultFile,
    lifecycleRunner: async (isolatedVaultFile) => {
      lifecycleCalls += 1;
      const isolated = JSON.parse(readFileSync(isolatedVaultFile, 'utf8'));
      assert.equal(isolated.syntheticBooking, undefined);
      isolated.status = 'synthetic-booking-completed';
      isolated.syntheticBooking = {
        workflowStatus: 'completed',
        paymentMode: 'memory',
        stripeLivemode: false,
        paymentEndpointCalled: false,
      };
      writeFileSync(isolatedVaultFile, `${JSON.stringify(isolated, null, 2)}\n`, { mode: 0o600 });
      return {
        status: 'passed-bounded-synthetic-role-booking-lifecycle',
        paymentEndpointCalled: false,
        stripeLivemode: false,
      };
    },
    threadRunner: async () => ({
      status: 'synthetic-booking-thread-ready',
      workflowStatus: 'completed',
      paymentEndpointCalled: false,
      stripeLivemode: false,
    }),
    retirementRunner: async () => ({
      status: 'synthetic-booking-retired',
      bookingCompleted: true,
      listingPaused: true,
      listingDeleted: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
    }),
    ensureGuestRunner: async () => true,
    restoreSessionRunner: async () => true,
    deepLinkRunner: async () => passedEvidence,
  });
  assert.equal(lifecycleCalls, 1);
});

test('restores the protected session after a failed isolated deep-link probe', async () => {
  const vaultFile = fixture();
  const before = readFileSync(vaultFile, 'utf8');
  let restoreCount = 0;
  await assert.rejects(
    runIsolatedAndroidAuthenticatedLinksDiagnostic({
      vaultFile,
      lifecycleRunner: async () => ({
        status: 'passed-bounded-synthetic-role-booking-lifecycle',
        paymentEndpointCalled: false,
        stripeLivemode: false,
      }),
      threadRunner: async () => ({
        status: 'synthetic-booking-thread-ready',
        workflowStatus: 'completed',
        paymentEndpointCalled: false,
        stripeLivemode: false,
      }),
      retirementRunner: async () => ({
        status: 'synthetic-booking-retired',
        bookingCompleted: true,
        listingPaused: true,
        listingDeleted: false,
        paymentEndpointCalled: false,
        stripeLivemode: false,
      }),
      ensureGuestRunner: async () => true,
      restoreSessionRunner: async () => { restoreCount += 1; return true; },
      deepLinkRunner: async () => { throw new Error('private diagnostic failure'); },
    }),
    /private diagnostic failure/,
  );
  assert.equal(restoreCount, 2);
  assert.equal(readFileSync(vaultFile, 'utf8'), before);
});
