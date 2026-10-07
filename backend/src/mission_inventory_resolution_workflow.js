import crypto from 'node:crypto';

import { parseRentalDates } from './booking_domain.js';
import { BookingWorkflowError, quoteBooking } from './booking_workflow.js';
import {
  missionInventoryCandidateLimit,
  resolveBoundedMissionCandidates,
} from './planner_inventory_workflow.js';
import { plannerCoreVersion } from './planner_core.js';
import {
  sanitizeMissionInventoryListingSnapshot,
  sanitizeMissionInventoryResolutionSnapshot,
} from './mission_inventory_resolution_privacy.js';

export const missionInventoryResolutionDomainVersion = 'P5-A-2026-10-01.1';

export class MissionInventoryResolutionError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MissionInventoryResolutionError(400, code);
  }
  return { ...value };
}

function exactKeys(value, expected, code) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
      || actual.some((key, index) => key !== wanted[index])) {
    throw new MissionInventoryResolutionError(400, code);
  }
}

function text(value, maximum, code) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || candidate.length > maximum) {
    throw new MissionInventoryResolutionError(400, code);
  }
  return candidate;
}

function identifier(value, pattern, code, status = 400) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!pattern.test(candidate)) throw new MissionInventoryResolutionError(status, code);
  return candidate;
}

function digest(value, code) {
  return identifier(value, /^[0-9a-f]{64}$/u, code);
}

function revision(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MissionInventoryResolutionError(400, code);
  }
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function missionInventoryResolutionDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function missionNeedId(value) {
  return identifier(
    value,
    /^mission_need_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    'mission_inventory_mission_not_found',
    404,
  );
}

function resolutionId(value) {
  return identifier(
    value,
    /^mission_inventory_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    'mission_inventory_resolution_not_found',
    404,
  );
}

function commandKey(value) {
  return identifier(
    value,
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/u,
    'mission_inventory_idempotency_key_invalid',
  );
}

function normalizeLocation(raw) {
  const candidate = object(raw, 'mission_inventory_location_invalid');
  exactKeys(candidate, [
    'latitudeE5', 'longitudeE5', 'ownerConfirmed', 'radiusKm', 'sourceVersion',
  ], 'mission_inventory_location_fields_invalid');
  if (!Number.isSafeInteger(candidate.latitudeE5)
      || candidate.latitudeE5 < -9_000_000
      || candidate.latitudeE5 > 9_000_000
      || !Number.isSafeInteger(candidate.longitudeE5)
      || candidate.longitudeE5 < -18_000_000
      || candidate.longitudeE5 > 18_000_000) {
    throw new MissionInventoryResolutionError(400, 'mission_inventory_coordinates_invalid');
  }
  if (!Number.isSafeInteger(candidate.radiusKm)
      || candidate.radiusKm < 1
      || candidate.radiusKm > 500) {
    throw new MissionInventoryResolutionError(400, 'mission_inventory_radius_invalid');
  }
  if (candidate.ownerConfirmed !== true) {
    throw new MissionInventoryResolutionError(400, 'mission_inventory_location_confirmation_required');
  }
  const sourceVersion = text(
    candidate.sourceVersion,
    120,
    'mission_inventory_location_source_version_invalid',
  );
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}$/u.test(sourceVersion)) {
    throw new MissionInventoryResolutionError(400, 'mission_inventory_location_source_version_invalid');
  }
  const normalized = Object.freeze({
    latitudeE5: candidate.latitudeE5,
    longitudeE5: candidate.longitudeE5,
    radiusKm: candidate.radiusKm,
    sourceVersion,
    ownerConfirmed: true,
  });
  const coordinateDigest = missionInventoryResolutionDigest({
    latitudeE5: normalized.latitudeE5,
    longitudeE5: normalized.longitudeE5,
  });
  const stored = Object.freeze({
    sourceType: 'owner_confirmed_search_origin',
    sourceVersion,
    ownerConfirmed: true,
    radiusKm: normalized.radiusKm,
    coordinateDigest,
    exactCoordinatesStored: false,
  });
  return Object.freeze({
    exact: normalized,
    stored,
    digest: missionInventoryResolutionDigest(stored),
  });
}

