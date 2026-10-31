import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/item_card.dart';
import 'package:lendify/widgets/wishlist_mosaic_card.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'rental_cart_surface_wishlist_test.dart' show role;
import 'support/test_builders.dart';

Future<GlobalKey<NavigatorState>> openNestedFolder(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1200, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final id = await DataService.addCustomWishlist('A nested private folder');
  await DataService.setItemWishlist('synthetic-nested-item', id);
  final nav = GlobalKey<NavigatorState>();
  await tester.pumpWidget(ChangeNotifierProvider<LocalizationController>(
    create: (_) => LocalizationController(),
    child: MaterialApp(navigatorKey: nav, home: const RentalCartScreen()),
  ));
  await tester.pumpAndSettle();
  await tester
      .tap(find.widgetWithText(WishlistMosaicCard, 'A nested private folder'));
  await tester.pumpAndSettle();
  expect(find.byType(ItemCard), findsOneWidget);
  return nav;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'items': jsonEncode([
        buildTestItem(id: 'synthetic-nested-item', ownerId: 'synthetic-lender')
            .toJson()
      ]),
      'users': '[]',
    });
    await role('a');
  });
  for (final entry in ['add', 'create', 'remove']) {
    testWidgets('unscoped shared heart positive control $entry',
        (tester) async {
      if (entry == 'remove') {
        await DataService.setItemWishlist(
            'synthetic-nested-item', DataService.wlSoonId);
      }
      await tester.pumpWidget(ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: MaterialApp(
            home: Scaffold(
                body: SizedBox(
                    width: 300,
                    height: 400,
                    child: ItemCard(
                        item: buildTestItem(
                            id: 'synthetic-nested-item',
                            ownerId: 'synthetic-lender'))))),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip(
          entry == 'remove' ? 'Gemerkt verwalten' : 'Unter Gemerkt speichern'));
      await tester.pumpAndSettle();
      if (entry == 'create') {
        await tester.tap(find.text('Neue Merkliste erstellen'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField), 'Unscoped created list');
        await tester.tap(find.text('Erstellen'));
      } else {
        await tester.tap(find
            .text(entry == 'remove' ? 'Aus Gemerkt entfernen' : 'Für später'));
      }
      await tester.pumpAndSettle();
      final saved =
          await DataService.getWishlistForItem('synthetic-nested-item');
      if (entry == 'create') {
        expect(
            (await DataService.getWishlists())
                .singleWhere((v) => v['id'] == saved)['name'],
            'Unscoped created list');
      } else {
        expect(saved, entry == 'remove' ? isNull : DataService.wlLaterId);
      }
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
  for (final entry in ['heart', 'move', 'create', 'context']) {
    for (final switchToB in [false, true]) {
      testWidgets('nested $entry stable/switch=$switchToB closes only A',
          (tester) async {
        final nav = await openNestedFolder(tester);
        if (entry == 'context') {
          await tester.longPress(find.byType(ItemCard));
        } else {
          await tester.tap(find.byTooltip('Gemerkt verwalten'));
        }
        await tester.pumpAndSettle();
        if (entry == 'move' || entry == 'create') {
          await tester.tap(find.text('In andere Merkliste verschieben'));
          await tester.pumpAndSettle();
        }
        if (entry == 'create') {
          await tester.tap(find.text('Neue Merkliste erstellen'));
          await tester.pumpAndSettle();
          await tester.enterText(
              find.byType(TextField), 'A private nested draft');
        }
        final marker = switch (entry) {
          'context' => 'Anzeigenoptionen',
          'create' => 'Neue Merkliste erstellen',
          'move' => 'In andere Merkliste verschieben',
          _ => 'Aus Gemerkt entfernen',
        };
        expect(find.text(marker), findsWidgets);
        if (switchToB) {
          await role('b');
          unawaited(nav.currentState!.push<void>(DialogRoute<void>(
            context: nav.currentContext!,
            builder: (_) =>
                const AlertDialog(title: Text('B unrelated dialog')),
          )));
          await tester.pumpAndSettle();
          expect(find.text('B unrelated dialog'), findsOneWidget);
          expect(find.text(marker, skipOffstage: false), findsNothing,
              reason: 'A nested popup must not outlive its owner folder.');
          expect(find.byType(TextField, skipOffstage: false), findsNothing);
        }
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      });
    }
  }

  for (final entry in [
    'heart-remove',
    'heart-move',
    'create',
    'context-remove',
    'context-move'
  ]) {
    for (final silentSwitch in [false, true]) {
      testWidgets('nested write $entry silent-switch=$silentSwitch',
          (tester) async {
        await openNestedFolder(tester);
        final original =
            await DataService.getWishlistForItem('synthetic-nested-item');
        if (entry.startsWith('context')) {
          await tester.longPress(find.byType(ItemCard));
        } else {
          await tester.tap(find.byTooltip('Gemerkt verwalten'));
        }
        await tester.pumpAndSettle();
        if (entry.endsWith('-move') || entry == 'create') {
          await tester.tap(find.text('In andere Merkliste verschieben'));
          await tester.pumpAndSettle();
        }
        if (entry == 'create') {
          await tester.tap(find.text('Neue Merkliste erstellen'));
          await tester.pumpAndSettle();
          await tester.enterText(
              find.byType(TextField), 'A created nested folder');
        }
        final prefs = await SharedPreferences.getInstance();
        final before = jsonDecode(prefs.getString('wishlist_state_v3')!) as Map;
        if (silentSwitch) await role('b', notify: false);
        final label = entry == 'create'
            ? 'Erstellen'
            : entry.endsWith('remove')
                ? 'Aus Gemerkt entfernen'
                : 'Für später';
        await tester.tap(find.text(label));
        await tester.pumpAndSettle();
        if (silentSwitch) {
          final after =
              jsonDecode(prefs.getString('wishlist_state_v3')!) as Map;
          // B's first read may initialize its empty default lists. A's actual
          // partition must remain byte-for-value unchanged, without A data in B.
          for (final key in (before['principals'] as Map).keys) {
            expect(after['principals'][key], before['principals'][key]);
          }
          expect(await DataService.getWishlistForItem('synthetic-nested-item'),
              isNull);
          expect(
              (await DataService.getWishlists())
                  .where((v) => v['system'] != true),
              isEmpty);
          expect(find.text('A created nested folder', skipOffstage: false),
              findsNothing);
          expect(find.text('A nested private folder', skipOffstage: false),
              findsNothing);
          await role('a');
          expect(await DataService.getWishlistForItem('synthetic-nested-item'),
              original);
        } else {
          final saved =
              await DataService.getWishlistForItem('synthetic-nested-item');
          if (entry.endsWith('remove')) {
            expect(saved, isNull);
          } else if (entry == 'create') {
            final lists = await DataService.getWishlists();
            expect(lists.singleWhere((v) => v['id'] == saved)['name'],
                'A created nested folder');
            expect(saved, isNot(original));
          } else {
            expect(saved, DataService.wlLaterId);
          }
        }
        // Advance the documented two-second notice lifetime, not a retry or
        // readiness sleep; stale notice timers must not dismiss B's route.
        await tester.pump(const Duration(seconds: 2));
        await tester.pumpAndSettle();
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final entry in ['card', 'context-open', 'context-availability']) {
    testWidgets('owned listing destination $entry closes beneath B',
        (tester) async {
      final nav = await openNestedFolder(tester);
      if (entry == 'card') {
        await tester.tap(find.byType(ItemCard));
      } else {
        await tester.longPress(find.byType(ItemCard));
        await tester.pumpAndSettle();
        await tester.tap(find.text(entry == 'context-open'
            ? 'Anzeige öffnen'
            : 'Verfügbarkeit prüfen'));
      }
      await tester.pumpAndSettle();
      final owned = ModalRoute.of(tester.element(find.byWidgetPredicate(
          (w) => w.runtimeType.toString() == '_ItemDetailsPage')))!;
      expect(owned.isCurrent, isTrue);
      await role('b');
      final foreign = MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('B foreign page')));
      unawaited(nav.currentState!.push(foreign));
      await tester.pumpAndSettle();
      expect(owned.isActive, isFalse);
      expect(foreign.isCurrent, isTrue);
      expect(
          find.byWidgetPredicate(
              (w) => w.runtimeType.toString() == '_ItemDetailsPage',
              skipOffstage: false),
          findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
