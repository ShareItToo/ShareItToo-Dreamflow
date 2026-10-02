import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertMissionSupplyDemandCreateTechnicalAccess,
  assertMissionSupplyDemandTechnicalAccess,
  createMissionSupplyDemand,
  MissionSupplyDemandError,
  missionSupplyDemandDigest,
  normalizeMissionSupplyDemandRequest,
  normalizeMissionSupplyDemandResponse,
  normalizeMissionSupplyDemandRevoke,
} from '../src/mission_supply_demand_workflow.js';

const now = new Date('2026-10-01T12:00:00.000Z');

function request(overrides = {}) {
  return {
    resolutionRevision: 2,
    slotKey: 'required:plant_container_equipment:1',
    purpose: 'mission_gap_supply_v1',
    expiresAt: '2026-10-05T12:00:00.000Z',
    ...overrides,
  };
}

test('P6 request is exact, purpose-bound and cannot carry recipient or Shelf selection', () => {
  assert.deepEqual(normalizeMissionSupplyDemandRequest(request(), { now }), request());
  for (const forbidden of ['recipientOwnerId', 'shelfItemId', 'ownerEmail', 'address']) {
    assert.throws(
      () => normalizeMissionSupplyDemandRequest(request({ [forbidden]: 'client-controlled' }), { now }),
      (error) => error instanceof MissionSupplyDemandError
        && error.code === 'mission_supply_request_fields_invalid',
    );
  }
  assert.throws(
    () => normalizeMissionSupplyDemandRequest(request({ purpose: 'marketing' }), { now }),
    (error) => error.code === 'mission_supply_purpose_invalid',
  );
  assert.throws(
    () => normalizeMissionSupplyDemandRequest(request({ expiresAt: now.toISOString() }), { now }),
    (error) => error.code === 'mission_supply_expiry_not_future',
  );
});

test('P6 decisions and revoke are strict revision-bound contracts', () => {
  assert.deepEqual(
    normalizeMissionSupplyDemandResponse({ expectedRevision: 1, decision: 'reject' }),
    { expectedRevision: 1, decision: 'reject' },
  );
  assert.deepEqual(normalizeMissionSupplyDemandRevoke({ expectedRevision: 2 }), {
    expectedRevision: 2,
  });
  assert.throws(
    () => normalizeMissionSupplyDemandResponse({ expectedRevision: 1, decision: 'accept' }),
    (error) => error.code === 'mission_supply_decision_invalid',
  );
  assert.throws(
    () => normalizeMissionSupplyDemandRevoke({ expectedRevision: 2, releaseId: 'client' }),
    (error) => error.code === 'mission_supply_revoke_fields_invalid',
  );
});

test('P6 digest is deterministic and changes when exact request meaning changes', () => {
  assert.equal(
    missionSupplyDemandDigest({ b: 2, a: 1 }),
    missionSupplyDemandDigest({ a: 1, b: 2 }),
  );
  assert.notEqual(
    missionSupplyDemandDigest(request()),
    missionSupplyDemandDigest(request({ expiresAt: '2026-10-06T12:00:00.000Z' })),
  );
});

test('P6 create recovers the same command before expiry admission without changing its digest', async () => {
  const actorId = 'p6-expiry-unit-owner';
  const resolutionId = 'mission_inventory_11111111-1111-4111-8111-111111111111';
  const raw = request();
  const digest = missionSupplyDemandDigest({ command: 'create', resolutionId, request: raw });
  for (const offset of [-1, 0, 1]) {
    const queries = [];
    const client = { async query(sql, values) {
      queries.push(sql);
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('FROM mission_supply_demand_commands')) {
        assert.deepEqual(values, [actorId, 'p6-expiry-unit-key']);
        return { rows: [{ command_type: 'create', request_sha256: digest, demand_id: 'stored-demand' }] };
      }
      assert.match(sql, /WHERE demand.id = \$1 AND/u);
      assert.deepEqual(values, ['stored-demand', actorId]);
      return { rowCount: 1, rows: [{
        id: 'stored-demand', requester_id: actorId, current_status: 'pending',
        current_revision: 1, expires_at: raw.expiresAt, region_snapshot: { radiusKm: 25 },
        created_at: now, updated_at: now,
      }] };
    } };
    const result = await createMissionSupplyDemand(client, {
      actorId, resolutionId, raw, idempotencyKey: 'p6-expiry-unit-key',
      recipientResolver: () => assert.fail('replay must not resolve a recipient'),
      now: new Date(Date.parse(raw.expiresAt) + offset),
    });
    assert.equal(result.replayed, true);
    assert.equal(result.demand.demandId, 'stored-demand');
    assert.equal(result.demand.status, offset < 0 ? 'pending' : 'expired_no_response');
    assert.equal(queries.length, 3);
  }
});

