import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  acceptanceTimestampForQuote,
  archiveCompletedSyntheticBookingFixture,
  archiveTerminalSyntheticBookingFixture,
  createSyntheticBookingFixture,
  inspectSyntheticReturnCaseRoleTruth,
  prepareSyntheticBookingThread,
  reconcileSyntheticBookingFixture,
  retireSyntheticBookingFixture,
  runSyntheticRoleBookingLifecycle,
  sendSyntheticBookingDiagnosticMessage,
  transitionSyntheticBookingFixture,
} from '../../tool/run_staging_synthetic_booking.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

function createEphemeralFixturePassword() {
  return `Aa9!${crypto.randomBytes(24).toString('base64url')}`;
}

function vaultFixture({ baseUrl = 'https://staging.shareittoo.com/api/v1' } = {}) {
  const root = tempFixtures.makeSync('sit-synthetic-booking-');
  chmodSync(root, 0o700);
  const vaultFile = resolve(root, 'accounts.json');
  const imagePath = resolve(root, 'fixture.png');
  writeFileSync(imagePath, Buffer.alloc(512, 7));
  writeFileSync(vaultFile, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    runId: '20260810t065907z-a6b6f407',
    status: 'fixture-verified-ready-for-login',
    apiBaseUrl: baseUrl,
    stripeLivemode: false,
    accounts: [
      { role: 'owner', email: 'owner@example.invalid', password: createEphemeralFixturePassword() },
      { role: 'renter', email: 'renter@example.invalid', password: createEphemeralFixturePassword() },
    ],
  }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(vaultFile, 0o600);
  return { vaultFile, imagePath };
}

