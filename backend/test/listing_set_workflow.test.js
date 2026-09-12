import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BookingWorkflowError } from '../src/booking_workflow.js';
import {
  assertListingSetsTechnicalAccess,
  createListingSet,
  discoverListingSets,
  ListingSetError,
  listingSetVersion,
  maximumListingSetMembers,
  resolveListingSet,
  reviseListingSet,
} from '../src/listing_set_workflow.js';

const fixedUuid = '11111111-1111-4111-8111-111111111111';
const setId = `listing_set_${fixedUuid}`;
const locationA = 'a'.repeat(64);
const locationB = 'b'.repeat(64);

function listingRow(id, ownerId = 'owner-0001', location = locationA, overrides = {}) {
  return {
    id,
    owner_id: ownerId,
    title: `Artikel ${id}`,
    payload: {
      city: 'Berlin',
      country: 'Deutschland',
      photos: [`https://example.invalid/${id}.webp`],
    },
    category_id: 'cat20',
    subcategory: 'Zubehör',
    currency: 'EUR',
    country: 'Deutschland',
    catalog_version: 1,
    status: 'active',
    is_active: true,
    moderation_status: 'active',
    handover_location_key: location,
    listing_handover_location_key: location,
    has_public_image: true,
    ...overrides,
  };
}

function currentRows({
  id = setId,
  revision = 1,
  kind = 'sit_set',
  status = 'active',
  ownerId = 'owner-0001',
  locations = [locationA, locationA],
  listingIds = ['listing-0001', 'listing-0002'],
} = {}) {
  return listingIds.map((listingId, index) => {
    const listing = listingRow(listingId, ownerId, locations[index]);
    return {
      listing_set_id: id,
      owner_id: ownerId,
      set_created_at: '2026-08-21T00:00:00.000Z',
      version_id: '22222222-2222-4222-8222-222222222222',
      revision,
      set_kind: kind,
      title: 'Werkstatt Set',
      status,
      currency: 'EUR',
      country_code: 'DE',
      member_count: 2,
      required_member_count: 2,
      membership_hash: 'c'.repeat(64),
      version_created_at: '2026-08-21T00:00:00.000Z',
      listing_id: listingId,
      member_role: 'required',
      sort_order: index,
      snapshot_category_id: listing.category_id,
      snapshot_subcategory: listing.subcategory,
      snapshot_currency: listing.currency,
      snapshot_country_code: 'DE',
      snapshot_handover_location_key: locations[index],
      listing_title: listing.title,
      listing_payload: listing.payload,
      category_id: listing.category_id,
      subcategory: listing.subcategory,
      listing_currency: listing.currency,
      listing_country: listing.country,
      catalog_version: listing.catalog_version,
      listing_status: listing.status,
      listing_is_active: listing.is_active,
      listing_moderation_status: listing.moderation_status,
      listing_handover_location_key: locations[index],
      has_public_image: true,
    };
  });
}

function quoteCandidate({ unavailable = new Set(), amounts = {} } = {}) {
  return async (_client, { raw, persist }) => {
    assert.equal(persist, false);
    if (unavailable.has(raw.listingId)) {
      throw new BookingWorkflowError(409, 'listing_unavailable');
    }
    const totalMinor = amounts[raw.listingId] ?? 1200;
    return {
      quoteId: null,
      quoteHash: crypto.createHash('sha256').update(`${raw.listingId}:${totalMinor}`).digest('hex'),
      quotedAt: '2026-08-21T00:00:00.000Z',
      preview: true,
      listingId: raw.listingId,
      availabilityRevision: 4,
      quote: {
        currency: 'EUR',
        rentalSubtotalMinor: totalMinor - 100,
        platformFeeMinor: 100,
        totalMinor,
        ownerPayoutMinor: totalMinor - 100,
        securityDepositMinor: 0,
      },
    };
  };
}

