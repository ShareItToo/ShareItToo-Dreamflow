import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const method = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} method bounds`);
  return source.slice(from, to);
};

const backend = read('lib/services/backend_repository.dart');
const data = read('lib/services/data_service.dart');
const coordinator = read('lib/services/listing_mutation_service.dart');
const interaction = read('lib/widgets/listing_mutation_interaction.dart');
const regression = read('scripts/technical_regression_check.sh');
const mutationScreens = [
  'lib/screens/create_listing_screen.dart',
  'lib/screens/my_listings_screen.dart',
  'lib/screens/own_profile_screen.dart',
];
const listingSurfaces = [
  ...mutationScreens,
  'lib/screens/explore_screen.dart',
];

test('listing backend mutations resolve credentials only for the captured owner', () => {
  const owned = method(
    backend,
    'static Future<Map<String, dynamic>> _authorizedForOwner(',
    'static List<Map<String, dynamic>> _maps(',
  );
  assert.match(owned, /AuthService\.accessTokenForOwner\(owner\)/u);
  assert.match(owned, /AuthService\.isSessionOwnerDefinitelyCurrent\(owner\)/u);
  assert.doesNotMatch(owned, /_token\(\)|AuthService\.accessToken\(\)/u);

  for (const marker of [
    'createListingForOwner',
    'publishBlueOceanListingForOwner',
    'updateListingForOwner',
    'updateListingStatusForOwner',
    'deleteListingForOwner',
    'analyzeBlueOceanListingDraftForOwner',
    'reviewBlueOceanListingDraftForOwner',
    'generateListingSupplyEnrichmentForOwner',
    'recordListingSupplyEnrichmentOutcomeForOwner',
    'uploadImageForOwner',
  ]) assert.match(backend, new RegExp(escaped(marker), 'u'));
});

test('data listing transaction preserves accepted truth and verifies local commit', () => {
  const owned = method(
    data,
    'static Future<AccountListingMutationResult> _runListingMutationForOwner(',
    'static AccountListingMutationFailure _accountListingBackendFailure(',
  );
  assert.match(owned, /AuthService\.isSessionOwnerDefinitelyCurrent\(owner\)/u);
  assert.match(owned, /await operation\(captured, verifyOwner, attempt\)/u);
  assert.match(owned, /remoteAccepted:\s*attempt\.remoteAccepted/u);

  const persistence = method(
    data,
    'static Future<void> _persistListings(',
    'static List<Item> _readListingsStrict(',
  );
  assert.match(persistence, /await verifyAuthorization\?\.call\(\)/u);
  assert.match(persistence, /_restorePreferenceString|prefs\.setString|prefs\.remove/u);

  for (const marker of [
    'BackendRepository.createListingForOwner',
    'BackendRepository.publishBlueOceanListingForOwner',
    'BackendRepository.updateListingForOwner',
    'BackendRepository.updateListingStatusForOwner',
    'BackendRepository.deleteListingForOwner',
  ]) assert.match(data, new RegExp(escaped(marker), 'u'));
  assert.match(data, /attempt\.remoteAccepted = true/u);
});

test('listing result semantics use exact rejection allowlist and keep 408 unknown', () => {
  for (const marker of [
    "'listing_title_required'",
    "'listing_photo_must_be_uploaded'",
    "'invalid_listing_status'",
    "'authentication_required'",
    "'listing_forbidden'",
    "'listing_not_found'",
    "'listing_revision_conflict'",
    'ListingMutationFailureKind.outcomeUnknown',
    'remoteAccepted: failure.remoteAccepted',
  ]) assert.match(coordinator, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(coordinator, /408:\s*<String>/u);
  assert.doesNotMatch(data, /408:\s*<String>/u);
});

test('all listing mutation surfaces use owner action context and no direct screen write', () => {
  for (const path of listingSurfaces) {
    const source = read(path);
    assert.match(source, /ListingMutationInteractionController/u, path);
    assert.match(source, /SharedPersistenceSync\.accountSecurityStateKey/u, path);
    assert.match(source, /_listingActions\.capture\(\)/u, path);
    assert.match(source, /_listingMutationService/u, path);
    assert.doesNotMatch(
      source,
      /DataService\.(?:addItem|updateItem|updateItemStatus|deleteItemById)\s*\(/u,
      path,
    );
    assert.doesNotMatch(
      source,
      /BackendRepository\.(?:createListing|publishBlueOceanListing|updateListing|updateListingStatus|deleteListing|uploadImage|analyzeBlueOceanListingDraft|reviewBlueOceanListingDraft)\s*\(/u,
      path,
    );
  }
  for (const path of [
    'lib/screens/my_listings_screen.dart',
    'lib/screens/own_profile_screen.dart',
  ]) {
    const source = read(path);
    assert.match(source, /int _loadRevision = 0/u, path);
    assert.match(source, /revision != _loadRevision/u, path);
  }
});

test('typed listing failures stay ahead of generic UI catches', () => {
  const bounds = [
    ['lib/screens/create_listing_screen.dart',
      'Future<void> _submit({bool forceInactive = false}) async {',
      'Future<void> _performSubmit('],
    ['lib/screens/my_listings_screen.dart',
      'Future<bool> _runOwnerMutation(',
      'Future<bool> _changeStatus('],
    ['lib/screens/own_profile_screen.dart',
      'Future<void> _changeStatus(Item item, String status) async {',
      'Future<void> _showListingMutationFailure('],
  ];
  for (const [path, start, end] of bounds) {
    const body = method(read(path), start, end);
    const typed = body.indexOf('on ListingMutationFailure catch (failure)');
    const generic = body.indexOf('catch (_)', typed);
    assert.ok(typed >= 0, `${path}: typed handler missing`);
    assert.ok(generic > typed, `${path}: generic catch precedes typed handler`);
    assert.doesNotMatch(body, /blieb unverändert/u, path);
  }
});

test('listing event and route cleanup are bound to exact owner identities', () => {
  assert.match(data, /setLastCreateEventForOwner\(/u);
  assert.match(data, /takeLastCreateEventForOwner\(/u);
  assert.match(data, /_sameAuthSessionOwner\(event\.owner, owner\)/u);
  assert.match(read('lib/screens/explore_screen.dart'),
    /takeLastCreateEventForOwner\(/u);
  assert.match(
    read('lib/screens/explore_screen.dart'),
    /_handleListingCreated\(Item created\)[\s\S]*_listingActions\.capture\(\)[\s\S]*owner\.context\.user\.id != created\.ownerId[\s\S]*_showCreatedPopup\(owner, created, false\)/u,
  );
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
    'ListingMutationActionOwner? capture() {',
  );
  assert.doesNotMatch(invalidate, /Navigator|maybePop|pop\(/u);
});

test('media, draft and submit awaits revalidate the captured listing owner', () => {
  const create = read('lib/screens/create_listing_screen.dart');
  assert.match(
    create,
    /accountSecurityStateKey[\s\S]*ModalRoute\.of\(context\)[\s\S]*removeOwnedNavigationRoute\(ownedRoute\)/u,
  );
  assert.match(create,
    /pickImage\([\s\S]*?_listingActions\.isCurrent/u);
  assert.match(create,
    /pickMultiImage\([\s\S]*?_listingActions\.isCurrent/u);
  assert.match(create,
    /readAsBytes\(\)[\s\S]*?_listingActions\.isCurrent[\s\S]*?_listingMutationService\.uploadImage/u);
  assert.match(create, /_listingMutationService\.analyzeBlueOceanDraft/u);
  assert.match(create, /_listingMutationService\.reviewBlueOceanDraft/u);
  assert.match(create, /_listingMutationService\.execute/u);
});

test('supported regression permanently retains RW20 behavior and wiring tests', () => {
  for (const marker of [
    'test/rw20_listing_mutation_principal_epoch_transaction_test.dart',
    'test/tool/rw20_listing_mutation_principal_epoch_transaction_wiring.test.mjs',
    'test/tool/validate_rw20_listing_mutation_principal_epoch_transaction.test.mjs',
    'tool/validate_rw20_listing_mutation_principal_epoch_transaction.mjs',
  ]) assert.match(regression, new RegExp(escaped(marker), 'u'));
});
