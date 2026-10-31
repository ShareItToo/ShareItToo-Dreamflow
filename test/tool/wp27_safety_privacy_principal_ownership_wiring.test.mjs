import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);

const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} section bounds`);
  return source.slice(from, to);
};

const backend = read('lib/services/backend_repository.dart');
const dataService = read('lib/services/data_service.dart');
const safety = read('lib/services/safety_action_service.dart');
const local = read('lib/services/local_safety_privacy_service.dart');
const interaction = read('lib/widgets/safety_action_interaction.dart');

test('safety remote methods resolve credentials only for captured owner', () => {
  for (const [marker, next] of [
    ['getBlockedUserIdsForOwner', 'static Future<void> blockUser('],
    ['blockUserForOwner', 'static Future<void> unblockUser('],
    ['unblockUserForOwner', 'static Future<Map<String, dynamic>> createReport('],
    ['createReportForOwner', 'static Future<Map<String, dynamic>> createHarassmentBlockReport('],
    ['createHarassmentBlockReportForOwner', 'static Future<List<Map<String, dynamic>>> getMyReports('],
  ]) {
    const body = section(backend, marker, next);
    assert.match(body, /_authorizedForOwner\(/u, marker);
    assert.doesNotMatch(body, /_authorized\(|_token\(\)/u, marker);
  }

  const upload = section(
    backend,
    'static Future<Map<String, dynamic>> uploadReportEvidenceForOwner(',
    '\n  }\n}',
  );
  assert.match(upload, /AuthService\.accessTokenForOwner\(owner\)/u);
  assert.match(upload, /AuthService\.isSessionOwnerDefinitelyCurrent\(owner\)/u);
  assert.doesNotMatch(upload, /_token\(\)|refreshAccessToken\(/u);
});

test('safety result semantics use exact rejection allowlist and keep 408 unknown', () => {
  for (const marker of [
    "'invalid_block_target'",
    "'invalid_report_target_type'",
    "'cannot_report_self'",
    "'report_evidence_not_owned'",
    "'authentication_required'",
    "'report_target_forbidden'",
    "'report_target_not_found'",
    "'active_report_already_exists'",
    "'rate_limit_exceeded'",
    'SafetyActionFailureKind.outcomeUnknown',
    'remoteAcceptedOrConfirmed: remoteAccepted',
  ]) assert.match(safety, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(safety, /408:\s*<String>/u);
  assert.doesNotMatch(safety, /400:\s*<String>\{[^}]*'request_failed'/su);
  assert.doesNotMatch(safety, /403:\s*<String>\{[^}]*'forbidden'/su);
  assert.doesNotMatch(safety, /409:\s*<String>\{[^}]*'conflict'/su);
  const upload = section(
    backend,
    'static Future<Map<String, dynamic>> uploadReportEvidenceForOwner(',
    '\n  }\n}',
  );
  assert.match(upload, /decoded\['error'\]/u);
  assert.match(upload, /evidence_upload_failed/u);
});

test('local safety writes remain bound to explicit opaque principal', () => {
  for (const marker of [
    'getBlockedUserIdsForPrincipal',
    'setBlockedUserIdsForPrincipal',
    'blockUserForPrincipal',
    'unblockUserForPrincipal',
    'addReportForPrincipal',
    'addHarassmentReportAndBlockForPrincipal',
  ]) assert.match(local, new RegExp(marker, 'u'));
  assert.match(safety, /context\.localPrincipal/u);
  assert.match(safety, /blockUserLocal\(context, normalized\)/u);
  assert.match(safety, /unblockUserLocal\(context, normalized\)/u);
});

test('message actions keep the captured auth owner through remote mutation and refresh', () => {
  for (const marker of [
    'getMessageThreadsSnapshotForOwner',
    'markThreadReadForOwner',
    'setThreadArchivedForOwner',
  ]) {
    const from = backend.indexOf(`static Future<`);
    assert.ok(backend.indexOf(marker, from) >= 0, marker);
  }
  const snapshotRead = section(
    backend,
    'static Future<BackendMessageThreadsSnapshot>\n      getMessageThreadsSnapshotForOwner(',
    '\n  static Future<List<Map<String, dynamic>>> getMessageThreadsForOwner(',
  );
  assert.match(snapshotRead, /AuthSessionOwner sessionOwner/u);
  assert.match(snapshotRead, /LocalPrincipalActionOwner\? owner/u);
  assert.match(
    snapshotRead,
    /capturedOwner\.sessionOwner![\s\S]*?sessionOwner\.epoch[\s\S]*?sessionOwner\.userId[\s\S]*?isSessionOwnerDefinitelyCurrent\(sessionOwner\)/u,
  );
  assert.match(
    snapshotRead,
    /_authorizedForOwner\(\s*owner: sessionOwner,/u,
  );
  assert.equal(
    snapshotRead.match(/await capturedOwner\.assertCurrent\(\)/gu)?.length,
    2,
  );
  assert.match(
    backend,
    /markThreadReadForOwner\([\s\S]*?_authorizedForOwner\(/u,
  );
  assert.match(
    backend,
    /setThreadArchivedForOwner\([\s\S]*?_authorizedForOwner\(/u,
  );
  const deleteMessageThread = section(
    dataService,
    'static Future<void> deleteMessageThreadForUser(',
    '\n  static Future<int> getUnreadThreadCountForUser(',
  );
  assert.match(
    deleteMessageThread,
    /AuthSessionOwner\? sessionOwner[\s\S]*?setThreadArchivedForOwner\([\s\S]*?owner: owner[\s\S]*?getMessageThreadsSnapshotForOwner\(owner\)[\s\S]*?_assertCurrentOperationalUserId\(current\.id\)[\s\S]*?_persistMessageThreads\([\s\S]*?snapshot\.copyThreads\(\)[\s\S]*?verifyAuthorization: snapshot\.assertCurrent/u,
  );
  const messagePersistence = section(
    dataService,
    'static Future<void> _persistMessageThreads(',
    '\n  static Future<String?> _readMessageThreads(',
  );
  assert.equal(
    messagePersistence.match(/await verifyAuthorization\?\.call\(\)/gu)?.length,
    2,
  );
});

test('every reachable user safety surface captures owner before awaits', () => {
  const screens = [
    'lib/screens/report_user_screen.dart',
    'lib/screens/blocked_users_screen.dart',
    'lib/screens/messages_screen.dart',
    'lib/screens/message_thread_screen.dart',
    'lib/screens/public_profile_screen.dart',
  ];
  for (const path of screens) {
    const source = read(path);
    assert.match(source, /SafetyActionInteractionController/u, path);
    assert.match(source, /SharedPersistenceSync\.accountSecurityStateKey/u, path);
    assert.match(source, /_safetyActions\.capture\(\)/u, path);
    assert.match(source, /_safetyActions\.isCurrent\(/u, path);
    assert.match(source, /SafetyActionFailure/u, path);
  }

  const targetSources = screens.map(read).join('\n');
  assert.doesNotMatch(
    targetSources,
    /BlockedUsersService\.(?:blockUser|unblockUser)\(/u,
  );
  assert.doesNotMatch(targetSources, /UserReportsService\.add/u);
  assert.doesNotMatch(
    targetSources,
    /BackendRepository\.uploadReportEvidence\(/u,
  );
});

test('typed safety handlers stay ahead of generic catches', () => {
  const bounds = [
    ['lib/screens/report_user_screen.dart', 'Future<void> _submit() async {', 'Future<void> _showOwnedNotice('],
    ['lib/screens/blocked_users_screen.dart', 'Future<void> _confirmUnblock(', 'Future<void> _showOwnedNotice('],
    ['lib/screens/messages_screen.dart', 'Future<void> _openThreadOptions(', 'Future<bool> _confirmDelete('],
    ['lib/screens/message_thread_screen.dart', 'Future<void> _toggleBlockUser() async {', 'Future<void> _showSafetyNotice('],
  ];
  for (const [path, start, end] of bounds) {
    const body = section(read(path), start, end);
    const typed = body.indexOf('on SafetyActionFailure catch (failure)');
    const generic = body.indexOf('catch (', typed + 1);
    assert.ok(typed >= 0, `${path}: typed handler missing`);
    assert.ok(generic > typed, `${path}: generic catch precedes typed handler`);
    assert.doesNotMatch(body, /blieb unverändert|nicht gesendet/u, path);
  }
});

test('safety route invalidation removes only the exact owned route', () => {
  for (const marker of [
    'TrackedDialogRouteHandle<T>()',
    'showTrackedDialog<T>',
    'showTrackedGeneralDialog<T>',
    'showTrackedModalBottomSheet<T>',
    'identical(identity, _activeRouteIdentity)',
    '_dismissActiveRoute = handle.dismiss',
  ]) assert.match(interaction, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  const invalidate = section(
    interaction,
    'void invalidate() {',
    'SafetyActionOwner? capture() {',
  );
  assert.doesNotMatch(invalidate, /Navigator|maybePop|\.pop\(/u);

  const messages = read('lib/screens/messages_screen.dart');
  const dismissible = section(
    messages,
    'class _ThreadDismissible',
    'class _SwipeActionsBackground',
  );
  assert.match(dismissible, /await onSwipeActions\(\);/u);
  assert.doesNotMatch(dismissible, /showModalBottomSheet|Navigator/u);
  assert.match(
    messages,
    /Future<void> _openSwipeActions\(MessageThread thread\) async \{[\s\S]*?final owner = _safetyActions\.capture\(\);[\s\S]*?final choice = await _safetyActions\.showOwnedSheet<String>/u,
  );
  assert.match(
    messages,
    /class _GlassSheet[\s\S]*?final VoidCallback onClose;[\s\S]*?onTap: onClose/u,
  );
  assert.doesNotMatch(messages, /Navigator\.of\(context\)\.pop\(/u);
});

test('communication refresh includes account-security transitions', () => {
  const sync = read('lib/services/shared_persistence_sync.dart');
  const communication = section(
    sync,
    'static bool affectsCommunicationSync(String key)',
    'static bool isSharedPersistenceKey',
  );
  assert.match(communication, /accountSecurityStateKey/u);
});

test('web cross-tab refresh includes principal-bound safety state', () => {
  const source = read('lib/services/shared_persistence_sync_web.dart');
  assert.match(source, /SharedPersistenceKeys.sharedKeys/u);
  assert.match(read('lib/services/shared_persistence_keys.dart'), /'local_safety_privacy_state_v1'/u);
});