function normalizeSnapshot(raw, { correction = false } = {}) {
  const candidate = object(raw, 'mission_inventory_payload_invalid');
  exactKeys(candidate, correction
    ? ['endDate', 'expectedRevision', 'location', 'missionPayloadDigest', 'missionRevision', 'startDate']
    : ['endDate', 'location', 'missionPayloadDigest', 'missionRevision', 'startDate'],
  correction
    ? 'mission_inventory_correction_fields_invalid'
    : 'mission_inventory_payload_fields_invalid');
  const dates = parseRentalDates(candidate.startDate, candidate.endDate, { maxDays: 365 });
  if (!dates) throw new MissionInventoryResolutionError(400, 'mission_inventory_dates_invalid');
  return Object.freeze({
    ...(correction ? {
      expectedRevision: revision(
        candidate.expectedRevision,
        'mission_inventory_expected_revision_invalid',
      ),
    } : {}),
    missionRevision: revision(
      candidate.missionRevision,
      'mission_inventory_mission_revision_invalid',
    ),
    missionPayloadDigest: digest(
      candidate.missionPayloadDigest,
      'mission_inventory_mission_digest_invalid',
    ),
    startDate: dates.startDate,
    endDate: dates.endDate,
    location: normalizeLocation(candidate.location),
  });
}

export function normalizeMissionInventoryRequest(raw) {
  return normalizeSnapshot(raw);
}

export function normalizeMissionInventoryCorrection(raw) {
  return normalizeSnapshot(raw, { correction: true });
}

function normalizedNeeds(payload) {
  const source = object(payload, 'mission_inventory_mission_payload_invalid');
  if (!Array.isArray(source.needs) || source.needs.length < 1) {
    throw new MissionInventoryResolutionError(409, 'mission_inventory_mission_payload_invalid');
  }
  return source.needs.map((rawNeed) => {
    const need = object(rawNeed, 'mission_inventory_need_invalid');
    const needKey = text(need.needKey, 80, 'mission_inventory_need_invalid');
    if (!['required', 'optional'].includes(need.necessity)
        || !Number.isSafeInteger(need.quantity)
        || need.quantity < 1
        || need.quantity > 100) {
      throw new MissionInventoryResolutionError(409, 'mission_inventory_need_invalid');
    }
    return Object.freeze({ needKey, necessity: need.necessity, quantity: need.quantity });
  });
}

function expandedSlots(needs) {
  return [...needs]
    .sort((left, right) => (left.necessity === right.necessity
      ? left.needKey.localeCompare(right.needKey)
      : (left.necessity === 'required' ? -1 : 1)))
    .flatMap((need) => Array.from({ length: need.quantity }, (_, index) => Object.freeze({
      slotKey: `${need.necessity}:${need.needKey}:${index + 1}`,
      needKey: need.needKey,
      necessity: need.necessity,
      ordinal: index + 1,
    })));
}

function assignSlots(slots, byNeed, unavailableListingIds = new Set()) {
  const listingToSlot = new Map();
  const slotToCandidate = new Map();
  const assign = (slotIndex, visited) => {
    const slot = slots[slotIndex];
    for (const candidate of byNeed.get(slot.needKey)?.candidates ?? []) {
      if (unavailableListingIds.has(candidate.listingId) || visited.has(candidate.listingId)) {
        continue;
      }
      visited.add(candidate.listingId);
      const previous = listingToSlot.get(candidate.listingId);
      if (previous === undefined || assign(previous, visited)) {
        listingToSlot.set(candidate.listingId, slotIndex);
        slotToCandidate.set(slotIndex, candidate);
        return true;
      }
    }
    return false;
  };
  for (let index = 0; index < slots.length; index += 1) assign(index, new Set());
  return slots.map((slot, index) => ({ slot, candidate: slotToCandidate.get(index) ?? null }));
}

