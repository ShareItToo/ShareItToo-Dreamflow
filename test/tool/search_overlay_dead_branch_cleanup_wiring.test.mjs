import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const searchOverlay = readFileSync(
  new URL('../../lib/widgets/search_overlay.dart', import.meta.url),
  'utf8',
);

test('removes the unreachable legacy search and decorative map branch', () => {
  for (const symbol of [
    '_BlurLayer',
    '_filteredResults',
    '_InnerFieldShell',
    '_PickerButton',
    '_NearbyCard',
    '_MapResultsOverlay',
    '_GridPainter',
    '_PriceMarker',
    '_SuggestionsPanel',
    '_coarseForItem',
  ]) {
    assert.doesNotMatch(searchOverlay, new RegExp(`\\b${symbol}\\b`));
  }
  assert.doesNotMatch(searchOverlay, /_nearby|_categoriesById/);
});

test('keeps the active search, suggestion, category, and result paths', () => {
  for (const symbol of [
    'class SearchOverlay',
    'class _SearchSheet',
    '_recomputeNearbySuggestions',
    '_FloatingSuggestionsPanel',
    '_openCategoryPicker',
    '_openResults',
    'SearchResultsScreen',
  ]) {
    assert.match(searchOverlay, new RegExp(symbol));
  }
});

test('keeps the active AI search and privacy-safe public item source', () => {
  assert.match(searchOverlay, /OpenAIConfig\.parseSearchQuery/);
  assert.match(searchOverlay, /OpenAIConfig\.suggestCategories/);
  assert.match(searchOverlay, /DataService\.searchPublicItems/);
  assert.match(searchOverlay, /DataService\.getPublicItems/);
});
