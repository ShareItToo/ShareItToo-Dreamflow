import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/search_results_screen.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('concurrent saved-item assignments preserve every invoked mutation',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': '[]',
    });

    await Future.wait(<Future<void>>[
      DataService.setItemWishlist('rw3-item-a', DataService.wlSoonId),
      DataService.setItemWishlist('rw3-item-b', DataService.wlLaterId),
      DataService.setItemWishlist('rw3-item-c', DataService.wlAgainId),
    ]);

    expect(
      await DataService.getSavedItemIds(),
      containsAll(<String>['rw3-item-a', 'rw3-item-b', 'rw3-item-c']),
    );
    final prefs = await SharedPreferences.getInstance();
    final canonical = jsonDecode(prefs.getString('wishlist_state_v2')!) as Map;
    expect(canonical['revision'], 3);
  });

  test('concurrent custom-list additions retain distinct complete entries',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': '[]',
    });

    final ids = await Future.wait(<Future<String>>[
      DataService.addCustomWishlist('Werkstatt'),
      DataService.addCustomWishlist('Garten'),
      DataService.addCustomWishlist('Umzug'),
    ]);

    final lists = await DataService.getWishlists();
    expect(ids.toSet(), hasLength(3));
    expect(
      lists.map((entry) => entry['name']),
      containsAll(<String>['Werkstatt', 'Garten', 'Umzug']),
    );
  });

  test('canonical saved-state snapshot wins over interrupted stale mirrors',
      () async {
    final canonicalLists = <Map<String, Object>>[
      <String, Object>{
        'id': DataService.wlSoonId,
        'name': 'Demnächst benötigt',
        'system': true,
      },
      <String, Object>{
        'id': DataService.wlLaterId,
        'name': 'Für später',
        'system': true,
      },
      <String, Object>{
        'id': DataService.wlAgainId,
        'name': 'Wieder mieten',
        'system': true,
      },
      <String, Object>{
        'id': 'wl_rw3_atomic',
        'name': 'Atomarer Stand',
        'system': false,
      },
    ];
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlist_state_v2': jsonEncode(<String, Object>{
        'schemaVersion': 1,
        'revision': 7,
        'lists': canonicalLists,
        'assignments': <String, String>{'rw3-item': 'wl_rw3_atomic'},
      }),
      'wishlists_meta_v1': '{interrupted-stale-mirror',
      'wishlist_assign_v1': '{interrupted-stale-mirror',
      'items': '[]',
    });

    expect(await DataService.getWishlistForItem('rw3-item'), 'wl_rw3_atomic');
    expect(
      (await DataService.getWishlists())
          .singleWhere((entry) => entry['id'] == 'wl_rw3_atomic')['name'],
      'Atomarer Stand',
    );
  });

  test('one rejected wishlist mutation does not poison the serialized queue',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': '[]',
    });

    await expectLater(
      DataService.setItemWishlist('rw3-rejected', 'wl_missing'),
      throwsStateError,
    );
    await DataService.setItemWishlist('rw3-recovered', DataService.wlAgainId);

    expect(
      await DataService.getWishlistForItem('rw3-recovered'),
      DataService.wlAgainId,
    );
  });

  test('concurrent rental-cart additions retain all items and one revision',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final items = List.generate(
      3,
      (index) => buildTestItem(
        id: 'rw3-cart-$index',
        ownerId: 'rw3-owner-$index',
      ),
    );

    await Future.wait(<Future<Object>>[
      for (var index = 0; index < items.length; index += 1)
        DataService.addRentalCartItem(
          item: items[index],
          range: DateTimeRange(
            start: DateTime(2026, 9, 10 + index),
            end: DateTime(2026, 9, 12 + index),
          ),
        ),
    ]);

    final cart = await DataService.getRentalCart();
    expect(
      cart.items.map((entry) => entry.listingId),
      containsAll(items.map((entry) => entry.id)),
    );
    expect(cart.items, hasLength(3));
    expect(cart.revision, 3);
  });

  test('successful wishlist and cart mutations announce cross-surface refresh',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': '[]',
    });
    final announced = <String>[];
    final subscription = SharedPersistenceSync.changes.listen(announced.add);
    addTearDown(subscription.cancel);

    await DataService.setItemWishlist('rw3-item', DataService.wlSoonId);
    await DataService.addRentalCartProject(title: 'RW3 Projekt');

    expect(announced, contains('wishlist_state_v3'));
    expect(announced, contains('rental_cart_v2'));
  });

  testWidgets('open search refreshes after an external saved-state mutation',
      (tester) async {
    final item = buildTestItem(id: 'rw3-search-item', ownerId: 'rw3-owner');
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': jsonEncode(<Object>[item.toJson()]),
    });
    final initialPreferences = await SharedPreferences.getInstance();
    expect(initialPreferences.getString('wishlist_state_v2'), isNull);
    expect(await DataService.getSavedItemIds(), isEmpty);

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: MaterialApp(
          home: SearchResultsScreen(
            queryText: 'RW3 Suche',
            results: [item],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.favorite_border), findsOneWidget);

    await DataService.setItemWishlist(item.id, DataService.wlLaterId);
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.favorite), findsOneWidget);
  });

  testWidgets('open Mietkorb refreshes after an external project mutation',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': '[]',
    });

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: const MaterialApp(home: RentalCartScreen()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('RW3 Parallelprojekt'), findsNothing);

    await DataService.addRentalCartProject(title: 'RW3 Parallelprojekt');
    await tester.pump();
    await tester.pump();

    expect(find.text('RW3 Parallelprojekt'), findsOneWidget);
  });

  testWidgets(
      'compact search fails closed on external corruption and recovers by event',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final item = buildTestItem(id: 'rw3-recovery-item', ownerId: 'rw3-owner');
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': jsonEncode(<Object>[item.toJson()]),
    });
    await DataService.setItemWishlist(item.id, DataService.wlSoonId);
    final prefs = await SharedPreferences.getInstance();
    final lastKnownGood = prefs.getString('wishlist_state_v3')!;

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(320, 568),
              textScaler: TextScaler.linear(2),
            ),
            child: SearchResultsScreen(
              queryText: 'RW3 Recovery',
              results: [item],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.favorite), findsOneWidget);

    await prefs.setString('wishlist_state_v3', '{interrupted-write');
    SharedPersistenceSync.notify(SharedPersistenceSync.wishlistStateKey);
    await tester.pumpAndSettle();

    expect(
      find.text('Gemerkt-Status konnte nicht geladen werden'),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.favorite_border), findsNothing);
    expect(prefs.getString('wishlist_state_v3'), '{interrupted-write');

    await prefs.setString('wishlist_state_v3', lastKnownGood);
    SharedPersistenceSync.notify(SharedPersistenceSync.wishlistStateKey);
    await tester.pumpAndSettle();

    expect(
      find.text('Gemerkt-Status konnte nicht geladen werden'),
      findsNothing,
    );
    expect(find.byIcon(Icons.favorite), findsOneWidget);
  });
}
