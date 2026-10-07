import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { missionNeedDigest as digest } from '../src/mission_need_workflow.js';
import { createSyntheticQuorumFixtureAdapter, readSyntheticMissionQuorum } from '../src/mission_quorum_projection_workflow.js';
import { bookingGroupEvidenceSlots } from '../src/booking_group_handover_domain.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!databaseUrl) {
  test.skip('mission quorum projection PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('P7-A1 reads a consistent synthetic quorum, isolates parents and commits zero data changes', async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    const namespace = `p7a1-synthetic-${crypto.randomUUID()}`;
    const users = ['renter', 'owner', 'foreign'].map((x) => `${namespace}:principal:${x}`);
    const missionId = `mission_need_${crypto.randomUUID()}`;
    const resolutionId = `mission_inventory_${crypto.randomUUID()}`;
    const listingId = `${namespace}:listing:one`;
    const shelfId = `shelf_item_${crypto.randomUUID()}`;
    const demandId = `mission_demand_${crypto.randomUUID()}`;
    const participationId = `mission_supply_participation_${crypto.randomUUID()}`;
    const payload = { title: 'P7 non-authentic synthetic fixture', status: 'planned',
      needs: [{ needKey: 'plant_container_equipment', necessity: 'required', quantity: 2 }] };
    const payloadDigest = digest(payload);
    const region = { sourceType: 'owner_confirmed_search_origin', sourceVersion: 'p7a1-fixture-v1',
      ownerConfirmed: true, radiusKm: 5, coordinateDigest: 'c'.repeat(64), exactCoordinatesStored: false };
    const start = '2090-01-01'; const end = '2090-01-03';
    const quote = { quoteHash: 'a'.repeat(64), availabilityRevision: 1, currency: 'EUR', preview: true, persisted: false };
    const listingSnapshot = { listingId, catalogRevision: 1, availabilityRevision: 1, handoverLocationKey: 'b'.repeat(64) };
    const slots = [1, 2].map((ordinal) => ({ slotKey: `required:plant_container_equipment:${ordinal}`,
      needKey: 'plant_container_equipment', necessity: 'required', ordinal,
      assignment: ordinal === 1 ? { ...listingSnapshot, quote } : null,
      gapReason: ordinal === 1 ? null : 'no_current_unique_candidate' }));
    const snapshot = { slots, coverage: [], requiredCoverageComplete: false, searchLimited: false,
      quotePersisted: false, revalidationRequiredBeforeRequest: true, bindingStatus: 'non_binding',
      reservationCreated: false, bookingCreated: false, contractCreated: false, paymentCreated: false,
      publicShelfCreated: false, publicListingCreated: false, automaticPublicationPerformed: false,
      externalGenerativeAiUsed: false };
    let recorded;
    const fixtureFor = (p) => {
      const root = Object.fromEntries(['missionNeedId', 'missionOwnerId', 'missionRevision', 'missionPayloadDigest',
        'resolutionId', 'resolutionRevision', 'resolutionDigest', 'fitSourceSnapshotDigest'].map((key) => [key, p[key]]));
      return p.components.map((c, i) => {
        const id = (x) => `${namespace}:${i}:${x}`;
        const binding = { slotKey: c.slotKey, itemId: c.itemId, ownerId: c.ownerId, renterId: users[0],
          sourceDigest: c.sourceDigest, bookingId: id('booking'), contractId: id('contract'), quoteId: id('quote'), quoteHash: quote.quoteHash };
        const f = { id: id('fixture'), synthetic: true, authentic: false, root, binding,
          acceptance: 'accepted', contract: 'bound', payment: 'paid', refund: 'none', payout: 'held', dispute: 'none', returnState: 'reportWindowOpen' };
        for (const segment of ['pickup', 'return']) {
          const actorId = segment === 'pickup' ? c.ownerId : users[0];
          const verifierId = segment === 'pickup' ? users[0] : c.ownerId;
          const photos = bookingGroupEvidenceSlots.map((slot) => ({ binding, segment, slot, actorId,
            uploadPurpose: segment === 'pickup' ? 'handover_evidence' : 'return_evidence',
            evidenceId: id(`${segment}-${slot}-evidence`), uploadId: id(`${segment}-${slot}-upload`),
            uploadSha256: 'e'.repeat(64), synthetic: true, authentic: false }));
          const evidenceSetDigest = digest(photos);
          f[segment] = { binding, segment, photos,
            confirmation: { id: id(`${segment}-confirmation`), binding, segment, actorId: verifierId, evidenceSetDigest, decision: 'confirmed' },
            verification: { id: id(`${segment}-verification`), binding, segment, verifierId, presenterId: actorId,
              evidenceSetDigest, method: 'qr_v3', verified: true } };
        }
        return f;
      });
    };
    try {
      await pool.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js'); await runMigrations(pool);
      const collision = await pool.query('SELECT id FROM users WHERE id = ANY($1::text[])', [users]);
      assert.equal(collision.rowCount, 0);
      await pool.query(`INSERT INTO users(id,email,profile) SELECT id,id || '@example.invalid','{}'::jsonb FROM unnest($1::text[]) id`, [users]);
      await pool.query(`INSERT INTO listings(id,owner_id,payload,status,is_active,catalog_revision,availability_revision,moderation_status)
        VALUES($1,$2,jsonb_build_object('ownerId',$3::text),'active',true,1,1,'active')`, [listingId, users[1], users[2]]);
      await pool.query(`INSERT INTO private_shelf_items(id,owner_id,domain_version,title,category_key,condition)
        VALUES($1,$2,'P3-A-2026-10-01.1','Synthetic P7 shelf','synthetic.container','good')`, [shelfId, users[1]]);
      await pool.query(`INSERT INTO mission_needs(id,owner_id,domain_version,status) VALUES($1,$2,'P2-A-2026-10-01.1','planned')`, [missionId, users[0]]);
      await pool.query(`INSERT INTO mission_need_revisions(mission_need_id,revision,status,payload,payload_sha256)
        VALUES($1,1,'planned',$2,$3)`, [missionId, payload, payloadDigest]);
      await pool.query(`INSERT INTO mission_inventory_resolutions(id,owner_id,mission_need_id,domain_version,planner_core_version,planner_inventory_version)
        VALUES($1,$2,$3,'P5-A-2026-10-01.1','G4A-2026-08-21.1','G4B-2026-08-21.1')`, [resolutionId, users[0], missionId]);
      const revision = (await pool.query(`INSERT INTO mission_inventory_resolution_revisions(resolution_id,mission_need_id,revision,mission_need_revision,
        mission_payload_sha256,start_date,end_date,location_snapshot,location_snapshot_sha256,resolution_snapshot,resolution_snapshot_sha256)
        VALUES($1,$2,1,1,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [resolutionId, missionId, payloadDigest, start, end, region, digest(region), snapshot, digest(snapshot)])).rows[0].id;
      for (const s of slots) await pool.query(`INSERT INTO mission_inventory_resolution_assignments(revision_id,resolution_id,resolution_revision,
        slot_key,need_key,necessity,slot_ordinal,listing_id,listing_snapshot,quote_snapshot,gap_reason)
        VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10)`, [revision, resolutionId, s.slotKey, s.needKey, s.necessity, s.ordinal,
        s.assignment?.listingId ?? null, s.assignment ? listingSnapshot : null, s.assignment ? quote : null, s.gapReason]);
      await pool.query(`INSERT INTO mission_supply_demands(id,requester_id,recipient_id,resolution_id,resolution_revision,
        mission_need_id,mission_need_revision,mission_payload_sha256,slot_key,need_key,necessity,quantity,slot_ordinal,gap_reason,
        candidate_shelf_item_id,eligibility_version,purpose,start_date,end_date,region_snapshot,region_snapshot_sha256,expires_at,domain_version)
        VALUES($1,$2,$3,$4,1,$5,1,$6,$7,'plant_container_equipment','required',1,2,'no_current_unique_candidate',
        $8,'p7a1-synthetic-v1','mission_gap_supply_v1',$9,$10,$11,$12,'2090-01-01','P6-A-2026-10-01.1')`,
      [demandId, users[0], users[1], resolutionId, missionId, payloadDigest, slots[1].slotKey, shelfId, start, end, region, digest(region)]);
      await pool.query(`INSERT INTO mission_supply_demand_revisions(demand_id,revision,actor_id,action,status) VALUES($1,1,$2,'create','pending')`, [demandId, users[0]]);
      await pool.query(`INSERT INTO mission_supply_demand_revisions(demand_id,revision,actor_id,action,status) VALUES($1,2,$2,'release','released')`, [demandId, users[1]]);
      await pool.query(`INSERT INTO mission_supply_releases(id,demand_id,recipient_id,shelf_item_id,purpose,released_revision,expires_at)
        VALUES($1,$2,$3,$4,'mission_gap_supply_v1',2,'2090-01-01')`, [`mission_release_${crypto.randomUUID()}`, demandId, users[1], shelfId]);
      await pool.query(`INSERT INTO mission_supply_participations(id,owner_id,domain_version) VALUES($1,$2,'P6-C1-2026-10-02.1')`, [participationId, users[1]]);
      await pool.query(`INSERT INTO mission_supply_participation_revisions(participation_id,owner_id,revision,actor_id,status)
        VALUES($1,$2,1,$2,'active')`, [participationId, users[1]]);
      await pool.query(`INSERT INTO mission_supply_participation_item_revisions(participation_id,owner_id,shelf_item_id,need_key,revision,actor_id,availability_status)
        VALUES($1,$2,$3,'plant_container_equipment',1,$2,'confirmed_available')`, [participationId, users[1], shelfId]);

      const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((r) => r.tablename);
      const allRows = async () => {
        const result = {};
        for (const table of tables) {
          assert.match(table, /^[a-z0-9_]+$/u);
          result[table] = (await pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) value FROM "${table}" t`)).rows[0].value;
        }
        return digest(result);
      };
      const before = await allRows();
      const adapter = createSyntheticQuorumFixtureAdapter({ namespace, read: (p) => { recorded = fixtureFor(p); return recorded; } });
      const args = { actorId: users[0], missionNeedId: missionId, resolutionId, adapter };
      const first = await readSyntheticMissionQuorum(pool, args);
      assert.equal(first.digest, digest(first.projection));
      assert.equal(first.projection.components[0].ownerId, users[1], 'listing payload owner is ignored');
      assert.equal(first.projection.components[0].axes.pickup, 'evidenced');
      assert.equal(first.projection.components[1].axes.supplyRelease, 'released');
      assert.equal(first.projection.components[1].axes.fit, 'unknown');
      const bare = createSyntheticQuorumFixtureAdapter({ namespace, read: () => [] });
      assert.equal((await readSyntheticMissionQuorum(pool, { ...args, adapter: bare })).projection.components[1].axes.acceptance, 'not_bound');
      await assert.rejects(() => readSyntheticMissionQuorum(pool, { ...args, actorId: users[2] }), /mission_not_found/u);
      await assert.rejects(() => readSyntheticMissionQuorum(pool, { ...args, resolutionId: `mission_inventory_${crypto.randomUUID()}` }), /resolution_not_found/u);
      const bad = structuredClone(recorded); bad[0].pickup.photos[0].binding = bad[1].binding;
      await assert.rejects(() => readSyntheticMissionQuorum(pool, { ...args, adapter:
        createSyntheticQuorumFixtureAdapter({ namespace, read: () => bad }) }), /evidence_binding/u);
      const real = structuredClone(recorded); real[0].binding.bookingId = 'real-booking';
      await assert.rejects(() => readSyntheticMissionQuorum(pool, { ...args, adapter:
        createSyntheticQuorumFixtureAdapter({ namespace, read: () => real }) }), /synthetic_identity/u);
      assert.equal(await allRows(), before, 'every public table is byte-equivalent after reads and failures');

      // Correct a listing on another connection after the snapshot's first query.
      let corrected = false;
      const concurrentPool = { async connect() {
        const client = await pool.connect();
        return { release: () => client.release(), async query(sql, params) {
          const result = await client.query(sql, params);
          if (!corrected && sql.includes('transaction_timestamp()')) {
            corrected = true;
            await pool.query('UPDATE listings SET owner_id=$2 WHERE id=$1', [listingId, users[2]]);
          }
          return result;
        } };
      } };
      const during = await readSyntheticMissionQuorum(concurrentPool, args);
      assert.equal(during.projection.components[0].ownerId, users[1], 'repeatable read keeps the old source consistently');
      const oldFixtures = structuredClone(recorded);
      await assert.rejects(() => readSyntheticMissionQuorum(pool, { ...args, adapter:
        createSyntheticQuorumFixtureAdapter({ namespace, read: () => oldFixtures }) }), /fixture_parent/u);
      const after = await readSyntheticMissionQuorum(pool, args);
      assert.equal(after.projection.components[0].ownerId, users[2]);
      assert.notEqual(after.projection.components[0].sourceDigest, first.projection.components[0].sourceDigest);

      await pool.query(`INSERT INTO mission_supply_demand_revisions(demand_id,revision,actor_id,action,status)
        VALUES($1,3,$2,'revoke','revoked')`, [demandId, users[1]]);
      const revoked = await readSyntheticMissionQuorum(pool, args);
      assert.equal(revoked.projection.components[1].axes.supplyRelease, 'revoked');
      const revokedBefore = await allRows();
      await readSyntheticMissionQuorum(pool, args);
      assert.equal(await allRows(), revokedBefore, 'revoked projection is also read-only');
      await pool.query('DELETE FROM mission_supply_releases WHERE demand_id=$1', [demandId]);
      await assert.rejects(() => readSyntheticMissionQuorum(pool, args), /release_binding/u);

      await pool.query(`INSERT INTO mission_need_revisions(mission_need_id,revision,status,payload,payload_sha256)
        VALUES($1,2,'planned',$2,$3)`, [missionId, { ...payload, title: 'corrected synthetic need' }, digest({ ...payload, title: 'corrected synthetic need' })]);
      await assert.rejects(() => readSyntheticMissionQuorum(pool, args), /revision/u);
      // This read-only adapter owns no files/rows/commands to add to account cleanup.
      await pool.query('DELETE FROM listings WHERE id=$1', [listingId]);
      await pool.query('DELETE FROM users WHERE id=ANY($1::text[])', [users]);
      for (const [table, column, id] of [
        ['mission_needs', 'id', missionId], ['mission_need_revisions', 'mission_need_id', missionId],
        ['mission_inventory_resolutions', 'id', resolutionId],
        ['mission_inventory_resolution_revisions', 'resolution_id', resolutionId],
        ['mission_inventory_resolution_assignments', 'resolution_id', resolutionId],
        ['mission_supply_demands', 'id', demandId], ['mission_supply_releases', 'demand_id', demandId],
        ['mission_supply_demand_revisions', 'demand_id', demandId],
        ['mission_supply_participations', 'id', participationId],
        ['mission_supply_participation_item_revisions', 'participation_id', participationId],
      ]) {
        assert.equal((await pool.query(`SELECT count(*)::int count FROM "${table}" WHERE "${column}"=$1`, [id])).rows[0].count, 0);
      }
    } finally {
      await pool.query('DELETE FROM listings WHERE id=$1', [listingId]);
      await pool.query('DELETE FROM users WHERE id=ANY($1::text[])', [users]);
      await pool.end();
    }
  });
}
