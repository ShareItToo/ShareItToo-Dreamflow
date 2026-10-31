import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/listing_sets_technical_config.dart';
import 'package:lendify/models/listing_set.dart';

Map<String, dynamic> quote(String id, int totalMinor) => <String, dynamic>{
      'role': 'required',
      'sortOrder': id.endsWith('1') ? 0 : 1,
      'listing': <String, dynamic>{'id': id, 'title': 'Artikel $id'},
      'quote': <String, dynamic>{
        'quoteHash':
            List<String>.filled(64, id.endsWith('1') ? 'a' : 'b').join(),
        'availabilityRevision': 1,
        'currency': 'EUR',
        'rentalSubtotalMinor': totalMinor - 100,
        'platformFeeMinor': 100,
        'totalMinor': totalMinor,
        'ownerPayoutMinor': totalMinor - 100,
        'securityDepositMinor': 0,
        'preview': true,
        'persisted': false,
      },
      'itemBoundary': <String, dynamic>{
        'priceAllocation': 'item_quote',
        'handoverReturnEvidence': 'v52_item_booking_evidence',
        'damageAndNeedsReview': 'v52_item_booking_case',
        'refund': 'v51_v52_item_booking_obligation',
        'auditReference': 'item_booking_and_quote_ids',
      },
    };

Map<String, dynamic> resolutionJson({
  String kind = 'one_stop_set',
  int handoverCount = 1,
}) =>
    <String, dynamic>{
      'listingSetVersion': 'G5B-2026-08-21.1',
      'id': 'listing_set_11111111-1111-4111-8111-111111111111',
      'revision': 2,
      'setKind': kind,
      'title': 'Werkstatt Set',
      'membershipHash': List<String>.filled(64, 'c').join(),
      'currency': 'EUR',
      'items': <Map<String, dynamic>>[
        quote('listing-0001', 1000),
        quote('listing-0002', 1500),
      ],
      'unavailableOptionalCount': 0,
      'totals': <String, dynamic>{
        'currency': 'EUR',
        'rentalSubtotalMinor': 2300,
        'platformFeeMinor': 200,
        'totalMinor': 2500,
        'ownerPayoutMinor': 2300,
        'securityDepositMinor': 0,
      },
      'rankingBasis': <String, dynamic>{
        'approvedSignal': 'fewer_handovers',
        'handoverCount': handoverCount,
        'businessStatusUsed': false,
        'priceUsedForRanking': false,
        'hiddenPriceManipulationUsed': false,
      },
      'serverTruth': <String, dynamic>{
        'allRequiredItemsAvailable': true,
        'itemAvailabilityChecked': true,
        'itemQuotePreviewChecked': true,
        'individualBookabilityPreserved': true,
        'setDiscountApplied': false,
        'quotePersisted': false,
        'reservationCreated': false,
        'bookingCreated': false,
        'contractCreated': false,
        'paymentCreated': false,
        'revalidationRequiredBeforeRequest': true,
      },
    };

void main() {
  test('G5B technical UI is disabled and cannot be exposed in release mode',
      () {
    expect(ListingSetsTechnicalConfig.enabled, isFalse);
    expect(ListingSetsTechnicalConfig.publicReleaseAllowed, isFalse);
    expect(ListingSetsTechnicalConfig.fewerHandoversRankingAllowed, isTrue);
    expect(ListingSetsTechnicalConfig.businessStatusRankingAllowed, isFalse);
    expect(ListingSetsTechnicalConfig.hiddenPriceManipulationAllowed, isFalse);
    expect(
      ListingSetsTechnicalConfig.availableForMode(releaseMode: false),
      isFalse,
    );
    expect(
      ListingSetsTechnicalConfig.availableForMode(releaseMode: true),
      isFalse,
    );
    expect(
      ListingSetsTechnicalConfig.availableForConfiguration(
        featureEnabled: true,
        releaseMode: true,
        signedStageAInternalEnvelope: false,
      ),
      isFalse,
    );
    expect(
      ListingSetsTechnicalConfig.availableForConfiguration(
        featureEnabled: true,
        releaseMode: true,
        signedStageAInternalEnvelope: true,
      ),
      isTrue,
    );
  });

  test('resolution preserves exact item price and operational boundaries', () {
    final resolution = ListingSetResolution.fromJson(resolutionJson());
    expect(resolution.kind, ListingSetKind.oneStopSet);
    expect(resolution.items, hasLength(2));
    expect(resolution.totalMinor, 2500);
    expect(resolution.handoverCount, 1);
    expect(
      resolution.items.every((item) => item.quote.securityDepositMinor == 0),
      isTrue,
    );
  });

  test('owner view accepts only versioned, individually bookable sets', () {
    final row = <String, dynamic>{
      'listingSetVersion': 'G5B-2026-08-21.1',
      'id': 'listing_set_11111111-1111-4111-8111-111111111111',
      'revision': 1,
      'setKind': 'sit_set',
      'title': 'Werkstatt Set',
      'status': 'active',
      'currency': 'EUR',
      'membershipHash': List<String>.filled(64, 'c').join(),
      'individualBookabilityPreserved': true,
      'members': <Map<String, dynamic>>[
        <String, dynamic>{
          'listingId': 'listing-0001',
          'role': 'required',
          'sortOrder': 0,
          'title': 'Bohrmaschine',
        },
        <String, dynamic>{
          'listingId': 'listing-0002',
          'role': 'required',
          'sortOrder': 1,
          'title': 'Schleifer',
        },
      ],
    };

    final set = ListingSetOwnerView.fromJson(row);
    expect(set.members, hasLength(2));
    expect(set.status, 'active');

    row['individualBookabilityPreserved'] = false;
    expect(
      () => ListingSetOwnerView.fromJson(row),
      throwsFormatException,
    );
  });

  test('unsafe totals, Business ranking and false 1-Stop claims fail closed',
      () {
    final wrongTotal = resolutionJson();
    (wrongTotal['totals'] as Map<String, dynamic>)['totalMinor'] = 2400;
    expect(
      () => ListingSetResolution.fromJson(wrongTotal),
      throwsFormatException,
    );

    final businessRanking = resolutionJson();
    (businessRanking['rankingBasis']
        as Map<String, dynamic>)['businessStatusUsed'] = true;
    expect(
      () => ListingSetResolution.fromJson(businessRanking),
      throwsFormatException,
    );

    expect(
      () => ListingSetResolution.fromJson(
        resolutionJson(handoverCount: 2),
      ),
      throwsFormatException,
    );
  });

  test('discovery accepts only omitted-unavailable and approved ranking facts',
      () {
    final entry = resolutionJson()
      ..['ranking'] = <String, dynamic>{
        'position': 1,
        'approvedSignals': <String>['fewer_handovers'],
        'businessStatusUsed': false,
        'priceUsedForRanking': false,
        'hiddenPriceManipulationUsed': false,
      };
    final discovery = ListingSetDiscovery.fromJson(<String, dynamic>{
      'sets': <Map<String, dynamic>>[entry],
      'unavailableSetsOmitted': true,
      'externalProviderTraffic': false,
    });
    expect(discovery.sets, hasLength(1));

    (entry['ranking'] as Map<String, dynamic>)['priceUsedForRanking'] = true;
    expect(
      () => ListingSetDiscovery.fromJson(<String, dynamic>{
        'sets': <Map<String, dynamic>>[entry],
        'unavailableSetsOmitted': true,
        'externalProviderTraffic': false,
      }),
      throwsFormatException,
    );
  });
}
