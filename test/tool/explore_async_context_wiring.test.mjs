import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/explore_screen.dart', import.meta.url),
  'utf8',
);
const favoriteAction = source.match(
  /Future<void> _toggleFavorite[\s\S]*?\n  bool _matches/u,
)?.[0];

assert.ok(favoriteAction, 'expected explore favorite action');

test('explore favorite flow rechecks lifecycle after wishlist lookup', () => {
  assert.match(
    favoriteAction,
    /final current = await DataService\.getWishlistForItem\(id\);\s+if \(!mounted\) return;\s+if \(current == null\) \{\s+final sel = await WishlistSelectionSheet\.showAdd\(context\);/u,
  );
});

test('explore favorite move rechecks lifecycle after option selection', () => {
  assert.match(
    favoriteAction,
    /final choice = await WishlistSelectionSheet\.showManageOptions\(context\);\s+if \(!mounted\) return;\s+if \(choice == 'move'\) \{\s+final sel = await WishlistSelectionSheet\.showMove\(context,/u,
  );
});

test('explore lifecycle fix contains no timing or lint accommodation', () => {
  assert.doesNotMatch(favoriteAction, /ignore:\s*use_build_context_synchronously/u);
  assert.doesNotMatch(favoriteAction, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
