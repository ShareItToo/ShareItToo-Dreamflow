import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  assertMissionAdmission,
  readMissionNewEntriesEnabled,
} from '../src/mission_admission.js';
import {
  setMissionSupplyParticipation,
  setMissionSupplyParticipationItem,
} from '../src/mission_supply_participation_workflow.js';

test('admission startup is independent, default-off, strict and non-production', () => {
  const context = { deploymentEnvironment: 'test', coreEnabled: true };
  assert.equal(readMissionNewEntriesEnabled({}, context), false);
  for (const value of ['true', ' TRUE ']) {
    assert.equal(readMissionNewEntriesEnabled({ PLANNER_NEW_ENTRIES_ENABLED: value }, context), true);
  }
  for (const value of ['', '1', 'yes', 'false-ish']) {
    assert.throws(() => readMissionNewEntriesEnabled({ PLANNER_NEW_ENTRIES_ENABLED: value }, context), /configuration_invalid/u);
  }
  for (const extra of [{ coreEnabled: false }, { deploymentEnvironment: 'production' }, { deploymentEnvironment: 'unknown' }]) {
    assert.throws(() => readMissionNewEntriesEnabled({ PLANNER_NEW_ENTRIES_ENABLED: 'true' }, { ...context, ...extra }), /configuration_unsafe/u);
  }
  const env = { JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
    DATABASE_URL: 'postgresql://127.0.0.1:1/sit_test', DEPLOYMENT_ENVIRONMENT: 'test', PLANNER_CORE_ENABLED: 'true' };
  const run = (extra) => spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { config } from ${JSON.stringify(new URL('../src/config.js', import.meta.url).href)}; console.log(config.planner.newEntriesEnabled);`,
  ], { env: { ...env, ...extra }, encoding: 'utf8' });
  for (const [extra, expected] of [[{}, 'false'], [{ PLANNER_NEW_ENTRIES_ENABLED: 'true' }, 'true']]) {
    const result = run(extra);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
  assert.notEqual(run({ PLANNER_NEW_ENTRIES_ENABLED: 'garbage' }).status, 0);
});

test('process support fixture is inert during normal test discovery', () => {
  const result = spawnSync(process.execPath, [new URL('./support/mission_admission_app_process.js', import.meta.url).pathname], {
    env: {}, encoding: 'utf8', timeout: 3000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('disabled admission admits only recognized reductions; unknown/malformed/expansion fail closed', () => {
  const off = { planner: { newEntriesEnabled: false } };
  for (const [action, raw] of [['respond', { decision: 'reject' }], ['participation', { status: 'withdrawn' }], ['participationItem', { availabilityStatus: 'withdrawn' }]]) {
    assert.doesNotThrow(() => assertMissionAdmission(off, action, raw));
  }
  for (const [action, raw] of [['create', {}], ['correct', {}], ['upload', {}], ['respond', { decision: 'release' }], ['respond', { decision: 'REJECT' }], ['participation', { status: 'active' }], ['participationItem', { availabilityStatus: 'confirmed_available' }], ['unknown', { status: 'withdrawn' }], ['respond', null], ['respond', []]]) {
    for (const config of [off, {}, { planner: { newEntriesEnabled: 'true' } }]) {
      assert.throws(() => assertMissionAdmission(config, action, raw), { status: 404, code: 'mission_new_entries_not_enabled' });
    }
    assert.doesNotThrow(() => assertMissionAdmission({ planner: { newEntriesEnabled: true } }, action, raw));
  }
});

test('disabled withdrawal cannot bootstrap a participation root or item under the owner lock', async () => {
  const owner = 'synthetic-owner';
  const shelfItemId = `shelf_item_${crypto.randomUUID()}`;
  for (const isItem of [false, true]) {
    const calls = [];
    const client = { async query(sql, params) {
      calls.push(sql);
      assert.ok(!/INSERT|UPDATE|DELETE/u.test(sql.replace(/FOR UPDATE/gu, '')));
      if (sql.includes('FROM users')) { assert.ok(sql.includes('FOR UPDATE')); assert.deepEqual(params, [owner]); return { rowCount: 1, rows: [{ id: owner, account_status: 'active' }] }; }
      if (sql.includes('FROM user_suspensions')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM mission_supply_participation_commands') || sql.includes('FROM mission_supply_participation_item_commands')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM mission_supply_participations')) { assert.ok(sql.includes('FOR UPDATE')); return { rows: isItem ? [{ id: 'existing-root', current_revision: 1 }] : [] }; }
      if (sql.includes('FROM private_shelf_items')) return { rowCount: 1, rows: [{ id: shelfItemId }] };
      if (sql.includes('MAX(revision)')) return { rows: [{ revision: 0 }] };
      assert.fail(`unexpected query: ${sql}`);
    } };
    const command = { actorId: owner, newEntriesEnabled: false, idempotencyKey: 'synthetic-withdraw-001',
      raw: isItem ? { expectedParticipationRevision: 1, expectedRevision: 0, needKey: 'plant_container_equipment', availabilityStatus: 'withdrawn' } : { expectedRevision: 0, status: 'withdrawn' }, shelfItemId };
    await assert.rejects(() => (isItem ? setMissionSupplyParticipationItem : setMissionSupplyParticipation)(client, command),
      { status: 404, code: 'mission_supply_participation_not_enabled' });
    assert.ok(calls.length >= 4);
  }
});
