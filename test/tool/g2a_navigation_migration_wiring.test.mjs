import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const [
  navigation,
  savedScreen,
  dataService,
  appLinks,
  localization,
  itemCard,
  imageGallery,
  guestGate,
] = await Promise.all([
  readFile(new URL('lib/navigation/main_navigation.dart', root), 'utf8'),
  readFile(new URL('lib/screens/wishlists_screen.dart', root), 'utf8'),
  readFile(new URL('lib/services/data_service.dart', root), 'utf8'),
  readFile(new URL('lib/services/app_link_service.dart', root), 'utf8'),
  readFile(new URL('lib/services/localization_service.dart', root), 'utf8'),
  readFile(new URL('lib/widgets/item_card.dart', root), 'utf8'),
  readFile(new URL('lib/widgets/image_gallery_overlay.dart', root), 'utf8'),
  readFile(new URL('lib/widgets/login_nudge_sheet.dart', root), 'utf8'),
]);

test('uses the exact G2A destinations and preserves established icon affordances', () => {
  assert.match(
    navigation,
    /mainNavigationLabelKeys\s*=\s*<String>\[\s*'Entdecken',\s*'Mietkorb',\s*'Buchungen',\s*'Nachrichten',\s*'Mein SIT',\s*\]/u,
  );
  assert.match(
    navigation,
    /asset:\s*'assets\/images\/icononly_transparent_nobuffer\.png'[\s\S]*label:\s*l10n\.t\(mainNavigationLabelKeys\[2\]\)/u,
  );
  assert.match(
    navigation,
    /icon:\s*mainNavigationTouchTarget\(\s*_buildProfileNavIcon\(active:\s*_currentIndex\s*==\s*4\),?\s*\)[\s\S]*label:\s*l10n\.t\(mainNavigationLabelKeys\[4\]\)/u,
  );
});

test('keeps legacy saved data under a truthful Mietkorb and Gemerkt surface', () => {
  assert.match(savedScreen, /class RentalCartScreen extends StatefulWidget/u);
  assert.match(savedScreen, /class WishlistsScreen extends RentalCartScreen/u);
  assert.match(savedScreen, /saved\.nonBindingNotice/u);
  assert.match(localization, /Unverbindlich gespeichert – keine Reservierung\./u);
  assert.match(dataService, /_wishlistsMetaKey\s*=\s*'wishlists_meta_v1'/u);
  assert.match(dataService, /_wishlistAssignKey\s*=\s*'wishlist_assign_v1'/u);
  assert.match(dataService, /_wishlistPrincipalStateKey\s*=\s*'wishlist_state_v3'/u);
  assert.match(dataService, /_wishlistStateKey\s*=\s*'wishlist_state_v2'/u);
  assert.match(dataService, /_rentalCartPrincipalStateKey\s*=\s*'rental_cart_v2'/u);
  assert.match(dataService, /_rentalCartKey\s*=\s*'rental_cart_v1'/u);
  assert.match(dataService, /_projectCartKey\s*=\s*'project_cart_v1'/u);
  assert.match(savedScreen, /Im Mietkorb – noch nicht reserviert/u);
  assert.match(itemCard, /l10n\.t\('Unter Gemerkt gespeichert'\)/u);
  assert.doesNotMatch(itemCard, /Zur Wunschliste hinzugefügt/u);
  assert.match(imageGallery, /Aus Gemerkt entfernen/u);
  assert.match(imageGallery, /Unter Gemerkt speichern/u);
  assert.doesNotMatch(imageGallery, /(?:Aus|Zur) Wunschliste/u);
  assert.match(guestGate, /title:\s*'Unter Gemerkt speichern'/u);
  assert.doesNotMatch(guestGate, /Favoriten/u);
});

test('leaves the existing app-link parser outside the G2A migration', () => {
  assert.doesNotMatch(savedScreen, /AppLink|deep.?link/iu);
  assert.doesNotMatch(navigation, /AppLink|deep.?link/iu);
  for (const route of ['listing', 'profile', 'booking', 'chat', 'notifications']) {
    assert.match(appLinks, new RegExp(`case '${route}':`, 'u'));
  }
});
