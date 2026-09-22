import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/profile_info_screen.dart', import.meta.url),
  'utf8',
);
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

test('successful profile patch rechecks exact owner and refreshes local state', () => {
  assert.match(
    source,
    /final owner = _profileActions\.capture\(\);[\s\S]*?persistPhotoDraft\([\s\S]*?context: owner\.context,[\s\S]*?if \(!await _profileActions\.isCurrent\([\s\S]*?owner,[\s\S]*?\)\) \{\s+return;\s+\}[\s\S]*?final result = await _profileMutationService\.updateProfile\([\s\S]*?context: owner\.context,/u,
  );
  assert.match(
    source,
    /final result = await _profileMutationService\.updateProfile\([\s\S]*?\}[\s\S]*?if \(!await _profileActions\.isCurrent\([\s\S]*?owner,[\s\S]*?\)\) \{\s+return;\s+\}[\s\S]*?setState\(\(\) \{\s+_user = result\.user;\s+_photoDraft = result\.user\.photoURL;/u,
  );
  assert.match(
    source,
    /_profileActions\.replaceContext\(ProfileMutationContext\([\s\S]*?owner: owner\.context\.owner,[\s\S]*?final refreshedOwner = _profileActions\.capture\(\);[\s\S]*?await _showOwnedStatus\([\s\S]*?refreshedOwner,[\s\S]*?if \(!await _profileActions\.isCurrent\([\s\S]*?refreshedOwner,[\s\S]*?\)\) \{\s+return;\s+\}[\s\S]*?_profileActions\.removeOwnedNavigationRoute\(screenRoute\);/u,
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
