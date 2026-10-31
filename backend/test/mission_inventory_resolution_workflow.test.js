import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertMissionInventoryResolutionTechnicalAccess,
  MissionInventoryResolutionError,
  missionInventoryResolutionDigest,
  normalizeMissionInventoryCorrection,
  normalizeMissionInventoryRequest,
  resolveMissionInventorySnapshot,
} from '../src/mission_inventory_resolution_workflow.js';
import {
  sanitizeMissionInventoryListingSnapshot,
  sanitizeMissionInventoryResolutionSnapshot,
} from '../src/mission_inventory_resolution_privacy.js';

const missionId = 'mission_need_11111111-1111-4111-8111-111111111111';

function request(overrides = {}) {
  return {
    missionRevision: 2,
    missionPayloadDigest: 'a'.repeat(64),
    startDate: '2026-10-10',
    endDate: '2026-10-12',
    location: {
      latitudeE5: 4_914_000,
      longitudeE5: 922_000,
      radiusKm: 25,
      sourceVersion: 'owner-location-v1',
      ownerConfirmed: true,
    },
    ...overrides,
  };
}

function candidate(listingId, distanceKm = 1.2) {
  return Object.freeze({
    listingId,
    title: `Candidate ${listingId}`,
    categoryId: 'cat7',
    subcategory: 'Gartengeräte',
    condition: 'good',
    city: 'Heilbronn',
    country: 'Deutschland',
    distanceKm,
    catalogRevision: 3,
    availabilityRevision: 4,
    handoverLocationKey: 'b'.repeat(64),
    quote: Object.freeze({
      quoteHash: 'c'.repeat(64),
      quotedAt: '2026-10-01T00:00:00.000Z',
      availabilityRevision: 4,
      currency: 'EUR',
      rentalSubtotalMinor: 900,
      platformFeeMinor: 100,
      totalMinor: 1000,
      ownerPayoutMinor: 900,
      preview: true,
      persisted: false,
    }),
  });
}

test('P5 request binds mission, dates and a private digest-only location snapshot', () => {
  const normalized = normalizeMissionInventoryRequest(request());
  assert.equal(normalized.missionRevision, 2);
  assert.equal(normalized.location.stored.radiusKm, 25);
  assert.equal(normalized.location.stored.exactCoordinatesStored, false);
  assert.match(normalized.location.stored.coordinateDigest, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(normalized.location.stored).includes('latitude'), false);
  assert.equal(JSON.stringify(normalized.location.stored).includes('longitude'), false);
  assert.equal(
    normalized.location.digest,
    missionInventoryResolutionDigest(normalized.location.stored),
  );
  assert.equal(
    missionInventoryResolutionDigest({ b: 2, a: 1 }),
    missionInventoryResolutionDigest({ a: 1, b: 2 }),
  );
  assert.throws(
    () => normalizeMissionInventoryRequest(request({ invented: true })),
    (error) => error.code === 'mission_inventory_payload_fields_invalid',
  );
  assert.throws(
    () => normalizeMissionInventoryRequest(request({
      location: { ...request().location, radiusKm: 501 },
    })),
    (error) => error.code === 'mission_inventory_radius_invalid',
  );
  assert.equal(normalizeMissionInventoryCorrection({
    ...request(), expectedRevision: 3,
  }).expectedRevision, 3);
});

