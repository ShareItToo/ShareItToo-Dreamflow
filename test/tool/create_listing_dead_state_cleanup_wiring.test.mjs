import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const createListing = readFileSync(
  new URL('../../lib/screens/create_listing_screen.dart', import.meta.url),
  'utf8',
);

test('removes obsolete listing state, helpers, and optional presentation slots', () => {
  for (const symbol of [
    '_offersExpressAtDropoff',
    '_deliveryOptionsEnabled',
    '_cancellationPolicy',
    '_tier1PctEmpty',
    '_tier2PctEmpty',
    '_tier3PctEmpty',
    '_iconFromName',
    'class _Bullet',
    'class _DiscountRow',
    'onPercentEmptyChanged',
  ]) {
    assert.doesNotMatch(createListing, new RegExp(symbol));
  }
  assert.doesNotMatch(createListing, /Widget\? trailing|this\.trailing/);
  assert.doesNotMatch(createListing, /widget\.(centerTitle|headerPadding|bodyPadding)/);
});

test('keeps the unified private-pilot delivery and cancellation payload', () => {
  assert.equal((createListing.match(/offersExpressAtDropoff: false/g) || []).length, 2);
  assert.equal((createListing.match(/cancellationPolicy: 'unified'/g) || []).length, 2);
  assert.match(createListing, /PrivatePilotConfig\.deliveryEnabled &&\s*_offersDeliveryAtDropoff/);
  assert.match(createListing, /PrivatePilotConfig\.deliveryEnabled &&\s*_offersPickupAtReturn/);
});

test('keeps active listing photos, address, AI price, and discount tiers', () => {
  for (const symbol of [
    '_showPhotoSourceSheet',
    'class _AddressAutocompleteField',
    '_calculatePriceSuggestion',
    'longRentalDiscounts',
    'class _ThresholdDiscountRow',
  ]) {
    assert.match(createListing, new RegExp(symbol));
  }
});

test('keeps the current left-aligned accordion and section layout defaults', () => {
  assert.match(createListing, /alignment: Alignment\.centerLeft/);
  assert.match(createListing, /horizontal: widget\.bare \? 0 : 12/);
  assert.match(createListing, /class _Section extends StatelessWidget/);
  assert.match(createListing, /final Widget\? leading/);
});
