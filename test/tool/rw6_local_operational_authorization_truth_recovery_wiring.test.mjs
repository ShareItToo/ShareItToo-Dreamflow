import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

test('RW6 is permanently invoked by the supported regression', () => {
  const regression = read('scripts/technical_regression_check.sh');
  for (const marker of [
    'rw6_local_operational_authorization_truth_recovery_test.dart',
    'rw6_local_operational_authorization_truth_recovery_wiring.test.mjs',
    'validate_rw6_local_operational_authorization_truth_recovery.mjs',
  ]) assert.match(regression, new RegExp(escaped(marker), 'u'));
});

test('operational access binds profile session caller and participant', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    '_requireCurrentOperationalUser(',
    '_assertCurrentOperationalUserId(',
    'AuthService.readSession()',
    '_requireCurrentRequestParticipant(',
    '_isThreadParticipant(',
    'deletedForUserIds',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
  const message = read('lib/models/message.dart');
  assert.match(message, /final List<String> deletedForUserIds/u);
});

test('strict bounded stores preserve corruption and reject capacity pruning', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    '_maxLocalMessageThreads = 1000',
    '_maxMessagesPerThread = 5000',
    '_maxLocalNotifications = 5000',
    '_maxLocalTimelineEvents = 5000',
    '_maxLocalRentalRequests = 1000',
    '_decodeMessageThreadsStrict(',
    '_decodeNotificationsStrict(',
    '_decodeRentalRequestsStrict(',
    '_decodeTimelineStrict(',
    '_writePreferenceString(',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(service, /notifications\.removeRange\(/u);
});

test('privacy export and both account deletion paths use scoped operational truth', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    'exportOperationalRecordsForPrivacy()',
    "'scope': 'current-authenticated-account'",
    "'unattributedLegacyNotificationsExcluded': true",
    'clearOperationalRecordsForAccountDeletion(',
    'Shared booking/timeline/handover records remain retained',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
  const deletion = read('lib/services/account_deletion_service.dart');
  assert.equal(
    [...deletion.matchAll(
      /DataService\.clearOperationalRecordsForAccountDeletion\(user\.id\)/gu,
    )].length,
    1,
  );
  assert.equal(
    [...deletion.matchAll(
      /DataService\.clearOperationalRecordsForConfirmedAccountDeletion\(/gu,
    )].length,
    1,
  );
  const privacy = read('lib/services/privacy_export_service.dart');
  assert.match(privacy, /exportOperationalRecordsForPrivacy\(\)/u);
});

test('lifecycle privacy and retention manifests bind operational records', () => {
  const lifecycle = JSON.parse(read('store/g2-data-lifecycle.json'));
  assert.equal(
    lifecycle.localOperationalRecords.identityBinding,
    'current-session-and-participant-or-current-principal-selection',
  );
  assert.equal(
    lifecycle.localOperationalRecords.capacityPolicy,
    'bounded-reject-overflow-without-pruning',
  );
  const privacy = JSON.parse(read('store/privacy-disclosures.json'));
  assert.equal(
    privacy.localOperationalRecords.privacyExport,
    'current-account-and-participant-records-only',
  );
  const retention = JSON.parse(read('store/retention-deletion-readiness.json'));
  assert.equal(
    retention.implementedControls.localOperationalRecords.retentionPeriodInvented,
    false,
  );
});

test('open communication surfaces clear and recheck account state', () => {
  const surfaces = [
    ['lib/screens/message_thread_screen.dart', 'message-thread-unavailable'],
    ['lib/screens/messages_screen.dart', 'SharedPersistenceSync.affectsCommunicationSync'],
    ['lib/screens/notifications_screen.dart', 'SharedPersistenceSync.localSafetyPrivacyStateKey'],
  ];
  for (const [path, marker] of surfaces) {
    assert.match(read(path), new RegExp(escaped(marker), 'u'));
  }
});

test('RW6 proof covers transitions corruption capacity privacy and UI deterministically', () => {
  const source = read(
    'test/rw6_local_operational_authorization_truth_recovery_test.dart',
  );
  for (const marker of [
    'stale cached profile without a matching auth session is rejected',
    'thread deletion is current-user-only and preserves the counterparty',
    'concurrent operational mutations retain every accepted update',
    'corrupt operational stores fail closed and preserve exact raw bytes',
    'full local stores reject new writes without pruning retained history',
    'privacy export and account deletion remain scoped and auditable',
    'open thread clears sensitive UI after account switch',
    'notification list replaces account A with account B only',
  ]) assert.match(source, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
