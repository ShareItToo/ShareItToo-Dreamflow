import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/shareittoo_test';
process.env.PUSH_TRANSPORT = 'disabled';

const { enqueueSupportCaseUpdateNotification } = await import('../src/support_notifications.js');

const caseId = '11111111-1111-4111-8111-111111111111';

function supportCase() {
  return {
    id: caseId,
    reporter_user_id: 'reporter-1',
    affected_user_ids: ['affected-1'],
  };
}

test('support update schedules only generic in-app and push records', async () => {
  const inserts = [];
  const client = {
    async query(sql, params = []) {
      const compact = sql.replace(/\s+/gu, ' ').trim();
      if (compact.startsWith('SELECT id, reporter_user_id')) {
        return { rowCount: 1, rows: [supportCase()] };
      }
      assert.match(compact, /INSERT INTO notification_outbox/u);
      assert.match(compact, /ON CONFLICT \(event_key, user_id, channel\) DO NOTHING/u);
      inserts.push(params);
      return { rowCount: 1, rows: [] };
    },
  };

  const count = await enqueueSupportCaseUpdateNotification(client, {
    caseId,
    recipientUserId: 'reporter-1',
    eventKey: 'support.message.publish:message-1:notification',
  });

  assert.equal(count, 2);
  assert.deepEqual(inserts.map((params) => params[2]), ['in_app', 'push']);
  const payload = JSON.parse(inserts[0][3]);
  assert.ok(inserts.every((params) => params[3] === inserts[0][3]));
  assert.deepEqual(payload, {
    notification: {
      category: 'support',
      kind: 'support_case_update',
      priority: 3,
      title: 'Update zu deinem Support-Fall',
      body: 'In deinem Support-Fall gibt es eine neue Information. Öffne die App, um sie sicher anzusehen.',
      entityType: 'support',
      entityId: caseId,
      actionUrl: null,
      ctaLabel: 'Support-Fall öffnen',
      payload: {},
    },
  });
  for (const sensitive of ['Musterstraße', '99,99', 'Schadensdetail', 'Verletzung']) {
    assert.doesNotMatch(JSON.stringify(payload), new RegExp(sensitive, 'u'));
  }
});

test('duplicate scheduler evaluation is absorbed by the outbox unique key', async () => {
  let insertAttempt = 0;
  const eventKeys = [];
  const client = {
    async query(sql, params = []) {
      const compact = sql.replace(/\s+/gu, ' ').trim();
      if (compact.startsWith('SELECT id, reporter_user_id')) {
        return { rowCount: 1, rows: [supportCase()] };
      }
      eventKeys.push(params[0]);
      insertAttempt += 1;
      return { rowCount: insertAttempt <= 2 ? 1 : 0, rows: [] };
    },
  };
  const input = {
    caseId,
    recipientUserId: 'reporter-1',
    eventKey: 'support.message.publish:message-1:notification',
  };

  assert.equal(await enqueueSupportCaseUpdateNotification(client, input), 2);
  assert.equal(await enqueueSupportCaseUpdateNotification(client, input), 0);
  assert.equal(new Set(eventKeys).size, 1);
  assert.equal(eventKeys.length, 4);
});

test('a user outside the support case receives no notification', async () => {
  let insertAttempted = false;
  const client = {
    async query(sql) {
      const compact = sql.replace(/\s+/gu, ' ').trim();
      if (compact.startsWith('SELECT id, reporter_user_id')) {
        return { rowCount: 1, rows: [supportCase()] };
      }
      insertAttempted = true;
      return { rowCount: 1, rows: [] };
    },
  };

  assert.equal(await enqueueSupportCaseUpdateNotification(client, {
    caseId,
    recipientUserId: 'outsider-1',
    eventKey: 'support.message.publish:message-1:notification',
  }), 0);
  assert.equal(insertAttempted, false);
});