function response(status, value) {
  return new Response(value === null ? '' : JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function boundQuote() {
  return {
    quoteId: 'quote-1',
    quoteHash: 'a'.repeat(64),
    quotedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:10:00.000Z',
  };
}

function bookingConfirmationResponse(path, options = {}) {
  if (path.endsWith('/confirmation-challenges')) {
    const segment = JSON.parse(options.body).segment;
    const presenterRole = segment === 'pickup' ? 'owner' : 'renter';
    return response(201, {
      challenge: {
        qrPayload: `shareittoo:v3:${segment}:${presenterRole}:00000000-0000-0000-0000-000000000000:123456:private-booking-id`,
      },
    });
  }
  if (path.endsWith('/confirmation-challenges/verify')) {
    const [, , segment, presenterRole] = JSON.parse(options.body).qrPayload.split(':');
    return response(200, {
      confirmation: {
        verificationVersion: 3,
        presenterRole,
        confirmedByRole: presenterRole === 'owner' ? 'renter' : 'owner',
        segment,
      },
    });
  }
  return null;
}

function createFetch(log) {
  let login = 0;
  return async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/api/v1', '');
    log.push({
      path,
      method: options.method ?? 'GET',
      body: typeof options.body === 'string' ? JSON.parse(options.body) : null,
    });
    if (path === '/auth/login') {
      login += 1;
      return response(200, { accessToken: `synthetic-token-${login}-${'x'.repeat(30)}` });
    }
    if (path === '/listings/mine') return response(200, { listings: [] });
    if (path === '/rental-requests') return response(200, { requests: [] });
    if (path === '/uploads') return response(201, { url: 'https://staging.shareittoo.com/api/v1/uploads/fixture.webp' });
    if (path === '/listings') return response(201, { listing: { id: 'fixture' } });
    if (path.endsWith('/availability')) return response(200, { availability: {} });
    if (path === '/bookings/quote') {
      return response(200, boundQuote());
    }
    if (path === '/bookings') return response(201, { booking: { workflowStatus: 'requested' } });
    throw new Error(`Unexpected path ${path}`);
  };
}

test('creates an isolated requested booking and returns no credentials or identifiers', async () => {
  const fixture = vaultFixture();
  const calls = [];
  const result = await createSyntheticBookingFixture({
    ...fixture,
    fetchImpl: createFetch(calls),
    now: new Date('2026-08-10T08:00:00.000Z'),
    random: () => Buffer.from('a1b2c3d4', 'hex'),
  });
  assert.deepEqual(result, {
    status: 'synthetic-booking-requested',
    rolesLoggedIn: ['owner', 'renter'],
    listingCreated: true,
    bookingCreated: true,
    fixtureRecovered: false,
    workflowStatus: 'requested',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
  });
  assert.equal(calls.some(({ path }) => path.includes('payment')), false);
  const listingCall = calls.find(({ path }) => path === '/listings');
  assert.equal(listingCall.body.categoryId, 'cat3');
  assert.equal(listingCall.body.subcategory, 'Kameras');
  assert.equal(listingCall.body.city, 'Heilbronn');
  assert.equal(listingCall.body.country, 'Deutschland');
  assert.equal(listingCall.body.privateStatusConfirmed, true);
  const bookingCall = calls.find(({ path }) => path === '/bookings');
  assert.equal(bookingCall.body.privateStatusConfirmed, true);
  assert.equal(bookingCall.body.legalDeclarations.length, 2);
  assert.deepEqual(
    bookingCall.body.legalDeclarations.map(({ type }) => type),
    [
      'private_terms_and_platform_terms',
      'early_performance_and_withdrawal',
    ],
  );
  assert.equal(
    bookingCall.body.legalDeclarations.every((entry) => (
      entry.accepted === true
      && entry.documentName === 'ShareItToo Rechtsmappe Privat-Launch V5.2'
      && entry.documentVersion === 'V5.2-2026-08-16'
      && entry.language === 'de'
      && entry.clientBuild === 'synthetic-review-tool-v52'
      && entry.quoteId === 'quote-1'
      && entry.quoteHash === 'a'.repeat(64)
      && Array.isArray(entry.documentReferences)
    )),
    true,
  );
  const stored = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  assert.equal(stored.syntheticBooking.workflowStatus, 'requested');
});

test('clamps V5.2 acceptance to a slightly newer authoritative quote timestamp', () => {
  assert.equal(
    acceptanceTimestampForQuote({
      quotedAt: '2026-09-05T06:40:00.004Z',
      expiresAt: '2026-09-05T06:50:00.004Z',
    }, new Date('2026-09-05T06:40:00.000Z')),
    '2026-09-05T06:40:00.004Z',
  );
});

test('transitions the synthetic booking with the correct roles and no payment endpoint', async () => {
  const fixture = vaultFixture();
  await createSyntheticBookingFixture({
    ...fixture,
    fetchImpl: createFetch([]),
    random: () => Buffer.from('a1b2c3d4', 'hex'),
  });
  const calls = [];
  for (const [status, actingRole, workflowStatus] of [
    ['accepted', 'owner', 'accepted'],
    ['running', 'renter', 'active'],
    ['completed', 'owner', 'completed'],
  ]) {
    const fetchImpl = async (url, options = {}) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      calls.push(path);
      if (path === '/auth/login') return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
      const confirmation = bookingConfirmationResponse(path, options);
      if (confirmation !== null) return confirmation;
      if (path.endsWith('/transitions')) return response(200, { booking: { workflowStatus } });
      throw new Error(`Unexpected path ${path}`);
    };
    const result = await transitionSyntheticBookingFixture({ ...fixture, status, fetchImpl });
    assert.equal(result.actingRole, actingRole);
    assert.equal(result.paymentEndpointCalled, false);
  }
  assert.equal(calls.some((path) => path.includes('payment')), false);
  assert.equal(JSON.parse(readFileSync(fixture.vaultFile, 'utf8')).status, 'synthetic-booking-completed');
});