function assignmentSnapshot(candidate) {
  return Object.freeze({
    listingId: candidate.listingId,
    title: candidate.title,
    categoryId: candidate.categoryId,
    subcategory: candidate.subcategory,
    condition: candidate.condition,
    city: candidate.city,
    country: candidate.country,
    distanceKm: candidate.distanceKm,
    catalogRevision: candidate.catalogRevision,
    availabilityRevision: candidate.availabilityRevision,
    handoverLocationKey: candidate.handoverLocationKey,
    quote: candidate.quote,
  });
}

export async function resolveMissionInventorySnapshot({
  client,
  actorId,
  mission,
  request,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  candidateResolver = resolveBoundedMissionCandidates,
  quoteCandidate = quoteBooking,
}) {
  const needs = normalizedNeeds(mission.payload);
  const slots = expandedSlots(needs);
  const byNeed = new Map();
  for (const needKey of [...new Set(needs.map((need) => need.needKey))].sort()) {
    byNeed.set(needKey, await candidateResolver(client, {
      actorId,
      itemType: needKey,
      startDate: request.startDate,
      endDate: request.endDate,
      latitude: request.location.exact.latitudeE5 / 100_000,
      longitude: request.location.exact.longitudeE5 / 100_000,
      radiusKm: request.location.exact.radiusKm,
      privatePilot,
      privatePilotAllowedRegions,
      quoteCandidate,
    }));
  }
  const requiredSlots = slots.filter((slot) => slot.necessity === 'required');
  const optionalSlots = slots.filter((slot) => slot.necessity === 'optional');
  const required = assignSlots(requiredSlots, byNeed);
  const requiredListingIds = new Set(required
    .map((entry) => entry.candidate?.listingId)
    .filter(Boolean));
  const optional = assignSlots(optionalSlots, byNeed, requiredListingIds);
  const resolved = [...required, ...optional].map(({ slot, candidate }) => Object.freeze({
    ...slot,
    status: candidate ? 'assigned' : 'gap',
    gapReason: candidate
      ? null
      : (byNeed.get(slot.needKey)?.supported === false
        ? 'unsupported_need_key'
        : 'no_current_unique_candidate'),
    assignment: candidate ? assignmentSnapshot(candidate) : null,
  }));
  const coverage = needs
    .map((need) => {
      const relevant = resolved.filter((slot) => slot.needKey === need.needKey);
      const coveredQuantity = relevant.filter((slot) => slot.status === 'assigned').length;
      const candidateTruth = byNeed.get(need.needKey);
      return Object.freeze({
        needKey: need.needKey,
        necessity: need.necessity,
        requestedQuantity: need.quantity,
        coveredQuantity,
        gapQuantity: need.quantity - coveredQuantity,
        supported: candidateTruth.supported,
        inspectedCount: candidateTruth.inspectedCount ?? 0,
        rejectedByServerTruth: candidateTruth.rejectedByServerTruth ?? 0,
        searchLimited: candidateTruth.searchLimited,
      });
    })
    .sort((left, right) => (left.necessity === right.necessity
      ? left.needKey.localeCompare(right.needKey)
      : (left.necessity === 'required' ? -1 : 1)));
  const snapshot = Object.freeze({
    domainVersion: missionInventoryResolutionDomainVersion,
    plannerCoreVersion,
    missionNeedId: mission.id,
    missionRevision: request.missionRevision,
    missionPayloadDigest: request.missionPayloadDigest,
    startDate: request.startDate,
    endDate: request.endDate,
    locationSnapshot: request.location.stored,
    locationSnapshotDigest: request.location.digest,
    candidatePolicy: Object.freeze({
      candidateLimitPerNeed: missionInventoryCandidateLimit,
      ordering: 'distance_then_listing_id',
      completeness: 'bounded_not_complete_or_optimal',
      pilotRegionUsedAsDistance: false,
    }),
    coverage: Object.freeze(coverage),
    slots: Object.freeze(resolved),
    requiredCoverageComplete: coverage
      .filter((entry) => entry.necessity === 'required')
      .every((entry) => entry.gapQuantity === 0),
    searchLimited: coverage.some((entry) => entry.searchLimited),
    status: 'resolved_at_request_time',
    quotePersisted: false,
    revalidationRequiredBeforeRequest: true,
    bindingStatus: 'non_binding',
    reservationCreated: false,
    bookingCreated: false,
    contractCreated: false,
    paymentCreated: false,
    publicShelfCreated: false,
    publicListingCreated: false,
    automaticPublicationPerformed: false,
    externalGenerativeAiUsed: false,
  });
  return Object.freeze({ snapshot, digest: missionInventoryResolutionDigest(snapshot) });
}

