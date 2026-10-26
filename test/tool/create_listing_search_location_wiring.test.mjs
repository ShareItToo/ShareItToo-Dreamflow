import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/create_listing_screen.dart', import.meta.url),
  'utf8',
);
const compact = source.replace(/\s+/gu, ' ');

test('new listing publication requires a chosen place with valid coordinates', () => {
  assert.match(
    compact,
    /if \(!isExplicitListingSearchLocation\( latitude: _selectedAddrLat, longitude: _selectedAddrLng, \)\) \{ return 'Wähle einen Suchort aus den Ortsvorschlägen für die Übergabe\.';/u,
  );
  assert.match(
    compact,
    /final pos = \(_selectedAddrLat!, _selectedAddrLng!\);/u,
    'published coordinates come only from the selected suggestion',
  );
  assert.doesNotMatch(source, /allCities\[city\] \?\? \(52\.52, 13\.405\)/u);
  assert.doesNotMatch(source, /resolveListingEditorProfilePlace/u);
});

test('editing the location text clears previously selected search coordinates', () => {
  assert.match(
    compact,
    /if \(q\.trim\(\) != _selectedAddrQuery\) \{ _selectedAddrLat = null; _selectedAddrLng = null; _selectedAddrQuery = null; \}/u,
  );
  assert.match(
    compact,
    /onPlaceChosen: \(d\) \{ setState\(\(\) \{ _addressCtrl\.text = d\.formattedAddress \?\? d\.description; _selectedAddrLat = d\.lat; _selectedAddrLng = d\.lng; _selectedAddrQuery = _addressCtrl\.text\.trim\(\);/u,
  );
});
