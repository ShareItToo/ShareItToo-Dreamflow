import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

test('RW7 is permanently invoked by the supported regression', () => {
  const regression = read('scripts/technical_regression_check.sh');
  for (const marker of [
    'rw7_local_listing_catalog_authorization_durability_test.dart',
    'rw7_local_listing_catalog_authorization_durability_wiring.test.mjs',
    'validate_rw7_local_listing_catalog_authorization_durability.mjs',
  ]) assert.match(regression, new RegExp(escaped(marker), 'u'));
});

test('listing writes bind current session exact owner and revision', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    '_listingMutationQueue',
    '_requireCurrentOperationalUser(',
    '_assertCurrentOperationalUserId(',
    'updated.catalogRevision != existing.catalogRevision',
    "'catalogRevision': existing.catalogRevision + 1",
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
});

test('strict bounded catalog preserves corruption and media', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    '_maxLocalListings = 1000',
    '_maxLocalListingDocumentBytes = 32 * 1024 * 1024',
    '_decodeListingsStrict(',
    '_persistListings(',
    'Der lokale Anzeigenkatalog ist voll.',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(service, /attempting to shrink payload|strip photos entirely/u);
  assert.doesNotMatch(service, /difference\(it\.endedAt!\)\.inDays/u);
});

test('privacy export and deletion use current-owner listing truth', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    'exportOwnedListingsForPrivacy()',
    "'otherAccountsPublicCacheExcluded': true",
    'deactivateAllListingsForUser(',
  ]) assert.match(service, new RegExp(escaped(marker), 'u'));
  assert.match(
    read('lib/services/privacy_export_service.dart'),
    /exportOwnedListingsForPrivacy\(\)/u,
  );
  assert.match(
    read('lib/services/account_deletion_service.dart'),
    /deactivateAllListingsForUser\(user\.id\)/u,
  );
});

test('owner listing surfaces clear and recheck account state', () => {
  for (const path of [
    'lib/screens/my_listings_screen.dart',
    'lib/screens/own_profile_screen.dart',
  ]) {
    const source = read(path);
    for (const marker of [
      'SharedPersistenceSync.listingCatalogKey',
      'Das angemeldete Konto hat sich geändert.',
      'Erneut laden',
      'Lokale Daten bleiben unverändert.',
    ]) assert.match(source, new RegExp(escaped(marker), 'u'));
  }
  const create = read('lib/screens/create_listing_screen.dart');
  assert.match(create, /Speicherstatus unklar/u);
  assert.match(create, /ListingMutationCommand\.update\(updated\)/u);
  assert.match(create, /SharedPersistenceSync\.accountSecurityStateKey/u);
  assert.doesNotMatch(create, /DataService\.updateItem\(/u);
});

test('lifecycle privacy and retention manifests bind local listings', () => {
  const lifecycle = JSON.parse(read('store/g2-data-lifecycle.json'));
  assert.equal(
    lifecycle.localListingCatalog.mutationIdentityBinding,
    'matching-auth-session-and-exact-listing-owner',
  );
  const privacy = JSON.parse(read('store/privacy-disclosures.json'));
  assert.equal(
    privacy.localListingCatalog.privacyExport,
    'current-owner-listings-only',
  );
  const retention = JSON.parse(read('store/retention-deletion-readiness.json'));
  assert.equal(
    retention.implementedControls.localListingCatalog
      .automaticEndedListingDeletion,
    false,
  );
});

test('RW7 proof is deterministic and covers the full local threat matrix', () => {
  const source = read(
    'test/rw7_local_listing_catalog_authorization_durability_test.dart',
  );
  for (const marker of [
    'foreign owner identifiers and guest listing mutations fail closed',
    'corrupt listing entry fails closed and preserves exact raw bytes',
    'concurrent creates retain every item with distinct generated ids',
    'storage failure preserves exact bytes and does not poison the queue',
    'privacy export and deletion deactivation stay current-owner scoped',
    'compact owner catalog preserves corruption behind retry',
    'open owner catalog replaces account A with account B only',
  ]) assert.match(source, new RegExp(escaped(marker), 'u'));
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