test('retires a temporary fixture by completing its booking and pausing, never deleting, its listing', async () => {
  const fixture = vaultFixture();
  const vault = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  vault.status = 'synthetic-booking-active';
  vault.syntheticBooking = {
    schemaVersion: 1,
    listingId: 'private-listing-id',
    bookingId: 'private-booking-id',
    workflowStatus: 'requested',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  };
  writeFileSync(fixture.vaultFile, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(fixture.vaultFile, 0o600);

  const operations = [];
  const result = await retireSyntheticBookingFixture({
    vaultFile: fixture.vaultFile,
    now: new Date('2026-08-12T12:30:00.000Z'),
    fetchImpl: async (url, options = {}) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      if (path === '/auth/login') {
        return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
      }
      operations.push({ path, method: options.method, body: JSON.parse(options.body) });
      const confirmation = bookingConfirmationResponse(path, options);
      if (confirmation !== null) return confirmation;
      if (path.endsWith('/transitions')) {
        const requested = operations.at(-1).body.status;
        return response(200, {
          booking: { workflowStatus: { accepted: 'accepted', running: 'active', completed: 'completed' }[requested] },
        });
      }
      if (path.endsWith('/status')) return response(200, { listing: { status: 'paused' } });
      throw new Error(`Unexpected path ${path}`);
    },
  });

  assert.deepEqual(operations.map(({ method, body }) => [method, body]), [
    ['POST', {
      status: 'accepted',
      legalDeclarations: [{
        type: 'owner_booking_acceptance',
        exactWording: 'Ich nehme die zahlungspflichtige Buchungsanfrage zu den angezeigten Bedingungen und Dokumentversionen an.',
        documentName: 'ShareItToo Rechtsmappe Privat-Launch',
        documentVersion: 'V5.1-2026-08-16',
        appVersion: 'synthetic-review-tool',
        language: 'de',
        accepted: true,
        acceptedAt: '2026-08-12T12:30:00.000Z',
      }],
    }],
    ['POST', { segment: 'pickup' }],
    ['POST', {
      qrPayload: 'shareittoo:v3:pickup:owner:00000000-0000-0000-0000-000000000000:123456:private-booking-id',
    }],
    ['POST', { status: 'running' }],
    ['POST', { segment: 'return' }],
    ['POST', {
      qrPayload: 'shareittoo:v3:return:renter:00000000-0000-0000-0000-000000000000:123456:private-booking-id',
    }],
    ['POST', { status: 'completed' }],
    ['PATCH', { status: 'paused' }],
  ]);
  assert.equal(result.bookingCompleted, true);
  assert.equal(result.listingPaused, true);
  assert.equal(result.listingDeleted, false);
  assert.equal(result.paymentEndpointCalled, false);
  const stored = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  assert.equal(stored.syntheticBooking.workflowStatus, 'completed');
  assert.equal(stored.syntheticBooking.listingStatus, 'paused');
});

test('runs the complete role-visible lifecycle without returning private fixture data', async () => {
  const fixture = vaultFixture();
  const calls = [];
  let workflowStatus = null;
  let login = 0;
  const result = await runSyntheticRoleBookingLifecycle({
    ...fixture,
    now: new Date('2026-08-11T19:20:00.000Z'),
    random: () => Buffer.from('a1b2c3d4', 'hex'),
    fetchImpl: async (url, options = {}) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      calls.push({ path, method: options.method ?? 'GET' });
      if (path === '/auth/login') {
        login += 1;
        return response(200, { accessToken: `synthetic-token-${login}-${'x'.repeat(30)}` });
      }
      const confirmation = bookingConfirmationResponse(path, options);
      if (confirmation !== null) return confirmation;
      if (path === '/listings/mine') return response(200, { listings: [] });
      if (path === '/rental-requests') {
        if (workflowStatus === null) return response(200, { requests: [] });
        return response(200, { requests: [{ id: 'sit-20260810t065907z-a6b6f407-a1b2c3d4-booking', workflowStatus }] });
      }
      if (path === '/uploads') return response(201, { url: 'https://staging.shareittoo.com/api/v1/uploads/fixture.webp' });
      if (path === '/listings') return response(201, { listing: { id: 'fixture' } });
      if (path.endsWith('/availability')) return response(200, { availability: {} });
      if (path === '/bookings/quote') {
        return response(200, boundQuote());
      }
      if (path === '/bookings') {
        workflowStatus = 'requested';
        return response(201, { booking: { workflowStatus } });
      }
      if (path.endsWith('/transitions')) {
        const requested = JSON.parse(options.body).status;
        workflowStatus = { accepted: 'accepted', running: 'active', completed: 'completed' }[requested];
        return response(200, { booking: { workflowStatus } });
      }
      throw new Error(`Unexpected path ${path}`);
    },
  });
  assert.equal(result.status, 'passed-bounded-synthetic-role-booking-lifecycle');
  assert.deepEqual(result.workflow, ['requested', 'accepted', 'active', 'completed']);
  assert.equal(result.tests.ownerRequestVisibility.result, 'requested-visible-to-owner');
  assert.equal(result.tests.renterUpcomingVisibility.result, 'accepted-visible-to-renter');
  assert.equal(result.tests.renterRunningVisibility.result, 'active-visible-to-renter');
  assert.equal(result.tests.renterCompletedVisibility.result, 'completed-visible-to-renter');
  assert.equal(result.confirmations.pickup.presenterRole, 'owner');
  assert.equal(result.confirmations.pickup.verifierRole, 'renter');
  assert.equal(result.confirmations.return.presenterRole, 'renter');
  assert.equal(result.confirmations.return.verifierRole, 'owner');
  assert.equal(result.paymentEndpointCalled, false);
  assert.equal(result.containsSecrets, false);
  assert.equal(result.containsFixtureIdentifiers, false);
  assert.equal(calls.some(({ path }) => path.includes('payment')), false);
});