export function assertMissionInventoryResolutionTechnicalAccess(configuration) {
  if (configuration?.planner?.enabled !== true
      || configuration.planner.inventoryResolutionEnabled !== true
      || configuration.planner.publicReleaseAllowed !== false
      || configuration.planner.externalGenerativeAiAllowed !== false
      || configuration.planner.inventoryResolutionAllowed !== false) {
    throw new MissionInventoryResolutionError(404, 'mission_inventory_resolution_not_enabled');
  }
  return true;
}

function iso(value) {
  const candidate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    throw new MissionInventoryResolutionError(500, 'mission_inventory_timestamp_invalid');
  }
  return candidate.toISOString();
}

async function currentMission(client, ownerId, id, { lock = false } = {}) {
  const result = await client.query(
    `SELECT need.id, need.current_revision, revision.payload, revision.payload_sha256
       FROM mission_needs AS need
       JOIN mission_need_revisions AS revision
         ON revision.mission_need_id = need.id
        AND revision.revision = need.current_revision
      WHERE need.owner_id = $1 AND need.id = $2
      ${lock ? 'FOR KEY SHARE OF need' : ''}`,
    [ownerId, id],
  );
  if (result.rowCount !== 1) {
    throw new MissionInventoryResolutionError(404, 'mission_inventory_mission_not_found');
  }
  return result.rows[0];
}

function assertMissionBinding(mission, request) {
  if (Number(mission.current_revision) !== request.missionRevision
      || mission.payload_sha256 !== request.missionPayloadDigest) {
    throw new MissionInventoryResolutionError(409, 'mission_inventory_mission_snapshot_stale');
  }
}

async function lockCommand(client, ownerId, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `mission_inventory:${ownerId}:${key}`,
  ]);
}

async function lockMissionRoot(client, ownerId, id) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `mission_inventory_root:${ownerId}:${id}`,
  ]);
}

const revisionSelect = `SELECT resolution.id, resolution.owner_id, resolution.mission_need_id,
        resolution.domain_version, resolution.planner_core_version,
        resolution.planner_inventory_version, resolution.created_at, resolution.updated_at,
        revision.id AS revision_id, revision.revision, revision.mission_need_revision,
        revision.mission_payload_sha256, revision.start_date::text AS start_date,
        revision.end_date::text AS end_date, revision.location_snapshot,
        revision.location_snapshot_sha256, revision.resolution_snapshot,
        revision.resolution_snapshot_sha256, revision.created_at AS revision_created_at
   FROM mission_inventory_resolutions AS resolution
   JOIN mission_inventory_resolution_revisions AS revision
     ON revision.resolution_id = resolution.id`;

async function revisionByNumber(client, ownerId, id, targetRevision) {
  const result = await client.query(
    `${revisionSelect}
      WHERE resolution.owner_id = $1 AND resolution.id = $2 AND revision.revision = $3`,
    [ownerId, id, targetRevision],
  );
  return result.rows[0] ?? null;
}

function validRevalidatedQuote(result, stored, startDate, endDate) {
  const quote = result?.quote;
  return result?.preview === true
    && result.quoteId === null
    && result.listingId === stored.listingId
    && result.startDate === startDate
    && result.endDate === endDate
    && /^[0-9a-f]{64}$/u.test(result.quoteHash ?? '')
    && Number.isSafeInteger(result.availabilityRevision)
    && quote?.currency === 'EUR'
    && [
      quote.rentalSubtotalMinor,
      quote.platformFeeMinor,
      quote.totalMinor,
      quote.ownerPayoutMinor,
    ].every((value) => Number.isSafeInteger(value) && value >= 0);
}

