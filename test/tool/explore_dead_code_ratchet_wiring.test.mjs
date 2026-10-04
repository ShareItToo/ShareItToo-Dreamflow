import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const source = readFileSync(
  new URL('../../lib/screens/explore_screen.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);
const square = section(
  source,
  'class _SquareItemCardState extends State<_SquareItemCard>',
  'class _SmallScrollCard extends StatefulWidget',
);
const scroll = section(
  source,
  'class _SmallScrollCardState extends State<_SmallScrollCard>',
  'class _SmallGridCard extends StatefulWidget',
);
const grid = section(
  source,
  'class _SmallGridCardState extends State<_SmallGridCard>',
  'double _exploreListingChildAspectRatio',
);

test('explore screen cannot regain superseded helper paths', () => {
  for (const name of [
    '_iconFromName',
    '_showFilters',
    '_openAllCategories',
    '_showCategoryConfirm',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`, 'u'));
  }
  assert.doesNotMatch(source, /all_categories_overlay\.dart/u);
  assert.doesNotMatch(source, /filters_overlay\.dart/u);
});

test('three listing cards cannot regain their unreachable timer machinery', () => {
  for (const card of [square, scroll, grid]) {
    assert.doesNotMatch(card, /_startPressTimer|_pressTimer|_pointerDown/u);
  }
  assert.match(source, /class _HoverTileState[\s\S]*?_startPressTimer/u);
  assert.match(
    source,
    /class _SquareTitleOnlyCardState[\s\S]*?_startPressTimer/u,
  );
});

test('always-default card variants are represented directly', () => {
  assert.doesNotMatch(source, /showFavorite|showInfo|widget\.compact/u);
  assert.match(
    source,
    /const _SquareItemCard\(\s*\{required this\.item,\s*required this\.isFavorite,\s*required this\.onFavoriteToggle\}\);/u,
  );
  assert.match(
    source,
    /double _iconSizeFor\(double width\) =>\s*\(width \* 0\.10\)\.clamp\(14\.0, 20\.0\);/u,
  );
  assert.match(
    source,
    /const _SquareTitleOnlyCard\(\{required this\.item\}\);/u,
  );
});

test('active Explore interactions remain intact', () => {
  assert.match(source, /void _openSearch\(\) => SearchOverlay\.show\(context\)/u);
  assert.match(source, /CategoryIconRow\(/u);
  assert.match(source, /'categories': \[c\.id\]/u);
  assert.match(source, /ItemDetailsOverlay\.showFullPage\(/u);
  assert.match(source, /showListingOptionsDialog\(/u);
  assert.match(source, /onWishlistChanged:/u);
  assert.match(source, /WishlistSelectionSheet/u);
});

test('Explore ratchet is permanent and adds no analyzer accommodation', () => {
  assert.doesNotMatch(source, /ignore:\s*unused_(?:element|element_parameter|import)/u);
  assert.match(
    regression,
    /node --test test\/tool\/explore_dead_code_ratchet_wiring\.test\.mjs/u,
  );
});