test('requires equal owner and renter truth for one server-confirmed return case', async () => {
  const fixture = vaultFixture();
  const vault = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  vault.status = 'synthetic-booking-completed';
  vault.syntheticBooking = {
    schemaVersion: 1,
    listingId: 'private-listing-id',
    bookingId: 'private-booking-id',
    workflowStatus: 'completed',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  };
  writeFileSync(fixture.vaultFile, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(fixture.vaultFile, 0o600);
  const truth = {
    id: 'private-booking-id',
    workflowStatus: 'completed',
    needsReview: true,
    reviewSource: 'v52_return_case',
    reviewEvidenceReferences: ['upload:00000000-0000-4000-8000-000000000001'],
    returnState: 'needsReview',
    returnT0: '2026-09-06T10:00:00.000Z',
    returnCaseOpenedAt: '2026-09-06T10:05:00.000Z',
    returnReportDeadline: '2026-09-08T10:00:00.000Z',
    contestedAuthorizedMinor: 100,
    undisputedReleasableMinor: 3900,
    additionalChargeMinor: 0,
  };
  const result = await inspectSyntheticReturnCaseRoleTruth({
    vaultFile: fixture.vaultFile,
    fetchImpl: async (url) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      if (path === '/auth/login') {
        return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
      }
      if (path === '/rental-requests') return response(200, { requests: [truth] });
      throw new Error(`Unexpected path ${path}`);
    },
  });

  assert.equal(result.status, 'synthetic-return-case-role-truth-passed');
  assert.equal(result.participantProjections, 2);
  assert.equal(result.needsReview, true);
  assert.equal(result.additionalChargeMinor, 0);
  assert.equal(JSON.stringify(result).includes('private-booking-id'), false);
});

test('fails closed when participant return-case projections disagree', async () => {
  const fixture = vaultFixture();
  const vault = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  vault.status = 'synthetic-booking-completed';
  vault.syntheticBooking = {
    schemaVersion: 1,
    listingId: 'private-listing-id',
    bookingId: 'private-booking-id',
    workflowStatus: 'completed',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  };
  writeFileSync(fixture.vaultFile, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 });
  let reads = 0;
  await assert.rejects(
    inspectSyntheticReturnCaseRoleTruth({
      vaultFile: fixture.vaultFile,
      fetchImpl: async (url) => {
        const path = new URL(url).pathname.replace('/api/v1', '');
        if (path === '/auth/login') {
          return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
        }
        if (path === '/rental-requests') {
          reads += 1;
          return response(200, { requests: [{
            id: 'private-booking-id',
            workflowStatus: 'completed',
            needsReview: reads === 1,
          }] });
        }
        throw new Error(`Unexpected path ${path}`);
      },
    }),
    /do not agree on server-owned truth/,
  );
});

test('recovers one already-created requested fixture without creating a duplicate', async () => {
  const fixture = vaultFixture();
  const calls = [];
  let login = 0;
  const result = await createSyntheticBookingFixture({
    ...fixture,
    now: new Date('2026-08-10T08:00:00.000Z'),
    fetchImpl: async (url) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      calls.push(path);
      if (path === '/auth/login') {
        login += 1;
        return response(200, { accessToken: `synthetic-token-${login}-${'x'.repeat(30)}` });
      }
      if (path === '/listings/mine') {
        return response(200, { listings: [{
          id: 'existing-listing',
          title: 'SIT Rollenprüfung 20260810t065907z-a6b6f407',
        }] });
      }
      if (path === '/rental-requests') {
        return response(200, { requests: [{
          id: 'existing-booking',
          itemId: 'existing-listing',
          workflowStatus: 'requested',
          startDate: '2026-10-09',
          endDate: '2026-10-11',
        }] });
      }
      throw new Error(`Unexpected path ${path}`);
    },
  });
  assert.equal(result.fixtureRecovered, true);
  assert.equal(result.workflowStatus, 'requested');
  assert.equal(calls.includes('/uploads'), false);
  assert.equal(calls.includes('/listings'), false);
  assert.equal(calls.includes('/bookings'), false);
});

