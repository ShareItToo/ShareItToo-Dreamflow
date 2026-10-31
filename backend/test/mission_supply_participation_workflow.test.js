import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  assertMissionSupplyParticipationTechnicalAccess,
  normalizeMissionSupplyParticipation,
  normalizeMissionSupplyParticipationItem,
  readMissionSupplyParticipationEnabled,
} from '../src/mission_supply_participation_workflow.js';

const prerequisites = {
  deploymentEnvironment: 'test', coreEnabled: true, inventoryEnabled: true, demandEnabled: true,
};
const planner = {
  enabled: true, inventoryResolutionEnabled: true, demandEnabled: true,
  supplyParticipationEnabled: true, demandActivationAllowed: false,
  publicReleaseAllowed: false, externalGenerativeAiAllowed: false, inventoryResolutionAllowed: false,
};
const root = { expectedRevision: 0, status: 'active' };
const item = {
  expectedParticipationRevision: 1, expectedRevision: 0,
  needKey: 'plant_container_equipment', availabilityStatus: 'confirmed_available',
};

test('participation flag is independent, strictly parsed and fails closed before startup', () => {
  assert.equal(readMissionSupplyParticipationEnabled({}, prerequisites), false);
  assert.equal(readMissionSupplyParticipationEnabled({ PLANNER_SUPPLY_PARTICIPATION_ENABLED: 'true' }, prerequisites), true);
  for (const value of ['', '1', 'yes', 'false-ish']) {
    assert.throws(() => readMissionSupplyParticipationEnabled({ PLANNER_SUPPLY_PARTICIPATION_ENABLED: value }, prerequisites), /configuration_invalid/u);
  }
  for (const change of [
    { deploymentEnvironment: 'production' }, { deploymentEnvironment: 'unknown' },
    { coreEnabled: false }, { inventoryEnabled: false }, { demandEnabled: false },
  ]) {
    assert.throws(() => readMissionSupplyParticipationEnabled({ PLANNER_SUPPLY_PARTICIPATION_ENABLED: 'true' }, { ...prerequisites, ...change }), /configuration_unsafe/u);
  }
  assert.doesNotThrow(() => assertMissionSupplyParticipationTechnicalAccess({ planner }));
  for (const key of Object.keys(planner)) {
    for (const value of [undefined, !planner[key]]) {
      assert.throws(() => assertMissionSupplyParticipationTechnicalAccess({ planner: { ...planner, [key]: value } }), /not_enabled/u);
    }
  }
});

test('actual config import defaults off and rejects invalid participation configuration', () => {
  const env = {
    JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
    DATABASE_URL: 'postgresql://127.0.0.1:1/sit_test', DEPLOYMENT_ENVIRONMENT: 'test',
    PLANNER_CORE_ENABLED: 'true', PLANNER_INVENTORY_ENABLED: 'true', PLANNER_DEMAND_ENABLED: 'true',
  };
  const run = (extra) => spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { config } from ${JSON.stringify(new URL('../src/config.js', import.meta.url).href)}; console.log(config.planner.supplyParticipationEnabled);`,
  ], { env: { ...env, ...extra }, encoding: 'utf8' });
  const off = run({});
  assert.equal(off.status, 0, off.stderr);
  assert.equal(off.stdout.trim(), 'false');
  const on = run({ PLANNER_SUPPLY_PARTICIPATION_ENABLED: 'true' });
  assert.equal(on.status, 0, on.stderr);
  assert.equal(on.stdout.trim(), 'true');
  for (const extra of [
    { PLANNER_SUPPLY_PARTICIPATION_ENABLED: 'invalid' },
    { PLANNER_SUPPLY_PARTICIPATION_ENABLED: 'true', PLANNER_DEMAND_ENABLED: 'false' },
  ]) {
    const rejected = run(extra);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /mission_supply_participation_configuration_(?:invalid|unsafe)/u);
  }
});

test('participation input has exact fields, bounded revisions and the single allowed need key', () => {
  assert.deepEqual(normalizeMissionSupplyParticipation(root), root);
  assert.deepEqual(normalizeMissionSupplyParticipationItem(item), item);
  for (const field of ['ownerId', 'actorId', 'participationId', 'recipientId', 'region', 'latitude', 'longitude', 'expiresAt', 'title']) {
    assert.throws(() => normalizeMissionSupplyParticipation({ ...root, [field]: 'untrusted' }), /fields_invalid/u);
    assert.throws(() => normalizeMissionSupplyParticipationItem({ ...item, [field]: 'untrusted' }), /fields_invalid/u);
  }
  for (const value of [-1, 1.1, '1', null, Number.MAX_SAFE_INTEGER, 2147483647]) {
    assert.throws(() => normalizeMissionSupplyParticipation({ ...root, expectedRevision: value }), /revision_invalid/u);
    assert.throws(() => normalizeMissionSupplyParticipationItem({ ...item, expectedParticipationRevision: value }), /revision_invalid/u);
    assert.throws(() => normalizeMissionSupplyParticipationItem({ ...item, expectedRevision: value }), /revision_invalid/u);
  }
  for (const needKey of ['vehicle', 'plant_container_equipment ', '', null]) {
    assert.throws(() => normalizeMissionSupplyParticipationItem({ ...item, needKey }), /need_key_invalid/u);
  }
  assert.throws(() => normalizeMissionSupplyParticipation({ ...root, status: 'enabled' }), /status_invalid/u);
  assert.throws(() => normalizeMissionSupplyParticipationItem({ ...item, availabilityStatus: 'active' }), /status_invalid/u);
  assert.throws(() => normalizeMissionSupplyParticipation(null), /fields_invalid/u);
  assert.throws(() => normalizeMissionSupplyParticipationItem([]), /fields_invalid/u);
});
