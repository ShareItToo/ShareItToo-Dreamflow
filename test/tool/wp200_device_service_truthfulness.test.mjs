import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync(
  new URL('../../lib/services/firebase_runtime.dart', import.meta.url),
  'utf8',
);
const prefs = readFileSync(
  new URL('../../lib/services/firebase_service_preferences.dart', import.meta.url),
  'utf8',
);
const settings = readFileSync(
  new URL('../../lib/screens/notification_settings_screen.dart', import.meta.url),
  'utf8',
);

const slice = (source, start, end) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = source.indexOf(end, from);
  return source.slice(from, to < 0 ? source.length : to);
};

test('push opt-out closes local gate before provider initialization and preserves foreign markers', () => {
  const disable = slice(
    runtime,
    'static Future<bool> _setPushEnabledOnce(',
    'static Future<bool> _registerToken(',
  );
  const disableBranch = slice(disable, 'if (!enabled)', 'if (!await initialize())');
  assert.match(disableBranch, /closeAuthenticatedPushSessionForLogout\(\)/u);
  assert.match(disableBranch, /setPushEnabled\(false\)/u);
  assert.doesNotMatch(
    disableBranch,
    /setPushBackendCleanupPending\(\s*false\s*\)/u,
  );
  assert.match(disableBranch, /setPushLocalCleanupPending\(true\)/u);
  assert.match(
    runtime,
    /pushBackendCleanupOwnerTokens[\s\S]*?contains\(currentOwnerToken\)/u,
  );
});

test('crash opt-out is persisted immediately and cleanup retries separately', () => {
  const change = slice(
    runtime,
    'static Future<FirebaseServiceToggleResult> setCrashDiagnosticsResult(',
    '/// Compatibility wrapper',
  );
  assert.match(change, /setCrashDiagnosticsEnabled\(false\)/u);
  assert.match(change, /setCrashDiagnosticsCleanupPending\(\s*true/u);
  assert.match(runtime, /static Future<bool> _retryPendingCrashCleanup\(/u);
  assert.match(prefs, /crashDiagnosticsCleanupPending/u);
});

test('local/debug crash consent cannot be reported as active collection', () => {
  const result = slice(
    runtime,
    'final persisted = (await FirebaseServicePreferencesStore.read())',
    '/// Compatibility wrapper',
  );
  assert.match(runtime, /crashDiagnosticsCollectionAllowed\(/u);
  assert.match(runtime, /setCrashDiagnosticsCleanupPending\(\s*false/u);
  const initialize = slice(runtime, 'static Future<bool> _initialize()', 'static void recordFlutterFatalError');
  assert.match(initialize, /crashDiagnosticsCollectionAllowed\(/u);
  assert.match(initialize, /setCrashDiagnosticsEnabled\(false\)/u);
});

test('account deletion removes only the captured owner marker', () => {
  const deletion = slice(
    runtime,
    'static Future<void> deleteInstallationForAccountDeletion()',
    'static Future<bool> _retryPendingInstallationCleanup()',
  );
  assert.match(deletion, /_captureCurrentPushCleanupOwnerToken\(/u);
  assert.match(deletion, /ownerToken: deletedOwnerToken/u);
  assert.doesNotMatch(deletion, /setPushBackendCleanupPending\(false\)/u);
});

test('notification settings labels match the split feed semantics and persist by readback', () => {
  assert.match(settings, /title: 'Sonstiges & System'/u);
  assert.match(settings, /Nicht zuordenbare Hinweise/u);
  assert.match(settings, /Übergabe & Rückgabe haben einen eigenen Filter/u);
  assert.match(settings, /_preferenceWriteGeneration/u);
  assert.match(settings, /NotificationPreferencesWriteQueue/u);
  assert.match(settings, /_preferenceWriteQueue\.add/u);
  assert.match(settings, /NotificationPreferencesService\.get\(\)/u);
  assert.match(settings, /Einstellung nicht gespeichert/u);
});