test('reuses one prepared listing after a failed booking request', async () => {
  const fixture = vaultFixture();
  const calls = [];
  let login = 0;
  const existingListingId = 'sit-20260810t065907z-a6b6f407-a1b2c3d4-listing';
  const result = await createSyntheticBookingFixture({
    ...fixture,
    now: new Date('2026-08-10T08:00:00.000Z'),
    random: () => Buffer.from('d4c3b2a1', 'hex'),
    fetchImpl: async (url, options = {}) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      calls.push({ path, body: typeof options.body === 'string' ? JSON.parse(options.body) : null });
      if (path === '/auth/login') {
        login += 1;
        return response(200, { accessToken: `synthetic-token-${login}-${'x'.repeat(30)}` });
      }
      if (path === '/listings/mine') {
        return response(200, { listings: [{
          id: existingListingId,
          title: 'SIT Rollenprüfung 20260810t065907z-a6b6f407',
        }] });
      }
      if (path === '/rental-requests') return response(200, { requests: [] });
      if (path === '/bookings/quote') {
        return response(200, boundQuote());
      }
      if (path === '/bookings') {
        return response(201, { booking: { workflowStatus: 'requested' } });
      }
      throw new Error(`Unexpected path ${path}`);
    },
  });
  assert.equal(result.fixtureRecovered, true);
  assert.equal(result.bookingCreated, true);
  assert.equal(calls.some(({ path }) => path === '/uploads'), false);
  assert.equal(calls.some(({ path }) => path === '/listings'), false);
  assert.equal(calls.some(({ path }) => path.endsWith('/availability')), false);
  assert.equal(
    calls.find(({ path }) => path === '/bookings').body.id,
    'sit-20260810t065907z-a6b6f407-d4c3b2a1-booking',
  );
});

test('does not reuse a previously paused listing with the same synthetic run title', async () => {
  const fixture = vaultFixture();
  const calls = [];
  let login = 0;
  const result = await createSyntheticBookingFixture({
    ...fixture,
    now: new Date('2026-08-10T08:00:00.000Z'),
    random: () => Buffer.from('d4c3b2a1', 'hex'),
    fetchImpl: async (url, options = {}) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      calls.push({ path, body: typeof options.body === 'string' ? JSON.parse(options.body) : null });
      if (path === '/auth/login') {
        login += 1;
        return response(200, { accessToken: `synthetic-token-${login}-${'x'.repeat(30)}` });
      }
      if (path === '/listings/mine') {
        return response(200, { listings: [{
          id: 'paused-listing',
          title: 'SIT Rollenprüfung 20260810t065907z-a6b6f407',
          status: 'paused',
          isActive: false,
        }] });
      }
      if (path === '/rental-requests') return response(200, { requests: [] });
      if (path === '/uploads') {
        return response(201, { url: 'https://staging.shareittoo.com/api/v1/uploads/fixture.webp' });
      }
      if (path === '/listings') return response(201, { listing: { id: 'fixture' } });
      if (path.endsWith('/availability')) return response(200, { availability: {} });
      if (path === '/bookings/quote') {
        return response(200, boundQuote());
      }
      if (path === '/bookings') {
        return response(201, { booking: { workflowStatus: 'requested' } });
      }
      throw new Error(`Unexpected path ${path}`);
    },
  });
  assert.equal(result.fixtureRecovered, false);
  assert.equal(calls.some(({ path }) => path === '/uploads'), true);
  assert.equal(calls.some(({ path }) => path === '/listings'), true);
  assert.equal(
    calls.find(({ path }) => path === '/bookings').body.itemId,
    'sit-20260810t065907z-a6b6f407-d4c3b2a1-listing',
  );
});

