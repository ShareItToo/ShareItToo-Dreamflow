import { MissionSupplyDemandError } from './mission_supply_demand_workflow.js';

// This adapter is deliberately not imported by app.js. It is a bounded,
// read-only bridge for synthetic/test injection into the existing P6-A
// recipientResolver seam; real-user selection and location matching remain
// unavailable.
export const missionSupplySyntheticEligibilityVersion = 'p6-c2-synthetic-participation-v1';

function failClosed() {
  throw new MissionSupplyDemandError(404, 'mission_supply_recipient_not_eligible');
}

function assertInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || typeof input.requesterId !== 'string' || !input.requesterId
      || input.needKey !== 'plant_container_equipment'
      || input.purpose !== 'mission_gap_supply_v1') {
    failClosed();
  }
}

/**
 * Resolve exactly one current C1 participation candidate for the server-built
 * P6-A gap. The query is intentionally a read-only snapshot: it does not
 * lock, mutate, rank, reserve, notify, publish, or invoke any provider.
 */
export async function resolveSyntheticMissionSupplyRecipient(client, input) {
  assertInput(input);
  if (!client || typeof client.query !== 'function') failClosed();

  const result = await client.query(
    `SELECT participation.id AS participation_id,
            participation.owner_id AS recipient_owner_id,
            participation.current_revision AS participation_revision,
            latest.shelf_item_id,
            latest.need_key,
            latest.revision AS item_revision
       FROM mission_supply_participations AS participation
       JOIN users AS owner
         ON owner.id = participation.owner_id
        AND owner.account_status = 'active'
        AND owner.deactivated_at IS NULL
        AND owner.private_use_confirmed_at IS NOT NULL
        AND owner.private_marketplace_review_status = 'clear'
       JOIN LATERAL (
         SELECT latest.shelf_item_id, latest.need_key,
                latest.revision, latest.availability_status
           FROM (
             SELECT DISTINCT ON (history.shelf_item_id, history.need_key)
                    history.shelf_item_id, history.need_key,
                    history.revision, history.availability_status
               FROM mission_supply_participation_item_revisions AS history
               JOIN private_shelf_items AS item
                 ON item.id = history.shelf_item_id
                AND item.owner_id = history.owner_id
              WHERE history.participation_id = participation.id
                AND history.owner_id = participation.owner_id
                AND history.need_key = $2
              ORDER BY history.shelf_item_id, history.need_key, history.revision DESC
           ) AS latest
          WHERE latest.availability_status = 'confirmed_available'
       ) AS latest ON latest.availability_status = 'confirmed_available'
      WHERE participation.current_status = 'active'
        AND participation.owner_id <> $1
        AND NOT EXISTS (
          SELECT 1
            FROM user_blocks AS block
           WHERE block.unblocked_at IS NULL
             AND ((block.blocker_id = $1 AND block.blocked_id = participation.owner_id)
               OR (block.blocker_id = participation.owner_id AND block.blocked_id = $1))
        )`,
    [input.requesterId, input.needKey],
  );

  // Never pick a winner from multiple active/confirmed rows. The SQL has no
  // random ordering or client-controlled candidate identifier.
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) failClosed();
  const row = result.rows[0];
  if (!row || typeof row.recipient_owner_id !== 'string'
      || row.recipient_owner_id === input.requesterId
      || typeof row.shelf_item_id !== 'string'
      || row.need_key !== input.needKey
      || !Number.isSafeInteger(Number(row.participation_revision))
      || Number(row.participation_revision) < 1
      || !Number.isSafeInteger(Number(row.item_revision))
      || Number(row.item_revision) < 1
      || typeof row.participation_id !== 'string') failClosed();

  return Object.freeze({
    recipientOwnerId: row.recipient_owner_id,
    shelfItemId: row.shelf_item_id,
    needKey: input.needKey,
    purpose: input.purpose,
    eligibilityVersion: missionSupplySyntheticEligibilityVersion,
    participationId: row.participation_id,
    participationRevision: Number(row.participation_revision),
    itemRevision: Number(row.item_revision),
  });
}

// Naming alias for callers that describe the seam as a recipient resolver.
export const createSyntheticMissionSupplyRecipientResolver = () =>
  resolveSyntheticMissionSupplyRecipient;
