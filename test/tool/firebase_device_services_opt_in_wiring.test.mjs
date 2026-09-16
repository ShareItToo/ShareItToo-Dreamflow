import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const runtime = read('lib/services/firebase_runtime.dart');
const android = read('android/app/src/main/AndroidManifest.xml');
const ios = read('ios/Runner/Info.plist');
const settings = read('lib/screens/notification_settings_screen.dart');
const foregroundHost = read('lib/widgets/foreground_push_host.dart');
const realtime = read('lib/services/backend_realtime_service.dart');
const deletion = read('lib/services/account_deletion_service.dart');
const backend = read('backend/src/app.js');
const publicPrivacy = read('backend/src/account_actions.js');

test('native Firebase auto collection is fail-closed on Android and iOS', () => {
  assert.match(android, /firebase_messaging_auto_init_enabled[\s\S]*android:value="false"/);
  assert.match(android, /firebase_analytics_collection_enabled[\s\S]*android:value="false"/);
  assert.match(android, /firebase_crashlytics_collection_enabled[\s\S]*android:value="false"/);
  assert.match(ios, /<key>FirebaseMessagingAutoInitEnabled<\/key>\s*<false\/>/);
  assert.match(ios, /<key>FirebaseCrashlyticsCollectionEnabled<\/key>\s*<false\/>/);
});

test('runtime gates push and crash collection on persisted user decisions', () => {
  assert.match(runtime, /FirebaseServicePreferencesStore\.read\(\)/);
  assert.match(runtime, /setAutoInitEnabled\(_pushEnabled\)/);
  assert.match(runtime, /releaseMode && userEnabled/);
  assert.match(runtime, /userEnabled: _crashDiagnosticsEnabled/);
  assert.match(runtime, /setPushEnabled\(\s*bool enabled/u);
  assert.match(runtime, /setCrashDiagnosticsEnabled\(bool enabled\)/);
  assert.match(runtime, /deleteUnsentReports\(\)/);
  assert.doesNotMatch(runtime, /setUserIdentifier\(|setUserId\(/);
});

test('account deletion removes the Firebase installation best effort', () => {
  assert.match(deletion, /FirebaseRuntime\.deleteInstallationForAccountDeletion\(\)/);
  assert.match(runtime, /FirebaseInstallations\.instance\.delete\(\)/);
  assert.match(runtime, /FirebaseMessaging\.instance\.deleteToken\(\)/);
  assert.match(runtime, /setInstallationCleanupPending\(true\)/);
  assert.match(runtime, /preferences\.installationCleanupPending/);
  assert.match(runtime, /setInstallationCleanupPending\(\s*false,?\s*\)/);
  assert.match(runtime, /setPushLocalCleanupPending\(true\)/);
  assert.match(runtime, /preferences\.pushLocalCleanupPending/);
  assert.match(runtime, /setPushLocalCleanupPending\(false\)/);
});

test('settings distinguish real device services from feed filters', () => {
  assert.match(settings, /Push-Mitteilungen auf diesem Gerät/);
  assert.match(settings, /Freiwillige Crashdiagnose/);
  assert.match(settings, /Firebase Cloud Messaging von Google/);
  assert.match(settings, /Firebase Crashlytics von Google/);
  assert.match(settings, /keine SIT-Nutzerkennung übermittelt/);
  assert.match(settings, /ungesendete Berichte auf diesem Gerät/);
  assert.match(settings, /nicht kontobezogen vorzeitig löschen/);
  assert.doesNotMatch(settings, /Push- und E-Mail-Benachrichtigungen folgen später/);
});

test('public privacy copy states the same privacy-preserving crash deletion boundary', () => {
  assert.match(publicPrivacy, /keine Werbe-ID und keine SIT-Nutzerkennung/);
  assert.match(publicPrivacy, /ungesendete Crashberichte auf dem Gerät/);
  assert.match(publicPrivacy, /nicht kontobezogen vorzeitig löschen/);
  assert.match(publicPrivacy, /90 Tage auf/);
});

test('backend cleanup is current-session scoped and does not expose tokens', () => {
  const route = backend.match(/app\.delete\('\/v1\/auth\/devices\/push\/current'[\s\S]*?\n  \}\)\);/u)?.[0] ?? '';
  assert.match(route, /deletePushDevicesForSession/);
  assert.match(route, /sessionId: req\.auth\.sessionId/);
  assert.match(route, /userId: req\.auth\.userId/);
  assert.match(route, /deletedCount/);
  assert.doesNotMatch(route, /token|token_hash/);
});

test('push registration is exact-session bound and retries on authenticated recovery', () => {
  assert.match(runtime, /expectedSessionEpoch \?\? BackendRepository\.authSessionEpoch/u);
  assert.match(runtime, /_pushOperationQueue/u);
  assert.match(runtime, /registerPushDevice\([\s\S]*?expectedSessionEpoch: expectedSessionEpoch/u);
  assert.match(runtime, /return await _syncPushRegistrationOnce\(requestedEpoch\)/u);
  assert.match(runtime, /onTokenRefresh\.listen[\s\S]*?_registerRefreshedToken/u);
  assert.match(foregroundHost, /WidgetsBindingObserver/u);
  assert.match(foregroundHost, /AppLifecycleState\.resumed/u);
  assert.match(foregroundHost, /BackendRealtimeService\.authenticatedReadyEvents/u);
  assert.match(realtime, /decoded\['type'\] == 'ready'[\s\S]*?_authenticatedReadyEvents\.add\(null\)/u);
});

test('push cleanup is exact-session owned and cannot drift to a successor account', () => {
  assert.match(runtime, /setPushBackendCleanupPending\([\s\S]*?ownerToken: cleanupOwnerToken/u);
  assert.match(runtime, /preferences\.pushBackendCleanupOwnerToken != currentOwnerToken/u);
  assert.match(runtime, /deleteCurrentSessionPushDevices\([\s\S]*?expectedSessionEpoch: expectedSessionEpoch/u);
  assert.match(runtime, /return _pushOperationQueue\.run\([\s\S]*?_setPushEnabledOnce/u);
});

test('device-service consent dialog is route-owned and account-epoch guarded', () => {
  assert.match(settings, /TrackedDialogRouteHandle<void>/u);
  assert.match(settings, /routeHandle: handle/u);
  assert.match(settings, /activeDialog\.dismiss\(\)/u);
  assert.match(settings, /interactionEpoch == AuthService\.sessionEpoch/u);
  assert.match(settings, /_showServiceError\([\s\S]*?interactionEpoch: interactionEpoch/u);
  assert.doesNotMatch(settings, /Navigator\.of\(context, rootNavigator: true\)\.pop/u);
  assert.match(settings, /Deine Einwilligung ist gespeichert/u);
  assert.match(settings, /bestätigten Verbindung oder beim nächsten Öffnen/u);
});
