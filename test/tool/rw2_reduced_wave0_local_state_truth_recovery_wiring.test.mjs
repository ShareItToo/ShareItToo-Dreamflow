import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('RW2 is permanently invoked by the supported regression', () => {
  const regression = read('scripts/technical_regression_check.sh');
  assert.match(
    regression,
    /reduced_wave0_local_state_truth_recovery_test\.dart/u,
  );
  assert.match(
    regression,
    /rw2_reduced_wave0_local_state_truth_recovery_wiring\.test\.mjs/u,
  );
  assert.match(
    regression,
    /validate_rw2_reduced_wave0_local_state_truth_recovery\.mjs/u,
  );
});

test('user-owned saved state fails closed while category reference data self-heals', () => {
  const service = read('lib/services/data_service.dart');
  for (const marker of [
    '_writePreferenceString',
    '_decodeWishlistMetadata',
    '_decodeWishlistAssignments',
    '_validateWishlistAssignmentTargets',
    "_wishlistPrincipalStateKey = 'wishlist_state_v3'",
    "_wishlistStateKey = 'wishlist_state_v2'",
    'rebuilding invalid category cache',
    'canonical revision $revision is authoritative',
  ]) assert.match(service, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(
    service,
    /getItemsByWishlist\(\)[\s\S]{0,900}?catch[\s\S]{0,200}?return out/u,
  );
});

test('persistent error surfaces keep unknown data out of empty states', () => {
  const panel = read('lib/widgets/local_state_error_panel.dart');
  assert.match(panel, /liveRegion: true/u);
  assert.match(panel, /minimumSize: const Size\(0, 48\)/u);

  const cart = read('lib/screens/wishlists_screen.dart');
  assert.match(cart, /bool _hasLoadedSnapshot = false/u);
  assert.match(cart, /bool _reloadInFlight = false/u);
  assert.match(cart, /Gespeicherte Daten konnten nicht geladen werden/u);
  assert.match(cart, /Merkliste konnte nicht geladen werden/u);

  const search = read('lib/screens/search_results_screen.dart');
  assert.match(search, /bool _savedStateReady = false/u);
  assert.match(search, /bool _favoriteActionInFlight = false/u);
  assert.match(
    search,
    /onFavoriteToggle: _savedStateReady[\s\S]*?: null/u,
  );
});

test('adjacent listing hearts cannot claim unknown state as unsaved', () => {
  for (const path of [
    'lib/widgets/item_card.dart',
    'lib/widgets/item_details_overlay.dart',
  ]) {
    const source = read(path);
    assert.match(source, /sync_problem_outlined/u, path);
    assert.match(source, /Gemerkt-Status/u, path);
  }
  assert.match(
    read('lib/widgets/listing_options_dialog.dart'),
    /Es wurde nichts als gespeichert bestätigt\./u,
  );
  assert.match(
    read('lib/widgets/wishlist_selection_sheet.dart'),
    /Return the new id only after persistence has been verified\./u,
  );
});

test('RW2 tests retain corruption retry restart compact and no-false-success proofs', () => {
  const source = read('test/reduced_wave0_local_state_truth_recovery_test.dart');
  for (const marker of [
    'corrupt reference categories self-heal',
    'corrupt wishlist metadata fails closed',
    'corrupt assignments reject writes',
    'orphan assignments fail closed',
    'process-style recreation',
    'persistent retry',
    'Size(320, 568)',
    'TextScaler.linear(2)',
    'folder detail never presents corrupt assignments as empty',
    'search never confirms a save',
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
