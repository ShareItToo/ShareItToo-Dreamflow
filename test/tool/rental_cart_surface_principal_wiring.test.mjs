import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const section = (text, start, end) => {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing inventory boundary ${start}`);
  return text.slice(a, b);
};

test('public rental-cart result methods remain an explicit reviewed inventory', () => {
  const source = read('lib/services/data_service.dart');
  const actual = [...source.matchAll(/static Future<RentalCart> ([a-z]\w*)\(/gu)].map(m => m[1]).sort();
  assert.deepEqual(actual, ['getRentalCart', 'addRentalCartItem', 'removeRentalCartItem',
    'assignRentalCartItemToProject', 'removeRentalCartProject', 'recheckRentalCart'].sort());
  for (const [name, end, endpoint] of [
    ['addRentalCartItem', 'static Future<RentalCart> removeRentalCartItem', 'putRentalCartItemForOwner'],
    ['removeRentalCartItem', 'static Future<RentalCart> assignRentalCartItemToProject', 'deleteRentalCartItemForOwner'],
    ['removeRentalCartProject', 'static Future<RentalCart> recheckRentalCart', 'deleteRentalCartProjectForOwner'],
    ['recheckRentalCart', '/// Returns only the local saved-item state', 'recheckRentalCartForOwner'],
  ]) {
    const body = section(source, `static Future<RentalCart> ${name}`, end);
    assert.match(body, /expectedOwner \?\? await LocalPrincipalActionOwner\.capture\(\)/u);
    assert.ok(body.includes(endpoint));
    assert.match(body, /await owner\.assertCurrent\(\);\s*await _writeLocalRentalCart\(principal, next\);\s*await owner\.assertCurrent\(\)/u);
    assert.doesNotMatch(body, /_currentLocalPrincipal\(|_hasBackendSession\(|_syncCompatibleGuestCartForCurrentSession/u);
  }
});

test('cart-root action dispatch and old-finally cleanup retain their owner', () => {
  const source = read('lib/screens/wishlists_screen.dart');
  const begin = section(source, 'SavedCartActionScope? _beginCartAction', 'void _endCartAction');
  assert.match(begin, /final owner = _snapshotOwner/u);
  assert.doesNotMatch(begin, /await /u);
  const change = section(source, 'Future<void> _changeCart', 'Future<void> _assignCartItem');
  assert.match(change, /await change\(action\.owner\)/u);
  assert.match(change, /await action\.isCurrent\(\)/u);
  assert.match(change, /action\.notice\(/u);
  const open = section(source, 'Future<void> _openCartItem', 'Future<void> _addCustomList');
  assert.match(open, /getItemByIdForSavedCart/u);
  assert.match(open, /identical\(_openingCartItem, action\)/u);
  assert.doesNotMatch(open, /Navigator\.of|AuthService\.readSession|orElse:\s*\(\) => cartItem/u);
  assert.match(open, /action\.push\(/u);
});

test('wishlist folder lifetime and actions no longer use global stack cleanup', () => {
  const source = section(read('lib/screens/wishlists_screen.dart'),
    'class _WishlistFolderDetailState', '// Compute a childAspectRatio');
  assert.match(source, /_scope\.trackRoute\(route\)/u);
  assert.match(source, /accountSecurityStateKey/u);
  assert.match(source, /_scope\.dialog<String>/u);
  assert.match(source, /_scope\.dialog<bool>/u);
  assert.doesNotMatch(source, /popUntil|maybePop|AppPopup\.showMenuActions|removeAt\(i\)/u);
  for (const method of ['getItemsByWishlist', 'removeItemFromWishlist', 'renameCustomWishlist', 'deleteCustomWishlist']) {
    assert.match(source, new RegExp(`${method}\\([\\s\\S]*?expectedOwner: _scope\\.owner`, 'u'));
  }
});

test('exact route cleanup schedules its own idle frame and preserves foreign routes', () => {
  const source = read('lib/widgets/saved_cart_action_scope.dart');
  assert.match(source, /navigator\.removeRoute\(route\)/u);
  assert.match(source, /addPostFrameCallback/u);
  assert.match(source, /ensureVisualUpdate\(\)/u);
  assert.doesNotMatch(source, /\.pop\(|popUntil|maybePop/u);
  assert.match(source, /SharedPersistenceSync\.notify\(\s*SharedPersistenceSync\.accountSecurityStateKey\)/u);
  const tests = read('test/saved_cart_action_scope_test.dart');
  for (const text of ['silent-switch', 'dispose', 'oldComplete', 'hasScheduledFrame', 'foreignPage.isCurrent', 'logout and relogin']) assert.ok(tests.includes(text));
});

test('cart acknowledgement is exact and malformed lists cannot become empty success', () => {
  const backend = read('lib/services/backend_repository.dart');
  const parser = section(backend, 'static Map<String, dynamic> _savedCartResponse', 'static Future<Map<String, dynamic>> getRentalCartForOwner');
  assert.match(parser, /_strictMaps\(cart\[key\]\)/u);
  assert.match(parser, /!ids\.add\(id\)/u);
  const add = section(read('lib/services/data_service.dart'), 'static Future<RentalCart> addRentalCartItem', 'static Future<RentalCart> removeRentalCartItem');
  for (const token of [
    '_rentalCartIntentClientId',
    '_existingExactRentalCartIntent',
    'matches.length != 1',
    'matches.single.id != id',
    'listingId: item.id',
    '_rentalDate(range.start)',
    '_rentalDate(range.end)',
    'matches.single.projectId != projectId',
  ]) assert.ok(add.includes(token));
  const helper = read('lib/widgets/saved_cart_intent.dart');
  assert.match(helper, /expectedOwner: owner/u);
  assert.match(helper, /action\.notice/u);
  assert.doesNotMatch(helper, /items\.isNotEmpty|AppPopup\.toast|Es wurde nichts/u);
  const overlay = section(read('lib/widgets/item_details_overlay.dart'), 'Future<void> _storeRentalCartIntent', 'Future<void> _showUnavailablePopup');
  assert.match(overlay, /saveListingToRentalCart\(context, item: item, range: range\)/u);
});

test('saved-cart prerequisite catalog is owner-bound and does not persist a shared private copy', () => {
  const source = section(read('lib/services/data_service.dart'), 'static Future<List<Item>> _getSavedCartItemsForOwner', 'static Future<Item?> getItemById(String');
  assert.match(source, /getListingsForSavedCart\(owner\)/u);
  assert.doesNotMatch(source, /_persistListings/u);
  const backend = section(read('lib/services/backend_repository.dart'), 'static Future<List<Map<String, dynamic>>> getListingsForSavedCart', 'static Future');
  assert.match(backend, /_authorizedForOwner/u);
  assert.doesNotMatch(backend, /await _authorized\(|refreshAccessToken|AuthService\.readSession/u);
});

test('enabled intercepted cart lane is mandatory, not replaced by default local tests', () => {
  const source = read('scripts/technical_regression_check.sh');
  assert.match(source, /--dart-define=SIT_BACKEND_ENABLED=true \\\n\s*--dart-define=SIT_API_BASE_URL=http:\/\/127\.0\.0\.1:1\/api\/v1 \\\n\s*test\/rental_cart_surface_principal_http_test\.dart/u);
  const tests = read('test/rental_cart_surface_principal_http_test.dart');
  for (const marker of ['malformed cart', 'unrelated nonempty cart', 'private-401', 'foreignRefreshes', 'local', 'listing cart intent']) assert.ok(tests.includes(marker));
});

test('saved-folder shared widgets propagate the original scope through every nested entry', () => {
  const root = read('lib/screens/wishlists_screen.dart');
  assert.match(root, /ItemCard\([\s\S]*?savedCartScope: _scope/u);
  const card = read('lib/widgets/item_card.dart');
  assert.match(card, /final SavedCartActionScope\? savedCartScope/u);
  for (const start of ['ItemDetailsOverlay.showFullPage', 'showListingOptionsDialog', '_WishlistHeartButton(']) {
    assert.match(card.slice(card.indexOf(start)), /savedCartScope: savedCartScope/u);
  }
  const scopedHeart = section(card, 'Future<void> _onScopedTap', '@override');
  for (const method of ['showAdd', 'showMove', 'showManageOptions']) {
    assert.match(scopedHeart, new RegExp(`${method}\\([\\s\\S]*?scope: scope`, 'u'));
  }
  assert.match(scopedHeart, /expectedOwner: scope.owner/u);
  assert.doesNotMatch(scopedHeart, /Navigator\.|AppPopup\./u);
  const options = section(read('lib/widgets/listing_options_dialog.dart'), 'Future<void> _showOwnedWishlistOptions', 'Future<List<_ListingOption>> _buildOptions');
  assert.match(options, /scope.dialog<int>/u);
  assert.match(options, /savedCartScope: scope/u);
  assert.doesNotMatch(options, /Navigator\.|AppPopup\./u);
  const details = section(read('lib/widgets/item_details_overlay.dart'), 'static Future<void> showFullPage', 'class ');
  assert.match(details, /savedCartScope\.push<void>\(context, route\)/u);
});

test('nested draft owns its controller and completion, including stale write controls', () => {
  const sheet = read('lib/widgets/wishlist_selection_sheet.dart');
  assert.match(sheet, /scope\.dialog<String>/u);
  assert.match(sheet, /_CreateListForm\(onComplete: complete\)/u);
  assert.match(sheet, /controller\.dispose\(\)/u);
  assert.match(sheet, /addCustomWishlist\(name\.trim\(\),\s*expectedOwner: scope\?\.owner\)/u);
  const tests = read('test/saved_cart_nested_principal_test.dart');
  for (const marker of ['silent-switch=', 'context-remove', 'context-move', 'context-availability', 'owned.isActive', 'foreign.isCurrent']) assert.ok(tests.includes(marker));
});

test('real navigation profile remains mandatory alongside guest and nested tests', () => {
  const script = read('scripts/technical_regression_check.sh');
  const lane = script.slice(script.indexOf('# Actual cart origins'), script.indexOf('# All three provider profiles'));
  for (const name of ['SIT_BACKEND_ENABLED=true', 'SIT_STAGE_A_NON_BINDING_PILOT=true', 'SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED=true', 'SIT_PLANNER_TECHNICAL_UI_ENABLED=true', 'SIT_LISTING_SETS_TECHNICAL_UI_ENABLED=true', 'test/saved_cart_navigation_principal_test.dart']) assert.ok(lane.includes(name));
  const root = read('lib/screens/wishlists_screen.dart');
  assert.match(root, /onPressed: \(\) => _openSavedDestination\(\s*\(\) => const LoginScreen/u);
  const tests = read('test/saved_cart_navigation_principal_test.dart');
  for (const marker of ['silent-before-click', 'bindingCheckoutEnabled', 'late-error', 'missing', 'owned.isActive', 'foreign.isCurrent']) assert.ok(tests.includes(marker));
});

test('owned details retain the cart owner through their descendant UI and cleanup', () => {
  const full = read('lib/widgets/item_details_overlay.dart');
  const entry = section(full, 'static Future<void> showFullPage', 'static Future<model.User?> _loadOwner');
  assert.match(entry, /_ItemDetailsPage\([\s\S]*?savedCartScope: savedCartScope/u);
  const page = section(full, 'class _ItemDetailsPageState', 'String _priceWithUnit');
  const wishlist = section(page, 'Future<void> _toggleWishlistFromMenu', 'Future<void> _share');
  assert.match(wishlist, /showAdd\(context, scope: scope\)/u);
  assert.match(wishlist, /showMove\(context,[\s\S]*?scope: scope/u);
  assert.equal(wishlist.match(/expectedOwner: scope\?\.owner/gu)?.length, 3);
  assert.doesNotMatch(wishlist, /AppPopup\.toast|Navigator\./u);
  const cleanup = section(page, 'Future<void> _clearSavedSelection', '@override');
  assert.match(cleanup, /final owner = widget.savedCartScope\?\.owner/u);
  assert.match(cleanup, /clearSavedDateRange\(itemId, expectedOwner: owner\)/u);
  assert.match(cleanup, /clearSavedDeliverySelection\(itemId,[\s\S]*?expectedOwner: owner\)/u);
  const body = full.slice(full.indexOf('class _ItemDetailsPageState'));
  assert.match(body, /showSITOverflowMenu<String>\(context,\s*scope: scope/u);
  assert.match(body, /ImageGalleryOverlay.show\([\s\S]*?savedCartScope: widget.savedCartScope/u);
});

test('nested general dialogs return through exact handles, not current-stack pop', () => {
  const scope = section(read('lib/widgets/saved_cart_action_scope.dart'), 'Future<T?> generalDialog', 'Future<void> notice');
  for (const marker of ['showTrackedGeneralDialog', 'pageBuilder(handle.dismiss)', '_dismissals.add(dismiss)', '_dismissals.remove(dismiss)', 'return await isCurrent() ? result : null']) assert.ok(scope.includes(marker));
  const menu = read('lib/widgets/sit_overflow_menu.dart');
  assert.match(menu, /scope.generalDialog<T>/u);
  assert.match(menu, /onTap: \(\) => complete\(opt.value\)/u);
  const gallery = read('lib/widgets/image_gallery_overlay.dart');
  assert.match(gallery, /savedCartScope.generalDialog<void>/u);
  assert.match(gallery, /onClose: \(\) => complete\(null\)/u);
  const tests = read('test/saved_cart_details_principal_test.dart');
  for (const marker of ['gallery-create', 'late-success', 'late-failure', 'silent-B', 'old overflow completion', 'disposal preserves B', 'unscoped details']) assert.ok(tests.includes(marker));
});
