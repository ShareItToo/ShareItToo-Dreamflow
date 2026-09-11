import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);

const auth = read('lib/services/auth_service.dart');
const data = read('lib/services/data_service.dart');
const transitions = read('lib/services/session_transition_service.dart');
const profile = read('lib/screens/profile_screen.dart');
const login = read('lib/screens/login_screen.dart');
const firebaseRuntime = read('lib/services/firebase_runtime.dart');
const trackedRoute = read('lib/widgets/tracked_dialog_route.dart');
const regression = read('scripts/technical_regression_check.sh');

const method = (source, start, end) => source.slice(
  source.indexOf(start),
  source.indexOf(end, source.indexOf(start)),
);

test('every app-owned auth-session mutation is serialized and epoch ratcheted', () => {
  assert.match(auth, /class _AuthSessionMutationQueue/u);
  assert.match(auth, /static final _AuthSessionMutationQueue _sessionMutationQueue/u);
  assert.equal([...auth.matchAll(/setString\(_sessionKey/gu)].length, 1);
  assert.equal([...auth.matchAll(/remove\(_sessionKey/gu)].length, 2);
  for (const marker of [
    'return _sessionMutationQueue.run(() async {',
    '_sessionGeneration += 1;',
    'clearSessionOwnerIfMatches(',
    '_storedSessionMatchesOwner(raw, owner)',
    'isSessionClearReceiptCurrent(',
  ]) assert.match(auth, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));

  const broadClear = method(
    auth,
    'static Future<void> clearSession()',
    '/// Clears only the exact captured session owner.',
  );
  assert.match(broadClear, /captureSessionOwner\(session\)/u);
  assert.match(broadClear, /clearSessionOwnerIfMatches/u);
  assert.doesNotMatch(broadClear, /remove\(_sessionKey/u);

  const exactClear = method(
    auth,
    'static Future<AuthSessionClearReceipt?> clearSessionOwnerIfMatches(',
    '/// Removes a backend session only when the exact expected principal',
  );
  const pushBoundary = exactClear.indexOf(
    'FirebaseRuntime.closeAuthenticatedPushSessionForLogout()',
  );
  const localRemovalAwait = exactClear.indexOf(
    'final removed = await prefs.remove(_sessionKey)',
  );
  const localRemoval = exactClear.indexOf('prefs.remove(_sessionKey)');
  assert.ok(pushBoundary >= 0 && pushBoundary < localRemoval);
  assert.doesNotMatch(
    exactClear.slice(pushBoundary, localRemovalAwait),
    /await\s/u,
  );
  assert.match(exactClear, /await BackendRealtimeService\.disconnect\(\)/u);
  assert.doesNotMatch(
    exactClear,
    /FirebaseMessaging\.instance\.(?:deleteToken|setAutoInitEnabled)/u,
  );
  assert.doesNotMatch(exactClear, /clearPushRegistrationForLogout/u);
});

test('logout push boundary is synchronous and stale registration cannot reopen it', () => {
  const closeBoundary = method(
    firebaseRuntime,
    'static void closeAuthenticatedPushSessionForLogout()',
    '@visibleForTesting\n  static void markAuthenticatedPushSessionActiveForTesting',
  );
  assert.match(closeBoundary, /_authenticatedPushSessionGeneration \+= 1/u);
  assert.match(closeBoundary, /_authenticatedPushSessionActive = false/u);
  assert.match(closeBoundary, /_pendingActionLink = null/u);
  assert.doesNotMatch(closeBoundary, /await|FirebaseMessaging|deleteToken/u);

  const syncRegistration = method(
    firebaseRuntime,
    'static Future<bool> syncPushRegistration() async',
    'static Future<bool> setPushEnabled(bool enabled) async',
  );
  assert.match(
    syncRegistration,
    /final operationGeneration = \+\+_authenticatedPushSessionGeneration/u,
  );
  assert.match(syncRegistration, /final registered = await _registerToken/u);
  assert.match(
    syncRegistration,
    /!registered \|\|\s*operationGeneration != _authenticatedPushSessionGeneration/u,
  );
  const gateOpen = syncRegistration.indexOf(
    '_authenticatedPushSessionActive = true',
  );
  const finalGenerationCheck = syncRegistration.lastIndexOf(
    'operationGeneration != _authenticatedPushSessionGeneration',
  );
  assert.ok(finalGenerationCheck >= 0 && finalGenerationCheck < gateOpen);
});

test('session transition cleanup preserves a successor profile and fails closed', () => {
  const conditionalProfileClear = method(
    data,
    'static Future<bool> clearCurrentUserIfMatches(',
    '/// Read-only current-profile snapshot',
  );
  assert.match(conditionalProfileClear, /current\.id\.trim\(\) != expectedId/u);
  assert.match(conditionalProfileClear, /current\.email\.trim\(\)\.toLowerCase\(\) != expectedEmail/u);
  assert.match(conditionalProfileClear, /return false;/u);

  for (const marker of [
    'AuthService.clearSessionOwnerIfMatches(',
    'DataService.clearCurrentUserIfMatches(',
    'AuthService.isStoredSessionDefinitelyAbsent()',
    'completion.completionEpoch != sessionEpoch',
  ]) assert.match(transitions, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(transitions, /DataService\.clearCurrentUser\(\)/u);
  assert.doesNotMatch(transitions, /AuthService\.clearSession\(\)/u);
});

test('profile logout captures A before await and owns only the A dialog route', () => {
  const logout = method(
    profile,
    'Future<void> _confirmLogout() async',
    'Widget _buildFeedbackSection()',
  );
  const capture = logout.indexOf('final owner = _activeSessionOwner;');
  const firstAwait = logout.indexOf('await ');
  assert.ok(capture >= 0 && capture < firstAwait);
  assert.match(logout, /showTrackedDialog<bool>/u);
  assert.match(logout, /handle\.dismiss\(false\)/u);
  assert.match(logout, /handle\.dismiss\(true\)/u);
  assert.doesNotMatch(logout, /Navigator\.of\(dialogContext\)\.(?:pop|maybePop)/u);
  assert.match(logout, /isOwnerCurrent\(owner\)[\s\S]*?\.signOut\(owner\)/u);
  assert.match(logout, /isCompletionCurrent\(completion\)[\s\S]*?preview\.setState/u);
  assert.match(logout, /isCompletionCurrent\(completion\)[\s\S]*?pushAndRemoveUntil/u);
  assert.match(profile, /_activeLogoutDialog\?\.dismiss\(false\)/u);
  assert.match(profile, /_dismissLogoutDialogIfOwnerChanged/u);
  assert.match(trackedRoute, /navigator\.removeRoute\(route, result\)/u);
});

test('login clear paths capture owner or confirmed-empty epoch before first await', () => {
  const guest = method(
    login,
    'Future<void> _continueAsGuest() async',
    '@override\n  void initState()',
  );
  const ownerCapture = guest.indexOf('final owner = _observedSessionOwner;');
  const epochCapture = guest.indexOf('final noSessionEpoch = _confirmedNoSessionEpoch;');
  const firstAwait = guest.indexOf('await ');
  assert.ok(ownerCapture >= 0 && ownerCapture < firstAwait);
  assert.ok(epochCapture >= 0 && epochCapture < firstAwait);
  assert.doesNotMatch(guest, /AuthService\.clearSession\(\)/u);
  assert.doesNotMatch(guest, /DataService\.clearCurrentUser\(\)/u);
  assert.match(guest, /isCompletionCurrent\(completion\)[\s\S]*?preview\.setState/u);
  assert.match(guest, /isCompletionCurrent\(completion\)[\s\S]*?_exitToExplore/u);

  const bootstrap = method(
    login,
    'Future<void> _bootstrap() async',
    '@override\n  void dispose()',
  );
  assert.ok(
    bootstrap.indexOf('final startingEpoch = _sessionTransitions.sessionEpoch;') <
      bootstrap.indexOf('await '),
  );
  assert.match(bootstrap, /captureOwner\(session\)[\s\S]*?isOwnerCurrent\(owner\)[\s\S]*?currentUserForOwner/u);
  assert.match(bootstrap, /isOwnerCurrent\(owner\)[\s\S]*?clearStaleSession\(owner\)/u);
});

test('supported regression permanently executes RW16 behavior and wiring tests', () => {
  for (const marker of [
    'test/rw16_session_transition_principal_epoch_test.dart',
    'test/tool/rw16_session_transition_principal_epoch_wiring.test.mjs',
    'test/tool/validate_rw16_session_transition_principal_epoch.test.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});