async function listingDriftReasons(client, snapshot, {
  actorId,
  privatePilot,
  privatePilotAllowedRegions,
  quoteCandidate,
}) {
  const assigned = snapshot.slots.filter((slot) => slot.assignment !== null);
  if (assigned.length === 0) return [];
  const ids = assigned.map((slot) => slot.assignment.listingId);
  const result = await client.query(
    `SELECT listing.id, listing.catalog_version, listing.catalog_revision,
            listing.availability_revision,
            listing.status, listing.is_active, listing.moderation_status,
            owner.deactivated_at AS owner_deactivated_at,
            owner.account_status AS owner_account_status,
            encode(digest(concat_ws(E'\\n',
              COALESCE(listing.location_text, ''),
              COALESCE(listing.latitude::text, ''),
              COALESCE(listing.longitude::text, ''),
              COALESCE(listing.handover_radius_km::text, '')
            ), 'sha256'), 'hex') AS handover_location_key,
            EXISTS (
              SELECT 1 FROM uploads AS upload
               WHERE upload.listing_id = listing.id
                 AND upload.purpose = 'listing_image'
                 AND upload.visibility = 'public'
                 AND upload.content_scan_status = 'passed'
            ) AS has_public_image
       FROM listings AS listing
       JOIN users AS owner ON owner.id = listing.owner_id
      WHERE listing.id = ANY($1::text[])`,
    [ids],
  );
  const current = new Map(result.rows.map((row) => [row.id, row]));
  const reasons = new Set();
  for (const slot of assigned) {
    const stored = slot.assignment;
    const row = current.get(stored.listingId);
    if (!row) {
      reasons.add('listing_missing');
      continue;
    }
    if (Number(row.catalog_revision) !== stored.catalogRevision) {
      reasons.add('listing_catalog_changed');
      reasons.add('quote_binding_inputs_changed');
    }
    if (Number(row.availability_revision) !== stored.availabilityRevision) {
      reasons.add('listing_availability_changed');
      reasons.add('quote_binding_inputs_changed');
    }
    if (row.handover_location_key !== stored.handoverLocationKey) {
      reasons.add('listing_location_changed');
    }
    if (Number(row.catalog_version) !== 1
        || row.owner_deactivated_at !== null
        || row.owner_account_status !== 'active'
        || row.status !== 'active'
        || row.is_active !== true
        || row.moderation_status !== 'active'
        || row.has_public_image !== true) {
      reasons.add('listing_no_longer_candidate');
    }
    try {
      const currentQuote = await quoteCandidate(client, {
        actorId,
        raw: {
          listingId: stored.listingId,
          startDate: snapshot.startDate,
          endDate: snapshot.endDate,
        },
        privatePilot,
        privatePilotAllowedRegions,
        persist: false,
      });
      if (!validRevalidatedQuote(
        currentQuote,
        stored,
        snapshot.startDate,
        snapshot.endDate,
      )) {
        throw new MissionInventoryResolutionError(
          500,
          'mission_inventory_quote_contract_invalid',
        );
      }
      const storedQuote = stored.quote;
      if (currentQuote.quoteHash !== storedQuote.quoteHash
          || currentQuote.availabilityRevision !== storedQuote.availabilityRevision
          || currentQuote.quote.currency !== storedQuote.currency
          || currentQuote.quote.rentalSubtotalMinor !== storedQuote.rentalSubtotalMinor
          || currentQuote.quote.platformFeeMinor !== storedQuote.platformFeeMinor
          || currentQuote.quote.totalMinor !== storedQuote.totalMinor
          || currentQuote.quote.ownerPayoutMinor !== storedQuote.ownerPayoutMinor) {
        reasons.add('quote_snapshot_changed');
      }
    } catch (error) {
      if (error instanceof BookingWorkflowError && error.status < 500) {
        reasons.add('listing_unavailable_or_quote_rejected');
      } else {
        throw error;
      }
    }
  }
  return [...reasons].sort();
}

