import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/widgets/item_card.dart';
import 'package:lendify/widgets/image_gallery_overlay.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'saved_cart_nested_principal_test.dart' show openNestedFolder;
import 'rental_cart_surface_wishlist_test.dart' show role;
import 'support/test_builders.dart' show buildTestItem;

Future<GlobalKey<NavigatorState>> openDetails(WidgetTester tester) async {
  final nav = await openNestedFolder(tester);
  await tester.tap(find.byType(ItemCard));
  await tester.pumpAndSettle();
  expect(
      find.byWidgetPredicate(
          (w) => w.runtimeType.toString() == '_ItemDetailsPage'),
      findsOneWidget);
  return nav;
}

Future<void> openSelector(WidgetTester tester, {bool create = false}) async {
  await tester.tap(find.byIcon(Icons.favorite).hitTestable().last);
  await tester.pumpAndSettle();
  expect(find.text('In andere Merkliste verschieben'), findsOneWidget);
  if (create) {
    await tester.tap(find.text('Neue Merkliste erstellen'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'A detail private draft');
  }
}

Future<void> openGallery(WidgetTester tester) async {
  final tap = find
      .descendant(
          of: find.byWidgetPredicate(
              (w) => w.runtimeType.toString() == '_ItemDetailsPage'),
          matching: find.byWidgetPredicate((w) =>
              w is GestureDetector &&
              w.behavior == HitTestBehavior.translucent))
      .first;
  await tester.tap(tap);
  await tester.pumpAndSettle();
  expect(find.byType(ImageGalleryOverlay), findsOneWidget);
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
  for (final action in ['read-range', 'clear-range', 'clear-delivery']) {
    for (final switched in [false, true]) {
      test(
          'owned selection $action switched=$switched preserves foreign bucket',
          () async {
        final start = DateTime(2026, 10, 1), end = DateTime(2026, 10, 3);
        await DataService.setSavedDateRange('synthetic-nested-item',
            start: start, end: end);
        await DataService.setSavedDeliverySelection('synthetic-nested-item',
            hinweg: true, rueckweg: false, addressCity: 'Synthetic A city');
        final owner = await LocalPrincipalActionOwner.capture();
        if (switched) {
          await role('b', notify: false);
          await DataService.setSavedDateRange('synthetic-nested-item',
              start: start.add(const Duration(days: 7)),
              end: end.add(const Duration(days: 7)));
          await DataService.setSavedDeliverySelection('synthetic-nested-item',
              hinweg: false, rueckweg: true, addressCity: 'Synthetic B city');
        }
        final prefs = await SharedPreferences.getInstance();
        final before = Map.fromEntries(prefs
            .getKeys()
            .where((k) => k.contains('booking_selection'))
            .map((k) => MapEntry(k, prefs.get(k))));
        expect(before, isNotEmpty);
        Future<Object?> run() async {
          if (action == 'read-range') {
            return DataService.getSavedDateRange('synthetic-nested-item',
                expectedOwner: owner);
          }
          if (action == 'clear-range') {
            await DataService.clearSavedDateRange('synthetic-nested-item',
                expectedOwner: owner);
            return null;
          }
          await DataService.clearSavedDeliverySelection('synthetic-nested-item',
              expectedOwner: owner);
          return null;
        }

        if (switched) {
          await expectLater(run(), throwsStateError);
          for (final e in before.entries) {
            expect(prefs.get(e.key), e.value);
          }
          expect(await DataService.getSavedDateRange('synthetic-nested-item'), (
            start.add(const Duration(days: 7)),
            end.add(const Duration(days: 7))
          ));
          expect(
              (await DataService.getSavedDeliverySelection(
                  'synthetic-nested-item'))?['city'],
              'Synthetic B city');
        } else {
          final result = await run();
          if (action == 'read-range') expect(result, (start, end));
          expect(await DataService.getSavedDateRange('synthetic-nested-item'),
              action == 'clear-range' ? (null, null) : (start, end));
          expect(
              (await DataService.getSavedDeliverySelection(
                  'synthetic-nested-item'))?['city'],
              action == 'clear-delivery' ? isNull : 'Synthetic A city');
        }
      });
    }
  }
  for (final kind in [
    'selector',
    'create',
    'overflow',
    'gallery',
    'gallery-create'
  ]) {
    for (final change in [false, true]) {
      testWidgets('details nested $kind change=$change owns child popup',
          (tester) async {
        final nav = await openDetails(tester);
        if (kind.startsWith('gallery')) {
          final tap = find
              .descendant(
                  of: find.byWidgetPredicate(
                      (w) => w.runtimeType.toString() == '_ItemDetailsPage'),
                  matching: find.byWidgetPredicate((w) =>
                      w is GestureDetector &&
                      w.behavior == HitTestBehavior.translucent))
              .first;
          await tester.tap(tap);
          await tester.pumpAndSettle();
          expect(find.byType(ImageGalleryOverlay), findsOneWidget);
          if (kind == 'gallery-create') {
            await openSelector(tester, create: true);
          }
        } else if (kind == 'overflow') {
          await tester.tap(find.byIcon(Icons.more_vert).first);
          await tester.pumpAndSettle();
        } else {
          await openSelector(tester, create: kind == 'create');
        }
        final marker = kind == 'overflow'
            ? 'Anzeige teilen'
            : kind.contains('create')
                ? 'Neue Merkliste erstellen'
                : 'In andere Merkliste verschieben';
        if (kind != 'gallery') expect(find.text(marker), findsWidgets);
        if (change) {
          await role('b');
          final foreign = MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('B unrelated page')));
          unawaited(nav.currentState!.push(foreign));
          await tester.pumpAndSettle();
          final aPopupSurvives = kind == 'gallery'
              ? find
                  .byType(ImageGalleryOverlay, skipOffstage: false)
                  .evaluate()
                  .isNotEmpty
              : find.text(marker, skipOffstage: false).evaluate().isNotEmpty;
          final bRemains = foreign.isCurrent;
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
          expect(aPopupSurvives, isFalse);
          expect(bRemains, isTrue);
        } else {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
        }
      });
    }
  }
  for (final entry in ['create', 'move', 'gallery-create']) {
    for (final silentB in [false, true]) {
      testWidgets(
          'details nested write $entry silent-B=$silentB never adopts B',
          (tester) async {
        await openDetails(tester);
        if (entry.startsWith('gallery')) await openGallery(tester);
        await openSelector(tester, create: entry != 'move');
        final original =
            await DataService.getWishlistForItem('synthetic-nested-item');
        if (silentB) await role('b', notify: false);
        await tester
            .tap(find.text(entry == 'move' ? 'Für später' : 'Erstellen'));
        await tester.pumpAndSettle();
        if (silentB) {
          expect(await DataService.getWishlistForItem('synthetic-nested-item'),
              isNull);
          expect(
              (await DataService.getWishlists())
                  .where((v) => v['system'] != true),
              isEmpty);
          await role('a');
          expect(await DataService.getWishlistForItem('synthetic-nested-item'),
              original);
        } else {
          final id =
              await DataService.getWishlistForItem('synthetic-nested-item');
          if (entry == 'move') {
            expect(id, DataService.wlLaterId);
          } else {
            expect(
                (await DataService.getWishlists())
                    .singleWhere((v) => v['id'] == id)['name'],
                'A detail private draft');
          }
        }
        await tester.pump(const Duration(seconds: 2));
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      });
    }
  }

  for (final entry in ['overflow', 'gallery']) {
    for (final outcome in [
      'success',
      'failure',
      'late-success',
      'late-failure',
      'silent-B'
    ]) {
      testWidgets('details $entry share $outcome has truthful owned notice',
          (tester) async {
        final nav = await openDetails(tester);
        final reply = Completer<void>();
        var writes = 0;
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method != 'Clipboard.setData') return null;
          writes++;
          expect((call.arguments as Map)['text'],
              contains('synthetic-nested-item'));
          if (outcome.startsWith('late-')) await reply.future;
          if (outcome.endsWith('failure')) {
            throw PlatformException(code: 'synthetic-clipboard-unavailable');
          }
          return null;
        });
        addTearDown(() => TestDefaultBinaryMessengerBinding
            .instance.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, null));
        if (entry == 'gallery') {
          await openGallery(tester);
        } else {
          await tester.tap(find.byIcon(Icons.more_vert).first);
          await tester.pumpAndSettle();
        }
        if (outcome == 'silent-B') await role('b', notify: false);
        if (entry == 'gallery') {
          await tester.tap(find.byIcon(Icons.share_rounded));
        } else {
          await tester.tap(find.text('Anzeige teilen'));
        }
        await tester.pumpAndSettle();
        expect(writes, outcome == 'silent-B' ? 0 : 1);
        if (outcome.startsWith('late-')) {
          expect(find.text('Link kopiert'), findsNothing);
          await role('b');
          final foreign = DialogRoute<void>(
              context: nav.currentContext!,
              builder: (_) =>
                  const AlertDialog(title: Text('B foreign dialog')));
          unawaited(nav.currentState!.push(foreign));
          await tester.pumpAndSettle();
          reply.complete();
          await tester.pumpAndSettle();
          expect(foreign.isCurrent, isTrue);
          expect(find.text('Link kopiert', skipOffstage: false), findsNothing);
          expect(find.text('Teilen fehlgeschlagen', skipOffstage: false),
              findsNothing);
        } else if (outcome != 'silent-B') {
          expect(
              find.text(outcome == 'failure'
                  ? 'Teilen fehlgeschlagen'
                  : 'Link kopiert'),
              findsOneWidget);
          expect(
              find.text(outcome == 'failure'
                  ? 'Link kopiert'
                  : 'Teilen fehlgeschlagen'),
              findsNothing);
        }
        // Complete the documented notice animation only after result assertions.
        await tester.pump(const Duration(seconds: 2));
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('old overflow completion cannot close a newer foreign dialog',
      (tester) async {
    final nav = await openDetails(tester);
    await tester.tap(find.byIcon(Icons.more_vert).first);
    await tester.pumpAndSettle();
    final oldTap = tester
        .widget<InkWell>(find
            .ancestor(
                of: find.text('Unter Gemerkt speichern'),
                matching: find.byType(InkWell))
            .first)
        .onTap!;
    await role('b');
    final foreign = DialogRoute<void>(
        context: nav.currentContext!,
        builder: (_) => const AlertDialog(title: Text('B protected dialog')));
    unawaited(nav.currentState!.push(foreign));
    await tester.pumpAndSettle();
    oldTap();
    await tester.pumpAndSettle();
    expect(foreign.isCurrent, isTrue);
    expect(find.text('B protected dialog'), findsOneWidget);
    expect(find.text('In andere Merkliste verschieben', skipOffstage: false),
        findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  testWidgets('unscoped details still add a new wishlist normally',
      (tester) async {
    await tester.pumpWidget(ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: MaterialApp(
            home: Builder(
                builder: (context) => Scaffold(
                    body: TextButton(
                        onPressed: () => ItemDetailsOverlay.showFullPage(
                            context,
                            item: buildTestItem(
                                id: 'synthetic-nested-item',
                                ownerId: 'synthetic-lender')),
                        child: const Text('open unscoped')))))));
    await tester.tap(find.text('open unscoped'));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.favorite_border).hitTestable().first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Für später'));
    await tester.pumpAndSettle();
    expect(await DataService.getWishlistForItem('synthetic-nested-item'),
        DataService.wlLaterId);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  testWidgets('A details disposal preserves B booking selection',
      (tester) async {
    final start = DateTime(2026, 10, 1), end = DateTime(2026, 10, 3);
    await role('b');
    await DataService.setSavedDateRange('synthetic-nested-item',
        start: start, end: end);
    await role('a');
    await openDetails(tester);
    await role('b');
    await tester.pumpAndSettle();
    final saved = await DataService.getSavedDateRange('synthetic-nested-item');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    expect(saved, (start, end));
  });

  testWidgets('stable A details disposal still clears its own saved selection',
      (tester) async {
    final start = DateTime(2026, 10, 1), end = DateTime(2026, 10, 3);
    await DataService.setSavedDateRange('synthetic-nested-item',
        start: start, end: end);
    final nav = await openDetails(tester);
    expect(await DataService.getSavedDateRange('synthetic-nested-item'),
        (start, end));
    nav.currentState!.pop();
    await tester.pumpAndSettle();
    expect(await DataService.getSavedDateRange('synthetic-nested-item'),
        (null, null));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });
}
