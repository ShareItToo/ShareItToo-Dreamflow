import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/utils/category_label.dart';
import 'package:lendify/widgets/all_categories_overlay.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

Finder field(String label) => find.byWidgetPredicate((widget) =>
    widget is DropdownButtonFormField<String> &&
    widget.decoration.labelText == label);

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  expect(finder.hitTestable(), findsOneWidget);
  await tester.tap(finder.hitTestable());
  await tester.pumpAndSettle();
}

Future<void> choose(WidgetTester tester, String label, String text) async {
  await tapVisible(tester, field(label));
  final option = find.text(text).last;
  await tester.ensureVisible(option);
  await tester.pumpAndSettle();
  final target =
      find.ancestor(of: option, matching: find.byType(InkWell)).first;
  expect(tester.getSize(target).height, greaterThanOrEqualTo(48));
  expect(tester.getSize(target).width, greaterThanOrEqualTo(48));
  await tapVisible(tester, option);
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    WidgetController.hitTestWarningShouldBeFatal = true;
  });
  tearDown(() => WidgetController.hitTestWarningShouldBeFatal = false);

  for (final width in [390.0, 1000.0]) {
    testWidgets(
        width < 600
            ? 'mobile category selection retains exact pair and 48px tap targets'
            : 'category pair survives create, draft reload and edit',
        (tester) async {
      tester.view.physicalSize = Size(width, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = _CategoryStore();
      final navigator = GlobalKey<NavigatorState>();
      Future<void> showHome() => tester.pumpWidget(ChangeNotifierProvider(
            create: (_) => LocalizationController(),
            child: MaterialApp(
              navigatorKey: navigator,
              home: const Scaffold(body: Text('Entwurfsübersicht')),
            ),
          ));
      await showHome();
      Future<void> open({Item? existing}) async {
        unawaited(navigator.currentState!.push(MaterialPageRoute<void>(
          builder: (_) => CreateListingScreen(
            existing: existing,
            listingMutationService: service,
          ),
        )));
        await tester.pumpAndSettle();
      }

      Future<void> save() async {
        await tapVisible(tester, find.widgetWithText(FilledButton, 'Weiter'));
        final price = find.byWidgetPredicate((widget) =>
            widget is TextField && widget.decoration?.hintText == '0,00');
        await tester.ensureVisible(price);
        await tester.enterText(price, '10');
        await tapVisible(tester, find.widgetWithText(FilledButton, 'Weiter'));
        await tapVisible(
            tester, find.widgetWithText(OutlinedButton, 'Entwurf speichern'));
        expect(service.operations, isNotEmpty);
      }

      await open();
      expect(field('Produktbereich'), findsOneWidget);
      final categories = await DataService.getCategories();
      final technology = categories.where((entry) =>
          DataService.coarseCategoryFor(entry.name) == 'Technik & Elektronik');
      expect(
        tester
            .widget<DropdownButton<String>>(find.descendant(
                of: field('Produktbereich'),
                matching: find.byType(DropdownButton<String>)))
            .items!
            .map((entry) => entry.value)
            .toSet(),
        technology.map((entry) => entry.id).toSet(),
      );
      await choose(tester, 'Produktbereich', 'Kameras & Foto');
      await choose(tester, 'Unterkategorie', 'Objektive');
      await choose(tester, 'Produktbereich', 'Computer & IT');
      expect(
          tester.state<FormFieldState<String>>(field('Unterkategorie')).value,
          'Laptops'); // Incompatible camera selection is cleared.
      await choose(tester, 'Unterkategorie', 'Sonstiges');
      await choose(tester, 'Produktbereich', 'Kameras & Foto');
      expect(
          tester.state<FormFieldState<String>>(field('Unterkategorie')).value,
          'Sonstiges'); // Compatible fallback is kept for the chosen ID.

      final mainCategory = find.ancestor(
          of: find.text('Technik & Elektronik'),
          matching: find.byType(InkWell));
      expect(
          tester.getSize(mainCategory.first).height, greaterThanOrEqualTo(48));
      await tapVisible(tester, mainCategory.first);
      final tiles = tester
          .widget<AllCategoriesScreen>(find.byType(AllCategoriesScreen))
          .categories;
      expect(tiles.any((entry) => entry.label == 'Auto & Mobilität'), isFalse);
      // Reselecting the same coarse group must not reset cat3 to cat1.
      await tapVisible(tester, find.text('Technik\n& Elektronik'));
      expect(
          tester.state<FormFieldState<String>>(field('Produktbereich')).value,
          'cat3');
      expect(
          tester.state<FormFieldState<String>>(field('Unterkategorie')).value,
          'Sonstiges');
      for (final label in ['Produktbereich', 'Unterkategorie']) {
        expect(tester.getSize(field(label)).height, greaterThanOrEqualTo(48));
      }
      if (width < 600) {
        // This package owns category interaction. The separately reported
        // narrow-screen price-step overflow is not category acceptance.
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        return;
      }
      final title = find.byWidgetPredicate((widget) =>
          widget is TextField && widget.decoration?.labelText == 'Titel');
      await tester.enterText(title, 'Synthetischer Kategorieentwurf');
      final description = find.byWidgetPredicate((widget) =>
          widget is TextField &&
          widget.decoration?.labelText == 'Beschreibung');
      await tester.ensureVisible(description);
      await tester.enterText(description, 'Nur synthetische Kategorieprüfung.');
      await save();
      expect(service.operations, [ListingMutationOperation.create]);
      final saved = await service.read();
      expect((saved.categoryId, saved.subcategory), ('cat3', 'Sonstiges'));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      await showHome();
      await open(existing: saved);
      expect(
          tester.state<FormFieldState<String>>(field('Produktbereich')).value,
          'cat3');
      expect(
          tester.state<FormFieldState<String>>(field('Unterkategorie')).value,
          'Sonstiges');
      await choose(tester, 'Produktbereich', 'Computer & IT');
      await choose(tester, 'Unterkategorie', 'Monitore');
      await save();
      final edited = await service.read();
      expect((edited.categoryId, edited.subcategory), ('cat2', 'Monitore'));
      expect(service.operations,
          [ListingMutationOperation.create, ListingMutationOperation.update]);
      await open(existing: edited);
      expect(
          tester.state<FormFieldState<String>>(field('Produktbereich')).value,
          'cat2');
      expect(
          tester.state<FormFieldState<String>>(field('Unterkategorie')).value,
          'Monitore');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }

  for (final width in [390.0, 1000.0]) {
    testWidgets(
        'price and discount editor has no responsive overflow at ${width.toInt()}px',
        (tester) async {
      tester.view.physicalSize = Size(width, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = _CategoryStore();
      final existing = Item.fromJson({
        ...buildTestItem(
          id: 'responsive-price-editor',
          ownerId: service.context.user.id,
          title: 'Synthetischer Preis-Test',
          pricePerDay: 20,
        ).toJson(),
        'categoryId': 'cat3',
        'subcategory': 'Sonstiges',
        'description': 'Ein synthetischer Beschreibungstext.',
        'locationText': 'Berlin',
        'city': 'Berlin',
        'autoApplyDiscounts': true,
        'longRentalDiscounts': [
          {'days': 3, 'discountPercent': 10},
          {'days': 5, 'discountPercent': 20},
          {'days': 8, 'discountPercent': 30},
        ],
        'status': 'draft',
        'isActive': false,
      });

      await tester.pumpWidget(MaterialApp(
        home: CreateListingScreen(
          existing: existing,
          listingMutationService: service,
        ),
      ));
      await tester.pumpAndSettle();
      final next = find.widgetWithText(FilledButton, 'Weiter');
      await tester.ensureVisible(next);
      await tester.tap(next);
      await tester.pumpAndSettle();

      final dayFields = find.byWidgetPredicate((widget) =>
          widget is TextField &&
          widget.decoration?.isCollapsed == true &&
          widget.decoration?.hintText == '0');
      final percentFields = find.byWidgetPredicate((widget) =>
          widget is TextField && widget.decoration?.suffixText == '%');
      expect(dayFields, findsNWidgets(3));
      expect(percentFields, findsNWidgets(3));
      for (final field in <Finder>[dayFields, percentFields]) {
        for (var i = 0; i < 3; i++) {
          expect(tester.getSize(field.at(i)).shortestSide,
              greaterThanOrEqualTo(48));
        }
      }
      await tester.enterText(dayFields.first, '4');
      await tester.enterText(percentFields.first, '12');
      await tester.pump();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }

  testWidgets(
      'every coarse group exposes every allowed fine category and fallback',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(ChangeNotifierProvider(
      create: (_) => LocalizationController(),
      child: MaterialApp(
          home: CreateListingScreen(listingMutationService: _CategoryStore())),
    ));
    await tester.pumpAndSettle();
    final categories = await DataService.getCategories();
    final groups = categories
        .map((entry) => DataService.coarseCategoryFor(entry.name))
        .toSet();
    for (final group in groups) {
      final button = find
          .ancestor(
            of: find.byWidgetPredicate((widget) =>
                widget is InputDecorator &&
                widget.decoration.hintText == 'Kategorie wählen'),
            matching: find.byType(InkWell),
          )
          .first;
      await tapVisible(tester, button);
      final tile = find.text(stackCategoryLabel(group));
      await tester.scrollUntilVisible(tile, 300,
          scrollable: find
              .descendant(
                  of: find.byType(AllCategoriesScreen),
                  matching: find.byType(Scrollable))
              .first);
      final tileTarget =
          find.ancestor(of: tile, matching: find.byType(InkWell)).first;
      expect(tester.getSize(tileTarget).shortestSide, greaterThanOrEqualTo(48));
      await tapVisible(tester, tile);
      final fine = categories
          .where((entry) => DataService.coarseCategoryFor(entry.name) == group);
      for (final category in fine) {
        if (fine.length > 1) {
          await choose(tester, 'Produktbereich', category.name);
        }
        final dropdown = tester.widget<DropdownButton<String>>(find.descendant(
            of: field('Unterkategorie'),
            matching: find.byType(DropdownButton<String>)));
        expect(dropdown.items!.map((entry) => entry.value).toSet(),
            PrivatePilotConfig.allowedSubcategories[category.id],
            reason: category.id);
        await choose(tester, 'Unterkategorie', 'Sonstiges');
        expect(
            tester.state<FormFieldState<String>>(field('Unterkategorie')).value,
            'Sonstiges');
      }
    }
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  test('each allowed fine category retains its exact usable fallback',
      () async {
    final categories = await DataService.getCategories();
    expect(categories.map((entry) => entry.id).toSet(),
        PrivatePilotConfig.allowedCategoryIds);
    for (final category in categories) {
      expect(category.subcategories.where((entry) => entry == 'Sonstiges'),
          hasLength(1));
      expect(
          category.subcategories.every((entry) =>
              PrivatePilotConfig.subcategoryAllowed(category.id, entry)),
          isTrue);
    }
  });
}

class _CategoryStore extends ListingMutationService {
  final operations = <ListingMutationOperation>[];
  final ListingMutationContext context;
  _CategoryStore() : context = _context();
  static ListingMutationContext _context() {
    final user = buildTestUser('category-owner',
        name: 'Synthetic Category Owner', email: 'category@example.invalid');
    return ListingMutationContext(
        user: user,
        owner: SessionTransitionOwner(
          authOwner: AuthSessionOwner(
              userId: user.id,
              sessionId: 'category-session',
              email: user.email,
              createdAt: DateTime.utc(2026, 10, 4),
              epoch: 1),
          profileUserId: user.id,
        ));
  }

  Future<Item> read() async => Item.fromJson(jsonDecode(
          (await SharedPreferences.getInstance()).getString('category-draft')!)
      as Map<String, dynamic>);
  @override
  Future<ListingMutationContext?> loadCurrentContext() async => context;
  @override
  Future<bool> isContextCurrent(ListingMutationContext observed) async =>
      identical(context, observed);
  @override
  Future<ListingAiCapability> loadBlueOceanListingCapability(
          {required ListingMutationContext context}) async =>
      throw const ListingMutationFailure.rejected(
          'synthetic-provider-disabled');
  @override
  Future<AccountListingMutationResult> performListingMutation({
    required ListingMutationContext context,
    required ListingMutationCommand command,
  }) async {
    operations.add(command.operation);
    await (await SharedPreferences.getInstance())
        .setString('category-draft', jsonEncode(command.item.toJson()));
    return AccountListingMutationResult(
        item: await read(), remoteAccepted: false);
  }
}
