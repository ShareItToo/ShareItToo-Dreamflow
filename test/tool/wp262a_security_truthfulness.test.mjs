import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const help = readFileSync('lib/screens/help_center_screen.dart', 'utf8');
const listingOptions = readFileSync('lib/widgets/listing_options_dialog.dart', 'utf8');
const composer = readFileSync('lib/services/message_send_coordinator.dart', 'utf8');
const messageThread = readFileSync('lib/screens/message_thread_screen.dart', 'utf8');

test('WP262-A help center describes the server-authoritative MFA surface', () => {
  assert.match(help, /id: '2fa'/u);
  assert.match(help, /serverbestätigt verwaltet/u);
  assert.match(help, /Serverstatus erneut laden|Erneut laden/u);
  assert.doesNotMatch(help, /Geplanter zusätzlicher Schutz/u);
  assert.doesNotMatch(help, /Sobald die serverseitige Funktion verfügbar ist/u);
});

test('WP262-A link-copy failure is a truthful retryable error', () => {
  assert.match(listingOptions, /Link kopieren nicht verfügbar/u);
  assert.match(listingOptions, /Zwischenablage konnte nicht aktualisiert werden/u);
  assert.doesNotMatch(listingOptions, /Link kopieren folgt bald/u);
});

test('WP262-A message send keeps persistence and context semantics typed', () => {
  assert.match(composer, /if \(readDraft\(\) == submittedDraft\)/u);
  assert.match(composer, /MessageSendRefreshOutcome\.persistedRefreshFailed/u);
  assert.match(messageThread, /MessageSendCoordinator/u);
  assert.match(messageThread, /_sameMessageContext\(me\.id, t\.id\)/u);
  assert.match(messageThread, /Fehler beim Senden/u);
});