async function shapeResolution(client, ownerId, row, {
  privatePilot = false,
  privatePilotAllowedRegions = [],
  quoteCandidate = quoteBooking,
} = {}) {
  const mission = await currentMission(client, ownerId, row.mission_need_id);
  const reasons = new Set(await listingDriftReasons(client, row.resolution_snapshot, {
    actorId: ownerId,
    privatePilot,
    privatePilotAllowedRegions,
    quoteCandidate,
  }));
  if (Number(mission.current_revision) !== Number(row.mission_need_revision)
      || mission.payload_sha256 !== row.mission_payload_sha256) {
    reasons.add('mission_snapshot_changed');
  }
  const driftReasons = [...reasons].sort();
  return Object.freeze({
    resolutionId: row.id,
    domainVersion: row.domain_version,
    plannerCoreVersion: row.planner_core_version,
    plannerInventoryVersion: row.planner_inventory_version,
    missionNeedId: row.mission_need_id,
    missionRevision: Number(row.mission_need_revision),
    missionPayloadDigest: row.mission_payload_sha256,
    revision: Number(row.revision),
    startDate: row.start_date,
    endDate: row.end_date,
    locationSnapshot: row.location_snapshot,
    locationSnapshotDigest: row.location_snapshot_sha256,
    storedResolution: sanitizeMissionInventoryResolutionSnapshot(row.resolution_snapshot),
    currentApplicability: driftReasons.length === 0 ? 'current_snapshot_inputs' : 'stale',
    currentStatus: driftReasons.length === 0 ? 'current_non_binding_preview' : 'unknown',
    driftReasons,
    quoteRevalidationRequired: false,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    revisionCreatedAt: iso(row.revision_created_at),
    bindingStatus: 'non_binding',
    reservationCreated: false,
    bookingCreated: false,
    contractCreated: false,
    paymentCreated: false,
    publicShelfCreated: false,
    publicListingCreated: false,
    automaticPublicationPerformed: false,
    externalGenerativeAiUsed: false,
  });
}

async function replayCommand(client, {
  ownerId,
  key,
  commandType,
  requestDigest,
  shapeOptions,
}) {
  const result = await client.query(
    `SELECT command_type, request_sha256, resolution_id, result_revision
       FROM mission_inventory_resolution_commands
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, key],
  );
  const command = result.rows[0];
  if (!command) return null;
  if (command.command_type !== commandType || command.request_sha256 !== requestDigest) {
    throw new MissionInventoryResolutionError(409, 'mission_inventory_idempotency_key_reused');
  }
  const row = await revisionByNumber(
    client,
    ownerId,
    command.resolution_id,
    Number(command.result_revision),
  );
  if (!row) throw new MissionInventoryResolutionError(500, 'mission_inventory_replay_state_invalid');
  return {
    resolution: await shapeResolution(client, ownerId, row, shapeOptions),
    replayed: true,
  };
}

async function insertRevision(client, { id, revisionNumber, missionId, resolved }) {
  const revisionRow = await client.query(
    `INSERT INTO mission_inventory_resolution_revisions (
       resolution_id, mission_need_id, revision, mission_need_revision,
       mission_payload_sha256, start_date, end_date, location_snapshot,
       location_snapshot_sha256, resolution_snapshot, resolution_snapshot_sha256
     ) VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::jsonb, $9, $10::jsonb, $11)
     RETURNING id`,
    [id, missionId, revisionNumber, resolved.snapshot.missionRevision,
      resolved.snapshot.missionPayloadDigest, resolved.snapshot.startDate,
      resolved.snapshot.endDate, JSON.stringify(resolved.snapshot.locationSnapshot),
      resolved.snapshot.locationSnapshotDigest, JSON.stringify(resolved.snapshot), resolved.digest],
  );
  const revisionId = revisionRow.rows[0].id;
  for (const slot of resolved.snapshot.slots) {
    await client.query(
      `INSERT INTO mission_inventory_resolution_assignments (
         revision_id, resolution_id, resolution_revision, slot_key, need_key,
         necessity, slot_ordinal, listing_id, listing_snapshot, quote_snapshot, gap_reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)`,
      [revisionId, id, revisionNumber, slot.slotKey, slot.needKey, slot.necessity,
        slot.ordinal, slot.assignment?.listingId ?? null,
        slot.assignment ? JSON.stringify({
          listingId: slot.assignment.listingId,
          title: slot.assignment.title,
          categoryId: slot.assignment.categoryId,
          subcategory: slot.assignment.subcategory,
          condition: slot.assignment.condition,
          city: slot.assignment.city,
          country: slot.assignment.country,
          distanceKm: slot.assignment.distanceKm,
          catalogRevision: slot.assignment.catalogRevision,
          availabilityRevision: slot.assignment.availabilityRevision,
          handoverLocationKey: slot.assignment.handoverLocationKey,
        }) : null,
        slot.assignment ? JSON.stringify(slot.assignment.quote) : null,
        slot.gapReason],
    );
  }
}

async function insertCommand(client, {
  ownerId, key, commandType, requestDigest, id, revisionNumber,
}) {
  await client.query(
    `INSERT INTO mission_inventory_resolution_commands (
       owner_id, idempotency_key, command_type, request_sha256,
       resolution_id, result_revision
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [ownerId, key, commandType, requestDigest, id, revisionNumber],
  );
}

