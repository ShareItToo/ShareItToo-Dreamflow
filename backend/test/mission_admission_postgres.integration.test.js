import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';
import sharp from 'sharp';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const message = (child, type) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => finish(new Error(`child ${type} timeout`)), 15000);
  const onMessage = (value) => { if (value.type === type) finish(null, value); };
  const onExit = (code) => finish(new Error(`child exited before ${type}: ${code}`));
  const finish = (error, value) => {
    clearTimeout(timeout); child.off('message', onMessage); child.off('exit', onExit);
    if (error) reject(error); else resolve(value);
  };
  child.on('message', onMessage); child.once('exit', onExit);
});

if (!databaseUrl) {
  test.skip('D8-P2b process acceptance requires isolated TEST_DATABASE_URL');
} else {
  test('D8-P2b admission on/off/on protects participants, reductions and ordinary persisted authority', { timeout: 90000 }, async () => {
    assert.equal(new URL(databaseUrl).hostname, '127.0.0.1');
    const setup = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(),'sit-d8-admission-'));
    const users = Array.from({ length: 3 }, () => `d8-${crypto.randomUUID()}`);
    const [owner, renter, foreign] = users;
    const sessions = users.map(() => crypto.randomUUID());
    const shelfItemId = `shelf_item_${crypto.randomUUID()}`;
    const historyId = `d8-completed-${crypto.randomUUID()}`;
    const legacyId = `d8-quarantined-${crypto.randomUUID()}`;
    const listingId = `d8-listing-${crypto.randomUUID()}`;
    const activeListingId = `d8-active-${crypto.randomUUID()}`;
    const quoteId = `quote_${crypto.randomUUID()}`;
    const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const startDate = futureDate(30), endDate = futureDate(32);
    const processes = [];
    let current;
    const env = {
      PATH: process.env.PATH, DATABASE_URL: databaseUrl, DEPLOYMENT_ENVIRONMENT: 'test',
      UPLOAD_DIR: uploadDir,
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      MAIL_TRANSPORT: 'memory', PAYMENT_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory',
      PLANNER_CORE_ENABLED: 'true', PLANNER_INVENTORY_ENABLED: 'true', PLANNER_DEMAND_ENABLED: 'true',
      PLANNER_SUPPLY_PARTICIPATION_ENABLED: 'true', PRIVATE_PILOT_V4_ENABLED: 'false', BOOKING_PILOT_MODE: 'on',
      SIT_D8_SYNTHETIC_FIXTURE: JSON.stringify({ owner, shelfItemId, users, sessions }),
    };
    const start = async (enabled) => {
      const child = fork(new URL('./support/mission_admission_app_process.js', import.meta.url), [], {
        env: { ...env, PLANNER_NEW_ENTRIES_ENABLED: String(enabled) }, execArgv: [],
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      const entry = { child, errors: '', stopped: false };
      processes.push(entry);
      child.stderr.on('data', (data) => { entry.errors += data.toString(); });
      const ready = await message(child, 'ready');
      assert.equal(ready.admission, enabled);
      Object.assign(entry, ready); current = entry;
    };
    const stop = async (entry) => {
      if (entry.stopped) return;
      const exit = once(entry.child, 'exit');
      entry.child.send('stop');
      const timer = setTimeout(() => entry.child.kill('SIGKILL'), 10000);
      try { const [code, signal] = await exit; assert.equal(code, 0, entry.errors); assert.equal(signal, null); }
      finally { clearTimeout(timer); entry.stopped = true; }
      await new Promise((resolve, reject) => {
        const socket = net.connect({ host: '127.0.0.1', port: entry.port });
        socket.once('connect', () => { socket.destroy(); reject(new Error('child port still open')); });
        socket.once('error', (error) => { assert.equal(error.code, 'ECONNREFUSED'); resolve(); });
      });
    };
    const request = async (who, path, body, key = crypto.randomUUID(), method = body === undefined ? 'GET' : 'POST', expected = 200) => {
      const response = await fetch(`http://127.0.0.1:${current.port}/v1/${path}`, {
        method, headers: { Authorization: `Bearer ${current.tokens[users.indexOf(who)]}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': key }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = response.status === 204 ? null : await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
      return result;
    };
    const post = (who, path, body, key) => request(who, path, body, key, 'POST', 201);
    const upload = async (expected) => {
      const bytes = await sharp({ create:{ width:64,height:64,channels:4,background:'#2563eb' } }).png().toBuffer();
      const form = new FormData(); form.append('file',new Blob([bytes],{ type:'image/png' }),'synthetic.png');
      const response = await fetch(`http://127.0.0.1:${current.port}/v1/private-shelf/${shelfItemId}/media`, {
        method:'POST',headers:{ Authorization:`Bearer ${current.tokens[0]}` },body:form,
      });
      const result=await response.json(); assert.equal(response.status,expected,JSON.stringify(result)); return result;
    };
    const mediaRead = async (who, mediaId, variant, expected=200) => {
      const response=await fetch(`http://127.0.0.1:${current.port}/v1/private-shelf/${shelfItemId}/media/${mediaId}/${variant}`, {
        headers:{ Authorization:`Bearer ${current.tokens[users.indexOf(who)]}` },
      });
      assert.equal(response.status,expected);
      if (expected===200) assert.match(response.headers.get('cache-control'),/private, no-store/u);
      return crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    };
    const canonicalRows = async (table, column, value) => (await setup.query(
      `SELECT to_jsonb(t)::text AS value FROM ${table} t WHERE ${column}=$1 ORDER BY to_jsonb(t)::text`, [value],
    )).rows.map((row) => row.value);
    const bookingSnapshot = async () => ({
      bookings: await canonicalRows('bookings', 'id', historyId),
      requests: await canonicalRows('rental_requests', 'id', historyId),
      quotes: await canonicalRows('booking_quotes', 'id', quoteId),
      contracts: await canonicalRows('platform_contracts', 'booking_id', historyId),
    });
    const graph = async () => {
      const result = {};
      const tables = (await setup.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'mission_%' OR tablename LIKE 'private_shelf_%') ORDER BY tablename")).rows;
      for (const { tablename } of tables) {
        assert.match(tablename, /^(mission|private_shelf)_[a-z_]+$/u);
        result[tablename] = (await setup.query(`SELECT to_jsonb(t)::text AS value FROM ${tablename} t ORDER BY to_jsonb(t)::text`)).rows;
      }
      return result;
    };
    const effects = async () => (await setup.query(`SELECT
      (SELECT count(*) FROM payments) AS payments,
      (SELECT count(*) FROM notifications) AS notifications,
      (SELECT count(*) FROM notification_outbox) AS outbox,
      (SELECT count(*) FROM uploads) AS uploads`)).rows[0];
    try {
      await setup.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(setup);
      await setup.query(`INSERT INTO users (id,email,profile,role,account_status,email_verified_at,private_use_confirmed_at,private_marketplace_review_status)
        SELECT id,id||'@example.invalid','{}','user','active',now(),now(),'clear' FROM unnest($1::text[]) id`, [users]);
      await setup.query(`INSERT INTO auth_sessions(id,user_id,device_label)
        SELECT id::uuid,user_id,'D8 synthetic' FROM unnest($1::text[],$2::text[]) input(id,user_id)`, [sessions, users]);
      await setup.query(`INSERT INTO private_shelf_items(id,owner_id,domain_version,title,category_key,condition)
        VALUES($1,$2,'P3-A-2026-10-01.1','Synthetic private item','garden.plant_container','good')`, [shelfItemId, owner]);
      for (const id of [listingId, activeListingId]) {
        await setup.query(`INSERT INTO listings(id,owner_id,payload,is_active,status,catalog_version,price_per_day_minor,currency,moderation_status,title,description,category_id,condition,city,country,latitude,longitude,min_days,max_days)
          VALUES($1,$2,$3,true,'active',1,1500,'EUR','active','D8 synthetic listing','Synthetic fixture description','cat3','good','Berlin','Deutschland',52.52,13.4,1,30)`, [id, owner, JSON.stringify({ title: 'D8 synthetic listing', pricePerDay: 15, city: 'Berlin', country: 'Deutschland', photos: [] })]);
      }
      await setup.query(`UPDATE listings SET is_active=false,status='ended' WHERE id=$1`, [listingId]);
      await setup.query(`INSERT INTO rental_requests(id,item_id,owner_id,renter_id,status,payload)
        VALUES($1,$2,$3,$4,'completed','{"quote":{"totalMinor":99999},"itemId":"stale"}'),($5,$6,$3,$4,'pending','{}')`, [historyId, listingId, owner, renter, legacyId, activeListingId]);
      await setup.query(`INSERT INTO bookings(id,listing_id,owner_id,renter_id,status,starts_at,ends_at,currency,quoted_total_minor,workflow_version,workflow_status,rental_start_date,rental_end_date,rental_timezone,quoted_days,price_per_day_minor,base_rental_minor,rental_subtotal_minor,platform_fee_minor,owner_payout_minor)
        VALUES($1,$2,$3,$4,'completed','2026-08-01T00:00:00Z','2026-08-03T00:00:00Z','EUR',3300,1,'completed','2026-08-01','2026-08-03','Europe/Berlin',2,1500,3000,3000,300,3000)`, [historyId, listingId, owner, renter]);
      await setup.query(`INSERT INTO bookings(id,listing_id,owner_id,renter_id,status,starts_at,ends_at,currency,quoted_total_minor)
        VALUES($1,$2,$3,$4,'pending',$5,$6,'EUR',3000)`, [legacyId, activeListingId, owner, renter, startDate, endDate]);
      await setup.query(`INSERT INTO booking_quotes(id,renter_id,listing_id,rental_start_date,rental_end_date,rental_timezone,starts_at,ends_at,catalog_revision,availability_revision,quote_version,currency,total_minor,quote_payload,quote_hash,issued_at,expires_at)
        VALUES($1,$2,$3,'2026-08-01','2026-08-03','Europe/Berlin','2026-08-01T00:00:00Z','2026-08-03T00:00:00Z',0,1,1,'EUR',3300,'{"totalMinor":3300}',repeat('a',64),'2026-07-01T00:00:00Z','2026-07-01T00:15:00Z')`, [quoteId, renter, listingId]);
      const documentIds = [];
      for (const key of ['platform_terms', 'private_rental_terms']) {
        const result = await setup.query(`INSERT INTO legal_document_snapshots(document_key,document_version,content_type,content_text,content_sha256,effective_at)
          VALUES($1,$2,'text/plain','Synthetic test evidence only',repeat('b',64),now()) RETURNING id`, [key, `d8-${crypto.randomUUID()}`]);
        documentIds.push(result.rows[0].id);
      }
      const contract = await setup.query(`INSERT INTO platform_contracts(user_id,booking_id,quote_id,quote_hash,contract_version,platform_terms_snapshot_id,private_rental_terms_snapshot_id,client_build,accepted_at,idempotency_key)
        VALUES($1,$2,$3,repeat('a',64),'d8-synthetic-v1',$4,$5,'d8-test',now(),$6) RETURNING id`, [renter, historyId, quoteId, ...documentIds, crypto.randomUUID()]);
      await setup.query(`UPDATE rental_requests SET payload=payload||jsonb_build_object('platformContract',jsonb_build_object('id',$2::text)) WHERE id=$1`, [historyId, contract.rows[0].id]);

      await start(true);
      const baselineRows = await bookingSnapshot();
      for (const rows of Object.values(baselineRows)) assert.equal(rows.length, 1);
      assert.doesNotMatch(JSON.stringify(baselineRows), /mission/iu);
      const history = async (who) => (await request(who, 'rental-requests')).requests;
      const baselineHistory = { owner: await history(owner), renter: await history(renter) };
      assert.deepEqual(await history(foreign), []);
      assert.equal(baselineHistory.owner.length, 1); assert.equal(baselineHistory.renter.length, 1);
      assert.equal(baselineHistory.renter[0].quote.totalMinor, 3300);
      assert.equal(baselineHistory.renter[0].platformContract.id, contract.rows[0].id);
      assert.equal(baselineHistory.owner[0].platformContract, undefined);
      assert.equal((await setup.query('SELECT workflow_version FROM bookings WHERE id=$1', [legacyId])).rows[0].workflow_version, 0);
      const missionRaw = { title: 'D8 synthetic need', status: 'planned', needs: [{ needKey: 'plant_container_equipment', necessity: 'required', quantity: 2 }] };
      const missionKey = crypto.randomUUID();
      const mission = (await post(renter, 'mission-needs', missionRaw, missionKey)).missionNeed;
      const ownShelf = (await post(renter, 'private-shelf', { title: 'Synthetic fit shelf', categoryKey: 'garden.plant_container', condition: 'good' })).shelfItem;
      const fitRaw = {
        definitionId: 'plant_container_dimensional_fit_v1', missionRevision: mission.revision, missionPayloadDigest: mission.payloadDigest,
        shelfItemId: ownShelf.shelfItemId, shelfUpdatedAt: ownShelf.updatedAt,
        requirement: { ownerConfirmed: true, facts: [
          { key: 'minimumUsableVolumeMl', value: 20000, unit: 'ml' },
          { key: 'maximumFootprintWidthMm', value: 500, unit: 'mm' },
          { key: 'maximumFootprintDepthMm', value: 400, unit: 'mm' },
          { key: 'maximumHeightMm', value: 600, unit: 'mm' },
        ] },
        itemFacts: [['usableVolumeMl',25000,'ml'], ['footprintWidthMm',390,'mm'], ['footprintDepthMm',490,'mm'], ['heightMm',550,'mm']].map(([key,value,unit]) => ({ key,value,unit,
          provenance: { sourceType: 'owner_confirmed_measurement', sourceReference: `d8-${key}`, sourceVersion: 'measurement-v1', ownerConfirmed: true } })),
      };
      const fit = (await post(renter, `mission-needs/${mission.missionNeedId}/fit-checks`, fitRaw)).fitCheck;
      const gapMission = (await post(renter, 'mission-needs', { ...missionRaw, title: 'D8 gap only' })).missionNeed;
      const resolutionRaw = { missionRevision: gapMission.revision, missionPayloadDigest: gapMission.payloadDigest, startDate, endDate,
        location: { latitudeE5: 4914000, longitudeE5: 922000, radiusKm: 25, sourceVersion: 'd8-origin-v1', ownerConfirmed: true } };
      const resolution = (await post(renter, `mission-needs/${gapMission.missionNeedId}/inventory-resolutions`, resolutionRaw)).resolution;
      const gaps = resolution.storedResolution.slots.filter((slot) => slot.status === 'gap');
      assert.equal(gaps.length, 2);
      const demands = [];
      for (const slot of gaps) demands.push((await post(renter, `mission-inventory-resolutions/${resolution.resolutionId}/supply-demands`, {
        resolutionRevision: 1, slotKey: slot.slotKey, purpose: 'mission_gap_supply_v1', expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })).demand);
      const releaseKey = crypto.randomUUID(), participationKey = crypto.randomUUID(), itemKey = crypto.randomUUID();
      await post(owner, `mission-supply-demands/${demands[0].demandId}/respond`, { expectedRevision: 1, decision: 'release' }, releaseKey);
      const participationRaw = { expectedRevision: 0, status: 'active' };
      await post(owner, 'mission-supply-participation', participationRaw, participationKey);
      const itemRaw = { expectedParticipationRevision: 1, expectedRevision: 0, needKey: 'plant_container_equipment', availabilityStatus: 'confirmed_available' };
      await post(owner, `mission-supply-participation/items/${shelfItemId}`, itemRaw, itemKey);
      const unusedItem = (await post(owner, 'private-shelf', { title: 'Never opted in', categoryKey: 'garden.plant_container', condition: 'good' })).shelfItem;
      const removableItem = (await post(owner, 'private-shelf', { title: 'Delete while disabled', categoryKey: 'garden.plant_container', condition: 'good' })).shelfItem;
      const media=(await upload(201)).media;
      const mediaHashes=await Promise.all(['full','thumbnail'].map((variant)=>mediaRead(owner,media.mediaId,variant)));
      const effectBaseline = await effects();
      await stop(current);

      await start(false);
      assert.deepEqual(await bookingSnapshot(), baselineRows);
      assert.deepEqual(await history(owner), baselineHistory.owner);
      assert.deepEqual(await history(renter), baselineHistory.renter);
      assert.deepEqual(await history(foreign), []);
      for (const path of [`mission-needs/${mission.missionNeedId}`, `mission-fit-checks/${fit.fitCheckId}`, `mission-inventory-resolutions/${resolution.resolutionId}`, `private-shelf/${ownShelf.shelfItemId}`]) {
        await request(renter, path); await request(foreign, path, undefined, undefined, 'GET', 404);
      }
      for (const path of ['mission-needs', `mission-needs/${mission.missionNeedId}/fit-checks`, `mission-needs/${gapMission.missionNeedId}/inventory-resolutions`, 'mission-supply-demands', 'private-shelf']) await request(renter, path);
      assert.equal((await request(foreign,'mission-supply-participation')).participation,null);
      assert.deepEqual(await Promise.all(['full','thumbnail'].map((variant)=>mediaRead(owner,media.mediaId,variant))),mediaHashes);
      await mediaRead(foreign,media.mediaId,'full',404);
      for (const demand of demands) {
        await request(renter, `mission-supply-demands/${demand.demandId}`);
        await request(owner, `mission-supply-demands/${demand.demandId}`);
        await request(foreign, `mission-supply-demands/${demand.demandId}`, undefined, undefined, 'GET', 404);
      }
      const graphBeforeBlocked = await graph();
      const blocked = [
        [renter,'mission-needs',missionRaw,missionKey],
        [renter,`mission-needs/${mission.missionNeedId}/revisions`,{ ...missionRaw, expectedRevision: 1 }],
        [renter,`mission-needs/${mission.missionNeedId}/fit-checks`,fitRaw],
        [renter,`mission-fit-checks/${fit.fitCheckId}/revisions`,{ ...fitRaw, expectedRevision: 1 }],
        [renter,`mission-needs/${gapMission.missionNeedId}/inventory-resolutions`,resolutionRaw],
        [renter,`mission-inventory-resolutions/${resolution.resolutionId}/revisions`,{ ...resolutionRaw, expectedRevision: 1 }],
        [renter,`mission-inventory-resolutions/${resolution.resolutionId}/supply-demands`,{}],
        [owner,`mission-supply-demands/${demands[1].demandId}/respond`,{ decision: 'release', expectedRevision: 1 }],
        [owner,`mission-supply-demands/${demands[0].demandId}/respond`,{ decision: 'release', expectedRevision: 1 },releaseKey],
        [owner,`mission-supply-demands/${demands[1].demandId}/respond`,{ decision: 'unknown', expectedRevision: 1 }],
        [owner,'mission-supply-participation',{ expectedRevision: 1, status: 'active' }],
        [owner,'mission-supply-participation',participationRaw,participationKey],
        [owner,'mission-supply-participation',{ expectedRevision: 1, status: 'unknown' }],
        [owner,`mission-supply-participation/items/${shelfItemId}`,{ ...itemRaw, expectedRevision: 1 }],
        [owner,`mission-supply-participation/items/${shelfItemId}`,itemRaw,itemKey],
        [owner,`mission-supply-participation/items/${shelfItemId}`,{ ...itemRaw, availabilityStatus: 'unknown' }],
        [owner,'private-shelf',{ title: 'Blocked', categoryKey: 'garden.plant_container', condition: 'good' }],
        [owner,`private-shelf/${shelfItemId}/media`,{}],
      ];
      for (const [who,path,raw,key] of blocked) {
        const result = await request(who,path,raw,key,'POST',404);
        assert.equal(result.error, 'mission_new_entries_not_enabled');
      }
      const mediaFiles=(await fs.readdir(path.join(uploadDir,'private-shelf'))).sort();
      assert.equal((await upload(404)).error,'mission_new_entries_not_enabled');
      assert.deepEqual((await fs.readdir(path.join(uploadDir,'private-shelf'))).sort(),mediaFiles);
      await request(foreign,'mission-supply-participation',{ expectedRevision: 0,status: 'withdrawn' },undefined,'POST',404);
      await request(owner,`mission-supply-participation/items/${unusedItem.shelfItemId}`,{ ...itemRaw,availabilityStatus: 'withdrawn' },undefined,'POST',404);
      await request(foreign,`mission-supply-participation/items/${shelfItemId}`,{ ...itemRaw,availabilityStatus: 'withdrawn' },undefined,'POST',404);
      await request(foreign,`mission-supply-demands/${demands[0].demandId}/revoke`,{ expectedRevision: 2 },undefined,'POST',404);
      await request(renter,`mission-supply-demands/${demands[1].demandId}/respond`,{ expectedRevision: 1,decision: 'reject' },undefined,'POST',404);
      await request(owner,`mission-supply-demands/${demands[1].demandId}/respond`,{ expectedRevision: 99,decision: 'reject' },undefined,'POST',409);
      await request(owner,'mission-supply-participation',{ expectedRevision: 1,status: 'withdrawn',unknown: true },undefined,'POST',400);
      const metricsPromise = message(current.child,'metrics'); current.child.send('metrics');
      assert.equal((await metricsPromise).resolverCalls,0);
      assert.deepEqual(await graph(),graphBeforeBlocked);
      assert.deepEqual(await effects(),effectBaseline);
      // Use the existing moderation workflow; do not bypass its evidence constraints.
      const admin = `d8-admin-${crypto.randomUUID()}`;
      await setup.query(`INSERT INTO users(id,email,profile,role,account_status) VALUES($1,$1||'@example.invalid','{}','admin','active')`, [admin]);
      Object.assign(process.env, env);
      const { setUserSuspension } = await import('../src/moderation_workflow.js');
      const suspensionClient = await setup.connect();
      let suspensionId;
      try {
        await suspensionClient.query('BEGIN');
        const result = await setUserSuspension(suspensionClient, {
          actor: { id:admin,role:'admin' }, userId:owner, idempotencyKey:crypto.randomUUID(),
          raw: { scope:'booking',reasonCode:'synthetic_test',decision:{
            facts:'Synthetic fixture for a Mission disabled-mode suspension check.',
            basis:'Synthetic test fixture only.',reasoning:'Exercise the unchanged suspension boundary in an isolated database.',
            detectionMethod:'human',statementOfReasons:{ decisionGround:'terms_violation',decisionOrigin:'notice',
              territorialScope:'Synthetic isolated test only.',durationType:'until_reversed',automationRole:'none' },
          } },
        });
        suspensionId=result.suspension.id;
        await suspensionClient.query('COMMIT');
      } catch (error) { await suspensionClient.query('ROLLBACK'); throw error; }
      finally { suspensionClient.release(); }
      await request(owner,`mission-supply-demands/${demands[1].demandId}/respond`,{ expectedRevision: 1,decision: 'reject' },undefined,'POST',403);
      const reductions = [
        [`mission-supply-demands/${demands[0].demandId}/revoke`,{ expectedRevision: 2 }],
        [`mission-supply-participation/items/${shelfItemId}`,{ ...itemRaw,expectedRevision: 1,availabilityStatus: 'withdrawn' }],
        ['mission-supply-participation',{ expectedRevision: 1,status: 'withdrawn' }],
        [`mission-supply-demands/${demands[1].demandId}/respond`,{ expectedRevision: 1,decision: 'reject' }],
      ];
      for (const [path,raw] of reductions) {
        if (raw.decision === 'reject') await setup.query('UPDATE user_suspensions SET lifted_at=now() WHERE id=$1', [suspensionId]);
        const key = crypto.randomUUID();
        await post(owner,path,raw,key);
        const beforeReplay = await graph();
        assert.equal((await request(owner,path,raw,key,'POST',200)).replayed,true);
        assert.deepEqual(await graph(),beforeReplay);
      }
      await request(owner,`private-shelf/${removableItem.shelfItemId}`,undefined,undefined,'DELETE',204);
      await request(owner,`private-shelf/${removableItem.shelfItemId}`,undefined,undefined,'GET',404);
      assert.deepEqual(await bookingSnapshot(),baselineRows);
      assert.deepEqual(await history(owner),baselineHistory.owner);
      assert.deepEqual(await history(renter),baselineHistory.renter);
      // Separate v0 control: foreign rejection, then the existing B6 PATCH revalidation.
      await request(foreign,`bookings/${legacyId}`,{ itemId:activeListingId,startDate,endDate },undefined,'PATCH',403);
      const revalidated = await request(renter,`bookings/${legacyId}`,{ itemId:activeListingId,startDate,endDate },undefined,'PATCH',200);
      assert.equal(revalidated.booking.workflowVersion,1);
      assert.equal(revalidated.booking.workflowStatus,'requested');
      assert.ok((await history(renter)).some((row) => row.id === legacyId));
      const reducedGraph = await graph();
      const reducedParticipation = await request(owner,'mission-supply-participation');
      assert.equal(reducedParticipation.participation.status,'withdrawn');
      await stop(current);

      await start(true);
      assert.deepEqual(await graph(),reducedGraph);
      assert.deepEqual(await request(owner,'mission-supply-participation'),reducedParticipation);
      assert.deepEqual(await Promise.all(['full','thumbnail'].map((variant)=>mediaRead(owner,media.mediaId,variant))),mediaHashes);
      assert.deepEqual(await bookingSnapshot(),baselineRows);
      for (const who of [owner,renter]) assert.deepEqual((await history(who)).filter((row) => row.id === historyId),baselineHistory[who === owner ? 'owner' : 'renter']);
      assert.deepEqual(await history(foreign),[]);
      // Re-enable admits an explicit new command, never automatically resurrects grants.
      await post(renter,'mission-needs',{ ...missionRaw,title:'Explicit successor' });
      assert.equal((await request(owner,`mission-supply-demands/${demands[0].demandId}`)).demand.status,'revoked');
      assert.equal((await request(owner,'mission-supply-participation')).participation.status,'withdrawn');
      // Enabled-mode first withdrawal semantics are unchanged, not silently prohibited globally.
      await post(foreign,'mission-supply-participation',{ expectedRevision: 0,status: 'withdrawn' });
      const foreignShelf = (await post(foreign,'private-shelf',{ title:'Synthetic successor item',categoryKey:'garden.plant_container',condition:'good' })).shelfItem;
      await post(foreign,`mission-supply-participation/items/${foreignShelf.shelfItemId}`,{ ...itemRaw,availabilityStatus:'withdrawn' });
      await stop(current);
      assert.equal(new Set(processes.map((entry) => entry.pid)).size,3);
      assert.ok(processes.every((entry) => entry.stopped));
      console.log('D8_PROCESS_READBACK ' + JSON.stringify({ processes:3,distinctPids:3,admission:[true,false,true],exitCodes:[0,0,0],portsClosed:true,providerTransports:'memory',storedAuthorityEqual:true }));
    } finally {
      for (const entry of processes) {
        if (!entry.stopped && entry.child.exitCode === null) {
          if (entry.port) await stop(entry);
          else { entry.child.kill('SIGKILL'); await once(entry.child,'exit'); }
        }
      }
      await setup.end();
      assert.equal(path.dirname(uploadDir),os.tmpdir());
      assert.ok(path.basename(uploadDir).startsWith('sit-d8-admission-'));
      await fs.rm(uploadDir,{ recursive:true,force:true });
      await assert.rejects(fs.stat(uploadDir),{ code:'ENOENT' });
    }
  });
}
