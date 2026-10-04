import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  listSupportOperationalAlerts,
  reconcileSupportDeadlinesWithClient,
  supportDeadlineHealth,
  supportDeadlineWatchdogVersion,
} from '../src/support_deadline_watchdog.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const now = new Date('2026-08-21T10:00:00.000Z');
const caseId = '11111111-1111-4111-8111-111111111111';

class ScriptedClient {
  constructor(steps) {
    this.steps = [...steps];
  }

  async query(sql, params = []) {
    const step = this.steps.shift();
    assert.ok(step, `unexpected query: ${sql}`);
    if (step.match) assert.match(sql, step.match);
    if (step.check) step.check({ sql, params });
    return typeof step.result === 'function' ? step.result({ sql, params }) : step.result;
  }

  done() {
    assert.equal(this.steps.length, 0, 'not all scripted queries were used');
  }
}

function candidate() {
  return {
    id: caseId,
    status: 'received',
    priority: 'p0',
    current_owner_id: null,
    current_owner_role: 'trust_safety_owner',
    next_update_at: new Date('2026-08-21T09:45:00.000Z'),
    lock_version: 3,
  };
}

test('watchdog creates one durable internal alert per exact overdue condition', async () => {
  const client = new ScriptedClient([
    {
      match: /FROM support_cases[\s\S]*FOR UPDATE SKIP LOCKED/u,
      check: ({ params }) => {
        assert.deepEqual(params, [now, 100]);
      },
      result: { rowCount: 1, rows: [candidate()] },
    },
    {
      match: /support_case_events/u,
      check: ({ params }) => {
        assert.equal(params[1], 'support.operational_alert.p0_without_owner');
        assert.match(params[3], /p0-without-owner:v1:3$/u);
        assert.equal(JSON.parse(params[2]).externalNotificationSent, false);
      },
      result: { rowCount: 1, rows: [{ id: 'alert-1' }] },
    },
    {
      match: /support_case_events/u,
      check: ({ params }) => {
        assert.equal(params[1], 'support.operational_alert.next_update_overdue');
        assert.match(params[3], /2026-08-21T09:45:00\.000Z$/u);
      },
      result: { rowCount: 1, rows: [{ id: 'alert-2' }] },
    },
    {
      match: /FROM support_privacy_rights_requests AS privacy_request/u,
      check: ({ params }) => assert.deepEqual(params, [now, 100]),
      result: { rowCount: 0, rows: [] },
    },
    {
      match: /FROM support_privacy_incidents AS incident/u,
      check: ({ params }) => assert.deepEqual(params, [now, 100]),
      result: { rowCount: 0, rows: [] },
    },
    {
      match: /support_deadline_watchdog_state/u,
      check: ({ params }) => {
        assert.deepEqual(params, [supportDeadlineWatchdogVersion, now, 1, 2]);
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  const result = await reconcileSupportDeadlinesWithClient(client, { now });
  assert.deepEqual(result, {
    inspected: 1,
    alertsCreated: 2,
    p0WithoutOwner: 1,
    nextUpdateOverdue: 1,
    privacyDeadlineNear: 0,
    privacyDeadlineOverdue: 0,
    privacyIncidentDeadlineNear: 0,
    privacyIncidentDeadlineOverdue: 0,
    externalNotificationsSent: 0,
  });
  client.done();
});

test('duplicate scheduler evaluation records no duplicate alert', async () => {
  const client = new ScriptedClient([
    { match: /FOR UPDATE SKIP LOCKED/u, result: { rowCount: 1, rows: [candidate()] } },
    { match: /ON CONFLICT \(case_id, idempotency_key\) DO NOTHING/u, result: { rowCount: 0, rows: [] } },
    { match: /ON CONFLICT \(case_id, idempotency_key\) DO NOTHING/u, result: { rowCount: 0, rows: [] } },
    { match: /FROM support_privacy_rights_requests AS privacy_request/u, result: { rowCount: 0, rows: [] } },
    { match: /FROM support_privacy_incidents AS incident/u, result: { rowCount: 0, rows: [] } },
    { match: /support_deadline_watchdog_state/u, result: { rowCount: 1, rows: [] } },
  ]);
  const result = await reconcileSupportDeadlinesWithClient(client, { now });
  assert.equal(result.alertsCreated, 0);
  assert.equal(result.externalNotificationsSent, 0);
  client.done();
});

test('health fails closed for stale or unresolved operational conditions', async () => {
  const client = new ScriptedClient([{
    match: /critical_next_update_overdue/u,
    result: {
      rowCount: 1,
      rows: [{
        last_succeeded_at: new Date('2026-08-21T09:59:00.000Z'),
        last_failed_at: null,
        last_error_code: null,
        last_inspected_count: 2,
        last_alert_count: 1,
        attempt_count: 5,
        success_count: 5,
        p0_without_owner: 0,
        next_update_overdue: 1,
        critical_next_update_overdue: 0,
        privacy_deadline_near: 0,
        privacy_deadline_overdue: 0,
      }],
    },
  }]);
  const health = await supportDeadlineHealth(client, { now, maxStalenessMs: 180_000 });
  assert.equal(health.status, 'degraded');
  assert.equal(health.stale, false);
  assert.equal(health.nextUpdateOverdue, 1);
  assert.equal(health.criticalNextUpdateOverdue, 0);
  client.done();
});

test('only an elevated-route admin can obtain the PII-minimized active alert queue', async () => {
  await assert.rejects(
    listSupportOperationalAlerts({ query: async () => ({ rows: [] }) }, {
      actor: { id: 'support-1', role: 'support' },
    }),
    /support_operational_alerts_forbidden/u,
  );
  const client = new ScriptedClient([{
    match: /event\.event_type IN/u,
    result: {
      rowCount: 1,
      rows: [{
        id: 'alert-1',
        case_id: caseId,
        human_readable_case_number: 'SIT-ABCDEFGHJKLM',
        event_type: 'support.operational_alert.next_update_overdue',
        case_status: 'under_review',
        priority: 'p1',
        current_owner_id: 'support-1',
        current_owner_role: 'booking_operations_owner',
        next_update_at: new Date('2026-08-21T09:45:00.000Z'),
        created_at: now,
      }],
    },
  }]);
  const alerts = await listSupportOperationalAlerts(client, {
    actor: { id: 'admin-1', role: 'admin' },
    now,
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].externalNotificationSent, false);
  assert.equal('summary' in alerts[0], false);
  client.done();
});

test('migration is reversible only before durable operational alerts exist', () => {
  const up = fs.readFileSync(path.resolve(
    currentDir,
    '../sql/migrations/039_support_deadline_watchdog.up.sql',
  ), 'utf8');
  const down = fs.readFileSync(path.resolve(
    currentDir,
    '../sql/migrations/039_support_deadline_watchdog.down.sql',
  ), 'utf8');
  assert.match(up, /support_deadline_watchdog_state/u);
  assert.match(up, /support_case_events_operational_alert_idx/u);
  assert.match(down, /Cannot roll back support deadline watchdog while alert truth exists/u);
});
