import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  retireStagingNonBindingSimulation,
  runStagingNonBindingSimulation,
} from '../../tool/run_staging_non_binding_simulation.mjs';

function response(status, value) {
  return { status, text: async () => JSON.stringify(value) };
}

function syntheticCredential(role) {
  return [role, 'credential', 'fixture'].join('-');
}

function testVault() {
  const root = mkdtempSync(join(tmpdir(), 'sit-stage-a-simulation-'));
  const directory = join(root, 'private');
  mkdirSync(directory, { mode: 0o700 });
  const path = join(directory, 'accounts.json');
  writeFileSync(path, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    runId: '20260902t150639z-6c5984c2',
    status: 'fixture-verified-ready-for-login',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
    accounts: [
      { role: 'owner', email: 'owner@example.invalid', password: syntheticCredential('owner') },
      { role: 'renter', email: 'renter@example.invalid', password: syntheticCredential('renter') },
    ],
  })}\n`, { mode: 0o600 });
  return path;
}

test('runs a persistent non-binding Staging request, acceptance and chat proof', async () => {
  const vaultFile = testVault();
  const calls = [];
  const listingId = 'listing-fixture';
  const bookingId = 'sit-20260902t150639z-6c5984c2-01020304-simulation';
  const threadId = 'thread-fixture';
  const booking = (workflowStatus) => ({
    id: bookingId,
    itemId: listingId,
    workflowStatus,
    simulationOnly: true,
    platformContract: null,
    bindingExpiresAt: null,
    contractCreated: false,
    paymentCreated: false,
    reservationCreated: false,
    monetaryEffectMinor: 0,
  });
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/api/v1', '') + new URL(url).search;
    calls.push({ path, method: options.method ?? 'GET', body: options.body });
    if (path === '/auth/login') return response(200, { accessToken: 'x'.repeat(24) });
    if (path === '/listings/mine') {
      return response(200, { listings: [{
        id: listingId,
        title: 'SIT Rollenprüfung 20260902t150639z-6c5984c2',
        status: 'active',
      }] });
    }
    if (path === '/bookings') return response(201, { booking: booking('requested') });
    if (path === '/rental-requests') {
      const accepted = calls.some((entry) => entry.path.endsWith('/transitions'));
      return response(200, { requests: [booking(accepted ? 'accepted' : 'requested')] });
    }
    if (path.endsWith('/availability/check')) return response(200, { available: true });
    if (path.endsWith('/payment')) {
      return response(409, { error: 'pilot_simulation_payment_forbidden' });
    }
    if (path.endsWith('/transitions')) return response(200, { booking: booking('accepted') });
    if (path.startsWith('/message-threads/booking/')) {
      return response(201, { thread: { id: threadId } });
    }
    if (path === `/message-threads/${threadId}/messages` && options.method === 'POST') {
      return response(201, { message: { id: 'message-fixture' } });
    }
    if (path === '/message-threads') return response(200, { threads: [{ id: threadId }] });
    if (path === `/message-threads/${threadId}/messages`) {
      return response(200, { messages: [{
        text: 'SIT Stage-A Testchat: unverbindliche Pilot-Simulation.',
      }] });
    }
    if (path === '/notifications?limit=100') {
      return response(200, { notifications: [
        {
          entityId: bookingId,
          kind: 'booking_requested',
          title: 'Pilot-Simulation · Neue Buchungsanfrage',
          payload: { simulationOnly: true },
        },
        {
          entityId: bookingId,
          kind: 'booking_accepted',
          title: 'Pilot-Simulation · Anfrage angenommen',
          payload: { simulationOnly: true },
        },
      ] });
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  const result = await runStagingNonBindingSimulation({
    vaultFile,
    fetchImpl,
    now: new Date('2026-09-02T15:30:00.000Z'),
    random: () => Buffer.from([1, 2, 3, 4]),
    wait: async () => {},
  });
  assert.equal(result.status, 'passed-staging-non-binding-simulation');
  assert.equal(result.chatReady, true);
  assert.equal(result.availabilityUnaffected, true);
  assert.equal(result.paymentReadRejected, true);
  assert.equal(result.contractCreated, false);
  assert.equal(result.reservationCreated, false);
  assert.equal(result.monetaryEffectMinor, 0);
  assert.equal(result.containsSecrets, false);
  assert.equal(result.containsEmailAddresses, false);
  assert.equal(result.containsTokens, false);
  const stored = JSON.parse(readFileSync(vaultFile, 'utf8'));
  assert.equal(stored.nonBindingSimulation.status, 'accepted-chat-ready');
  assert.equal(stored.nonBindingSimulation.paymentReadRejected, true);
});

test('requires a private vault outside the repository', async () => {
  await assert.rejects(
    () => runStagingNonBindingSimulation({
      vaultFile: new URL('../../pubspec.yaml', import.meta.url).pathname,
      fetchImpl: async () => response(500, {}),
    }),
    /outside the repository/u,
  );
});

test('retires the exact accepted non-binding simulation without payment or deletion', async () => {
  const vaultFile = testVault();
  const listingId = 'listing-fixture';
  const bookingId = 'booking-fixture';
  const vault = JSON.parse(readFileSync(vaultFile, 'utf8'));
  vault.status = 'non-binding-simulation-active';
  vault.nonBindingSimulation = {
    schemaVersion: 1,
    status: 'accepted-chat-ready',
    listingId,
    bookingId,
    threadId: 'thread-fixture',
    paymentEndpointCalled: false,
    stripeLivemode: false,
  };
  writeFileSync(vaultFile, `${JSON.stringify(vault)}\n`, { mode: 0o600 });
  const calls = [];
  let cancelled = false;
  let paused = false;
  const booking = (workflowStatus) => ({
    id: bookingId,
    itemId: listingId,
    workflowStatus,
    simulationOnly: true,
    platformContract: null,
    bindingExpiresAt: null,
    contractCreated: false,
    paymentCreated: false,
    reservationCreated: false,
    monetaryEffectMinor: 0,
  });
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace('/api/v1', '') + parsed.search;
    calls.push({ path, method: options.method ?? 'GET' });
    if (path === '/auth/login') return response(200, { accessToken: 'x'.repeat(24) });
    if (path === '/rental-requests') {
      return response(200, { requests: [booking(cancelled ? 'cancelled' : 'accepted')] });
    }
    if (path === `/bookings/${bookingId}/transitions`) {
      cancelled = true;
      return response(200, { booking: booking('cancelled') });
    }
    if (path === '/listings/mine') {
      return response(200, { listings: [{
        id: listingId,
        title: 'SIT Rollenprüfung 20260902t150639z-6c5984c2',
        status: paused ? 'paused' : 'active',
        isActive: !paused,
      }] });
    }
    if (path === `/listings/${listingId}/status`) {
      paused = true;
      return response(200, { listing: { status: 'paused', isActive: false } });
    }
    if (path === '/listings?limit=100&offset=0') {
      return response(200, { listings: [] });
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  const result = await retireStagingNonBindingSimulation({
    vaultFile,
    fetchImpl,
    now: new Date('2026-09-08T04:00:00.000Z'),
  });
  assert.equal(result.status, 'staging-non-binding-simulation-retired');
  assert.equal(result.bookingCancelled, true);
  assert.equal(result.listingPaused, true);
  assert.equal(result.publicCatalogEntryRemoved, true);
  assert.equal(result.monetaryEffectMinor, 0);
  assert.equal(calls.some(({ path }) => /payment|delete/iu.test(path)), false);
  const stored = JSON.parse(readFileSync(vaultFile, 'utf8'));
  assert.equal(stored.status, 'non-binding-simulation-retired');
  assert.equal(stored.nonBindingSimulation.workflowStatus, 'cancelled');
  assert.equal(stored.nonBindingSimulation.listingStatus, 'paused');
});

test('retirement fails closed when the server booking is not an exact simulation', async () => {
  const vaultFile = testVault();
  const vault = JSON.parse(readFileSync(vaultFile, 'utf8'));
  vault.status = 'non-binding-simulation-active';
  vault.nonBindingSimulation = {
    schemaVersion: 1,
    status: 'accepted-chat-ready',
    listingId: 'listing-fixture',
    bookingId: 'booking-fixture',
    paymentEndpointCalled: false,
    stripeLivemode: false,
  };
  writeFileSync(vaultFile, `${JSON.stringify(vault)}\n`, { mode: 0o600 });

  await assert.rejects(
    retireStagingNonBindingSimulation({
      vaultFile,
      fetchImpl: async (url) => {
        const path = new URL(url).pathname.replace('/api/v1', '');
        if (path === '/auth/login') return response(200, { accessToken: 'x'.repeat(24) });
        if (path === '/rental-requests') {
          return response(200, { requests: [{
            id: 'booking-fixture',
            itemId: 'listing-fixture',
            workflowStatus: 'accepted',
            simulationOnly: false,
          }] });
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    }),
    /not safely represented as accepted/u,
  );
});