test('retires the exact new listing after the V5.2 legal hold rejects booking creation', async () => {
  const fixture = vaultFixture();
  let login = 0;
  let listingCreated = false;
  let createdListingId = null;
  let pauseCount = 0;
  await assert.rejects(
    () => createSyntheticBookingFixture({
      ...fixture,
      now: new Date('2026-08-10T08:00:00.000Z'),
      fetchImpl: async (url, options = {}) => {
        const path = new URL(url).pathname.replace('/api/v1', '');
        if (path === '/auth/login') {
          login += 1;
          return response(200, { accessToken: `synthetic-token-${login}-${'x'.repeat(30)}` });
        }
        if (path === '/listings/mine') {
          return response(200, {
            listings: listingCreated && pauseCount === 0
              ? [{ id: createdListingId, status: 'active', isActive: true }]
              : [],
          });
        }
        if (path === '/rental-requests') return response(200, { requests: [] });
        if (path === '/uploads') return response(201, { url: 'https://staging.shareittoo.com/api/v1/uploads/fixture.webp' });
        if (path === '/listings') {
          listingCreated = true;
          createdListingId = JSON.parse(options.body).id;
          return response(201, { listing: { id: 'fixture' } });
        }
        if (path.endsWith('/availability')) return response(200, { availability: {} });
        if (path.endsWith('/status')) {
          pauseCount += 1;
          return response(200, { listing: { status: 'paused', isActive: false } });
        }
        if (path === '/bookings/quote') {
          return response(200, boundQuote());
        }
        if (path === '/bookings') {
          return response(409, {
            error: 'v52_contract_documents_unavailable',
            requestId: 'safe-request-123',
            details: 'must never be surfaced',
          });
        }
        throw new Error(`Unexpected path ${path} ${options.method ?? 'GET'}`);
      },
    }),
    (error) => {
      assert.match(error.message, /HTTP 409 \(v52_contract_documents_unavailable\) \[request safe-request-123\]/);
      assert.doesNotMatch(error.message, /must never be surfaced/);
      return true;
    },
  );
  assert.equal(listingCreated, true);
  assert.equal(pauseCount, 1);
  assert.equal(
    JSON.parse(readFileSync(fixture.vaultFile, 'utf8')).syntheticBooking,
    undefined,
  );
});

