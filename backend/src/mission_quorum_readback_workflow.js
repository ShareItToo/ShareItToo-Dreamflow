import { missionNeedDigest as digest } from './mission_need_workflow.js';
import { sanitizeMissionInventoryResolutionSnapshot } from './mission_inventory_resolution_privacy.js';
import { projectMissionQuorumReadback, MissionQuorumReadbackProjectionError } from './mission_quorum_readback_projection.js';

export const missionQuorumReadbackVersion = 'P6-C4-2026-10-05.1';

export class MissionQuorumReadbackError extends Error {
  constructor(status, code) {
    super(`mission_quorum_readback_${code}`);
    this.status = status;
    this.code = this.message;
  }
}

function fail(status, code) {
  throw new MissionQuorumReadbackError(status, code);
}

function id(value, prefix, code) {
  if (typeof value !== 'string' || value.length === 0 || !value.startsWith(prefix)
      || value.length > 180) fail(400, code);
  return value;
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(500, 'timestamp_invalid');
  return date.toISOString();
}

function sourceDigest(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    fail(500, 'digest_invalid');
  }
  return value;
}

function exactBinding(mission, resolution) {
  if (resolution.owner_id !== mission.owner_id
      || resolution.mission_need_id !== mission.id
      || Number(resolution.mission_need_revision) !== Number(mission.current_revision)
      || resolution.mission_payload_sha256 !== mission.payload_sha256
      || digest(mission.payload) !== mission.payload_sha256
      || digest(resolution.resolution_snapshot) !== resolution.resolution_snapshot_sha256) {
    fail(409, 'source_stale');
  }
}

function slotState(component) {
  if (component.status === 'needs_clarification') return 'clarification_required';
  if (!component.itemId) return 'open';
  if (component.axes.availability !== 'observed_available') return 'stale_or_unknown';
  if (component.itemType === 'private_shelf'
      && (component.axes.supplyRelease !== 'released'
          || component.axes.fit !== 'fit')) return 'stale_or_unknown';
  return 'covered';
}

function shape(projection) {
  const components = projection.components.map((component) => ({
    slotKey: component.slotKey,
    needKey: component.needKey,
    necessity: component.necessity,
    ordinal: component.ordinal,
    state: slotState(component),
  }));
  return Object.freeze({
    version: missionQuorumReadbackVersion,
    missionNeedId: projection.missionNeedId,
    resolutionId: projection.resolutionId,
    missionRevision: projection.missionRevision,
    resolutionRevision: projection.resolutionRevision,
    missionPayloadDigest: sourceDigest(projection.missionPayloadDigest),
    resolutionDigest: sourceDigest(projection.resolutionDigest),
    observedAt: iso(projection.observedAt),
    status: projection.status,
    bindingStatus: 'non_binding',
    persisted: false,
    paymentStatus: 'not_determined',
    components: Object.freeze(components),
  });
}

function valueRow(row) {
  return row ? row.value : null;
}

async function rows(client, sql, values) {
  const result = await client.query(`SELECT row_to_json(source) AS value FROM (${sql}) AS source`, values);
  return result.rows.map(valueRow);
}

/**
 * Read the current Mission/resolution truth in the caller-owned transaction.
 * The route sets REPEATABLE READ READ ONLY before invoking this function.
 */