test('required quantities are allocated first and one physical listing is never double-used', async () => {
  const shared = candidate('listing-shared');
  const second = candidate('listing-second', 2.1);
  const mission = {
    id: missionId,
    payload: {
      title: 'Mission', status: 'planned',
      needs: [
        { needKey: 'carrying_and_storage_equipment', necessity: 'optional', quantity: 1 },
        { needKey: 'plant_container_equipment', necessity: 'required', quantity: 2 },
      ],
    },
  };
  const resolved = await resolveMissionInventorySnapshot({
    client: {}, actorId: 'owner-1', mission,
    request: normalizeMissionInventoryRequest(request()),
    candidateResolver: async (_client, { itemType }) => ({
      supported: true,
      candidates: itemType === 'plant_container_equipment' ? [shared, second] : [shared],
      inspectedCount: itemType === 'plant_container_equipment' ? 2 : 1,
      rejectedByServerTruth: 0,
      searchLimited: itemType === 'plant_container_equipment',
    }),
  });
  const assigned = resolved.snapshot.slots
    .filter((slot) => slot.assignment)
    .map((slot) => slot.assignment.listingId);
  assert.deepEqual(assigned.sort(), ['listing-second', 'listing-shared']);
  assert.equal(new Set(assigned).size, assigned.length);
  const required = resolved.snapshot.coverage.find((entry) => entry.necessity === 'required');
  const optional = resolved.snapshot.coverage.find((entry) => entry.necessity === 'optional');
  assert.deepEqual(
    [required.requestedQuantity, required.coveredQuantity, required.gapQuantity],
    [2, 2, 0],
  );
  assert.equal(optional.gapQuantity, 1);
  assert.equal(resolved.snapshot.requiredCoverageComplete, true);
  assert.equal(resolved.snapshot.searchLimited, true);
  assert.equal(resolved.snapshot.candidatePolicy.candidateLimitPerNeed, 24);
  assert.equal(resolved.snapshot.candidatePolicy.pilotRegionUsedAsDistance, false);
  for (const key of [
    'reservationCreated', 'bookingCreated', 'contractCreated', 'paymentCreated',
    'publicShelfCreated', 'publicListingCreated', 'automaticPublicationPerformed',
    'externalGenerativeAiUsed', 'quotePersisted',
  ]) assert.equal(resolved.snapshot[key], false);
});

test('unsupported needs and empty bounded inventory stay visible as honest gaps', async () => {
  const mission = {
    id: missionId,
    payload: {
      title: 'Mission', status: 'draft',
      needs: [
        { needKey: 'unsupported_custom_need', necessity: 'required', quantity: 2 },
        { needKey: 'plant_container_equipment', necessity: 'optional', quantity: 1 },
      ],
    },
  };
  const resolved = await resolveMissionInventorySnapshot({
    client: {}, actorId: 'owner-1', mission,
    request: normalizeMissionInventoryRequest(request()),
    candidateResolver: async (_client, { itemType }) => (itemType === 'unsupported_custom_need'
      ? { supported: false, candidates: [], searchLimited: false }
      : {
          supported: true, candidates: [], inspectedCount: 0,
          rejectedByServerTruth: 0, searchLimited: false,
        }),
  });
  assert.equal(resolved.snapshot.requiredCoverageComplete, false);
  assert.deepEqual(
    resolved.snapshot.slots.map((slot) => slot.gapReason),
    ['unsupported_need_key', 'unsupported_need_key', 'no_current_unique_candidate'],
  );
});

test('P5 technical gate remains internal and non-public', () => {
  const accepted = {
    planner: {
      enabled: true,
      inventoryResolutionEnabled: true,
      publicReleaseAllowed: false,
      externalGenerativeAiAllowed: false,
      inventoryResolutionAllowed: false,
    },
  };
  assert.equal(assertMissionInventoryResolutionTechnicalAccess(accepted), true);
  for (const mutation of [
    { enabled: false },
    { inventoryResolutionEnabled: false },
    { publicReleaseAllowed: true },
    { externalGenerativeAiAllowed: true },
    { inventoryResolutionAllowed: true },
  ]) {
    assert.throws(
      () => assertMissionInventoryResolutionTechnicalAccess({
        planner: { ...accepted.planner, ...mutation },
      }),
      (error) => error instanceof MissionInventoryResolutionError
        && error.code === 'mission_inventory_resolution_not_enabled',
    );
  }
});

test('config-free privacy shaping removes private location drift keys without mutating history', () => {
  const internal = Object.freeze({
    slots: Object.freeze([
      Object.freeze({
        slotKey: 'required:plant_container_equipment:1',
        assignment: Object.freeze({
          listingId: 'listing-private',
          handoverLocationKey: 'b'.repeat(64),
          quote: Object.freeze({ quoteHash: 'c'.repeat(64) }),
        }),
      }),
    ]),
  });
  const safe = sanitizeMissionInventoryResolutionSnapshot(internal);
  assert.equal(JSON.stringify(safe).includes('handoverLocationKey'), false);
  assert.equal(internal.slots[0].assignment.handoverLocationKey, 'b'.repeat(64));
  assert.equal(
    sanitizeMissionInventoryListingSnapshot(internal.slots[0].assignment).listingId,
    'listing-private',
  );
});