test('archives only a completed payment-free fixture without returning private identifiers', async () => {
  const fixture = vaultFixture();
  await createSyntheticBookingFixture({
    ...fixture,
    fetchImpl: createFetch([]),
    random: () => Buffer.from('a1b2c3d4', 'hex'),
  });
  for (const [status, workflowStatus] of [
    ['accepted', 'accepted'],
    ['running', 'active'],
    ['completed', 'completed'],
  ]) {
    await transitionSyntheticBookingFixture({
      ...fixture,
      status,
      fetchImpl: async (url, options = {}) => {
        const path = new URL(url).pathname.replace('/api/v1', '');
        if (path === '/auth/login') return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
        const confirmation = bookingConfirmationResponse(path, options);
        if (confirmation !== null) return confirmation;
        if (path.endsWith('/transitions')) return response(200, { booking: { workflowStatus } });
        throw new Error(`Unexpected path ${path}`);
      },
    });
  }
  const result = archiveCompletedSyntheticBookingFixture({
    vaultFile: fixture.vaultFile,
    nextRunId: 'next-private-run',
    now: new Date('2026-08-10T17:40:00.000Z'),
  });
  assert.deepEqual(result, {
    status: 'synthetic-booking-archived',
    historyCount: 1,
    readyForNextFixture: true,
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
  const stored = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  assert.equal(stored.syntheticBooking, undefined);
  assert.equal(stored.syntheticBookingHistory.length, 1);
  assert.equal(stored.syntheticBookingHistory[0].workflowStatus, 'completed');
  assert.equal(stored.runId, 'next-private-run');
  assert.equal(stored.status, 'fixture-verified-ready-for-login');
});

test('refuses to archive an active fixture', async () => {
  const fixture = vaultFixture();
  await createSyntheticBookingFixture({
    ...fixture,
    fetchImpl: createFetch([]),
    random: () => Buffer.from('a1b2c3d4', 'hex'),
  });
  assert.throws(
    () => archiveCompletedSyntheticBookingFixture({
      vaultFile: fixture.vaultFile,
      nextRunId: 'next-private-run',
    }),
    /Only a completed, payment-free Staging fixture can be archived/,
  );
});

test('reconciles and archives a server-cancelled payment-free fixture', async () => {
  const fixture = vaultFixture();
  await createSyntheticBookingFixture({
    ...fixture,
    fetchImpl: createFetch([]),
    random: () => Buffer.from('a1b2c3d4', 'hex'),
  });
  const storedBefore = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  const result = await reconcileSyntheticBookingFixture({
    ...fixture,
    now: new Date('2026-08-11T07:50:00.000Z'),
    fetchImpl: async (url) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      if (path === '/auth/login') return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
      if (path === '/rental-requests') {
        return response(200, {requests: [{
          id: storedBefore.syntheticBooking.bookingId,
          workflowStatus: 'cancelled',
        }]});
      }
      throw new Error(`Unexpected path ${path}`);
    },
  });
  assert.deepEqual(result, {
    status: 'synthetic-booking-reconciled-terminal',
    workflowStatus: 'cancelled',
    terminal: true,
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
  const reconciled = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  assert.equal(reconciled.status, 'synthetic-booking-terminal');
  assert.equal(reconciled.syntheticBooking.workflowStatus, 'cancelled');

  const archived = archiveTerminalSyntheticBookingFixture({
    vaultFile: fixture.vaultFile,
    nextRunId: 'fresh-push-run',
  });
  assert.equal(archived.readyForNextFixture, true);
  assert.equal(archived.containsFixtureIdentifiers, false);
  const ready = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  assert.equal(ready.status, 'fixture-verified-ready-for-login');
  assert.equal(ready.syntheticBooking, undefined);
  assert.equal(ready.syntheticBookingHistory.at(-1).workflowStatus, 'cancelled');
});

test('refuses terminal archive before server reconciliation', async () => {
  const fixture = vaultFixture();
  await createSyntheticBookingFixture({
    ...fixture,
    fetchImpl: createFetch([]),
    random: () => Buffer.from('a1b2c3d4', 'hex'),
  });
  assert.throws(
    () => archiveTerminalSyntheticBookingFixture({
      vaultFile: fixture.vaultFile,
      nextRunId: 'fresh-push-run',
    }),
    /Only a reconciled terminal, payment-free Staging fixture can be archived/,
  );
});

test('prepares a controlled thread and sends an identifier-free diagnostic message result', async () => {
  const fixture = vaultFixture();
  await createSyntheticBookingFixture({
    ...fixture,
    fetchImpl: createFetch([]),
    random: () => Buffer.from('a1b2c3d4', 'hex'),
  });
  await transitionSyntheticBookingFixture({
    ...fixture,
    status: 'accepted',
    fetchImpl: async (url) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      if (path === '/auth/login') return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
      if (path.endsWith('/transitions')) return response(200, { booking: { workflowStatus: 'accepted' } });
      throw new Error(`Unexpected path ${path}`);
    },
  });
  const threadResult = await prepareSyntheticBookingThread({
    ...fixture,
    fetchImpl: async (url) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      if (path === '/auth/login') return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
      if (path.includes('/message-threads/booking/')) {
        return response(201, { thread: { id: 'private-thread-id' } });
      }
      throw new Error(`Unexpected path ${path}`);
    },
  });
  assert.equal(threadResult.containsFixtureIdentifiers, false);
  assert.equal(JSON.parse(readFileSync(fixture.vaultFile, 'utf8')).syntheticBooking.threadId, 'private-thread-id');

  const messageResult = await sendSyntheticBookingDiagnosticMessage({
    ...fixture,
    diagnosticKind: 'foreground',
    diagnosticRunId: 'repeatable-test-run',
    fetchImpl: async (url) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      if (path === '/auth/login') return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
      if (path.includes('/message-threads/private-thread-id/messages')) {
        return response(201, { message: { id: 'private-message-id' } });
      }
      throw new Error(`Unexpected path ${path}`);
    },
  });
  assert.equal(messageResult.status, 'synthetic-booking-diagnostic-message-sent');
  assert.equal(messageResult.diagnosticKind, 'foreground');
  assert.equal(messageResult.containsFixtureIdentifiers, false);
  assert.equal(messageResult.paymentEndpointCalled, false);
});

