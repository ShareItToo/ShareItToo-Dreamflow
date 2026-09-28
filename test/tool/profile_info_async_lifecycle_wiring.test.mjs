import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/profile_info_screen.dart', import.meta.url),
  'utf8',
);
const compactSource = source.replace(/\s+/gu, ' ');
const mutationService = readFileSync(
  new URL('../../lib/services/profile_mutation_service.dart', import.meta.url),
  'utf8',
);
const thread = readFileSync(
  new URL('../../lib/screens/message_thread_screen.dart', import.meta.url),
  'utf8',
);
const booking = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);

test('late profile-load failure cannot update disposed state', () => {
  assert.match(
    source,
    /catch \(e\) \{\s+\/\/ just fallback[\s\S]*?if \(!mounted \|\| revision != _loadRevision\) return;\s+setState\(\(\) \{\s+_loading = false;/u,
  );
});

test('profile editor does not wait for optional rental statistics', () => {
  const profileReady = source.indexOf('_loading = false;');
  const statsKickoff = source.indexOf('unawaited(_loadMembershipStats');
  assert.ok(profileReady >= 0, 'profile readiness state is present');
  assert.ok(statsKickoff > profileReady, 'stats start after the editor is ready');
  assert.match(source, /Future\.wait<List<RentalRequest>>\([\s\S]*?\.timeout\(const Duration\(seconds: 5\)\)/u);
  assert.match(source, /Buchungszahlen sind gerade nicht verfügbar\./u);
  assert.match(source, /child: const Text\('Erneut versuchen'\)/u);
});

test('profile save bounds photo persistence and restores user retry', () => {
  assert.match(
    source,
    /persistPhotoDraft\([\s\S]*?updateProfile\([\s\S]*?\}\)\(\)\.timeout\(const Duration\(seconds: 15\)\)/u,
  );
  assert.match(source, /e is TimeoutException/u);
  assert.match(source, /Speichern nicht abgeschlossen/u);
  assert.match(source, /remoteMutationMayHaveStarted = true/u);
  assert.match(source, /Speicherstatus ist unklar/u);
  assert.match(source, /versuche es erneut\./u);
});

test('profile save coalesces its own projection event without stranding busy state', () => {
  assert.match(
    source,
    /key == SharedPersistenceSync\.profileStateKey[\s\S]*?if \(_saving\) \{\s+_profileRefreshPending = true;[\s\S]*?unawaited\(_load\(\)\);/u,
  );
  assert.match(
    source,
    /_user = result\.user;[\s\S]*?_profileRefreshPending = false;[\s\S]*?_profileActions\.replaceContext/u,
  );
  assert.match(
    source,
    /void _finishSave\(\)[\s\S]*?if \(_saving\) setState\(\(\) => _saving = false\);[\s\S]*?if \(refreshPending\) unawaited\(_load\(\)\);/u,
  );
  assert.match(source, /finally \{[\s\S]*?_finishSave\(\);\s+\}/u);
  assert.match(
    source,
    /_isActionCurrentForFeedback[\s\S]*?\.timeout\(const Duration\(seconds: 3\), onTimeout: \(\) => false\)/u,
  );
});

test('successful profile patch rechecks exact owner and refreshes local state', () => {
  assert.match(
    compactSource,
    /persistPhotoDraft\( context: owner\.context, photoDraft: _photoDraft, \)/u,
  );
  assert.match(
    compactSource,
    /final result = await _profileMutationService\.updateProfile\( context: owner\.context,/u,
  );
  assert.equal(
    [...compactSource.matchAll(/if \(!await _profileActions\.isCurrent\( _profileMutationService, owner, \)\) \{ throw const ProfileMutationFailure\.principalChanged\(\); \}/gu)].length,
    2,
  );
  assert.match(
    compactSource,
    /return result; \}\)\(\)\.timeout[\s\S]*?setState\(\(\) \{ _user = result\.user; _photoDraft = result\.user\.photoURL;/u,
  );
  assert.match(
    compactSource,
    /_profileActions\.replaceContext\([\s\S]*?owner: owner\.context\.owner[\s\S]*?final refreshedOwner = _profileActions\.capture\(\);[\s\S]*?_showOwnedStatus\( refreshedOwner,[\s\S]*?if \(!await _isActionCurrentForFeedback\(refreshedOwner\)\) \{ return; \}[\s\S]*?_profileActions\.removeOwnedNavigationRoute\(screenRoute\);/u,
  );
  assert.match(source, /on ProfileMutationFailure catch \(failure\)/u);
  assert.doesNotMatch(source, /DataService\.updateCurrentUserProfile\(/u);
  assert.doesNotMatch(source, /Navigator\.of\(context\)\.maybePop\(\);/u);
  assert.doesNotMatch(source, /DataService\.setCurrentUser\(/u);
});

test('profile lifecycle fix contains no timing or lint accommodation', () => {
  assert.doesNotMatch(source, /ignore:\s*use_build_context_synchronously/u);
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});

test('profile save reads the authenticated projection back before reporting success', () => {
  assert.match(
    mutationService,
    /performProfileMutation\([\s\S]*?syncCurrentUserForSessionOwner\([\s\S]*?context\.owner\.authOwner/u,
  );
  assert.match(
    mutationService,
    /ProfileMutationFailure\.outcomeUnknown\([\s\S]*?remoteAccepted/u,
  );
  assert.match(
    mutationService,
    /ProfileMutationFailure\.localUnavailable\([\s\S]*?remoteAccepted: remoteAccepted/u,
  );
});

test('open identity surfaces refresh the authoritative avatar after profile changes', () => {
  assert.match(
    thread,
    /key == SharedPersistenceSync\.accountSecurityStateKey[\s\S]*?_clearSensitiveThreadState\(\)[\s\S]*?_sharedPersistenceRefresh\.schedule\(_load\)/u,
  );
  assert.match(
    booking,
    /key != SharedPersistenceSync\.accountSecurityStateKey[\s\S]*?_reloadFromSharedPersistence/u,
  );
  assert.match(
    booking,
    /counterparty = counterpartyId\.isEmpty[\s\S]*?DataService\.getUserById\(counterpartyId\)/u,
  );
});
