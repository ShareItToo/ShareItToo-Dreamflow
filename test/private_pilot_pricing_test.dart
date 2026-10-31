import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/services/private_pilot_pricing.dart';

import 'support/test_builders.dart';

void main() {
  test('platform contribution is exact ten percent with one cent rounding', () {
    expect(PrivatePilotPricing.platformFeeMinor(0), 0);
    expect(PrivatePilotPricing.platformFeeMinor(1), 0);
    expect(PrivatePilotPricing.platformFeeMinor(99), 10);
    expect(PrivatePilotPricing.platformFeeMinor(1000), 100);
    expect(PrivatePilotPricing.platformFeeMinor(1005), 101);
  });

  test('quote discounts owner rent before applying the contribution', () {
    final json = buildTestItem(
      id: 'pilot-item',
      ownerId: 'owner',
      pricePerDay: 10.01,
    ).toJson()
      ..['autoApplyDiscounts'] = true
      ..['longRentalDiscounts'] = [
        {'days': 3, 'discountPercent': 10},
      ];
    final item = Item.fromJson(json);

    final quote = PrivatePilotPricing.quoteForItem(item: item, days: 3);

    expect(quote.baseRentalMinor, 3003);
    expect(quote.discountMinor, 300);
    expect(quote.rentalSubtotalMinor, 2703);
    expect(quote.platformFeeMinor, 270);
    expect(quote.totalMinor, 2973);
    expect(quote.discountId, 'listing_long_rental_3d_1000bp');
    expect(quote.discountLabel, 'Rabatt ab 3 Tagen (10 %)');
    expect(quote.discountFundingSource, 'owner');
    expect(quote.discountThresholdDays, 3);
  });

  test('public unit price already includes the contribution', () {
    expect(PrivatePilotPricing.customerUnitPriceMinor(10), 1100);
    expect(PrivatePilotPricing.formatMinor(1100), '11,00 €');
  });

  test('checkout renders the authoritative server quote without recomputing',
      () {
    final quote = PrivatePilotQuote.fromServerJson({
      'quoteVersion': 3,
      'days': 3,
      'pricePerDayMinor': 2000,
      'baseRentalMinor': 6000,
      'discountPercent': 10,
      'discountId': 'listing_long_rental_3d_1000bp',
      'discountLabel': 'Rabatt ab 3 Tagen (10 %)',
      'discountFundingSource': 'owner',
      'discountThresholdDays': 3,
      'discountMinor': 600,
      'rentalSubtotalMinor': 5400,
      'platformFeeMinor': 540,
      'totalMinor': 5940,
      'currency': 'EUR',
    });

    expect(quote.discountBasisPoints, 1000);
    expect(quote.discountLabel, 'Rabatt ab 3 Tagen (10 %)');
    expect(quote.rentalSubtotalMinor, 5400);
    expect(quote.platformFeeMinor, 540);
    expect(quote.totalMinor, 5940);
  });

  test('malformed server money is rejected', () {
    expect(
      () => PrivatePilotQuote.fromServerJson({
        'quoteVersion': 3,
        'days': 3,
        'pricePerDayMinor': 2000,
        'baseRentalMinor': 6000,
        'discountPercent': 10,
        'discountId': 'listing_long_rental_3d_1000bp',
        'discountLabel': 'Rabatt ab 3 Tagen (10 %)',
        'discountFundingSource': 'owner',
        'discountThresholdDays': 3,
        'discountMinor': 600,
        'rentalSubtotalMinor': 5400,
        'platformFeeMinor': 540,
        'totalMinor': 59.4,
        'currency': 'EUR',
      }),
      throwsFormatException,
    );
  });

  test('inconsistent or non-EUR server quotes are rejected', () {
    Map<String, dynamic> validQuote() => {
          'quoteVersion': 3,
          'days': 3,
          'pricePerDayMinor': 2000,
          'baseRentalMinor': 6000,
          'discountPercent': 10,
          'discountId': 'listing_long_rental_3d_1000bp',
          'discountLabel': 'Rabatt ab 3 Tagen (10 %)',
          'discountFundingSource': 'owner',
          'discountThresholdDays': 3,
          'discountMinor': 600,
          'rentalSubtotalMinor': 5400,
          'platformFeeMinor': 540,
          'totalMinor': 5940,
          'currency': 'EUR',
        };

    for (final invalid in [
      validQuote()..['days'] = 0,
      validQuote()..['baseRentalMinor'] = 5999,
      validQuote()..['rentalSubtotalMinor'] = 5399,
      validQuote()..['platformFeeMinor'] = 539,
      validQuote()..['totalMinor'] = 5941,
      validQuote()..['currency'] = 'USD',
    ]) {
      expect(
        () => PrivatePilotQuote.fromServerJson(invalid),
        throwsFormatException,
      );
    }
  });

  test('owner acceptance reconstructs the same strict request snapshot', () {
    final request = RentalRequest(
      id: 'owner-price',
      itemId: 'item',
      ownerId: 'owner',
      renterId: 'renter',
      start: DateTime(2026, 9, 1),
      end: DateTime(2026, 9, 4),
      status: 'pending',
      quotedQuoteVersion: 3,
      quotedDays: 3,
      quotedPricePerDayMinor: 2000,
      quotedBaseRentalMinor: 6000,
      quotedDiscountPercent: 10,
      quotedDiscountId: 'listing_long_rental_3d_1000bp',
      quotedDiscountLabel: 'Rabatt ab 3 Tagen (10 %)',
      quotedDiscountFundingSource: 'owner',
      quotedDiscountThresholdDays: 3,
      quotedDiscountMinor: 600,
      quotedRentalSubtotalMinor: 5400,
      quotedPlatformFeeMinor: 540,
      quotedTotalMinor: 5940,
      quotedOwnerPayoutMinor: 5400,
      quotedCurrency: 'EUR',
    );

    final quote = PrivatePilotQuote.fromRentalRequestSnapshot(request);

    expect(quote.rentalSubtotalMinor, 5400);
    expect(quote.discountLabel, 'Rabatt ab 3 Tagen (10 %)');
    expect(quote.platformFeeMinor, 540);
    expect(quote.totalMinor, 5940);
    expect(
      () => PrivatePilotQuote.fromRentalRequestSnapshot(
        request.copyWith(quotedTotalMinor: 5941),
      ),
      throwsFormatException,
    );
    expect(
      () => PrivatePilotQuote.fromRentalRequestSnapshot(
        request.copyWith(quotedOwnerPayoutMinor: 5399),
      ),
      throwsFormatException,
    );
  });

  test('discounted V3 snapshots fail closed without bound metadata', () {
    expect(
      () => PrivatePilotQuote.fromServerJson({
        'quoteVersion': 3,
        'days': 3,
        'pricePerDayMinor': 2000,
        'baseRentalMinor': 6000,
        'discountPercent': 10,
        'discountMinor': 600,
        'rentalSubtotalMinor': 5400,
        'platformFeeMinor': 540,
        'totalMinor': 5940,
        'currency': 'EUR',
      }),
      throwsFormatException,
    );
  });
}