export async function createMissionInventoryResolution(client, {
  actorId,
  missionNeedId: rawMissionId,
  raw,
  idempotencyKey,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  candidateResolver = resolveBoundedMissionCandidates,
  quoteCandidate = quoteBooking,
}) {
  const ownerId = text(actorId, 160, 'mission_inventory_actor_invalid');
  const missionId = missionNeedId(rawMissionId);
  const request = normalizeMissionInventoryRequest(raw);
  const key = commandKey(idempotencyKey);
  const requestDigest = missionInventoryResolutionDigest({
    command: 'create', missionNeedId: missionId, request,
  });
  await lockCommand(client, ownerId, key);
  const replay = await replayCommand(client, {
    ownerId, key, commandType: 'create', requestDigest,
    shapeOptions: { privatePilot, privatePilotAllowedRegions, quoteCandidate },
  });
  if (replay) return replay;
  await lockMissionRoot(client, ownerId, missionId);
  const existing = await client.query(
    'SELECT id FROM mission_inventory_resolutions WHERE owner_id = $1 AND mission_need_id = $2',
    [ownerId, missionId],
  );
  if (existing.rowCount) throw new MissionInventoryResolutionError(409, 'mission_inventory_resolution_exists');
  const mission = await currentMission(client, ownerId, missionId, { lock: true });
  assertMissionBinding(mission, request);
  const id = `mission_inventory_${crypto.randomUUID()}`;
  const resolved = await resolveMissionInventorySnapshot({
    client, actorId: ownerId, mission: { ...mission, id: missionId }, request,
    privatePilot, privatePilotAllowedRegions, candidateResolver, quoteCandidate,
  });
  await client.query(
    `INSERT INTO mission_inventory_resolutions (
       id, owner_id, mission_need_id, domain_version, planner_core_version,
       planner_inventory_version
     ) VALUES ($1, $2, $3, $4, $5, 'G4B-2026-08-21.1')`,
    [id, ownerId, missionId, missionInventoryResolutionDomainVersion, plannerCoreVersion],
  );
  await insertRevision(client, { id, revisionNumber: 1, missionId, resolved });
  await insertCommand(client, {
    ownerId, key, commandType: 'create', requestDigest, id, revisionNumber: 1,
  });
  const row = await revisionByNumber(client, ownerId, id, 1);
  return {
    resolution: await shapeResolution(client, ownerId, row, {
      privatePilot, privatePilotAllowedRegions, quoteCandidate,
    }),
    replayed: false,
  };
}

