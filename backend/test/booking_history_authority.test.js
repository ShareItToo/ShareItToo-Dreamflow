import assert from 'node:assert/strict';
import test from 'node:test';

import { listBookings } from '../src/booking_workflow.js';

// D8-P1: execute the existing projection, not a new booking/command adapter.
// This fake checks query shape and parameters, not PostgreSQL participant
// isolation, rollback, or the real hold-expiry lifecycle. G3 owner guards and
// version-0 quarantine remain covered by their existing tests, not bypassed here.
function completedBookingRow() {
  return {
    id: 'synthetic-history-booking',
    listing_id: 'synthetic-history-listing',
    owner_id: 'synthetic-history-owner',
    renter_id: 'synthetic-history-renter',
    status: 'completed',
    workflow_status: 'completed',
    workflow_version: 1,
    workflow_revision: 7,
    simulation_only: false,
    rental_start_date: '2026-08-01',
    rental_end_date: '2026-08-03',
    rental_timezone: 'Europe/Berlin',
    starts_at: new Date('2026-07-31T22:00:00.000Z'),
    ends_at: new Date('2026-08-02T22:00:00.000Z'),
    time_snapshot_version: 'booking-time-v1',
    handover_at: new Date('2026-08-01T08:00:00.000Z'),
    return_at: new Date('2026-08-03T16:00:00.000Z'),
    hold_expires_at: null,
    accepted_at: new Date('2026-07-25T12:00:00.000Z'),
    quote_version: 3,
    currency: 'EUR',
    quoted_days: 2,
    price_per_day_minor: 2000,
    base_rental_minor: 4000,
    discount_minor: 400,
    rental_subtotal_minor: 3600,
    platform_fee_minor: 360,
    delivery_fee_minor: 0,
    pickup_fee_minor: 0,
    express_fee_minor: 0,
    quoted_total_minor: 3960,
    owner_payout_minor: 3600,
    security_deposit_minor: 0,
    quote_breakdown: { discountLabel: 'Stored synthetic discount', totalMinor: 1 },
    payload: {
      id: 'stale-booking', itemId: 'stale-listing',
      ownerId: 'stale-owner', renterId: 'stale-renter',
      status: 'pending', workflowStatus: 'requested',
      workflowVersion: 0, workflowRevision: 1, simulationOnly: true,
      startDate: '2025-01-01', endDate: '2025-01-02', timezone: 'UTC',
      start: '2025-01-01T00:00:00.000Z', end: '2025-01-02T00:00:00.000Z',
      timeSnapshot: { version: 'stale' },
      holdExpiresAt: '2025-01-01T00:00:00.000Z', acceptedAt: null,
      quotedTotalRenter: 999,
      quote: { totalMinor: 99900, currency: 'USD', days: 99 },
      listingSnapshot: { title: 'Old request title', pricePerDay: 999 },
      platformContract: { id: 'synthetic-platform-contract', quoteHash: 'a'.repeat(64) },
    },
    listing_status: 'ended',
    listing_is_active: false,
    listing_catalog_revision: 12,
    listing_payload: {
      id: 'stale-listing-id', ownerId: 'stale-listing-owner',
      title: 'Current ended synthetic listing', pricePerDay: 75,
      status: 'active', isActive: true, catalogRevision: 1,
      city: 'Berlin', country: 'Deutschland',
      locationText: 'Synthetic exact pickup text',
      lat: 52.521234, lng: 13.411234, geohash: 'synthetic-exact-cell',
      photos: ['synthetic-private-photo'],
      photoTruthPolicyVersion: 'synthetic-policy',
      photoTruthAttestation: 'synthetic-attestation',
      photoTruthClassifications: ['synthetic-classification'],
      supplyEnrichment: { suggestions: [] },
    },
  };
}

