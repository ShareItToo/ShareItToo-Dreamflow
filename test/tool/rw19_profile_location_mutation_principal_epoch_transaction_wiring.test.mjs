import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const backendRepository = read('lib/services/backend_repository.dart');
const dataService = read('lib/services/data_service.dart');
const coordinator = read('lib/services/profile_mutation_service.dart');
const interaction = read('lib/widgets/profile_mutation_interaction.dart');
const regression = read('scripts/technical_regression_check.sh');
const screens = [
  'lib/screens/change_address_screen.dart',
  'lib/screens/contact_data_screen.dart',
  'lib/screens/edit_profile_screen.dart',
  'lib/screens/edit_social_media_screen.dart',
  'lib/screens/explore_screen.dart',
  'lib/screens/own_profile_screen.dart',
  'lib/screens/profile_info_screen.dart',
];

const method = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} method bounds`);
  return source.slice(from, to);
};

test('profile backend requests resolve credentials only for the captured owner', () => {
  const owned = method(
    backendRepository,
    'static Future<Map<String, dynamic>> _authorizedForOwner(',
    'static List<Map<String, dynamic>> _maps(',
  );
  assert.match(owned, /AuthService\.accessTokenForOwner\(owner\)/u);
  assert.match(owned, /AuthService\.isSessionOwnerDefinitelyCurrent\(owner\)/u);
  assert.doesNotMatch(owned, /_token\(\)|AuthService\.accessToken\(\)/u);

  const update = method(
    backendRepository,
    'static Future<Map<String, dynamic>> updateCurrentProfileForOwner(',
    'static Future<List<Map<String, dynamic>>> autocompleteAddresses(',
  );
  assert.match(update, /_authorizedForOwner\([\s\S]*?owner:\s*owner/u);
});

test('data-layer profile mutation rechecks exact owner around remote and local commit', () => {
  const mutation = method(
    dataService,
    'static Future<AccountProfileMutationResult> _updateCurrentUserProfileOwned(',
    'static AccountProfileMutationFailure _accountProfileBackendFailure(',
  );
  assert.match(
    mutation,
    /await verifyOwner\(\);[\s\S]*?BackendRepository\.updateCurrentProfileForOwner\([\s\S]*?remoteAccepted = true;[\s\S]*?await verifyOwner\(\);/u,
  );
  assert.match(
    mutation,
    /_persistAccountProfileDocumentsVerified\([\s\S]*?verifyAuthorization:\s*verifyOwner/u,
  );
  assert.match(mutation, /remoteAccepted:\s*remoteAccepted/u);
  assert.match(
    dataService,
    /syncCurrentUserForSessionOwner[\s\S]*?BackendRepository\.getCurrentProfileForOwner\(owner\)/u,
  );
});

test('profile result semantics use an exact rejection allowlist and preserve accepted truth', () => {
  for (const marker of [
    "400: <String>{'minimum_age_required', 'invalid_phone'}",
    "'authentication_required'",
    "'invalid_or_expired_session'",
    "'account_not_active'",
    "404: <String>{'user_not_found'}",
    'ProfileMutationFailureKind.outcomeUnknown',
    'remoteAccepted: failure.remoteAccepted',
  ]) assert.match(coordinator, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(coordinator, /408:\s*<String>/u);
  assert.match(dataService, /AccountProfileMutationFailureKind\.outcomeUnknown/u);
  assert.doesNotMatch(dataService, /408:\s*<String>/u);
});

test('all repository-owned profile screens use the owner coordinator and no direct data write', () => {
  for (const path of screens) {
    const source = read(path);
    assert.match(source, /ProfileMutationInteractionController/u, path);
    assert.match(source, /SharedPersistenceSync\.accountSecurityStateKey/u, path);
    assert.match(source, /_profileActions\.capture\(\)/u, path);
    assert.match(source, /_profileMutationService/u, path);
    assert.match(source, /\.updateProfile\(/u, path);
    assert.match(source, /on ProfileMutationFailure catch \(failure\)/u, path);
    assert.doesNotMatch(source, /DataService\.updateCurrentUserProfile\(/u, path);
    assert.doesNotMatch(source, /DataService\.setCurrentUser\(/u, path);
  }
});

test('typed profile failures are handled before generic catches in every mutation screen', () => {
  for (const path of screens) {
    const source = read(path);
    const typed = source.indexOf('on ProfileMutationFailure catch (failure)');
    const generic = source.indexOf('catch (', typed);
    assert.ok(typed >= 0, `${path}: typed failure handler missing`);
    assert.ok(generic > typed, `${path}: generic catch precedes typed handler`);
  }
});

test('route cleanup is bound to exact identities and never pops the successor route', () => {
  for (const marker of [
    '_activeRouteIdentity',
    'identical(identity, _activeRouteIdentity)',
    'TrackedDialogRouteHandle<T>()',
    'routeNavigator.removeRoute(route)',
    'navigator.removeRoute(route)',
  ]) assert.match(interaction, new RegExp(escaped(marker), 'u'));
  const invalidate = method(
    interaction,
    'void invalidate() {',
    'ProfileMutationActionOwner? capture() {',
  );
  assert.doesNotMatch(invalidate, /Navigator|maybePop|pop\(/u);
  assert.doesNotMatch(interaction, /Navigator\.of\([^)]*\)\.maybePop/u);
});

test('location permission and media awaits revalidate the captured profile owner', () => {
  const explore = read('lib/screens/explore_screen.dart');
  assert.match(
    explore,
    /Geolocator\.checkPermission\(\)[\s\S]*?_profileActions\.isCurrent[\s\S]*?Geolocator\.requestPermission\(\)[\s\S]*?_profileActions\.isCurrent[\s\S]*?Geolocator\.getCurrentPosition\([\s\S]*?_profileActions\.isCurrent/u,
  );
  const profileInfo = read('lib/screens/profile_info_screen.dart');
  assert.match(
    profileInfo,
    /picker\.pickImage[\s\S]*?_profileActions\.isCurrent[\s\S]*?shot\.readAsBytes\(\)[\s\S]*?_profileActions\.isCurrent/u,
  );
});

test('supported regression permanently retains RW19 implementation and evidence', () => {
  for (const marker of [
    'test/rw19_profile_location_mutation_principal_epoch_transaction_test.dart',
    'test/tool/rw19_profile_location_mutation_principal_epoch_transaction_wiring.test.mjs',
    'test/tool/validate_rw19_profile_location_mutation_principal_epoch_transaction.test.mjs',
    'tool/validate_rw19_profile_location_mutation_principal_epoch_transaction.mjs',
  ]) assert.match(regression, new RegExp(escaped(marker), 'u'));
});
