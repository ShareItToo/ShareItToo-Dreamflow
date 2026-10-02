import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('anonymous opt-in is fail-closed and precedes ordinary debug image handling', () => {
  const image = read('lib/widgets/app_image.dart');
  assert.match(image, /this\.publicCatalogImage = false/u);
  assert.match(image, /if \(publicCatalogImage\) \{\s*if \(!BackendConfig\.isPublicCatalogImageUrl\(src\)\) return _fallback\(\);/u);
  assert.ok(image.indexOf('if (publicCatalogImage)') < image.indexOf("if (src.startsWith('http'))"));
  assert.match(image, /AuthService\.accessTokenForOwner\(owner\)/u);
});

test('public entry points derive listings from public catalog reads, never owner-active flags', () => {
  for (const path of ['lib/screens/explore_screen.dart', 'lib/screens/app_link_destination_screen.dart']) {
    const source = read(path);
    assert.match(source, /DataService\.getPublicItems/u);
    assert.match(source, /publicCatalogImage: true/u);
  }
  const profile = read('lib/screens/public_profile_screen.dart');
  assert.match(profile, /DataService\.getPublicCatalogSnapshot\(\)/u);
  assert.match(profile, /widget\.isOwnPreview\s*\? IgnorePointer/u);
  assert.match(profile, /: ItemCard\(item: _items\[i\], compact: true, publicCatalogImage: true\)/u);
  for (const path of ['lib/screens/search_results_screen.dart', 'lib/widgets/search_overlay.dart']) {
    assert.match(read(path), /publicCatalogImage: true/u);
  }
});

test('private owner, booking, chat, profile and saved-cart surfaces do not opt in', () => {
  for (const path of [
    'lib/widgets/user_avatar.dart', 'lib/screens/message_thread_screen.dart',
    'lib/screens/private_shelf_screen.dart', 'lib/screens/owner_requests_screen.dart',
    'lib/screens/ongoing_owner_detail_screen.dart', 'lib/screens/booking_detail_screen.dart',
    'lib/screens/bookings_screen.dart', 'lib/screens/wishlists_screen.dart',
  ]) assert.doesNotMatch(read(path), /publicCatalogImage:\s*true/u, path);
  const detail = read('lib/widgets/item_details_overlay.dart');
  const owner = detail.slice(detail.indexOf('class OwnerListingDetailsScreen'), detail.indexOf('class _ItemDetailsSheet'));
  assert.doesNotMatch(owner, /publicCatalogImage/u);
  assert.match(detail, /publicCatalogImage && !isOwnerPreview && savedCartScope == null/u);
  assert.match(read('lib/widgets/image_gallery_overlay.dart'), /publicCatalogImage && savedCartScope == null/u);
});

test('reachable Explore grid and carousel opt in; dead historical card implementations remain unchanged', () => {
  const explore = read('lib/screens/explore_screen.dart');
  assert.match(explore, /child: ListingCarouselCard\(\s*publicCatalogImage: true/u);
  const grid = explore.slice(explore.indexOf('class _ExploreListingCard extends'), explore.indexOf('class _SquareTitleOnlyCard extends'));
  assert.match(grid, /SyntheticCatalogCard\(item: item, publicCatalogImage: true\)/u);
  assert.match(grid, /AppImage\(\s*publicCatalogImage: true/u);
  // These constructors have no root call sites: only their declarations remain.
  for (const name of ['_HoverResponsiveTopGrid', '_SmallScrollCard', '_SmallGridCard', '_SquareTitleOnlyCard']) {
    assert.equal(explore.match(new RegExp(`${name}\\(`, 'gu'))?.length, 1, name);
  }
});

test('public options preserve the image opt-in; wishlist and saved-cart options remain private', () => {
  const options = read('lib/widgets/listing_options_dialog.dart');
  assert.match(options, /bool publicCatalogImage = false/u);
  assert.match(options, /publicCatalogImage: publicCatalogImage && savedCartScope == null &&\s*contextType == ListingOptionsContext\.explore/u);
  const builder = options.slice(options.indexOf('Future<List<_ListingOption>> _buildOptions'));
  assert.match(builder, /Future<void> openListing\(\)[\s\S]*?ItemDetailsOverlay\.showFullPage\(context,\s*item: item, fresh: true, publicCatalogImage: publicCatalogImage\)/u);
  assert.match(builder, /label: 'Anzeige öffnen', onTap: openListing/u);
  assert.match(builder, /label: 'Verfügbarkeit prüfen',\s*onTap: openListing/u);
  assert.match(read('lib/screens/search_results_screen.dart'), /_showOptions\(\) => showListingOptionsDialog\(\s*context,\s*publicCatalogImage: true/u);
  const explore = read('lib/screens/explore_screen.dart');
  assert.equal(explore.match(/showListingOptionsDialog\(\s*context,\s*publicCatalogImage: true/gu)?.length, 2);
  const privateOptions = options.slice(options.indexOf('Future<void> _showOwnedWishlistOptions'), options.indexOf('Future<List<_ListingOption>> _buildOptions'));
  assert.doesNotMatch(privateOptions, /publicCatalogImage/u);
});
