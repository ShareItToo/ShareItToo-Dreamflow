// Deliberately not imported by app.js, routes, jobs, or feature flags.
import { MissionQuorumError, projectMissionQuorum } from './mission_quorum_projection.js';

const adapters = new WeakMap();
const namespacePattern = /^p7a1-synthetic-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function check(value, code) { if (!value) throw new MissionQuorumError(code); }
function assertTestBoundary() {
  check(typeof process.env.NODE_TEST_CONTEXT === 'string', 'synthetic_adapter_unavailable');
}

/** The fixture adapter is explicitly constructed only inside the Node test runner. */
export function createSyntheticQuorumFixtureAdapter({ namespace, read }) {
  assertTestBoundary();
  check(namespacePattern.test(namespace) && typeof read === 'function', 'synthetic_namespace');
  const adapter = Object.freeze({ version: 'P7-A1-synthetic-fixture-v1' });
  adapters.set(adapter, { namespace, read });
  return adapter;
}

function validateFixtures(fixtures, namespace) {
  check(Array.isArray(fixtures) && fixtures.length <= 5000, 'synthetic_fixtures');
  const seen = new Set();
  const fixtureId = (id) => {
    check(typeof id === 'string' && id.startsWith(`${namespace}:`)
      && /^[A-Za-z0-9:_-]+$/u.test(id) && id.length < 240, 'synthetic_identity');
    check(!seen.has(id), 'collision'); seen.add(id);
  };
  for (const f of fixtures) {
    check(f.synthetic === true && f.authentic === false, 'synthetic_marker');
    fixtureId(f.id);
    for (const key of ['bookingId', 'contractId', 'quoteId']) fixtureId(f.binding?.[key]);
    for (const segment of ['pickup', 'return']) {
      const s = f[segment]; if (!s) continue;
      for (const p of s.photos ?? []) { fixtureId(p.evidenceId); fixtureId(p.uploadId); }
      if (s.confirmation) fixtureId(s.confirmation.id);
      if (s.verification) fixtureId(s.verification.id);
    }
    if (f.returnCase) fixtureId(f.returnCase.id);
  }
}

async function rows(client, sql, values) {
  const result = await client.query(`SELECT row_to_json(source) AS value FROM (${sql}) AS source`, values);
  return result.rows.map((r) => r.value);
}

/** Owns the transaction, so a caller cannot accidentally supply READ COMMITTED. */
export async function readSyntheticMissionQuorum(pool, { actorId, missionNeedId, resolutionId, adapter }) {
  assertTestBoundary();
  const registered = adapters.get(adapter);
  check(registered, 'synthetic_adapter_required');
  const { namespace, read } = registered;
  check(typeof actorId === 'string' && actorId.startsWith(`${namespace}:principal:`), 'synthetic_principal');
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const [mission] = await rows(client,
      `SELECT n.id, n.owner_id, n.current_revision, r.payload, r.payload_sha256,
              transaction_timestamp() AS observed_at
         FROM mission_needs n JOIN mission_need_revisions r
           ON r.mission_need_id = n.id AND r.revision = n.current_revision
        WHERE n.id = $1 AND n.owner_id = $2`, [missionNeedId, actorId]);
    check(mission, 'mission_not_found');
    const [resolution] = await rows(client,
      `SELECT r.id, r.owner_id, r.mission_need_id, r.current_revision,
              v.id AS revision_id, v.mission_need_revision, v.mission_payload_sha256,
              v.resolution_snapshot, v.resolution_snapshot_sha256
         FROM mission_inventory_resolutions r JOIN mission_inventory_resolution_revisions v
           ON v.resolution_id = r.id AND v.revision = r.current_revision
        WHERE r.id = $1 AND r.owner_id = $2 AND r.mission_need_id = $3`,
      [resolutionId, actorId, missionNeedId]);
    check(resolution, 'resolution_not_found');
    const assignments = await rows(client,
      `SELECT revision_id, resolution_id, resolution_revision, slot_key, need_key,
              necessity, slot_ordinal, listing_id, listing_snapshot, quote_snapshot, gap_reason
         FROM mission_inventory_resolution_assignments WHERE revision_id = $1 ORDER BY slot_key`,
      [resolution.revision_id]);
    const listings = await rows(client,
      `SELECT l.id, l.owner_id, l.status, l.is_active, l.moderation_status,
              l.catalog_revision, l.availability_revision
         FROM listings l WHERE l.id = ANY($1::text[]) ORDER BY l.id`,
      [assignments.map((a) => a.listing_id).filter(Boolean)]);
    const demands = await rows(client,
      `SELECT d.*, s.owner_id AS shelf_owner_id,
              dr.status AS revision_status, dr.revision AS revision_number,
              dr.actor_id AS revision_actor_id,
              rel.id AS release_id, rel.recipient_id AS release_recipient_id,
              rel.shelf_item_id AS release_shelf_item_id, rel.released_revision,
              p.current_status AS participation_status, p.current_revision AS participation_revision,
              item.availability_status AS item_availability_status, item.revision AS item_revision
         FROM mission_supply_demands d
         LEFT JOIN private_shelf_items s ON s.id = d.candidate_shelf_item_id
         LEFT JOIN mission_supply_demand_revisions dr
           ON dr.demand_id = d.id AND dr.revision = d.current_revision
         LEFT JOIN mission_supply_releases rel ON rel.demand_id = d.id
         LEFT JOIN mission_supply_participations p ON p.owner_id = d.recipient_id
         LEFT JOIN LATERAL (SELECT availability_status, revision
           FROM mission_supply_participation_item_revisions i
           WHERE i.participation_id = p.id AND i.owner_id = d.recipient_id
             AND i.shelf_item_id = d.candidate_shelf_item_id AND i.need_key = d.need_key
           ORDER BY i.revision DESC LIMIT 1) item ON true
        WHERE d.resolution_id = $1 AND d.resolution_revision = $2 ORDER BY d.slot_key`,
      [resolution.id, resolution.current_revision]);
    const fits = await rows(client,
      `SELECT f.id, f.owner_id, f.mission_need_id, f.shelf_item_id, f.need_key,
              v.revision, v.mission_need_revision, v.mission_payload_sha256,
              v.shelf_snapshot_sha256, v.payload_sha256, v.evaluation,
              s.owner_id AS shelf_owner_id,
              jsonb_build_object('shelfItemId', s.id, 'domainVersion', s.domain_version,
                'title', s.title, 'categoryKey', s.category_key, 'condition', s.condition,
                'updatedAt', to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS live_shelf_snapshot
         FROM mission_fit_checks f JOIN mission_fit_check_revisions v
           ON v.fit_check_id = f.id AND v.revision = f.current_revision
         LEFT JOIN private_shelf_items s ON s.id = f.shelf_item_id
        WHERE f.mission_need_id = $1 AND f.owner_id = $2 ORDER BY f.id`,
      [missionNeedId, actorId]);
    check([...listings.map((l) => l.owner_id), ...demands.map((d) => d.recipient_id)]
      .every((id) => id?.startsWith(`${namespace}:principal:`)), 'synthetic_principal');
    const source = { mission, resolution, assignments, listings, demands, fits,
      observedAt: mission.observed_at };
    // Only the detached, whitelisted projection enters the fixture callback.
    // It never receives a client, SQL handle or private source payload.
    const initial = projectMissionQuorum(source);
    const fixtures = structuredClone(await read(structuredClone(initial.projection)));
    validateFixtures(fixtures, namespace);
    const result = projectMissionQuorum(source, fixtures);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