test('P6 new expired commands and expired key collisions fail before recipient resolution', async () => {
  for (const collision of [false, true]) {
    let queries = 0;
    await assert.rejects(createMissionSupplyDemand({ async query(sql) {
      queries += 1;
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      assert.match(sql, /FROM mission_supply_demand_commands/u);
      return { rows: collision ? [{ command_type: 'create', request_sha256: 'different' }] : [] };
    } }, {
      actorId: 'p6-expiry-unit-owner',
      resolutionId: 'mission_inventory_11111111-1111-4111-8111-111111111111',
      raw: request(), idempotencyKey: 'p6-expiry-unit-key',
      recipientResolver: () => assert.fail('rejected command must not resolve a recipient'),
      now: new Date(request().expiresAt),
    }), (error) => error.code === (collision
      ? 'mission_supply_idempotency_key_reused' : 'mission_supply_expiry_not_future'));
    assert.equal(queries, 2);
  }
});

test('P6 technical gate is standard-off while only creation requires a server resolver', () => {
  const accepted = {
    planner: {
      enabled: true,
      inventoryResolutionEnabled: true,
      demandEnabled: true,
      demandActivationAllowed: false,
      publicReleaseAllowed: false,
      externalGenerativeAiAllowed: false,
      inventoryResolutionAllowed: false,
    },
  };
  assert.equal(assertMissionSupplyDemandTechnicalAccess(accepted), true);
  assert.equal(
    assertMissionSupplyDemandCreateTechnicalAccess(accepted, async () => ({})),
    true,
  );
  for (const mutation of [
    { enabled: false },
    { inventoryResolutionEnabled: false },
    { demandEnabled: false },
    { demandActivationAllowed: true },
    { publicReleaseAllowed: true },
    { externalGenerativeAiAllowed: true },
    { inventoryResolutionAllowed: true },
  ]) {
    assert.throws(
      () => assertMissionSupplyDemandTechnicalAccess({
        planner: { ...accepted.planner, ...mutation },
      }),
      (error) => error instanceof MissionSupplyDemandError
        && error.code === 'mission_supply_demand_not_enabled',
    );
  }
  assert.throws(
    () => assertMissionSupplyDemandCreateTechnicalAccess(accepted, null),
    (error) => error.code === 'mission_supply_demand_not_enabled',
  );
});

test('P6 contact limiter applies to create only and never blocks lifecycle or revoke routes', () => {
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /app\.post\('\/v1\/mission-inventory-resolutions\/:id\/supply-demands', missionSupplyDemandCreateLimiter,/u,
  );
  for (const route of [
    '/v1/mission-supply-demands/:id/respond',
    '/v1/mission-supply-demands/:id/revoke',
  ]) {
    assert.equal(
      source.includes(`app.post('${route}', missionSupplyDemandCreateLimiter,`),
      false,
    );
  }
});

test('P6 safe revoke retains authentication and account guards while other routes retain booking guards', () => {
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(source.includes("app.post('/v1/mission-supply-demands/:id/revoke', requireAuth, requireActiveAccount, requireUnsuspendedScope('account'),"));
  for (const route of [
    "app.get('/v1/mission-supply-demands'",
    "app.get('/v1/mission-supply-demands/:id'",
    "app.post('/v1/mission-supply-demands/:id/respond'",
    "app.post('/v1/mission-inventory-resolutions/:id/supply-demands', missionSupplyDemandCreateLimiter",
  ]) {
    assert.ok(source.includes(`${route}, requireAuth, requireActiveAccount, requireUnsuspendedScope('booking'),`));
  }
});
