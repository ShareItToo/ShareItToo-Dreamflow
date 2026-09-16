import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/widgets/listing_options_dialog.dart', import.meta.url),
  'utf8',
);

test('add and move selection guard every later context and callback access', () => {
  assert.match(
    source,
    /Future<void> addToWishlist\(\) async \{[\s\S]*?if \(currentWishlistId == null\) \{\s+if \(!context\.mounted\) return;\s+selected = await WishlistSelectionSheet\.showAdd\(context\);\s+\} else \{\s+if \(!context\.mounted\) return;\s+selected = await WishlistSelectionSheet\.showMove\(context,[\s\S]*?\}\s+if \(!context\.mounted\) return;[\s\S]*?setItemWishlist\(item\.id, selected\);\s+if \(!context\.mounted\) return;\s+onWishlistChanged\?\.call\(\);\s+await AppPopup\.toast\(context/u,
  );
});

test('removal cannot notify a disposed listing-options caller', () => {
  assert.match(
    source,
    /removeItemFromWishlist\(item\.id\);\s+if \(!context\.mounted\) return;\s+onWishlistChanged\?\.call\(\);\s+await AppPopup\.toast\(context/u,
  );
});

test('move rechecks lifecycle after lookup dialog and persistence', () => {
  assert.match(
    source,
    /Future<void> moveToAnotherWishlist\(\) async \{[\s\S]*?getWishlistForItem\(item\.id\);\s+if \(!context\.mounted\) return;[\s\S]*?WishlistSelectionSheet\.showMove\(\s*context,\s*currentListId:\s*current,?\s*\);\s+if \(!context\.mounted\) return;[\s\S]*?setItemWishlist\(item\.id, selected\);\s+if \(!context\.mounted\) return;\s+onWishlistChanged\?\.call\(\);\s+await AppPopup\.toast\(context/u,
  );
});

test('lifecycle fix contains no timing or lint accommodation', () => {
  assert.doesNotMatch(source, /ignore:\s*use_build_context_synchronously/u);
  assert.doesNotMatch(source, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
