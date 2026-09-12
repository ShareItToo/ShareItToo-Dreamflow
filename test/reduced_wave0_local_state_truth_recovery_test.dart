import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/search_results_screen.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('corrupt reference categories self-heal without rewriting user state',
      () async {
    const preserved = <String, String>{
      'users': '[{"id":"preserved-user"}]',
      'currentUser': '{"id":"preserved-user"}',
      'items': '[]',
      'reviews': '[{"id":"preserved-review"}]',
    };
    SharedPreferences.setMockInitialValues(<String, Object>{
      ...preserved,
      'categories': '{corrupt-reference-cache',
    });

    final categories = await DataService.getCategories();

    expect(categories, isNotEmpty);
    expect(categories.any((category) => category.id == 'cat8'), isTrue);
    final prefs = await SharedPreferences.getInstance();
    expect(jsonDecode(prefs.getString('categories')!), isA<List<dynamic>>());
    for (final entry in preserved.entries) {
      expect(prefs.getString(entry.key), entry.value, reason: entry.key);
    }
  });

  test(
      'corrupt wishlist metadata fails closed and remains byte-for-byte intact',
      () async {
    const corrupt = '{"unexpected":"object"}';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': corrupt,
      'wishlist_assign_v1': '{}',
      'items': '[]',
    });

    await expectLater(DataService.getWishlists(), throwsFormatException);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('wishlists_meta_v1'), corrupt);
  });

  test('corrupt assignments cannot become a false empty saved state', () async {
    const corrupt = '["not","an","assignment-map"]';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': corrupt,
      'items': '[]',
    });

    await expectLater(DataService.getSavedItemIds(), throwsFormatException);
    await expectLater(
      DataService.getWishlistForItem('item-1'),
      throwsFormatException,
    );
    await expectLater(DataService.getItemsByWishlist(), throwsFormatException);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('wishlist_assign_v1'), corrupt);
  });

  test('corrupt assignments reject writes without reporting persistence',
      () async {
    const corrupt = '{not-json';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': corrupt,
      'items': '[]',
    });

    await expectLater(
      DataService.setItemWishlist('item-1', DataService.wlSoonId),
      throwsFormatException,
    );
    await expectLater(
      DataService.removeItemFromWishlist('item-1'),
      throwsFormatException,
    );

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('wishlist_assign_v1'), corrupt);
  });

  test('corrupt wishlist metadata rejects every metadata mutation', () async {
    const corrupt = '{not-list-metadata';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': corrupt,
      'wishlist_assign_v1': '{}',
      'items': '[]',
    });

    await expectLater(
      DataService.addCustomWishlist('Renovierung'),
      throwsFormatException,
    );
    await expectLater(
      DataService.renameCustomWishlist(
        id: 'wl_custom',
        newName: 'Werkstatt',
      ),
      throwsFormatException,
    );
    await expectLater(
      DataService.deleteCustomWishlist('wl_custom'),
      throwsFormatException,
    );

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('wishlists_meta_v1'), corrupt);
  });

  test('orphan assignments fail closed instead of disappearing from folders',
      () async {
    const assignments = '{"item-1":"wl_missing_custom"}';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': assignments,
      'items': '[]',
    });

    await expectLater(DataService.getSavedItemIds(), throwsFormatException);
    await expectLater(
      DataService.getWishlistForItem('item-1'),
      throwsFormatException,
    );
    await expectLater(DataService.getItemsByWishlist(), throwsFormatException);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('wishlist_assign_v1'), assignments);
  });

  test('custom wishlist lifecycle is verified through metadata and assignments',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': '[]',
    });

    final id = await DataService.addCustomWishlist('Renovierung');
    await DataService.setItemWishlist('item-1', id);
    await DataService.renameCustomWishlist(id: id, newName: 'Werkstatt');

    final renamed = await DataService.getWishlists();
    expect(
      renamed.singleWhere((entry) => entry['id'] == id)['name'],
      'Werkstatt',
    );
    expect(await DataService.getWishlistForItem('item-1'), id);

    await DataService.deleteCustomWishlist(id);
    expect(
      (await DataService.getWishlists()).any((entry) => entry['id'] == id),
      isFalse,
    );
    expect(await DataService.getWishlistForItem('item-1'), isNull);
  });

  test('corrupt listings cannot become an empty wishlist result', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': '{not-a-list}',
    });

    await expectLater(DataService.getItemsByWishlist(), throwsFormatException);
  });

  test('successful assignment survives a local process-style recreation',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
      'items': '[]',
    });

    await DataService.setItemWishlist('item-1', DataService.wlLaterId);
    final beforeRestart = await SharedPreferences.getInstance();
    final persisted = beforeRestart.getString('wishlist_assign_v1')!;

    SharedPreferences.setMockInitialValues(<String, Object>{
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': persisted,
      'items': '[]',
    });

    expect(
      await DataService.getWishlistForItem('item-1'),
      DataService.wlLaterId,
    );
  });

  testWidgets('Mietkorb keeps corrupt local state behind a persistent retry',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    const corrupt = '{"unexpected":"object"}';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': '[]',
      'wishlists_meta_v1': corrupt,
      'wishlist_assign_v1': '{}',
    });

    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: const MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: Size(320, 568),
              textScaler: TextScaler.linear(2),
            ),
            child: RentalCartScreen(),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 4));

    expect(
      find.text('Gespeicherte Daten konnten nicht geladen werden'),
      findsOneWidget,
    );
    expect(find.text('Noch keine Mietzeiträume vorbereitet.'), findsNothing);
    expect(find.text('Noch keine Merklisten'), findsNothing);
    final retry = find.widgetWithText(OutlinedButton, 'Erneut laden');
    expect(retry, findsOneWidget);
    expect(tester.getSize(retry).height, greaterThanOrEqualTo(48));
    expect(
      find.bySemanticsLabel(
        'Gespeicherte Daten konnten nicht geladen werden. '
        'Lokale Daten bleiben unverändert. Erneut laden.',
      ),
      findsOneWidget,
    );

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('wishlists_meta_v1'), corrupt);
    await prefs.setString('wishlists_meta_v1', '[]');
    await tester.drag(find.byType(ListView).first, const Offset(0, -600));
    await tester.pump();
    expect(tester.getCenter(retry).dy, inInclusiveRange(0, 568));
    final retryAction = tester.widget<OutlinedButton>(retry).onPressed!;
    retryAction();
    retryAction();
    await tester.pumpAndSettle();

    expect(
      find.text('Gespeicherte Daten konnten nicht geladen werden'),
      findsNothing,
    );
    expect(
        prefs.getString('wishlists_meta_v1'), contains(DataService.wlSoonId));
    semantics.dispose();
  });

  testWidgets('folder detail never presents corrupt assignments as empty',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': '[]',
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
    });

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: const MaterialApp(home: RentalCartScreen()),
      ),
    );
    await tester.pumpAndSettle();
    final prefs = await SharedPreferences.getInstance();
    final lastKnownGood = prefs.getString('wishlist_state_v3')!;
    await prefs.setString('wishlist_state_v3', '{corrupt-saved-state');

    final folder = find.text('Demnächst benötigt').last;
    await tester.ensureVisible(folder);
    await tester.tap(folder);
    await tester.pumpAndSettle();

    expect(find.text('Merkliste konnte nicht geladen werden'), findsOneWidget);
    expect(find.text('Noch keine Artikel gespeichert'), findsNothing);
    final retry = find.widgetWithText(OutlinedButton, 'Erneut laden');
    expect(retry, findsOneWidget);
    expect(tester.getSize(retry).height, greaterThanOrEqualTo(48));

    await prefs.setString('wishlist_state_v3', lastKnownGood);
    await tester.tap(retry);
    await tester.pumpAndSettle();

    expect(find.text('Merkliste konnte nicht geladen werden'), findsNothing);
    expect(find.text('Noch keine Artikel gespeichert'), findsOneWidget);
  });

  testWidgets('search exposes unknown saved state until a retry succeeds',
      (tester) async {
    final item = buildTestItem(id: 'rw2-search-item', ownerId: 'rw2-owner');
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': jsonEncode(<Object>[item.toJson()]),
      'wishlist_assign_v1': '{corrupt-assignments',
    });

    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: MaterialApp(
          home: SearchResultsScreen(
            queryText: 'RW2 Suche',
            results: [item],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Gemerkt-Status konnte nicht geladen werden'),
      findsOneWidget,
    );
    final retry = find.widgetWithText(OutlinedButton, 'Erneut laden');
    expect(retry, findsOneWidget);
    expect(tester.getSize(retry).height, greaterThanOrEqualTo(48));
    expect(
      find.bySemanticsLabel(
        'Gemerkt-Status konnte nicht geladen werden. '
        'Es wurde nichts verändert. Erneut laden.',
      ),
      findsOneWidget,
    );

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('wishlist_assign_v1', '{}');
    await tester.tap(retry);
    await tester.pumpAndSettle();

    expect(
      find.text('Gemerkt-Status konnte nicht geladen werden'),
      findsNothing,
    );
    semantics.dispose();
  });

  testWidgets('search never confirms a save after local saved-state corruption',
      (tester) async {
    final item = buildTestItem(id: 'rw2-save-item', ownerId: 'rw2-owner');
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': jsonEncode(<Object>[item.toJson()]),
      'wishlists_meta_v1': '[]',
      'wishlist_assign_v1': '{}',
    });

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: MaterialApp(
          home: SearchResultsScreen(
            queryText: 'RW2 Save',
            results: [item],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final prefs = await SharedPreferences.getInstance();
    final metadataMirror = prefs.getString('wishlists_meta_v1');
    final assignmentMirror = prefs.getString('wishlist_assign_v1');
    await prefs.setString('wishlist_state_v3', '{corrupt-saved-state');
    await tester.tap(
      find.bySemanticsLabel('Unter Gemerkt speichern: ${item.title}'),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Gemerkt-Status konnte nicht geladen werden'),
      findsOneWidget,
    );
    expect(find.text('Unter Gemerkt gespeichert'), findsNothing);
    expect(prefs.getString('wishlist_assign_v1'), assignmentMirror);
    expect(prefs.getString('wishlists_meta_v1'), metadataMirror);
    expect(prefs.getString('wishlist_state_v3'), '{corrupt-saved-state');
  });
}
