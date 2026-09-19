import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('booking cards cannot regain never-selected presentation defaults', () => {
  for (const name of [
    'pickupVisible',
    'returnVisible',
    'pickupAddress',
    'returnAddress',
    'enablePickupMapActions',
    'enableReturnMapActions',
    'showPickupRow',
    'initiallyOpen',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`, 'u'));
  }
  assert.doesNotMatch(source, /ignore:\s*unused_element_parameter/u);
});

test('modern card keeps the former default location semantics', () => {
  const details = between(
    'class _ModernDetailsCard extends StatelessWidget',
    'class _InfoRowModern extends StatelessWidget',
  );
  assert.match(details, /final bool showLocations;/u);
  assert.match(details, /this\.showLocations = true/u);
  assert.match(details, /if \(showLocationSection\) \.\.\./u);
  assert.match(
    details,
    /label: 'Abholort',\s+value: location,\s+trailing: _MapActions\(onMap: onMap, onNav: onNav\)/u,
  );
  assert.match(
    details,
    /label: 'Rückgabeort',\s+value: location,\s+trailing: _MapActions\(onMap: onMap, onNav: onNav\)/u,
  );
});

test('booking screens keep locations in the active privacy surfaces', () => {
  const hiddenCardLocations = source.match(/showLocations: false/g) ?? [];
  assert.equal(hiddenCardLocations.length, 2);
  assert.match(source, /AddressPrivacy\.nearbyShort\(kindLabel: 'Abholung'\)/u);
  assert.match(source, /AddressPrivacy\.nearbyShort\(kindLabel: 'Rückgabe'\)/u);
  assert.match(source, /widget\.booking\['exactAddressRevealed'\] == true/u);
});

test('cancellation policy stays collapsed and centrally sourced', () => {
  const cancellation = between(
    'class _CancellationPolicyCard extends StatefulWidget',
    'class _BoundBookingPriceSnapshot',
  );
  assert.match(cancellation, /bool _open = false;/u);
  assert.doesNotMatch(cancellation, /void initState\(\)/u);
  assert.match(cancellation, /CancellationPolicyText\.header/u);
  assert.match(cancellation, /CancellationPolicyText\.body\(\)/u);
  assert.match(cancellation, /onTap: \(\) => setState\(\(\) => _open = !_open\)/u);
});

test('fixed-default ratchet is permanently registered', () => {
  assert.match(
    regression,
    /node --test test\/tool\/booking_detail_fixed_default_parameter_ratchet_wiring\.test\.mjs/u,
  );
});
