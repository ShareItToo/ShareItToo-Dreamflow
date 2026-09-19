import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('lib/services/data_service.dart', 'utf8');

function methodBody(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} is missing`);
  assert.notEqual(endIndex, -1, `${end} is missing`);
  return source.slice(startIndex, endIndex);
}

test('the primary remote message-thread read updates its cache silently', () => {
  const body = methodBody(
    'static Future<String?> _readMessageThreads(',
    'static List<MessageThread> _decodeMessageThreadsStrict(',
  );
  assert.match(body, /BackendRepository\.getMessageThreads\(/u);
  assert.match(
    body,
    /_persistMessageThreads\([\s\S]*announceChange:\s*shouldAnnounceMessageThreadCacheWrite\([\s\S]*readOnlyRemoteRefresh:\s*true/u,
  );
  assert.doesNotMatch(body, /_writePreferenceString\(prefs,\s*_messageThreadsKey/u);
});

test('the messages screen keeps listening without turning a failure into empty truth', () => {
  const screen = readFileSync('lib/screens/messages_screen.dart', 'utf8');
  assert.match(screen, /SharedPersistenceSync\.affectsCommunicationSync\(key\)/u);
  assert.match(screen, /Nachrichten konnten nicht sicher geladen werden\./u);
  assert.match(screen, /Es werden keine alten Kontodaten angezeigt\./u);
});
