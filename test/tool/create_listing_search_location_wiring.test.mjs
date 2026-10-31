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
    /_validateAllListingFields\(requirePlace: !forceInactive\)/u,
  );
  assert.match(
    compact,
    /bool get _hasPublishableSelectedPlace \{ final selectedQuery = _selectedAddrQuery\?\.trim\(\) \?\? ''; if \(selectedQuery\.isEmpty \|\| selectedQuery != _addressCtrl\.text\.trim\(\)\) \{ return false; \} if \(!isExplicitListingSearchLocation\( latitude: _selectedAddrLat, longitude: _selectedAddrLng, \)\) \{ return false; \} return resolveListingPayloadCity\( locationText: selectedQuery, latitude: _selectedAddrLat, longitude: _selectedAddrLng, availableCities: DataService\.getCities\(\), \) != null;/u,
    'publication requires the exact selected text, valid coordinates, and a canonical city',
  );
  assert.match(
    compact,
    /final pos = selectedPlace \? \(_selectedAddrLat!, _selectedAddrLng!\) : \(0\.0, 0\.0\);/u,
    'unlocated drafts use the documented unknown sentinel, never unrelated city coordinates',
  );
  assert.match(compact, /approximateLocation: !selectedPlace/u);
  assert.match(compact, /onPressed: _submitBusy \|\| _blueOceanBusy \|\| !_hasPublishableSelectedPlace \? null : _submit/u);
  assert.match(compact, /_validateListingStep\(_listingStep, requirePlace: false\)/u);
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
