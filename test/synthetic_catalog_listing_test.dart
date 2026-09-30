import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/screens/select_rental_duration_screen.dart';
import 'package:lendify/widgets/item_card.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/widgets/listing_carousel_card.dart';
import 'package:lendify/widgets/synthetic_catalog_listing.dart';

Map<String, dynamic> itemJson({bool synthetic = true}) => {
      'id': 'synthetic-fixture',
      'ownerId': 'synthetic-owner',
      'title': 'Testillustration',
      'description': 'Erfundene Daten',
      'categoryId': 'cat3',
      'subcategory': 'Sonstiges',
      'condition': 'good',
      'pricePerDay': 12,
      'photos': <String>[],
      'locationText': 'Heilbronn',
      'lat': 49.14,
      'lng': 9.22,
      'geohash': '',
      'createdAt': '2026-09-30T10:00:00Z',
      'city': 'Heilbronn',
      'country': 'Deutschland',
      if (synthetic) ...{
        'catalogClass': Item.syntheticCatalogClass,
        'bookingAllowed': false,
        'paymentAllowed': false,
        'syntheticNotice': Item.syntheticCatalogNotice,
      },
    };

void main() {
  test('ordinary parity and synthetic class survive persistence/restart', () {
    final ordinary = Item.fromJson(itemJson(synthetic: false));
    expect(ordinary.bookingAllowed, isTrue);
    expect(ordinary.paymentAllowed, isTrue);
    expect(ordinary.toJson().containsKey('catalogClass'), isFalse);
    final item = Item.fromJson(itemJson());
    final restored = Item.fromJson(item.toJson());
    expect(restored.isSyntheticCatalog, isTrue);
    expect(restored.bookingAllowed, isFalse);
    expect(restored.paymentAllowed, isFalse);
    final contradictory =
        Item.fromJson({...itemJson(), 'bookingAllowed': true});
    expect(contradictory.bookingAllowed, isFalse);
  });

  for (final carousel in [false, true]) {
    testWidgets(
        'synthetic ${carousel ? 'carousel' : 'grid'} card shows notice and opens nonbookable detail',
        (tester) async {
      final item = Item.fromJson(itemJson());
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: SizedBox(
                  width: 240,
                  height: 320,
                  child: carousel
                      ? ListingCarouselCard(
                          item: item,
                          isFavorite: false,
                          onFavoriteToggle: () => fail(
                              'fixture must not save a real rental intent'))
                      : ItemCard(item: item)))));
      expect(find.text(Item.syntheticCatalogNotice), findsOneWidget);
      expect(find.textContaining('€'), findsNothing);
      await tester.tap(find.text('Testansicht öffnen'));
      await tester.pumpAndSettle();
      expect(find.byType(SyntheticCatalogDetails), findsOneWidget);
      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
      expect(find.text('In den Mietkorb'), findsNothing);
      expect(find.text('Reservieren'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  for (final entry in ['deep-link', 'owner', 'direct-calendar']) {
    testWidgets(
        '$entry cannot reach normal booking actions at mobile width and enlarged text',
        (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final semantics = tester.ensureSemantics();
      try {
        final item = Item.fromJson(itemJson());
        final Widget screen = switch (entry) {
          'deep-link' => LinkedListingDetailsScreen(item: item),
          'owner' => OwnerListingDetailsScreen(item: item),
          _ => SelectRentalDurationScreen(item: item),
        };
        await tester.pumpWidget(MaterialApp(
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(2)),
                child: child!),
            home: screen));
        await tester.pumpAndSettle();
        expect(find.text(Item.syntheticCatalogNotice), findsOneWidget);
        expect(find.byType(SyntheticCatalogDetails), findsOneWidget);
        await tester.scrollUntilVisible(find.byType(FilledButton), 150);
        expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
            isNull);
        expect(find.bySemanticsLabel('Nicht buchbar – nur Katalogtest'),
            findsOneWidget);
        expect(find.textContaining('€'), findsNothing);
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    });
  }
}