export async function reviseMissionInventoryResolution(client, {
  actorId,
  resolutionId: rawResolutionId,
  raw,
  idempotencyKey,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  candidateResolver = resolveBoundedMissionCandidates,
  quoteCandidate = quoteBooking,
}) {
  const ownerId = text(actorId, 160, 'mission_inventory_actor_invalid');
  const id = resolutionId(rawResolutionId);
  const request = normalizeMissionInventoryCorrection(raw);
  const key = commandKey(idempotencyKey);
  const requestDigest = missionInventoryResolutionDigest({ command: 'revise', id, request });
  await lockCommand(client, ownerId, key);
  const replay = await replayCommand(client, {
    ownerId, key, commandType: 'revise', requestDigest,
    shapeOptions: { privatePilot, privatePilotAllowedRegions, quoteCandidate },
  });
  if (replay) return replay;
  const locked = await client.query(
    `SELECT id, mission_need_id, current_revision
       FROM mission_inventory_resolutions
      WHERE owner_id = $1 AND id = $2 FOR UPDATE`,
    [ownerId, id],
  );
  if (locked.rowCount !== 1) {
    throw new MissionInventoryResolutionError(404, 'mission_inventory_resolution_not_found');
  }
  const root = locked.rows[0];
  if (Number(root.current_revision) !== request.expectedRevision) {
    throw new MissionInventoryResolutionError(409, 'mission_inventory_revision_conflict', {
      expectedRevision: request.expectedRevision,
      actualRevision: Number(root.current_revision),
    });
  }
  const mission = await currentMission(client, ownerId, root.mission_need_id, { lock: true });
  assertMissionBinding(mission, request);
  const resolved = await resolveMissionInventorySnapshot({
    client, actorId: ownerId, mission: { ...mission, id: root.mission_need_id }, request,
    privatePilot, privatePilotAllowedRegions, candidateResolver, quoteCandidate,
  });
  const revisionNumber = request.expectedRevision + 1;
  await insertRevision(client, {
    id, revisionNumber, missionId: root.mission_need_id, resolved,
  });
  await insertCommand(client, {
    ownerId, key, commandType: 'revise', requestDigest, id, revisionNumber,
  });
  const row = await revisionByNumber(client, ownerId, id, revisionNumber);
  return {
    resolution: await shapeResolution(client, ownerId, row, {
      privatePilot, privatePilotAllowedRegions, quoteCandidate,
    }),
    replayed: false,
  };
}

export async function getMissionInventoryResolution(client, {
  actorId,
  resolutionId: rawResolutionId,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  quoteCandidate = quoteBooking,
}) {
  const ownerId = text(actorId, 160, 'mission_inventory_actor_invalid');
  const id = resolutionId(rawResolutionId);
  const result = await client.query(
    `${revisionSelect}
      WHERE resolution.owner_id = $1 AND resolution.id = $2
        AND revision.revision = resolution.current_revision`,
    [ownerId, id],
  );
  if (result.rowCount !== 1) {
    throw new MissionInventoryResolutionError(404, 'mission_inventory_resolution_not_found');
  }
  return {
    resolution: await shapeResolution(client, ownerId, result.rows[0], {
      privatePilot, privatePilotAllowedRegions, quoteCandidate,
    }),
  };
}

export async function listMissionInventoryResolutions(client, {
  actorId,
  missionNeedId: rawMissionId,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  quoteCandidate = quoteBooking,
}) {
  const ownerId = text(actorId, 160, 'mission_inventory_actor_invalid');
  const missionId = missionNeedId(rawMissionId);
  await currentMission(client, ownerId, missionId);
  const result = await client.query(
    `${revisionSelect}
      WHERE resolution.owner_id = $1 AND resolution.mission_need_id = $2
        AND revision.revision = resolution.current_revision
      ORDER BY resolution.updated_at DESC, resolution.id`,
    [ownerId, missionId],
  );
  const resolutions = [];
  for (const row of result.rows) {
    resolutions.push(await shapeResolution(client, ownerId, row, {
      privatePilot, privatePilotAllowedRegions, quoteCandidate,
    }));
  }
  return { resolutions };
}