export async function getMissionQuorumReadback(client, {
  actorId,
  resolutionId: rawResolutionId,
}) {
  const ownerId = id(actorId, '', 'actor_invalid');
  const resolutionId = id(rawResolutionId, 'mission_inventory_', 'resolution_invalid');
  const missionRows = await rows(client,
    `SELECT need.id, need.owner_id, need.current_revision, revision.payload,
            revision.payload_sha256, transaction_timestamp() AS observed_at
       FROM mission_needs AS need
       JOIN mission_need_revisions AS revision
         ON revision.mission_need_id = need.id
        AND revision.revision = need.current_revision
      WHERE need.owner_id = $1
        AND need.id = (SELECT mission_need_id FROM mission_inventory_resolutions
                         WHERE id = $2 AND owner_id = $1)`,
    [ownerId, resolutionId]);
  const resolutionRows = await rows(client,
    `SELECT resolution.id, resolution.owner_id, resolution.mission_need_id,
            resolution.current_revision, revision.id AS revision_id,
            revision.revision, revision.mission_need_revision,
            revision.mission_payload_sha256, revision.resolution_snapshot,
            revision.resolution_snapshot_sha256
       FROM mission_inventory_resolutions AS resolution
       JOIN mission_inventory_resolution_revisions AS revision
         ON revision.resolution_id = resolution.id
        AND revision.revision = resolution.current_revision
      WHERE resolution.owner_id = $1
        AND resolution.id = $2`,
    [ownerId, resolutionId]);
  const mission = missionRows[0];
  const resolution = resolutionRows[0];
  if (!mission || !resolution) fail(404, 'not_found');
  exactBinding(mission, resolution);

  const assignments = await rows(client,
    `SELECT revision_id, resolution_id, resolution_revision, slot_key, need_key,
            necessity, slot_ordinal, listing_id, listing_snapshot, quote_snapshot,
            gap_reason
       FROM mission_inventory_resolution_assignments
      WHERE revision_id = $1
      ORDER BY slot_key`, [resolution.revision_id]);
  const listingIds = assignments.map((row) => row.listing_id).filter(Boolean);
  const listings = listingIds.length === 0 ? [] : await rows(client,
    `SELECT listing.id, listing.owner_id, listing.status, listing.is_active,
            listing.moderation_status, listing.catalog_revision,
            listing.availability_revision
       FROM listings AS listing
      WHERE listing.id = ANY($1::text[])
      ORDER BY listing.id`, [listingIds]);
  const demands = await rows(client,
    `SELECT demand.*, shelf.owner_id AS shelf_owner_id,
            demand_revision.status AS revision_status,
            demand_revision.revision AS revision_number,
            demand_revision.actor_id AS revision_actor_id,
            release.id AS release_id,
            release.recipient_id AS release_recipient_id,
            release.shelf_item_id AS release_shelf_item_id,
            release.released_revision,
            participation.current_status AS participation_status,
            participation.current_revision AS participation_revision,
            item.availability_status AS item_availability_status,
            item.revision AS item_revision
       FROM mission_supply_demands AS demand
       LEFT JOIN private_shelf_items AS shelf
         ON shelf.id = demand.candidate_shelf_item_id
       LEFT JOIN mission_supply_demand_revisions AS demand_revision
         ON demand_revision.demand_id = demand.id
        AND demand_revision.revision = demand.current_revision
       LEFT JOIN mission_supply_releases AS release
         ON release.demand_id = demand.id
       LEFT JOIN mission_supply_participations AS participation
         ON participation.owner_id = demand.recipient_id
       LEFT JOIN LATERAL (
         SELECT history.availability_status, history.revision
           FROM mission_supply_participation_item_revisions AS history
          WHERE history.participation_id = participation.id
            AND history.owner_id = demand.recipient_id
            AND history.shelf_item_id = demand.candidate_shelf_item_id
            AND history.need_key = demand.need_key
          ORDER BY history.revision DESC
          LIMIT 1
       ) AS item ON true
      WHERE demand.resolution_id = $1
        AND demand.resolution_revision = $2
      ORDER BY demand.slot_key`, [resolution.id, resolution.current_revision]);
  const fits = await rows(client,
    `SELECT fit.id, fit.owner_id, fit.mission_need_id, fit.shelf_item_id,
            fit.need_key, fit_revision.revision,
            fit_revision.mission_need_revision,
            fit_revision.mission_payload_sha256,
            fit_revision.shelf_snapshot_sha256,
            fit_revision.payload_sha256, fit_revision.evaluation,
            shelf.owner_id AS shelf_owner_id,
            jsonb_build_object(
              'shelfItemId', shelf.id,
              'domainVersion', shelf.domain_version,
              'title', shelf.title,
              'categoryKey', shelf.category_key,
              'condition', shelf.condition,
              'updatedAt', to_char(shelf.updated_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            ) AS live_shelf_snapshot
       FROM mission_fit_checks AS fit
       JOIN mission_fit_check_revisions AS fit_revision
         ON fit_revision.fit_check_id = fit.id
        AND fit_revision.revision = fit.current_revision
       LEFT JOIN private_shelf_items AS shelf ON shelf.id = fit.shelf_item_id
      WHERE fit.mission_need_id = $1
        AND fit.owner_id = $2
      ORDER BY fit.id`, [mission.id, ownerId]);

  let projection;
  try {
    projection = projectMissionQuorumReadback({
      mission,
      resolution: {
        ...resolution,
        current_revision: resolution.revision,
      },
      assignments,
      listings,
      demands,
      fits,
      observedAt: mission.observed_at,
    });
  } catch (error) {
    if (error instanceof MissionQuorumReadbackProjectionError) fail(409, 'source_invalid');
    throw error;
  }
  // Bind the client to the exact privacy-sanitized resolution representation
  // it can read back, never to the internal snapshot carrying handover data.
  return {
    quorum: shape({
      ...projection,
      resolutionDigest: digest(
        sanitizeMissionInventoryResolutionSnapshot(resolution.resolution_snapshot),
      ),
    }),
  };
}
