import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/screens/search_results_screen.dart';
import 'package:lendify/screens/select_rental_duration_screen.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/item_card.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/widgets/listing_carousel_card.dart';
import 'package:lendify/widgets/search_overlay.dart';
import 'package:lendify/widgets/synthetic_catalog_listing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final Map<String, dynamic> backendSyntheticFixture = jsonDecode(
    File('test/fixtures/staging_synthetic_catalog_public_listing.json')
        .readAsStringSync()) as Map<String, dynamic>;

Map<String, dynamic> itemJson({bool synthetic = true}) {
  final value = Map<String, dynamic>.from(backendSyntheticFixture);
  value['tags'] = List<String>.from(value['tags'] as List);
  value['photos'] = List<String>.from(value['photos'] as List);
  value['longRentalDiscounts'] =
      List<dynamic>.from(value['longRentalDiscounts'] as List);
  if (!synthetic) {
    for (final key in [
      'catalogClass',
      'realOffer',
      'ownerDeclaration',
      'bookingAllowed',
      'paymentAllowed',
      'syntheticNotice',
    ]) {
      value.remove(key);
    }
    value['id'] = 'ordinary-fixture';
  }
  return value;
}

void main() {
  testWidgets('guest nearby search suggestions retain the synthetic notice',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({
      'items': jsonEncode([itemJson()]),
      'users': '[]',
    });
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: Builder(builder: (context) {
        return TextButton(
            onPressed: () => SearchOverlay.show(context),
            child: const Text('Suche öffnen'));
      })),
    ));
    await tester.tap(find.text('Suche öffnen'));
    await tester.pumpAndSettle();
    expect(find.text(Item.syntheticCatalogNotice), findsOneWidget);
    expect(find.byType(SyntheticCatalogCard), findsOneWidget);
    expect(find.byIcon(Icons.verified_outlined), findsNothing);
    await tester.ensureVisible(find.text('Testansicht öffnen'));
    await tester.tap(find.text('Testansicht öffnen'));
    await tester.pumpAndSettle();
    expect(find.byType(SyntheticCatalogDetails), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull);
    expect(tester.takeException(), isNull);
  });

  for (final synthetic in [true, false]) {
    testWidgets(
        'guest search ${synthetic ? 'synthetic results are noncontractual' : 'ordinary results retain listing controls'}',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final semantics = tester.ensureSemantics();
      try {
        final item = Item.fromJson(itemJson(synthetic: synthetic));
        await tester.pumpWidget(ChangeNotifierProvider(
          create: (_) => LocalizationController(),
          child: MaterialApp(
            home:
                SearchResultsScreen(queryText: 'Synthetische', results: [item]),
          ),
        ));
        await tester.pumpAndSettle();
        if (!synthetic) {
          expect(find.bySemanticsLabel('Anzeige öffnen: ${item.title}'),
              findsOneWidget);
          expect(find.byTooltip('Anzeigenoptionen'), findsOneWidget);
          expect(find.byType(SyntheticCatalogCard), findsNothing);
          return;
        }
        expect(find.text(Item.syntheticCatalogNotice), findsOneWidget);
        expect(find.byType(SyntheticCatalogCard), findsOneWidget);
        expect(
            find.bySemanticsLabel(
                RegExp('Anzeige öffnen|Anzeigenoptionen|Gemerkt')),
            findsNothing);
        expect(find.byTooltip('Nicht verifiziert'), findsNothing);
        expect(find.textContaining('€'), findsNothing);
        expect(find.byIcon(Icons.favorite_border), findsNothing);
        // No long-press route to ordinary listing options or rental intent.
        await tester.longPress(find.text(item.title));
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsNothing);
        // InkWell may treat an unhandled long press as the safe card tap.
        if (find.byType(SyntheticCatalogDetails).evaluate().isNotEmpty) {
          await tester.pageBack();
          await tester.pumpAndSettle();
        }
        await tester.ensureVisible(find.text('Testansicht öffnen'));
        await tester.tap(find.text('Testansicht öffnen'));
        await tester.pumpAndSettle();
        expect(find.byType(SyntheticCatalogDetails), findsOneWidget);
        await tester.scrollUntilVisible(find.byType(FilledButton), 120);
        expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
            isNull);
        expect(find.text('In den Mietkorb'), findsNothing);
        expect(find.text('Reservieren'), findsNothing);
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    });
  }

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

  test(
      'exact backend synthetic fixture parses while malformed ordinary remains strict',
      () {
    final item = Item.fromJson(itemJson());
    expect(item.id, 'synthetic-fixture');
    expect(item.ownerId, 'synthetic-owner');
    expect(item.photos, [
      'https://shareittoo.com/api/v1/uploads/synthetic.jpg',
    ]);
    expect(item.lat, 49.14);
    expect(item.lng, 9.22);
    expect(item.isSyntheticCatalog, isTrue);
    expect(item.bookingAllowed, isFalse);
    expect(item.paymentAllowed, isFalse);

    final malformed = itemJson(synthetic: false)..remove('pricePerDay');
    expect(() => Item.fromJson(malformed), throwsA(isA<TypeError>()));
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
      await tester.scrollUntilVisible(
          find.text('Nicht buchbar – nur Katalogtest'), 120);
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