function freezeTree(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

const normalizeSql = (sql) => sql.replace(/\s+/gu, ' ').trim();
const emptyHoldSweep = normalizeSql(`
  SELECT booking.id, booking.workflow_status, booking.renter_id, request.payload
  FROM bookings AS booking
  JOIN rental_requests AS request ON request.id = booking.id
  WHERE booking.workflow_version = 1
    AND booking.simulation_only = false
    AND booking.workflow_status IN ('accepted', 'payment_pending')
    AND booking.hold_expires_at IS NOT NULL
    AND booking.hold_expires_at <= now()
  FOR UPDATE OF booking, request SKIP LOCKED
`);
const participantQueryTail = normalizeSql(`
  FROM bookings AS booking
  JOIN rental_requests AS request ON request.id = booking.id
  JOIN listings AS listing ON listing.id = booking.listing_id
  WHERE booking.workflow_version = 1
    AND (booking.owner_id = $1 OR booking.renter_id = $1)
  ORDER BY booking.created_at DESC
`);

async function readHistory(rows, viewer) {
  const before = structuredClone(rows);
  freezeTree(rows);
  // No Mission identifier is needed on either input or output. Do not add a
  // synthetic relation, schema fixture, or command hash to make this test pass.
  assert.doesNotMatch(JSON.stringify(rows), /mission/iu);
  let calls = 0;
  const result = await listBookings({
    async query(sql, params) {
      const normalized = normalizeSql(sql);
      assert.doesNotMatch(normalized, /mission|booking_commands/iu);
      calls += 1;
      if (calls === 1) {
        assert.equal(normalized, emptyHoldSweep);
        assert.equal(params, undefined);
        return { rows: [], rowCount: 0 };
      }
      assert.equal(calls, 2, 'no query after the empty sweep and participant read');
      assert.match(normalized, /^SELECT request\.payload, /u);
      assert.ok(normalized.endsWith(participantQueryTail));
      assert.doesNotMatch(normalized, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/iu);
      assert.deepEqual(params, [viewer], 'bind exactly the requesting participant');
      return { rows, rowCount: rows.length };
    },
  }, viewer);
  assert.equal(calls, 2, 'exactly one empty hold sweep followed by one history read');
  assert.deepEqual(rows, before, 'projection must not mutate its input rows');
  assert.doesNotMatch(JSON.stringify(result), /mission/iu);
  return result;
}

test('completed version-1 history without Mission uses relational authority over stale request payload', async () => {
  const row = completedBookingRow();
  const [booking] = await readHistory([row], row.renter_id);
  assert.equal(booking.id, row.id);
  assert.equal(booking.itemId, row.listing_id);
  assert.equal(booking.ownerId, row.owner_id);
  assert.equal(booking.renterId, row.renter_id);
  assert.equal(booking.status, 'completed');
  assert.equal(booking.workflowStatus, 'completed');
  assert.equal(booking.workflowVersion, 1);
  assert.equal(booking.workflowRevision, 7);
  assert.equal(booking.simulationOnly, false);
  assert.equal(booking.startDate, '2026-08-01');
  assert.equal(booking.endDate, '2026-08-03');
  assert.equal(booking.timezone, 'Europe/Berlin');
  assert.equal(booking.start, '2026-07-31T22:00:00.000Z');
  assert.equal(booking.end, '2026-08-02T22:00:00.000Z');
  assert.deepEqual(booking.timeSnapshot, {
    version: 'booking-time-v1', timezone: 'Europe/Berlin',
    handoverAt: '2026-08-01T08:00:00.000Z', returnAt: '2026-08-03T16:00:00.000Z',
  });
  assert.equal(booking.holdExpiresAt, null);
  assert.equal(booking.acceptedAt, '2026-07-25T12:00:00.000Z');
  assert.equal(booking.quotedTotalRenter, 39.6);
  assert.deepEqual(booking.quote, {
    discountLabel: 'Stored synthetic discount',
    quoteVersion: 3, currency: 'EUR', days: 2,
    pricePerDayMinor: 2000, baseRentalMinor: 4000, discountMinor: 400,
    rentalSubtotalMinor: 3600, platformFeeMinor: 360,
    deliveryFeeMinor: 0, pickupFeeMinor: 0, expressFeeMinor: 0,
    totalMinor: 3960, ownerPayoutMinor: 3600, securityDepositMinor: 0,
  });
});

test('same stored history binds each participant query and exposes platformContract only to renter', async () => {
  const row = completedBookingRow();
  const [renterView] = await readHistory([row], row.renter_id);
  const [ownerView] = await readHistory([row], row.owner_id);
  assert.deepEqual(renterView.platformContract, row.payload.platformContract);
  assert.equal(Object.hasOwn(ownerView, 'platformContract'), false);
  const { platformContract, ...renterWithoutContract } = renterView;
  assert.deepEqual(ownerView, renterWithoutContract);
  assert.deepEqual(row.payload.platformContract, platformContract);
});

test('current non-public listing snapshot is reduced while historically stored booking quote stays authoritative', async () => {
  const row = completedBookingRow();
  const [booking] = await readHistory([row], row.renter_id);
  assert.deepEqual(booking.listingSnapshot, {
    id: row.listing_id, ownerId: row.owner_id,
    title: 'Current ended synthetic listing', pricePerDay: 75,
    status: 'ended', isActive: false, catalogRevision: 12,
    city: 'Berlin', country: 'Deutschland', locationText: 'Berlin, Deutschland',
    lat: 52.52, lng: 13.41, geohash: '', approximateLocation: true,
    photos: [], includedAccessories: [],
  });
  assert.equal(booking.quote.pricePerDayMinor, 2000);
  assert.equal(booking.quote.totalMinor, 3960);
  assert.equal(booking.quote.discountLabel, 'Stored synthetic discount');
});

test('no participant rows still performs exactly the empty hold sweep then version-1 history query', async () => {
  assert.deepEqual(await readHistory([], 'synthetic-empty-history-renter'), []);
});
