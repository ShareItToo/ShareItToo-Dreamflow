import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('RW3 is permanently invoked by the supported regression', () => {
  const regression = read('scripts/technical_regression_check.sh');
  for (const marker of [
    'reduced_wave0_local_concurrency_consistency_test.dart',
    'rw3_reduced_wave0_local_concurrency_consistency_wiring.test.mjs',
    'validate_rw3_reduced_wave0_local_concurrency_consistency.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});

test('wishlist and cart read-modify-write paths use idle-resetting queues', () => {
  const service = read('lib/services/data_service.dart');
  assert.match(service, /class _LocalMutationQueue/u);
  assert.match(service, /final Queue<_QueuedLocalMutation> _pending/u);
  assert.match(service, /if \(becameIdle\) _running = false/u);
  assert.match(service, /_wishlistMutationQueue\.run/u);
  assert.match(service, /_rentalCartMutationQueue\.run/u);
  assert.doesNotMatch(service, /Future<void> _tail = Future<void>\.value/u);
});

test('one canonical wishlist document owns metadata and assignments', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    "_wishlistPrincipalStateKey = 'wishlist_state_v3'",
    "_wishlistStateKey = 'wishlist_state_v2'",
    "'schemaVersion': 1",
    "'revision': revision",
    "'lists': state.lists",
    "'assignments': state.assignments",
    'canonical revision $revision is authoritative',
    'prefs.remove(_wishlistStateKey)',
  ]) assert.match(service, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(
    service,
    /await _writePreferenceString\(prefs, _wishlistStateKey, canonical\)[\s\S]*?prefs\.setString\(\s*_wishlistsMetaKey/u,
  );
});

test('committed saved state propagates to every retained open surface', () => {
  const sync = read('lib/services/shared_persistence_sync.dart');
  for (const key of ['savedItemsKey', 'wishlistStateKey', 'rentalCartKey']) {
    assert.match(sync, new RegExp(`static const String ${key}`, 'u'));
  }
  assert.match(read('lib/services/shared_persistence_sync_web.dart'), /wishlist_state_v3/u);
  assert.match(read('lib/services/shared_persistence_sync_web.dart'), /wishlist_state_v2/u);

  for (const path of [
    'lib/screens/explore_screen.dart',
    'lib/screens/search_results_screen.dart',
    'lib/screens/wishlists_screen.dart',
    'lib/widgets/item_card.dart',
    'lib/widgets/item_details_overlay.dart',
  ]) {
    const source = read(path);
    assert.match(source, /SharedPersistenceSync\.changes\.listen/u, path);
    assert.match(source, /SharedPersistenceRefreshCoordinator/u, path);
  }
});

test('RW3 keeps deterministic race interruption recreation and compact proofs', () => {
  const source = read('test/reduced_wave0_local_concurrency_consistency_test.dart');
  for (const marker of [
    'concurrent saved-item assignments preserve every invoked mutation',
    'concurrent custom-list additions retain distinct complete entries',
    'canonical saved-state snapshot wins over interrupted stale mirrors',
    'does not poison the serialized queue',
    'concurrent rental-cart additions retain all items and one revision',
    'announce cross-surface refresh',
    'open search refreshes',
    'open Mietkorb refreshes',
    'Size(320, 568)',
    'TextScaler.linear(2)',
    'recovers by event',
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});

test('local lifecycle binds and purges the canonical saved-state key', () => {
  const lifecycle = JSON.parse(read('store/g2-data-lifecycle.json'));
  assert.equal(lifecycle.currentSavedItems.canonicalKey, 'wishlist_state_v3');
  assert.ok(lifecycle.currentSavedItems.legacyKeys.includes('wishlist_state_v2'));
  assert.match(read('tool/validate_g2_data_lifecycle.mjs'), /principal-scoped saved-state document/u);
});
