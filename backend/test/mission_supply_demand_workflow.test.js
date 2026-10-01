import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertMissionSupplyDemandCreateTechnicalAccess,
  assertMissionSupplyDemandTechnicalAccess,
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
