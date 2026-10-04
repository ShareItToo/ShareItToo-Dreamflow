import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);
const method = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} method bounds`);
  return source.slice(from, to);
};

const backend = read('lib/services/backend_repository.dart');
const data = read('lib/services/data_service.dart');
const service = read('lib/services/rental_request_decision_service.dart');
const interaction = read('lib/widgets/rental_request_decision_interaction.dart');

test('request backend and local persistence stay bound to captured owner', () => {
  for (const marker of [
    'transitionBookingForOwner',
    'getRentalRequestsForOwner',
    'createOrGetBookingThreadForOwner',
  ]) assert.match(backend, new RegExp(marker, 'u'));
  const ownedTransition = method(
    backend,
    'static Future<Map<String, dynamic>> transitionBookingForOwner(',
    'static Future<Map<String, dynamic>> issueBookingConfirmationChallenge(',
  );
  assert.match(ownedTransition, /_authorizedForOwner/u);
  assert.doesNotMatch(ownedTransition, /_authorized\(/u);

  const owned = method(
    data,
    'updateRentalRequestStatusForOwner({',
    'static AccountRentalRequestMutationFailure',
  );
  assert.match(owned, /AuthService\.isSessionOwnerDefinitelyCurrent\(owner\)/u);
  assert.match(owned, /BackendRepository\.transitionBookingForOwner/u);
  assert.match(owned, /attempt\.remoteAccepted = true/u);
  assert.match(owned, /_persistRentalRequestsDocumentForOwner/u);
  assert.match(owned, /expectedSessionOwner: owner/u);
});

test('request result semantics keep intermediary and unknown failures unknown', () => {
  for (const marker of [
    "'booking_request_expired'",
    "'booking_revision_conflict'",
    "'invalid_status_transition'",
    'RentalRequestDecisionFailureKind.outcomeUnknown',
    'remoteAccepted: failure.remoteAccepted',
  ]) assert.match(service, new RegExp(marker, 'u'));
  assert.doesNotMatch(service, /408:\s*<String>/u);
  assert.doesNotMatch(data, /408:\s*<String>/u);
});

test('every live request decision surface owns its exact dialog and epoch', () => {
  assert.match(interaction, /TrackedDialogRouteHandle/u);
  assert.match(interaction, /navigator\.removeRoute\(route/u);
  assert.match(interaction, /AuthService\.sessionEpoch/u);

  for (const path of [
    'lib/screens/owner_requests_screen.dart',
    'lib/screens/request_detail_screen.dart',
    'lib/screens/ongoing_owner_detail_screen.dart',
  ]) {
    const source = read(path);
    assert.match(source, /RentalRequestDecisionInteractionController/u, path);
    assert.match(source, /SharedPersistenceSync\.accountSecurityStateKey/u, path);
    assert.match(source, /_decisionActions\.capture\(\)/u, path);
    assert.match(source, /_decisionActions\.isCurrent/u, path);
    assert.match(source, /RentalRequestDecisionFailure/u, path);
  }

  const chat = read('lib/screens/message_thread_screen.dart');
  assert.match(chat, /_safetyActions\.capture\(\)/u);
  assert.match(chat, /_safetyActions\.showOwnedDialog/u);
  assert.match(chat, /_requestDecisionService\.execute/u);
  assert.match(chat, /RentalRequestDecisionFailure/u);
});

test('decision methods never close or navigate via current global stack', () => {
  const bounds = [
    ['lib/screens/owner_requests_screen.dart', '_acceptRequest(', 'Widget? _buildInlineAction('],
    ['lib/screens/request_detail_screen.dart', '_acceptRequest(', '@override\n  void dispose()'],
    ['lib/screens/ongoing_owner_detail_screen.dart', '_acceptPendingRequest(', '@override\n  Widget build('],
  ];
  for (const [path, start, end] of bounds) {
    const source = read(path);
    const body = method(source, start, end.replace('\\n', '\n'));
    assert.doesNotMatch(body, /maybePop\(|pushReplacement\(|Navigator\.of\([^)]*\)\.pop/u, path);
    assert.doesNotMatch(body, /Future\.delayed/u, path);
    assert.doesNotMatch(body, /DataService\.updateRentalRequestStatus\(/u, path);
  }
});
