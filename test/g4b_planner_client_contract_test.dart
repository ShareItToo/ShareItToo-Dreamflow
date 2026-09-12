import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/planner.dart';

Map<String, dynamic> _catalog() => <String, dynamic>{
      'plannerVersion': 'G4A-2026-08-21.1',
      'externalGenerativeAiUsed': false,
      'serverResolutionRequired': true,
      'templates': List<Map<String, dynamic>>.generate(
        5,
        (index) => <String, dynamic>{
          'id': 'template_$index',
          'title': 'Projekt $index',
          'questions': List<Map<String, dynamic>>.generate(
            3,
            (question) => <String, dynamic>{
              'id': 'question_$question',
              'prompt': 'Welche Auswahl gilt für Frage $question?',
              'type': 'single_choice',
              'options': <String>['first', 'second'],
            },
          ),
        },
      ),
    };

Map<String, dynamic> _selection(String suffix, int total) => <String, dynamic>{
      'itemType': 'required_item_$suffix',
      'priority': 'required',
      'listing': <String, dynamic>{
        'id': 'listing-$suffix',
        'title': 'Artikel $suffix',
      },
      'quote': <String, dynamic>{
        'quoteHash': List<String>.filled(64, suffix).join(),
        'quotedAt': '2026-08-30T00:00:00.000Z',
        'availabilityRevision': 1,
        'currency': 'EUR',
        'rentalSubtotalMinor': total - 100,
        'platformFeeMinor': 100,
        'totalMinor': total,
        'ownerPayoutMinor': total - 100,
        'preview': true,
        'persisted': false,
      },
    };

Map<String, dynamic> _variant(String id, String suffix) => <String, dynamic>{
      'id': id,
      'label': id,
      'status': 'current',
      'rankingBasis': 'deterministic current server facts only',
      'unavailableReason': null,
      'selections': <Map<String, dynamic>>[_selection(suffix, 1200)],
      'totals': <String, dynamic>{
        'currency': 'EUR',
        'rentalSubtotalMinor': 1100,
        'platformFeeMinor': 100,
        'totalMinor': 1200,
        'ownerPayoutMinor': 1100,
      },
      'reservationCreated': false,
    };

Map<String, dynamic> _resolution() => <String, dynamic>{
      'plannerInventoryVersion': 'G4B-2026-08-21.1',
      'plannerCoreVersion': 'G4A-2026-08-21.1',
      'templateId': 'move',
      'templateTitle': 'Umzug vorbereiten',
      'startDate': '2026-09-10',
      'endDate': '2026-09-12',
      'selectedItemTypes': <String>['required_item_a'],
      'cartEligible': true,
      'variants': <Map<String, dynamic>>[
        _variant('one_stop', 'a'),
        _variant('price_efficient', 'b'),
        _variant('top_rated', 'c'),
      ],
      'inventorySnapshotHash': List<String>.filled(64, 'd').join(),
      'serverTruth': <String, dynamic>{
        'status': 'resolved_at_request_time',
        'inventoryQueried': true,
        'currentAvailabilityChecked': true,
        'currentQuotePreviewChecked': true,
        'quotePersisted': false,
        'reservationCreated': false,
        'bookingCreated': false,
        'revalidationRequiredBeforeRequest': true,
      },
      'externalGenerativeAiUsed': false,
    };

void main() {
  test('planner catalog and resolution accept exact non-AI preview contracts',
      () {
    final catalog = PlannerCatalog.fromJson(_catalog());
    final resolution = PlannerResolution.fromJson(_resolution());

    expect(catalog.templates, hasLength(5));
    expect(resolution.variants, hasLength(3));
    expect(resolution.cartEligible, isTrue);
    expect(resolution.variants.every((variant) => variant.available), isTrue);
  });

  test('planner client rejects AI, persisted quote, and false server truth',
      () {
    final aiCatalog = _catalog()..['externalGenerativeAiUsed'] = true;
    expect(
      () => PlannerCatalog.fromJson(aiCatalog),
      throwsFormatException,
    );

    final persisted = _resolution();
    final firstVariant = (persisted['variants'] as List).first as Map;
    final firstSelection =
        (firstVariant['selections'] as List).first as Map<String, dynamic>;
    final firstQuote =
        Map<String, dynamic>.from(firstSelection['quote'] as Map);
    firstSelection['quote'] = <String, dynamic>{
      ...firstQuote,
      'persisted': true,
    };
    expect(
      () => PlannerResolution.fromJson(persisted),
      throwsFormatException,
    );

    final falseTruth = _resolution();
    (falseTruth['serverTruth'] as Map<String, dynamic>)['reservationCreated'] =
        true;
    expect(
      () => PlannerResolution.fromJson(falseTruth),
      throwsFormatException,
    );
  });

  test('planner cart receipt requires exact snapshot and non-reserving cart',
      () {
    final resolution = PlannerResolution.fromJson(_resolution());
    final receipt = <String, dynamic>{
      'plannerInventoryVersion': 'G4B-2026-08-21.1',
      'templateId': 'move',
      'inventorySnapshotHash': resolution.inventorySnapshotHash,
      'variantId': 'one_stop',
      'addedItemCount': 1,
      'revalidated': true,
      'reservationCreated': false,
      'bookingCreated': false,
      'cart': <String, dynamic>{
        'schemaVersion': 1,
        'revision': 2,
        'reservationCreated': false,
        'projects': const <Object>[],
        'items': const <Object>[],
      },
    };
    expect(
      PlannerCartReceipt.fromJson(
        receipt,
        resolution: resolution,
        variantId: 'one_stop',
      ).addedItemCount,
      1,
    );

    receipt['inventorySnapshotHash'] = List<String>.filled(64, 'e').join();
    expect(
      () => PlannerCartReceipt.fromJson(
        receipt,
        resolution: resolution,
        variantId: 'one_stop',
      ),
      throwsFormatException,
    );
  });
}
