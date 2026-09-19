import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

const model = read('lib/models/rental_request.dart');
const checkout = read('lib/screens/private_pilot_checkout_screen.dart');
const detail = read('lib/screens/booking_detail_screen.dart');
const bookingMaps = [
  'lib/screens/bookings_screen.dart',
  'lib/screens/notifications_screen.dart',
  'lib/screens/message_thread_screen.dart',
  'lib/screens/app_link_destination_screen.dart',
].map(read);

test('RentalRequest preserves the complete server price snapshot', () => {
  for (const field of [
    'quotedQuoteVersion',
    'quotedDays',
    'quotedPricePerDayMinor',
    'quotedBaseRentalMinor',
    'quotedDiscountPercent',
    'quotedDiscountId',
    'quotedDiscountLabel',
    'quotedDiscountFundingSource',
    'quotedDiscountThresholdDays',
    'quotedDiscountMinor',
    'quotedRentalSubtotalMinor',
    'quotedPlatformFeeMinor',
    'quotedTotalMinor',
    'quotedOwnerPayoutMinor',
    'quotedCurrency',
  ]) {
    assert.match(model, new RegExp(`final (?:int|double|String)\\? ${field};`, 'u'));
    assert.match(model, new RegExp(`'${field}': ${field}`, 'u'));
  }
  assert.match(model, /quote\['baseRentalMinor'\]/u);
  assert.match(model, /quote\['discountMinor'\]/u);
  assert.match(model, /quote\['ownerPayoutMinor'\]/u);
});

test('checkout binds every displayed quote amount to the request', () => {
  assert.match(checkout, /quotedQuoteVersion: quote\.quoteVersion/u);
  assert.match(checkout, /quotedDays: quote\.days/u);
  assert.match(checkout, /quotedBaseRentalMinor: quote\.baseRentalMinor/u);
  assert.match(checkout, /quotedDiscountMinor: quote\.discountMinor/u);
  assert.match(checkout, /quotedDiscountId: quote\.discountId/u);
  assert.match(checkout, /quotedDiscountLabel: quote\.discountLabel/u);
  assert.match(
    checkout,
    /quotedDiscountFundingSource: quote\.discountFundingSource/u,
  );
  assert.match(checkout, /quotedRentalSubtotalMinor: quote\.rentalSubtotalMinor/u);
  assert.match(checkout, /quotedPlatformFeeMinor: quote\.platformFeeMinor/u);
  assert.match(checkout, /quotedTotalMinor: quote\.totalMinor/u);
  assert.match(checkout, /quotedOwnerPayoutMinor: quote\.rentalSubtotalMinor/u);
});

test('every route into booking detail forwards the immutable quote values', () => {
  for (const source of bookingMaps) {
    for (const field of [
      'quotedQuoteVersion',
      'quotedBaseRentalMinor',
      'quotedDiscountId',
      'quotedDiscountLabel',
      'quotedDiscountFundingSource',
      'quotedDiscountThresholdDays',
      'quotedDiscountMinor',
      'quotedRentalSubtotalMinor',
      'quotedPlatformFeeMinor',
      'quotedTotalMinor',
      'quotedOwnerPayoutMinor',
      'quotedCurrency',
    ]) {
      assert.match(source, new RegExp(`'${field}'`, 'u'));
    }
  }
});

test('booking detail accepts only a self-consistent EUR launch snapshot', () => {
  assert.match(detail, /class _BoundBookingPriceSnapshot/u);
  assert.match(detail, /currency != 'EUR'/u);
  assert.match(detail, /rental \+ fee != total/u);
  assert.match(detail, /rawOwnerPayout != rental/u);
  assert.match(detail, /rawBase - rawDiscount == rental/u);
  assert.match(detail, /rawDaily \* rawDays == rawBase/u);
  assert.match(detail, /rawQuoteVersion == 3/u);
  assert.match(detail, /rawFundingSource == 'owner'/u);
  assert.match(detail, /return stored/u);
});

test('all booking states prefer exact server rent, fee, total and payout', () => {
  assert.match(detail, /boundPrice\?\.platformFee/u);
  assert.match(detail, /boundPrice\?\.rentalSubtotal/u);
  assert.match(detail, /boundPrice\?\.total/u);
  assert.match(detail, /boundPrice\?\.ownerPayout/u);
  assert.doesNotMatch(detail, /dropFee|retFee|expressFee/u);
  assert.match(detail, /\(rentalSubtotalLocal \+ feeLocal\)\.toStringAsFixed\(2\)/u);
  assert.match(detail, /\(rentalSubtotal \+ fee\)[\s\S]*?\.clamp\(0\.0, double\.infinity\)/u);
  assert.match(detail, /Legacy and\s+\/\/\/ QA bookings without a complete/u);
});
