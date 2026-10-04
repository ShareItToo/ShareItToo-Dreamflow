import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dataService = readFileSync(
  new URL('../../lib/services/data_service.dart', import.meta.url),
  'utf8',
);
const messagesScreen = readFileSync(
  new URL('../../lib/screens/messages_screen.dart', import.meta.url),
  'utf8',
);
const notifications = readFileSync(
  new URL('../../backend/src/notifications.js', import.meta.url),
  'utf8',
);

test('public counterparty profiles are authoritative before offline fallback', () => {
  const section = dataService.match(
    /static Future<User\?> getUserById\(String id\) async \{[\s\S]*?\n  \}/u,
  )?.[0];
  assert.ok(section);
  assert.match(section, /BackendRepository\.getPublicProfile\(id\)/u);
  assert.match(section, /return User\.fromJson\(remote\)/u);
  assert.match(section, /final users = await getUsers\(\)/u);
  assert.ok(section.indexOf('BackendRepository.getPublicProfile') < section.indexOf('final users = await getUsers'));
});

test('message list hydrates participant profiles before rendering', () => {
  assert.match(messagesScreen, /final participantIds = <String>\{/u);
  assert.match(messagesScreen, /final participant = await DataService\.getUserById\(participantId\)/u);
  assert.match(messagesScreen, /usersById\[participant\.id\] = participant/u);
  assert.match(messagesScreen, /isContextCurrent\(actionContext\)/u);
});

test('message notifications carry the sender name without exposing push payload secrets', () => {
  const start = notifications.indexOf('export async function enqueueMessageNotification');
  const end = notifications.indexOf('export async function enqueueFinancialNotification', start);
  assert.ok(start >= 0 && end > start);
  const section = notifications.slice(start, end);
  assert.match(section, /SELECT profile[\s\S]*?FROM messages/u);
  assert.match(section, /Neue Nachricht von \$\{senderName\}/u);
  assert.match(section, /participantName: senderName/u);
  assert.doesNotMatch(section, /token|password|secret|credential/iu);
});
