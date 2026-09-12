import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/widgets/wishlist_mosaic_card.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> role(String value, {bool notify = true}) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    jsonEncode({
      'userId': 'synthetic-wishlist-$value',
      'sessionId': 'synthetic-wishlist-session-$value',
      'email': 'wishlist-$value@example.invalid',
      'createdAt': '2026-09-04T00:00:00Z',
    }),
  );
  if (notify) {
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({'items': '[]'});
    await role('a');
  });
  for (final operation in [
    'create',
    'rename',
    'delete',
    'assign',
    'remove',
    'read'
  ]) {
    test('wishlist $operation rejects A owner after silent B replacement',
        () async {
      final id = await DataService.addCustomWishlist('A private saved list');
      await DataService.setItemWishlist('synthetic-listing', id);
      final owner = await LocalPrincipalActionOwner.capture();
      await role('b', notify: false);
      final prefs = await SharedPreferences.getInstance();
      final before = prefs.getString('wishlist_state_v3');
      final Future<Object?> request = switch (operation) {
        'create' =>
          DataService.addCustomWishlist('A draft', expectedOwner: owner),
        'rename' => DataService.renameCustomWishlist(
            id: id, newName: 'A draft', expectedOwner: owner),
        'delete' => DataService.deleteCustomWishlist(id, expectedOwner: owner),
        'assign' => DataService.setItemWishlist(
            'synthetic-listing', DataService.wlSoonId,
            expectedOwner: owner),
        'remove' => DataService.removeItemFromWishlist('synthetic-listing',
            expectedOwner: owner),
        _ => DataService.getItemsByWishlist(expectedOwner: owner),
      };
      await expectLater(request, throwsStateError);
      expect(prefs.getString('wishlist_state_v3'), before);
    });
  }
  for (final operation in ['menu', 'rename', 'delete']) {
    for (final mode in ['stable', 'switch', 'silent-switch']) {
      if (operation == 'menu' && mode == 'silent-switch') continue;
      testWidgets('folder $operation $mode owns only A routes', (tester) async {
        tester.view.physicalSize = const Size(1200, 1800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final id = await DataService.addCustomWishlist('A private folder');
        final nav = GlobalKey<NavigatorState>();
        await tester.pumpWidget(ChangeNotifierProvider<LocalizationController>(
          create: (_) => LocalizationController(),
          child: MaterialApp(navigatorKey: nav, home: const RentalCartScreen()),
        ));
        await tester.pumpAndSettle();
        await tester
            .tap(find.widgetWithText(WishlistMosaicCard, 'A private folder'));
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.more_vert));
        await tester.pumpAndSettle();
        if (operation != 'menu') {
          await tester.tap(find.text(
              operation == 'rename' ? 'Name ändern' : 'Merkliste löschen'));
          await tester.pumpAndSettle();
        }
        if (operation == 'rename') {
          await tester.enterText(find.byType(TextField), 'Renamed A folder');
        }
        if (mode == 'switch') {
          await role('b');
          unawaited(nav.currentState!.push<void>(DialogRoute<void>(
            context: nav.currentContext!,
            builder: (_) => const AlertDialog(title: Text('B foreign dialog')),
          )));
          await tester.pumpAndSettle();
          expect(find.text('B foreign dialog'), findsOneWidget);
          expect(find.textContaining('A private folder', skipOffstage: false),
              findsNothing);
          expect(find.byType(TextField, skipOffstage: false), findsNothing);
        } else if (operation != 'menu') {
          if (mode == 'silent-switch') await role('b', notify: false);
          await tester
              .tap(find.text(operation == 'rename' ? 'Umbenennen' : 'Löschen'));
          await tester.pumpAndSettle();
          if (mode == 'silent-switch') {
            expect(find.text('Renamed A folder', skipOffstage: false),
                findsNothing);
            expect(find.text('A private folder', skipOffstage: false),
                findsNothing);
            await role('a');
          }
          final lists = await DataService.getWishlists();
          final matches = lists.where((v) => v['id'] == id).toList();
          if (operation == 'delete' && mode == 'stable') {
            expect(matches, isEmpty);
          } else {
            expect(matches.single['name'],
                mode == 'stable' ? 'Renamed A folder' : 'A private folder');
          }
        } else {
          expect(find.text('Name ändern'), findsOneWidget);
          expect(find.text('Merkliste löschen'), findsOneWidget);
        }
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }
  for (final mode in ['stable', 'switch-sheet', 'silent-switch-write']) {
    testWidgets('wishlist-create $mode retains initiating owner', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1200, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final nav = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        ChangeNotifierProvider<LocalizationController>(
          create: (_) => LocalizationController(),
          child: MaterialApp(navigatorKey: nav, home: const RentalCartScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Neue Merkliste'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField),
        'Synthetic A private wishlist',
      );
      if (mode == 'switch-sheet') {
        await role('b');
        unawaited(
          nav.currentState!.push<void>(
            DialogRoute<void>(
              context: nav.currentContext!,
              builder: (_) =>
                  const AlertDialog(title: Text('B foreign dialog')),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('B foreign dialog'), findsOneWidget);
        expect(
          find.byType(TextField, skipOffstage: false),
          findsNothing,
          reason: 'A wishlist draft must close without closing B route.',
        );
      } else {
        if (mode == 'silent-switch-write') await role('b', notify: false);
        await tester.tap(find.text('Erstellen'));
        await tester.pumpAndSettle();
        final names =
            (await DataService.getWishlists()).map((v) => v['name']).toList();
        expect(
          names.contains('Synthetic A private wishlist'),
          mode == 'stable',
          reason: 'A draft cannot create a private wishlist under B.',
        );
      }
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }
}
