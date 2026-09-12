import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const notifications = readFileSync('backend/src/support_notifications.js', 'utf8');
const messages = readFileSync('backend/src/support_message_workflow.js', 'utf8');
const pushSender = readFileSync('backend/src/push_sender.js', 'utf8');
const notificationScreen = readFileSync('lib/screens/notifications_screen.dart', 'utf8');
const supportCases = readFileSync('lib/screens/support_cases_screen.dart', 'utf8');

test('support publications schedule a duplicate-safe generic notification', () => {
  assert.match(
    notifications,
    /export async function enqueueSupportCaseUpdateNotification/u,
  );
  assert.match(
    notifications,
    /ON CONFLICT \(event_key, user_id, channel\) DO NOTHING/u,
  );
  assert.match(notifications, /kind: 'support_case_update'/u);
  assert.match(notifications, /for \(const channel of \['in_app', 'push'\]\)/u);
  assert.match(messages, /if \(draft\.publishNow\)[\s\S]*enqueueSupportCaseUpdateNotification/u);
  assert.ok(
    messages.match(/enqueueSupportCaseUpdateNotification\(client/gu)?.length >= 2,
    'immediate and reviewed publication paths must both schedule the update',
  );
});

test('support push stays identifier-free and opens only the authenticated inbox', () => {
  assert.match(pushSender, /support_case_update: 60 \* 60/u);
  assert.match(pushSender, /V52_PUSH_TITLE = 'Neue ShareItToo-Aktualisierung'/u);
  assert.match(pushSender, /V52_PUSH_BODY = 'In der App ansehen\.'/u);
  assert.match(pushSender, /route: 'notifications'/u);
  assert.doesNotMatch(pushSender, /route: 'support/u);
});

test('support CTA re-fetches the case and fails closed without leaking the identifier', () => {
  assert.match(
    notificationScreen,
    /SupportCaseNotificationDestinationScreen\([\s\S]*caseId: entityId/u,
  );
  assert.match(
    supportCases,
    /BackendRepository\.getSupportCase\(widget\.caseId, owner: owner\)[\s\S]*detail\.supportCase\.id != widget\.caseId/u,
  );
  assert.match(supportCases, /_detail = _readOwned\(\(owner\) async/u);
  assert.match(supportCases, /Support-Fall nicht verfügbar/u);
  assert.match(supportCases, /Es werden keine Falldaten angezeigt/u);
});
