import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

test('RW5 is permanently invoked by the supported regression', () => {
  const regression = read('scripts/technical_regression_check.sh');
  for (const marker of [
    'rw5_local_safety_privacy_principal_isolation_test.dart',
    'rw5_local_safety_privacy_principal_isolation_wiring.test.mjs',
    'validate_rw5_local_safety_privacy_principal_isolation.mjs',
  ]) assert.match(regression, new RegExp(escaped(marker), 'u'));
});

test('one opaque bounded registry owns every RW5 local data class', () => {
  const principal = read('lib/services/local_principal_scope.dart');
  const service = read('lib/services/local_safety_privacy_service.dart');
  for (const marker of [
    'maxRetainedPrincipals = 12',
    "_derivationDomain = 'sit-local-stage-a-v1'",
    "return 'p_$digest'",
    "token: 'guest'",
  ]) assert.match(principal, new RegExp(escaped(marker), 'u'));
  for (const marker of [
    "storageKey = 'local_safety_privacy_state_v1'",
    'blockedUserIds',
    'reports',
    'hiddenItemIds',
    'feedbackProfile',
    'mutedThreadIds',
    'messagesSettings',
    'notificationPreferences',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
});

test('legacy migration is guest-only or exact-owner and corrupt data is preserved', () => {
  const service = read('lib/services/local_safety_privacy_service.dart');
  for (const marker of [
    'principal.authenticated || !_hasLegacyGuestState(prefs)',
    'LocalPrincipalScope.tokenForUserId(owner) != principal.token',
    'legacyGuestQuarantined: true',
    'quarantined[token] = entry.value',
    'for (final entry in registry.quarantinedPrincipals.entries)',
    'registry.principals.length + registry.quarantinedPrincipals.length',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(service, /catch\s*\([^)]*\)\s*\{\s*return const \[\]/u);
});

test('public local services delegate to the principal registry', () => {
  const contracts = [
    ['lib/services/blocked_users_service.dart', 'LocalSafetyPrivacyService.blockUser'],
    ['lib/services/listing_feedback_service.dart', 'LocalSafetyPrivacyService.recordFeedback'],
    ['lib/services/user_reports_service.dart', 'LocalSafetyPrivacyService.addHarassmentReportAndBlock'],
    ['lib/services/messages_settings_service.dart', 'LocalSafetyPrivacyService.setMessagesSettings'],
    ['lib/services/notification_preferences_service.dart', 'LocalSafetyPrivacyService.setNotificationPreferences'],
  ];
  for (const [path, marker] of contracts) {
    assert.match(read(path), new RegExp(escaped(marker), 'u'));
  }
});

test('session transitions and open surfaces cannot retain old account state', () => {
  const auth = read('lib/services/auth_service.dart');
  assert.match(auth, /SharedPersistenceSync\.localSafetyPrivacyStateKey/u);
  const closedSurfaceMarkers = [
    ['lib/screens/blocked_users_screen.dart', 'Blockierte Nutzer konnten nicht sicher geladen werden.', 'SharedPersistenceSync.localSafetyPrivacyStateKey'],
    ['lib/screens/messages_screen.dart', 'Es werden keine alten Kontodaten angezeigt.', 'SharedPersistenceSync.affectsCommunicationSync'],
    ['lib/screens/notification_settings_screen.dart', 'Benachrichtigungseinstellungen konnten nicht sicher geladen werden.', 'SharedPersistenceSync.localSafetyPrivacyStateKey'],
    ['lib/screens/notifications_screen.dart', 'Es werden keine Daten eines vorherigen Kontos angezeigt.', 'SharedPersistenceSync.localSafetyPrivacyStateKey'],
    ['lib/widgets/messages_settings_sheet.dart', 'Nachrichten-Einstellungen konnten nicht sicher geladen werden.', 'SharedPersistenceSync.localSafetyPrivacyStateKey'],
  ];
  for (const [path, marker, syncMarker] of closedSurfaceMarkers) {
    const content = read(path);
    assert.match(content, new RegExp(escaped(syncMarker), 'u'));
    assert.match(content, new RegExp(escaped(marker), 'u'));
  }
});

test('privacy export and confirmed deletion are current-principal operations', () => {
  const privacy = read('lib/services/privacy_export_service.dart');
  assert.match(privacy, /LocalSafetyPrivacyService\.exportCurrentPrincipal\(\)/u);
  const deletion = read('lib/services/account_deletion_service.dart');
  assert.equal(
    [...deletion.matchAll(
      /LocalSafetyPrivacyService\.clearPrincipalForConfirmedAccountDeletion\(/gu,
    )].length,
    2,
  );
  const service = read('lib/services/local_safety_privacy_service.dart');
  for (const marker of [
    "'scope': 'local-principal'",
    "'principalScope'",
    'registry.principals.remove(principal.token)',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
});

test('lifecycle privacy and retention manifests bind the closed local policy', () => {
  const lifecycle = JSON.parse(read('store/g2-data-lifecycle.json'));
  assert.equal(
    lifecycle.localSafetyPrivacy.canonicalKey,
    'local_safety_privacy_state_v1',
  );
  assert.equal(lifecycle.localSafetyPrivacy.maximumRetainedPrincipals, 12);
  const privacy = JSON.parse(read('store/privacy-disclosures.json'));
  assert.equal(
    privacy.localDevicePrincipalState.privacyExport,
    'current-principal-only',
  );
  assert.equal(privacy.localDevicePrincipalState.externalTransferAdded, false);
  const retention = JSON.parse(read('store/retention-deletion-readiness.json'));
  assert.equal(
    retention.implementedControls.localSafetyPrivacyPrincipalState
      .retentionPeriodInvented,
    false,
  );
});

test('RW5 proof is deterministic and covers transitions corruption and UI', () => {
  const source = read('test/rw5_local_safety_privacy_principal_isolation_test.dart');
  for (const marker of [
    'account A, guest and account B do not share safety or discovery state',
    'unattributed legacy safety and discovery state belongs only to guest',
    'corrupt legacy communication preferences fail closed and are kept',
    'privacy export and confirmed deletion affect only the current account',
    'already-invoked mutations cannot cross an immediate session switch',
    'opaque principal state survives process-style recreation',
    'principal registry is bounded without evicting earlier state',
    'one corrupt principal bucket is preserved without blocking another',
    'legacy muted entries migrate only to their exact user-id principal',
    'corrupt block state renders a closed error instead of empty',
    'blocked-users UI drops account A state after switch to B',
  ]) assert.match(source, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
