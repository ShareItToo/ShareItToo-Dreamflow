import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('RW4 is permanently invoked by the supported regression', () => {
  const regression = read('scripts/technical_regression_check.sh');
  for (const marker of [
    'reduced_wave0_local_principal_isolation_test.dart',
    'rw4_reduced_wave0_local_principal_isolation_wiring.test.mjs',
    'validate_rw4_reduced_wave0_local_principal_isolation.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});

test('principal registries use opaque bounded identifiers', () => {
  const service = read('lib/services/data_service.dart');
  const principal = read('lib/services/local_principal_scope.dart');
  for (const marker of [
    "_wishlistPrincipalStateKey = 'wishlist_state_v3'",
    "_rentalCartPrincipalStateKey = 'rental_cart_v2'",
    '_maxLocalStageAPrincipals = 12',
  ]) assert.match(service, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  for (const marker of [
    "_derivationDomain = 'sit-local-stage-a-v1'",
    "utf8.encode('$_derivationDomain|$kind|$identity')",
    "return 'p_$digest'",
    "token: 'guest'",
  ]) assert.match(principal, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(principal, /sha256\s*\.convert/u);
});

test('legacy input belongs only to guest and account writes stay scoped', () => {
  const service = read('lib/services/data_service.dart');
  assert.match(
    service,
    /LocalPrincipalIdentity\.guest\.token:\s*_LocalWishlistState/u,
  );
  assert.match(
    service,
    /LocalPrincipalIdentity\.guest\.token:\s*_LocalRentalCartBucket/u,
  );
  assert.match(
    service,
    /if \(principal\.authenticated\) \{[\s\S]*?SharedPersistenceSync\.notify\(SharedPersistenceSync\.wishlistStateKey\);[\s\S]*?return _LocalWishlistState/u,
  );
  assert.match(service, /legacyGuestQuarantined/u);
});

test('session transitions refresh all scoped surfaces', () => {
  const auth = read('lib/services/auth_service.dart');
  for (const marker of [
    '_notifyLocalPrincipalChanged()',
    'SharedPersistenceSync.wishlistStateKey',
    'SharedPersistenceSync.savedItemsKey',
    'SharedPersistenceSync.rentalCartKey',
    'SharedPersistenceSync.localSafetyPrivacyStateKey',
  ]) assert.match(auth, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(
    auth,
    /final removed = await prefs\.remove\(_sessionKey\);[\s\S]*?_sessionGeneration \+= 1;[\s\S]*?_notifyLocalPrincipalChanged\(\)/u,
  );
});

test('corrupt buckets are quarantined and preserved per principal', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    'quarantinedPrincipals[token] = bucket',
    'registry.quarantinedPrincipals.containsKey(principal.token)',
    'for (final entry in registry.quarantinedPrincipals.entries)',
    'registry.quarantinedPrincipals.remove(principal.token)',
    'Local principal capacity reached.',
  ]) assert.match(service, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});

test('privacy export and deletion are current-principal operations', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    "'scope': 'local-principal'",
    "'principalScope'",
    "'authenticated-account'",
    "'guest-device'",
    'registry.principals.remove(principal.token)',
    'guest?.syncOwnerToken == principal.token',
  ]) assert.match(service, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});

test('RW4 retains deterministic transition corruption and compact proofs', () => {
  const source = read('test/reduced_wave0_local_principal_isolation_test.dart');
  for (const marker of [
    'account A, guest and account B retain isolated saved state',
    'account A, guest and account B retain isolated local carts',
    'unscoped legacy data migrates to guest',
    'privacy export and deletion affect only the active account',
    'opaque principal documents survive process-style recreation',
    'corrupt unattributed legacy is quarantined away from accounts',
    'invoked mutations cannot cross an immediate session replacement',
    'principal registry is bounded without evicting earlier state',
    'one corrupt saved bucket is quarantined without blocking another',
    'one corrupt cart bucket is quarantined without blocking another',
    'compact open search follows account switches and corruption',
    'Size(320, 568)',
    'TextScaler.linear(2)',
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);

  const lifecycle = JSON.parse(read('store/g2-data-lifecycle.json'));
  assert.equal(lifecycle.currentSavedItems.canonicalKey, 'wishlist_state_v3');
  assert.equal(
    lifecycle.currentSavedItems.legacyMigrationRule,
    'guest-only-or-quarantine',
  );
});