test('uses a diagnostic-run-specific idempotency key so a later device probe can send again', async () => {
  const fixture = vaultFixture();
  const vault = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  vault.status = 'synthetic-booking-active';
  vault.syntheticBooking = {
    schemaVersion: 1,
    listingId: 'private-listing-id',
    bookingId: 'private-booking-id',
    threadId: 'private-thread-id',
    title: 'Private fixture title',
    workflowStatus: 'accepted',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  };
  writeFileSync(fixture.vaultFile, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(fixture.vaultFile, 0o600);

  const keys = [];
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/api/v1', '');
    if (path === '/auth/login') {
      return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
    }
    keys.push(options.headers['Idempotency-Key']);
    return response(201, { message: { id: `message-${keys.length}` } });
  };

  await sendSyntheticBookingDiagnosticMessage({
    ...fixture,
    diagnosticKind: 'background',
    diagnosticRunId: 'device-probe-one',
    fetchImpl,
  });
  await sendSyntheticBookingDiagnosticMessage({
    ...fixture,
    diagnosticKind: 'background',
    diagnosticRunId: 'device-probe-two',
    fetchImpl,
  });

  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
  assert.match(keys[0], /device-probe-one/);
  assert.match(keys[1], /device-probe-two/);
});

test('sends controlled diagnostics through a payment-free non-binding simulation thread', async () => {
  const fixture = vaultFixture();
  const vault = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  vault.status = 'non-binding-simulation-active';
  vault.nonBindingSimulation = {
    schemaVersion: 1,
    status: 'accepted-chat-ready',
    bookingId: 'private-simulation-booking',
    threadId: 'private-simulation-thread',
    paymentEndpointCalled: false,
    stripeLivemode: false,
  };
  writeFileSync(fixture.vaultFile, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(fixture.vaultFile, 0o600);
  const paths = [];
  const result = await sendSyntheticBookingDiagnosticMessage({
    ...fixture,
    diagnosticKind: 'terminated',
    diagnosticRunId: 'non-binding-fcm-run',
    fetchImpl: async (url) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      paths.push(path);
      if (path === '/auth/login') {
        return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
      }
      return response(201, { message: { id: 'private-message-id' } });
    },
  });
  assert.equal(result.status, 'synthetic-booking-diagnostic-message-sent');
  assert.equal(result.workflowStatus, 'accepted');
  assert.equal(result.paymentEndpointCalled, false);
  assert.equal(paths.includes('/message-threads/private-simulation-thread/messages'), true);
});

test('rejects a production or otherwise different API base before any request', async () => {
  const fixture = vaultFixture({ baseUrl: 'https://shareittoo.com/api/v1' });
  let called = false;
  await assert.rejects(
    createSyntheticBookingFixture({
      ...fixture,
      fetchImpl: async () => {
        called = true;
        return response(500, null);
      },
    }),
    /not an isolated, verified Staging role set/,
  );
  assert.equal(called, false);
});

test('redacts private fixture identifiers from diagnostic message transport errors', async () => {
  const fixture = vaultFixture();
  const vault = JSON.parse(readFileSync(fixture.vaultFile, 'utf8'));
  vault.status = 'synthetic-booking-active';
  vault.syntheticBooking = {
    schemaVersion: 1,
    listingId: 'private-listing-id',
    bookingId: 'private-booking-id',
    threadId: 'private-thread-id',
    title: 'Private fixture title',
    workflowStatus: 'accepted',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  };
  writeFileSync(fixture.vaultFile, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(fixture.vaultFile, 0o600);

  await assert.rejects(
    sendSyntheticBookingDiagnosticMessage({
      ...fixture,
      diagnosticKind: 'logout',
      fetchImpl: async (url) => {
        const path = new URL(url).pathname.replace('/api/v1', '');
        if (path === '/auth/login') {
          return response(200, { accessToken: `synthetic-token-${'x'.repeat(40)}` });
        }
        return response(409, { error: 'fixture-conflict' });
      },
    }),
    (error) => {
      assert.match(error.message, /Staging POST request failed with HTTP 409/);
      assert.equal(error.message.includes('private-thread-id'), false);
      assert.equal(error.message.includes('private-booking-id'), false);
      return true;
    },
  );
});
