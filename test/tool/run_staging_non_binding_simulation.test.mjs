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
  if (status === 200 && typeof value?.accessToken === 'string' && !value.refreshToken) {
    value = { ...value, refreshToken: `simulation-refresh-${'r'.repeat(40)}` };
  }
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

function simulationHarness({ failEvidenceSegment = null, failQrSegment = null } = {}) {
  const calls = [];
  let loginCount = 0;
  let logoutCount = 0;
  let uploadCount = 0;
  let workflowStatus = 'requested';
  let listingStatus = 'active';
  let currentFailQrSegment = failQrSegment;
  const photoCounts = { pickup: 0, return: 0 };
  const conditionConfirmed = { pickup: false, return: false };
  const qrVerified = { pickup: false, return: false };
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
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname.replace('/api/v1', '') + parsedUrl.search;
    const authorization = options.headers?.Authorization ?? '';
    const role = authorization.includes('owner-token') ? 'owner'
      : authorization.includes('renter-token') ? 'renter' : null;
    if (path === '/auth/logout') {
      logoutCount += 1;
      return response(204, null);
    }
    calls.push({
      path,
      method: options.method ?? 'GET',
      body: options.body instanceof FormData
        ? { purpose: options.body.get('purpose'), filename: options.body.get('file')?.name }
        : options.body,
      authorization,
      role,
    });
    if (path === '/auth/login') {
      const body = JSON.parse(options.body);
      loginCount += 1;
      const accountRole = body.email.startsWith('owner') ? 'owner' : 'renter';
      return response(200, {
        accessToken: `${accountRole}-token-for-staging-gate`,
        refreshToken: `${accountRole}-refresh-token-for-staging-gate-${loginCount}`,
      });
    }
    if (path === '/listings?limit=100&offset=0') return response(200, { listings: [] });
    if (!authorization.startsWith('Bearer ')) {
      return response(401, { error: 'staging_access_required' });
    }
    if (path === '/auth/me') return response(200, { user: {
      id: `${role}-principal-fixture`, email: `${role}@example.invalid`,
    } });
    if (path === '/listings/mine') {
      return response(200, { listings: [{
        id: listingId,
        title: 'SIT Rollenprüfung 20260902t150639z-6c5984c2',
        status: listingStatus,
        isActive: listingStatus === 'active',
      }] });
    }
    if (path === `/listings/${listingId}/status` && options.method === 'PATCH') {
      listingStatus = JSON.parse(options.body).status;
      return response(200, { listing: { status: listingStatus, isActive: false } });
    }
    if (path === '/bookings') return response(201, { booking: booking('requested') });
    if (path === '/rental-requests') return response(200, { requests: [booking(workflowStatus)] });
    if (path.endsWith('/availability/check')) return response(200, { available: true });
    assert.doesNotMatch(path, /payment|stripe/iu, 'simulation must not call any payment endpoint');
    if (path.endsWith('/transitions')) {
      const requested = JSON.parse(options.body).status;
      const allowedRole = { accepted: 'owner', active: 'renter', completed: 'owner' }[requested];
      if (role !== allowedRole) return response(403, { error: 'booking_forbidden' });
      if (requested === 'active' && !qrVerified.pickup) {
        return response(409, { error: 'verified_pickup_confirmation_required' });
      }
      if (requested === 'completed' && !qrVerified.return) {
        return response(409, { error: 'verified_return_confirmation_required' });
      }
      workflowStatus = requested;
      return response(200, { booking: booking(workflowStatus) });
    }
    if (path === '/uploads') {
      const purpose = options.body.get('purpose');
      const expectedRole = purpose === 'handover_evidence' ? 'owner' : 'renter';
      if (role !== expectedRole) return response(403, { error: 'upload_forbidden' });
      uploadCount += 1;
      return response(201, {
        id: `00000000-0000-4000-8000-${String(uploadCount).padStart(12, '0')}`,
        url: `https://staging.shareittoo.com/api/v1/uploads/${uploadCount}`,
      });
    }
    if (path.startsWith('/message-threads/booking/')) {
      return response(201, { thread: { id: threadId } });
    }
    if (path === `/message-threads/${threadId}/messages` && options.method === 'POST') {
      const body = JSON.parse(options.body);
      if (body.conditionEvidence) photoCounts[body.conditionEvidence.segment] += 1;
      return response(201, { message: { id: 'message-fixture' } });
    }
    if (path === '/message-threads') return response(200, { threads: [{ id: threadId }] });
    if (path === `/message-threads/${threadId}/messages`) {
      return response(200, { messages: [{
        text: 'SIT Stage-A Testchat: unverbindliche Pilot-Simulation.',
      }] });
    }
    if (/\/condition-evidence\?segment=(pickup|return)$/u.test(path)) {
      const segment = /segment=(pickup|return)$/u.exec(path)[1];
      const count = photoCounts[segment]
        - (failEvidenceSegment === segment && photoCounts[segment] === 4 ? 1 : 0);
      return response(200, { summary: {
        presenterPhotos: count,
        deviationPhotos: 0,
        counterpartyConfirmation: conditionConfirmed[segment]
          ? { decision: 'confirmed' }
          : null,
      } });
    }
    if (path.endsWith('/condition-confirmations')) {
      const segment = JSON.parse(options.body).segment;
      const expectedRole = segment === 'pickup' ? 'renter' : 'owner';
      if (role !== expectedRole || photoCounts[segment] !== 4) {
        return response(409, { error: 'condition_evidence_incomplete' });
      }
      conditionConfirmed[segment] = true;
      return response(201, { confirmation: { decision: 'confirmed' } });
    }
    if (path.endsWith('/confirmation-challenges')) {
      const segment = JSON.parse(options.body).segment;
      const expectedRole = segment === 'pickup' ? 'owner' : 'renter';
      if (role !== expectedRole || !conditionConfirmed[segment]) {
        return response(409, { error: 'condition_confirmation_required' });
      }
      return response(201, { challenge: {
        qrPayload: `shareittoo:v3:${segment}:${expectedRole}:00000000-0000-4000-8000-000000000000:123456:${bookingId}`,
      } });
    }
    if (path.endsWith('/confirmation-challenges/verify')) {
      const { qrPayload } = JSON.parse(options.body);
      const match = /^shareittoo:v3:(pickup|return):(owner|renter):/u.exec(qrPayload);
      const segment = match?.[1];
      const presenterRole = match?.[2];
      const verifierRole = presenterRole === 'owner' ? 'renter' : 'owner';
      if (!segment || role !== verifierRole || !conditionConfirmed[segment]
          || currentFailQrSegment === segment) {
        if (segment && currentFailQrSegment === segment) {
          return response(200, { confirmation: {
            verificationVersion: 2,
            presenterRole,
            confirmedByRole: verifierRole,
          } });
        }
        return response(400, { error: 'confirmation_challenge_invalid' });
      }
      qrVerified[segment] = true;
      return response(200, { confirmation: {
        verificationVersion: 3,
        presenterRole,
        confirmedByRole: verifierRole,
      } });
    }
    if (path.endsWith('/reviews')) {
      return response(409, { error: 'pilot_simulation_review_forbidden' });
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

  return {
    calls,
    fetchImpl,
    listingId,
    bookingId,
    get loginCount() { return loginCount; },
    get logoutCount() { return logoutCount; },
    get uploadCount() { return uploadCount; },
    get workflowStatus() { return workflowStatus; },
    setFailQrSegment(segment) { currentFailQrSegment = segment; },
    get photoCounts() { return { ...photoCounts }; },
    get qrVerified() { return { ...qrVerified }; },
  };
}

test('runs requested to completed with eight photos, two QR verifications and zero binding effects', async () => {
  const vaultFile = testVault();
  const harness = simulationHarness();

  const result = await runStagingNonBindingSimulation({
    vaultFile,
    fetchImpl: harness.fetchImpl,
    now: new Date('2026-09-02T15:30:00.000Z'),
    random: () => Buffer.from([1, 2, 3, 4]),
    wait: async () => {},
  });
  assert.equal(result.status, 'passed-staging-non-binding-full-lifecycle');
  assert.deepEqual(result.workflow, ['requested', 'accepted', 'active', 'completed']);
  assert.equal(result.chatReady, true);
  assert.equal(result.availabilityUnaffected, true);
  assert.equal(result.pickupPhotos, 4);
  assert.equal(result.returnPhotos, 4);
  assert.equal(result.pickupQrVerified, true);
  assert.equal(result.returnQrVerified, true);
  assert.equal(result.reviewsBlocked, true);
  assert.equal(result.paymentMode, 'memory');
  assert.equal(result.paymentEndpointCalled, false);
  assert.equal(result.stripeLivemode, false);
  assert.equal(result.contractCreated, false);
  assert.equal(result.reservationCreated, false);
  assert.equal(result.monetaryEffectMinor, 0);
  assert.equal(result.containsSecrets, false);
  assert.equal(result.containsEmailAddresses, false);
  assert.equal(result.containsTokens, false);
  const stored = JSON.parse(readFileSync(vaultFile, 'utf8'));
  assert.equal(stored.nonBindingSimulation.status, 'full-lifecycle-completed');
  assert.equal(stored.nonBindingSimulation.workflowStatus, 'completed');
  assert.equal(stored.nonBindingSimulation.pickupPhotoCount, 4);
  assert.equal(stored.nonBindingSimulation.returnPhotoCount, 4);
  assert.equal(stored.nonBindingSimulation.pickupQrVerified, true);
  assert.equal(stored.nonBindingSimulation.returnQrVerified, true);
  assert.equal(stored.nonBindingSimulation.paymentEndpointCalled, false);
  assert.equal(stored.nonBindingSimulation.stripeLivemode, false);
  assert.equal(stored.nonBindingSimulation.contractCreated, false);
  assert.equal(stored.nonBindingSimulation.paymentCreated, false);
  assert.equal(stored.nonBindingSimulation.reservationCreated, false);
  assert.equal(stored.nonBindingSimulation.monetaryEffectMinor, 0);
  const availability = harness.calls.find((entry) => entry.path.endsWith('/availability/check'));
  assert.equal(availability?.authorization, 'Bearer renter-token-for-staging-gate');
  const bookingCreation = harness.calls.find((entry) => entry.path === '/bookings');
  assert.equal(JSON.parse(bookingCreation.body).simulationOnly, true);
  assert.equal(JSON.parse(bookingCreation.body).simulationAcknowledged, true);
  assert.deepEqual(
    harness.calls.filter((entry) => entry.path.endsWith('/transitions'))
      .map((entry) => JSON.parse(entry.body).status),
    ['accepted', 'active', 'completed'],
  );
  assert.equal(harness.uploadCount, 8);
  assert.deepEqual(harness.photoCounts, { pickup: 4, return: 4 });
  assert.equal(harness.calls.filter((entry) => entry.path.endsWith('/confirmation-challenges')).length, 2);
  assert.equal(harness.calls.filter((entry) => entry.path.endsWith('/confirmation-challenges/verify')).length, 2);
  assert.equal(harness.calls.filter((entry) => entry.path.endsWith('/reviews')).length, 1);
  assert.equal(harness.calls.some((entry) => /payment|stripe/u.test(entry.path)), false);
  assert.equal(harness.logoutCount, harness.loginCount);
  assert.deepEqual(harness.qrVerified, { pickup: true, return: true });
  const expectedSlots = ['overview', 'detail', 'accessories', 'critical'];
  assert.deepEqual(
    harness.calls.filter((entry) => entry.path === '/uploads')
      .map((entry) => [entry.role, entry.body.purpose, entry.body.filename]),
    [
      ...expectedSlots.map((slot) => ['owner', 'handover_evidence', `sit-pickup-${slot}.png`]),
      ...expectedSlots.map((slot) => ['renter', 'return_evidence', `sit-return-${slot}.png`]),
    ],
  );
  assert.deepEqual(
    harness.calls.filter((entry) => entry.method === 'POST' && entry.path.endsWith('/messages')
      && typeof JSON.parse(entry.body).conditionEvidence === 'object')
      .map((entry) => {
        const evidence = JSON.parse(entry.body).conditionEvidence;
        return [entry.role, evidence.segment, evidence.semanticSlot];
      }),
    [
      ...expectedSlots.map((slot) => ['owner', 'pickup', slot]),
      ...expectedSlots.map((slot) => ['renter', 'return', slot]),
    ],
  );
  assert.deepEqual(
    harness.calls.filter((entry) => entry.path.endsWith('/condition-confirmations'))
      .map((entry) => [entry.role, JSON.parse(entry.body).segment]),
    [['renter', 'pickup'], ['owner', 'return']],
  );
  assert.deepEqual(
    harness.calls.filter((entry) => entry.path.endsWith('/confirmation-challenges'))
      .map((entry) => [entry.role, JSON.parse(entry.body).segment]),
    [['owner', 'pickup'], ['renter', 'return']],
  );
  assert.deepEqual(
    harness.calls.filter((entry) => entry.path.endsWith('/confirmation-challenges/verify'))
      .map((entry) => [entry.role, JSON.parse(entry.body).qrPayload.split(':')[2]]),
    [['renter', 'pickup'], ['owner', 'return']],
  );
  assert.deepEqual(
    harness.calls
      .filter((entry) => !['/auth/login', '/auth/logout'].includes(entry.path))
      .filter((entry) => entry.path.endsWith('/transitions'))
      .map((entry) => [entry.role, JSON.parse(entry.body).status]),
    [['owner', 'accepted'], ['renter', 'active'], ['owner', 'completed']],
  );
  const retired = await retireStagingNonBindingSimulation({
    vaultFile,
    fetchImpl: harness.fetchImpl,
    now: new Date('2026-09-03T15:30:00.000Z'),
  });
  assert.equal(retired.bookingCancelled, false);
  assert.equal(retired.bookingCompleted, true);
  assert.equal(retired.publicCatalogEntryRemoved, true);
  assert.equal(retired.monetaryEffectMinor, 0);
  assert.equal(harness.workflowStatus, 'completed');
  assert.equal(harness.logoutCount, harness.loginCount);
  const retiredVault = JSON.parse(readFileSync(vaultFile, 'utf8'));
  assert.equal(retiredVault.nonBindingSimulation.status, 'retired');
  assert.equal(retiredVault.nonBindingSimulation.workflowStatus, 'completed');
});

test('fails closed before activating when pickup evidence readback is incomplete and revokes sessions', async () => {
  const vaultFile = testVault();
  const harness = simulationHarness({ failEvidenceSegment: 'pickup' });
  await assert.rejects(
    () => runStagingNonBindingSimulation({
      vaultFile,
      fetchImpl: harness.fetchImpl,
      now: new Date('2026-09-02T15:30:00.000Z'),
      random: () => Buffer.from([1, 2, 3, 4]),
      wait: async () => {},
    }),
    /pickup condition evidence is incomplete/u,
  );
  const transitions = harness.calls.filter((entry) => entry.path.endsWith('/transitions'));
  assert.deepEqual(transitions.map((entry) => JSON.parse(entry.body).status), ['accepted']);
  assert.equal(harness.logoutCount, harness.loginCount);
  const stored = JSON.parse(readFileSync(vaultFile, 'utf8'));
  assert.equal(stored.nonBindingSimulation.status, 'pickup-evidence-recorded');
  assert.equal(stored.nonBindingSimulation.workflowStatus, 'accepted');
});

test('resumes after active and completes once return QR verification is available', async () => {
  const vaultFile = testVault();
  const harness = simulationHarness({ failQrSegment: 'return' });
  await assert.rejects(
    () => runStagingNonBindingSimulation({
      vaultFile,
      fetchImpl: harness.fetchImpl,
      now: new Date('2026-09-02T15:30:00.000Z'),
      random: () => Buffer.from([1, 2, 3, 4]),
      wait: async () => {},
    }),
    /return confirmation was not verified safely/u,
  );
  const transitions = harness.calls.filter((entry) => entry.path.endsWith('/transitions'));
  assert.deepEqual(transitions.map((entry) => JSON.parse(entry.body).status), ['accepted', 'active']);
  assert.equal(harness.logoutCount, harness.loginCount);
  const stored = JSON.parse(readFileSync(vaultFile, 'utf8'));
  assert.equal(stored.nonBindingSimulation.status, 'return-condition-confirmed');
  assert.equal(stored.nonBindingSimulation.workflowStatus, 'active');
  assert.equal(harness.workflowStatus, 'active');
  harness.setFailQrSegment(null);
  const resumed = await runStagingNonBindingSimulation({
    vaultFile,
    fetchImpl: harness.fetchImpl,
    now: new Date('2026-09-02T16:30:00.000Z'),
    random: () => Buffer.from([9, 9, 9, 9]),
    wait: async () => {},
  });
  assert.equal(resumed.status, 'passed-staging-non-binding-full-lifecycle');
  assert.equal(harness.uploadCount, 8);
  assert.deepEqual(harness.photoCounts, { pickup: 4, return: 4 });
  assert.deepEqual(
    harness.calls.filter((entry) => entry.path.endsWith('/transitions'))
      .map((entry) => JSON.parse(entry.body).status),
    ['accepted', 'active', 'completed'],
  );
  assert.equal(harness.logoutCount, harness.loginCount);
});

test('resumes after pickup QR failure without repeating accepted transition or evidence', async () => {
  const vaultFile = testVault();
  const harness = simulationHarness({ failQrSegment: 'pickup' });
  await assert.rejects(
    () => runStagingNonBindingSimulation({
      vaultFile,
      fetchImpl: harness.fetchImpl,
      now: new Date('2026-09-02T15:30:00.000Z'),
      random: () => Buffer.from([1, 2, 3, 4]),
      wait: async () => {},
    }),
    /pickup confirmation was not verified safely/u,
  );
  const stored = JSON.parse(readFileSync(vaultFile, 'utf8'));
  assert.equal(stored.nonBindingSimulation.status, 'pickup-condition-confirmed');
  harness.setFailQrSegment(null);
  const resumed = await runStagingNonBindingSimulation({
    vaultFile,
    fetchImpl: harness.fetchImpl,
    now: new Date('2026-09-02T16:30:00.000Z'),
    random: () => Buffer.from([9, 9, 9, 9]),
    wait: async () => {},
  });
  assert.equal(resumed.status, 'passed-staging-non-binding-full-lifecycle');
  assert.equal(harness.uploadCount, 8);
  assert.deepEqual(harness.photoCounts, { pickup: 4, return: 4 });
  assert.deepEqual(
    harness.calls.filter((entry) => entry.path.endsWith('/transitions'))
      .map((entry) => JSON.parse(entry.body).status),
    ['accepted', 'active', 'completed'],
  );
  assert.equal(harness.logoutCount, harness.loginCount);
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
    const sessionCleanupPath = new URL(url).pathname.replace('/api/v1', '');
    if (sessionCleanupPath === '/auth/logout') return response(204, null);
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
    const sessionCleanupPath = new URL(url).pathname.replace('/api/v1', '');
    if (sessionCleanupPath === '/auth/logout') return response(204, null);
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
