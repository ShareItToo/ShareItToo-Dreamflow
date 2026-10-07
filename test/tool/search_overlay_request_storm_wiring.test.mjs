import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('lib/widgets/search_overlay.dart', 'utf8');

function methodBody(name, nextName) {
  const start = source.indexOf(`void ${name}(`);
  const end = source.indexOf(`void ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} is missing`);
  assert.notEqual(end, -1, `${nextName} boundary is missing`);
  return source.slice(start, end);
}

test('typing filters cached suggestions and schedules one debounced remote recompute', () => {
  const what = methodBody('_onQueryChangedWhat', '_onQueryChangedWhere');
  const where = methodBody('_onQueryChangedWhere', '_addToRecentWhat');
  for (const body of [what, where]) {
    assert.doesNotMatch(body, /DataService\.(?:getItems|searchPublicItems)\(/u);
    assert.match(body, /_scheduleNearbySuggestionsRecompute\(\)/u);
    assert.doesNotMatch(body, /await _recomputeNearbySuggestions\(\)/u);
  }
  assert.match(what, /_searchSuggestionInventory/u);
  assert.match(where, /_locationSuggestionInventory/u);
});

test('late remote results can update the UI only for the latest generation', () => {
  assert.match(
    source,
    /if \(!mounted \|\| !_nearbyRecompute\.isCurrent\(generation\)\) return;/u,
  );
  assert.match(
    source,
    /if \(mounted && _nearbyRecompute\.isCurrent\(generation\)\)/u,
  );
  assert.match(source, /_nearbyRecompute\.dispose\(\)/u);
});
