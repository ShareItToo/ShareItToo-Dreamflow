import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);
const service = read('lib/services/account_deletion_service.dart');
const repository = read('lib/services/backend_repository.dart');
const data = read('lib/services/data_service.dart');
const safety = read('lib/services/local_safety_privacy_service.dart');
const screen = read('lib/screens/account_settings_screen.dart');
const regression = read('scripts/technical_regression_check.sh');

const method = (source, start, end) => source.slice(
  source.indexOf(start),
  source.indexOf(end, source.indexOf(start)),
);

test('deletion outcomes are typed and rejection uses only the exact allowlist', () => {
  for (const marker of [
    'AccountDeletionFailureKind.rejected',
    'AccountDeletionFailureKind.localFinalizationFailed',
    'AccountDeletionFailureKind.confirmedLocalFinalizationFailed',
    'AccountDeletionFailureKind.outcomeUnknown',
    "409: <String>{'account_deletion_blocked'}",
    "429: <String>{'rate_limit_exceeded'}",
  ]) assert.match(service, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(service, /408:\s*<String>/u);
  assert.doesNotMatch(service, /statusCode\s*>?=\s*400[\s\S]*?rejected/u);
});

test('preflight unavailable cannot become an empty server blocker truth', () => {
  const preflight = method(
    service,
    'Future<AccountDeletionPreflightResult> preflightCheck(',
    '@protected\n  Future<void> deleteRemoteAccount',
  );
  assert.match(preflight, /AccountDeletionPreflightFailure\.unavailable/u);
  assert.match(preflight, /AccountDeletionPreflightFailure\.invalidResponse/u);
  assert.doesNotMatch(preflight, /catch[\s\S]*?canDelete:\s*true/u);
});

test('confirmed deletion finalizes explicit A and preserves a successor device', () => {
  const finalize = method(
    service,
    'Future<AccountDeletionCompletion> finalizeConfirmedDeletion(',
    '@protected\n  Future<AccountDeletionCompletion?> clearExactSessionAfterUnknown',
  );
  for (const marker of [
    'clearOperationalRecordsForConfirmedAccountDeletion(',
    'clearSavedItemsForConfirmedAccountDeletion(',
    'clearPrincipalForConfirmedAccountDeletion(',
    'finalizeProfileForConfirmedAccountDeletion(',
    'clearSessionOwnerIfMatches(',
  ]) assert.match(finalize, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(finalize, /if \(await isContextCurrent\(context\)\)[\s\S]*?deleteInstallationForAccountDeletion/u);
  assert.match(finalize, /_completionAfterDeletedOwnerDisappeared/u);
});

test('explicit-A data cleanup is separate from current-B state', () => {
  assert.match(data, /clearOperationalRecordsForConfirmedAccountDeletion\([\s\S]*?userId/u);
  assert.match(data, /clearSavedItemsForConfirmedAccountDeletion\([\s\S]*?userId/u);
  assert.match(data, /finalizeProfileForConfirmedAccountDeletion\([\s\S]*?userId/u);
  assert.match(data, /currentMatchesDeleted = current\.id\.trim\(\) == expectedId[\s\S]*?_accountDeletedKey/u);
  assert.match(safety, /clearPrincipalForConfirmedAccountDeletion\([\s\S]*?userId/u);
});

test('UI captures owner before await and keeps typed outcomes distinct', () => {
  const start = method(
    screen,
    'void _confirmDeleteAccount(BuildContext context)',
    'Future<void> _showDeleteDialogStep1(',
  );
  assert.match(start, /final owner = _captureDeletionOwner\(\);/u);
  assert.match(start, /unawaited\(_showDeleteDialogStep1\(owner\)\)/u);
  const flow = method(
    screen,
    'Future<void> _runPreflightAndDelete(',
    'Future<void> _handleDeletionFailure(',
  );
  assert.match(flow, /_isDeletionOwnerCurrent\(owner\)[\s\S]*?preflightCheck/u);
  assert.match(flow, /_isDeletionOwnerCurrent\(owner\)[\s\S]*?deleteAccount/u);
  assert.match(flow, /on AccountDeletionFailure catch/u);
  assert.match(flow, /isCompletionCurrent\(completion\)[\s\S]*?pushAndRemoveUntil/u);
  const failure = method(
    screen,
    'Future<void> _handleDeletionFailure(',
    'Future<void> _showDeletionOutcome(',
  );
  assert.match(failure, /confirmedLocalFinalizationFailed/u);
  assert.match(failure, /localFinalizationFailed/u);
  assert.match(failure, /outcomeUnknown/u);
});

test('remote deletion cannot refresh or fall back to a successor principal', () => {
  const dispatch = method(
    service,
    'Future<void> deleteRemoteAccount({',
    'Future<AccountDeletionContext?> loadCurrentContext()',
  );
  assert.match(dispatch, /required AuthSessionOwner owner/u);
  assert.match(dispatch, /BackendRepository\.deleteAccount\([\s\S]*?owner: owner/u);

  const remoteCall = method(
    repository,
    'static Future<void> deleteAccount({',
    'static Future<bool> registerPushDevice(',
  );
  assert.match(remoteCall, /required AuthSessionOwner owner/u);
  assert.match(remoteCall, /_authorizedForOwner\([\s\S]*?owner: owner/u);
  assert.doesNotMatch(remoteCall, /_authorized\(/u);

  const deletion = method(
    service,
    'Future<AccountDeletionCompletion> deleteAccount({',
    'static bool _isDefiniteRejection(',
  );
  assert.match(deletion, /deleteRemoteAccount\([\s\S]*?owner: context\.owner\.authOwner/u);
});

test('exact route ownership and supported regression retain RW17', () => {
  assert.match(screen, /TrackedDialogRouteHandle/u);
  assert.match(screen, /_dismissActiveDeletionDialog\?\.call\(\)/u);
  assert.match(screen, /_dismissActiveDeletionDialog = \(\) => handle\.dismiss\(\)/u);
  assert.match(screen, /identical\(_activeDeletionDialogIdentity, handle\)/u);
  assert.doesNotMatch(screen, /Navigator\.of\(dialogContext\)\.(?:pop|maybePop)/u);
  for (const marker of [
    'test/rw17_account_deletion_principal_epoch_transaction_test.dart',
    'test/tool/rw17_account_deletion_principal_epoch_transaction_wiring.test.mjs',
    'test/tool/validate_rw17_account_deletion_principal_epoch_transaction.test.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});