test('G5B migration is normalized, same-owner guarded, item-bound and fail-closed', () => {
  const up = readFileSync(
    new URL('../sql/migrations/031_g5b_listing_sets.up.sql', import.meta.url),
    'utf8',
  );
  const down = readFileSync(
    new URL('../sql/migrations/031_g5b_listing_sets.down.sql', import.meta.url),
    'utf8',
  );
  for (const table of ['listing_sets', 'listing_set_versions', 'listing_set_version_members']) {
    assert.match(up, new RegExp(`CREATE TABLE ${table}`, 'u'));
  }
  assert.match(up, /target_listing\.owner_id <> target_set\.owner_id/u);
  assert.match(up, /required_member_count BETWEEN 2 AND member_count/u);
  assert.match(up, /one_stop_set'[\s\S]*handover_count <> 1/u);
  assert.match(up, /REFERENCES listings\(id\) ON DELETE RESTRICT/u);
  assert.doesNotMatch(up, /REFERENCES bookings/u);
  assert.doesNotMatch(up, /INSERT INTO bookings/u);
  assert.match(down, /G5B rollback blocked: listing set data exists/u);
});

test('feature gate is disabled unless every non-live ranking boundary is exact', () => {
  const enabled = {
    listingSets: {
      enabled: true,
      publicReleaseAllowed: false,
      fewerHandoversRankingAllowed: true,
      businessStatusRankingAllowed: false,
      hiddenPriceManipulationAllowed: false,
    },
  };
  assert.equal(assertListingSetsTechnicalAccess(enabled), true);
  for (const configuration of [
    {},
    { listingSets: { ...enabled.listingSets, enabled: false } },
    { listingSets: { ...enabled.listingSets, publicReleaseAllowed: true } },
    { listingSets: { ...enabled.listingSets, businessStatusRankingAllowed: true } },
    { listingSets: { ...enabled.listingSets, hiddenPriceManipulationAllowed: true } },
  ]) {
    assert.throws(
      () => assertListingSetsTechnicalAccess(configuration),
      (error) => error instanceof ListingSetError && error.code === 'listing_sets_not_enabled',
    );
  }
});

test('owner creates a bounded same-owner set without changing individual listings', async () => {
  const insertedMembers = [];
  const client = {
    async query(statement, values) {
      if (statement.includes('FROM listings AS listing')) {
        return {
          rowCount: 2,
          rows: values[0].map((id) => listingRow(id)),
        };
      }
      if (statement.startsWith('INSERT INTO listing_sets')) return { rowCount: 1, rows: [] };
      if (statement.includes('INSERT INTO listing_set_versions')) {
        return {
          rowCount: 1,
          rows: [{ id: '22222222-2222-4222-8222-222222222222', created_at: '2026-08-21T00:00:00.000Z' }],
        };
      }
      if (statement.includes('INSERT INTO listing_set_version_members')) {
        insertedMembers.push(values);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected query: ${statement}`);
    },
  };
  const created = await createListingSet(client, {
    actorId: 'owner-0001',
    raw: {
      title: 'Werkstatt Set',
      setKind: 'one_stop_set',
      members: [
        { listingId: 'listing-0001', role: 'required' },
        { listingId: 'listing-0002', role: 'required' },
      ],
    },
    idFactory: () => fixedUuid,
  });
  assert.equal(created.id, setId);
  assert.equal(created.revision, 1);
  assert.equal(created.members.length, 2);
  assert.equal(insertedMembers.length, 2);
  assert.match(created.membershipHash, /^[0-9a-f]{64}$/u);
  assert.equal(created.individualBookabilityPreserved, true);
  assert.equal(created.reservationCreated, false);
  assert.equal(created.bookingCreated, false);
  assert.equal(created.paymentCreated, false);
});

test('same-owner, member-count and exact 1-Stop handover constraints fail closed', async () => {
  const makeClient = (rows) => ({
    async query(statement) {
      if (statement.includes('FROM listings AS listing')) return { rowCount: rows.length, rows };
      throw new Error('write should not be reached');
    },
  });
  await assert.rejects(
    createListingSet(makeClient([
      listingRow('listing-0001'),
      listingRow('listing-0002', 'owner-0002'),
    ]), {
      actorId: 'owner-0001',
      raw: {
        title: 'Nicht erlaubt',
        setKind: 'sit_set',
        members: [
          { listingId: 'listing-0001', role: 'required' },
          { listingId: 'listing-0002', role: 'required' },
        ],
      },
    }),
    (error) => error instanceof ListingSetError && error.code === 'listing_set_member_owner_mismatch',
  );
  await assert.rejects(
    createListingSet(makeClient([
      listingRow('listing-0001', 'owner-0001', locationA),
      listingRow('listing-0002', 'owner-0001', locationB),
    ]), {
      actorId: 'owner-0001',
      raw: {
        title: 'Kein 1 Stop',
        setKind: 'one_stop_set',
        members: [
          { listingId: 'listing-0001', role: 'required' },
          { listingId: 'listing-0002', role: 'required' },
        ],
      },
    }),
    (error) => error instanceof ListingSetError && error.code === 'one_stop_set_handover_mismatch',
  );
  await assert.rejects(
    createListingSet({}, {
      actorId: 'owner-0001',
      raw: {
        title: 'Zu groß',
        setKind: 'sit_set',
        members: Array.from({ length: maximumListingSetMembers + 1 }, (_, index) => ({
          listingId: `listing-${String(index).padStart(4, '0')}`,
          role: 'required',
        })),
      },
    }),
    (error) => error instanceof ListingSetError && error.code === 'invalid_listing_set_member_count',
  );
});

test('resolution shows a set only when all required items have current item quotes', async () => {
  const client = {
    async query(statement) {
      assert.match(statement, /WITH current_version AS/u);
      return { rowCount: 2, rows: currentRows({ kind: 'one_stop_set' }) };
    },
  };
  const result = await resolveListingSet(client, {
    actorId: 'renter-0001',
    listingSetId: setId,
    raw: { startDate: '2026-09-10', endDate: '2026-09-12' },
    quoteCandidate: quoteCandidate({
      amounts: { 'listing-0001': 1000, 'listing-0002': 1500 },
    }),
  });
  assert.equal(result.listingSetVersion, listingSetVersion);
  assert.equal(result.items.length, 2);
  assert.equal(result.totals.totalMinor, 2500);
  assert.equal(result.totals.securityDepositMinor, 0);
  assert.equal(result.rankingBasis.handoverCount, 1);
  assert.equal(result.rankingBasis.businessStatusUsed, false);
  assert.equal(result.rankingBasis.hiddenPriceManipulationUsed, false);
  assert.equal(result.serverTruth.allRequiredItemsAvailable, true);
  assert.equal(result.serverTruth.individualBookabilityPreserved, true);
  assert.equal(result.serverTruth.reservationCreated, false);
  assert.equal(result.serverTruth.paymentCreated, false);

  await assert.rejects(
    resolveListingSet(client, {
      actorId: 'renter-0001',
      listingSetId: setId,
      raw: { startDate: '2026-09-10', endDate: '2026-09-12' },
      quoteCandidate: quoteCandidate({ unavailable: new Set(['listing-0002']) }),
    }),
    (error) => error instanceof ListingSetError
      && error.code === 'listing_set_required_member_unavailable',
  );
});

test('G5 availability drift stays item-bound and requires request-time revalidation', async () => {
  const client = {
    async query(statement) {
      assert.match(statement, /WITH current_version AS/u);
      return { rowCount: 2, rows: currentRows({ kind: 'one_stop_set' }) };
    },
  };
  let availabilityRevision = 40;
  const result = await resolveListingSet(client, {
    actorId: 'renter-0001',
    listingSetId: setId,
    raw: { startDate: '2026-09-10', endDate: '2026-09-12' },
    quoteCandidate: async (_client, { raw, persist }) => {
      assert.equal(persist, false);
      availabilityRevision += 1;
      const totalMinor = raw.listingId === 'listing-0001' ? 1000 : 1500;
      return {
        quoteId: null,
        quoteHash: crypto.createHash('sha256')
          .update(`${raw.listingId}:${totalMinor}:${availabilityRevision}`)
          .digest('hex'),
        quotedAt: '2026-08-21T00:00:00.000Z',
        preview: true,
        listingId: raw.listingId,
        availabilityRevision,
        quote: {
          currency: 'EUR',
          rentalSubtotalMinor: totalMinor - 100,
          platformFeeMinor: 100,
          totalMinor,
          ownerPayoutMinor: totalMinor - 100,
          securityDepositMinor: 0,
        },
      };
    },
  });

  assert.deepEqual(
    result.items.map((item) => item.quote.availabilityRevision),
    [41, 42],
  );
  assert.equal(result.serverTruth.revalidationRequiredBeforeRequest, true);
  assert.equal(result.serverTruth.quotePersisted, false);
  assert.equal(result.serverTruth.reservationCreated, false);
  assert.equal(result.serverTruth.paymentCreated, false);
});

test('discovery omits unavailable sets and ranks only by the approved handover signal', async () => {
  const rows = new Map([
    ['listing_set_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', currentRows({
      id: 'listing_set_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      locations: [locationA, locationB],
    })],
    ['listing_set_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', currentRows({
      id: 'listing_set_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      kind: 'one_stop_set',
    })],
    ['listing_set_cccccccc-cccc-4ccc-8ccc-cccccccccccc', currentRows({
      id: 'listing_set_cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      listingIds: ['listing-0003', 'listing-0004'],
    })],
  ]);
  let discoveryQuery = true;
  const client = {
    async query(statement, values) {
      if (discoveryQuery) {
        discoveryQuery = false;
        assert.match(statement, /WITH current_versions AS/u);
        return {
          rowCount: rows.size,
          rows: [...rows.keys()].map((id) => ({ listing_set_id: id })),
        };
      }
      return { rowCount: 2, rows: rows.get(values[0]) };
    },
  };
  const result = await discoverListingSets(client, {
    actorId: 'renter-0001',
    raw: {
      listingId: 'listing-0001',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
    },
    quoteCandidate: quoteCandidate({ unavailable: new Set(['listing-0004']) }),
  });
  assert.equal(result.sets.length, 2);
  assert.equal(result.sets[0].rankingBasis.handoverCount, 1);
  assert.equal(result.sets[0].ranking.position, 1);
  assert.deepEqual(result.sets[0].ranking.approvedSignals, ['fewer_handovers']);
  assert.equal(result.sets[0].ranking.businessStatusUsed, false);
  assert.equal(result.sets[0].ranking.priceUsedForRanking, false);
  assert.equal(result.unavailableSetsOmitted, true);
  assert.equal(result.externalProviderTraffic, false);
});

test('optimistic revision rejects stale owner writes before a new version is appended', async () => {
  const client = {
    async query(statement) {
      if (statement.includes('FROM listing_sets') && statement.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [{ id: setId, owner_id: 'owner-0001' }] };
      }
      if (statement.includes('WITH current_version AS')) {
        return { rowCount: 2, rows: currentRows({ revision: 3 }) };
      }
      throw new Error('stale write must stop before insert');
    },
  };
  await assert.rejects(
    reviseListingSet(client, {
      actorId: 'owner-0001',
      listingSetId: setId,
      raw: { expectedRevision: 2, status: 'paused' },
    }),
    (error) => error instanceof ListingSetError
      && error.code === 'listing_set_revision_changed'
      && error.details.currentRevision === 3,
  );
});

test('owner can end an obsolete 1-Stop set without mutating its member listings', async () => {
  let memberWrites = 0;
  const client = {
    async query(statement, values) {
      if (statement.includes('FROM listing_sets') && statement.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [{ id: setId, owner_id: 'owner-0001' }] };
      }
      if (statement.includes('WITH current_version AS')) {
        return { rowCount: 2, rows: currentRows({ kind: 'one_stop_set' }) };
      }
      if (statement.includes('FROM listings AS listing')) {
        return {
          rowCount: 2,
          rows: [
            listingRow(values[0][0], 'owner-0001', locationA),
            listingRow(values[0][1], 'owner-0001', locationB, {
              status: 'paused',
              is_active: false,
            }),
          ],
        };
      }
      if (statement.includes('INSERT INTO listing_set_versions')) {
        return {
          rowCount: 1,
          rows: [{ id: '33333333-3333-4333-8333-333333333333', created_at: '2026-08-21T01:00:00.000Z' }],
        };
      }
      if (statement.includes('INSERT INTO listing_set_version_members')) {
        memberWrites += 1;
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected query: ${statement}`);
    },
  };
  const ended = await reviseListingSet(client, {
    actorId: 'owner-0001',
    listingSetId: setId,
    raw: { expectedRevision: 1, status: 'ended' },
  });
  assert.equal(ended.status, 'ended');
  assert.equal(ended.revision, 2);
  assert.equal(memberWrites, 2);
  assert.equal(ended.individualBookabilityPreserved, true);
});
