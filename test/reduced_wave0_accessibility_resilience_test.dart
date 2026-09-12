import 'dart:convert';
import 'dart:ui' show SemanticsAction;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/screens/search_results_screen.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/background_theme_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/listing_options_dialog.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  void useCompactLargeText(WidgetTester tester) {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
  }

  Widget harness(Widget child) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<LocalizationController>(
          create: (_) => LocalizationController(),
        ),
        ChangeNotifierProvider<MainNavController>(
          create: (_) => MainNavController(),
        ),
        ChangeNotifierProvider<DeveloperPreviewController>(
          create: (_) => DeveloperPreviewController(
            initialState: DeveloperUserState.verifiedUser,
          ),
        ),
        ChangeNotifierProvider<BackgroundThemeController>(
          create: (_) => BackgroundThemeController(),
        ),
      ],
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2),
          ),
          child: child!,
        ),
        home: child,
      ),
    );
  }

  Item syntheticItem() => buildTestItem(
        id: 'rw1-compact-item',
        ownerId: 'rw1-owner',
        title: 'Kompakter Akkuschrauber mit Zubehör',
        pricePerDay: 14,
      );

  testWidgets(
    'listing options and feedback reasons stay scrollable at 200 percent text',
    (tester) async {
      useCompactLargeText(tester);
      final semantics = tester.ensureSemantics();
      try {
        final item = syntheticItem();
        SharedPreferences.setMockInitialValues(<String, Object>{
          'items': jsonEncode(<Object>[item.toJson()]),
        });

        await tester.pumpWidget(harness(_OptionsHost(item: item)));
        await tester.tap(find.text('Anzeigenoptionen öffnen'));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byTooltip('Schließen'), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text('Ausblenden / Weniger davon anzeigen'),
          160,
          scrollable: find.byType(Scrollable).last,
        );
        expect(
          find.text('Ausblenden / Weniger davon anzeigen').hitTestable(),
          findsOneWidget,
        );
        await tester.tap(
          find.text('Ausblenden / Weniger davon anzeigen').hitTestable(),
        );
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        await tester.scrollUntilVisible(
          find.text('Nur diese Anzeige ausblenden'),
          160,
          scrollable: find.byType(Scrollable).last,
        );
        final destructive =
            find.bySemanticsLabel('Nur diese Anzeige ausblenden');
        expect(destructive, findsOneWidget);
        final node = tester.getSemantics(destructive);
        expect(
            node.rect.height, greaterThanOrEqualTo(kMinInteractiveDimension));
        expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );

  testWidgets(
    'listing options retain keyboard focus and safe route recreation',
    (tester) async {
      useCompactLargeText(tester);
      final item = syntheticItem();
      SharedPreferences.setMockInitialValues(<String, Object>{
        'items': jsonEncode(<Object>[item.toJson()]),
      });
      await tester.pumpWidget(harness(_OptionsHost(item: item)));
      await tester.tap(find.text('Anzeigenoptionen öffnen'));
      await tester.pumpAndSettle();

      final visited = <FocusNode>{};
      for (var i = 0; i < 3; i++) {
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pump();
        final focus = FocusManager.instance.primaryFocus;
        expect(focus, isNotNull);
        visited.add(focus!);
      }
      expect(visited.length, greaterThanOrEqualTo(2));

      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Anzeigenoptionen'), findsNothing);
      await tester.tap(find.text('Anzeigenoptionen öffnen'));
      await tester.pumpAndSettle();
      expect(find.text('Anzeigenoptionen'), findsOneWidget);
      await tester.tap(find.byTooltip('Schließen'));
      await tester.pumpAndSettle();
      expect(find.text('Anzeigenoptionen'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'search save flow stays operable on compact 200 percent text surface',
    (tester) async {
      useCompactLargeText(tester);
      final semantics = tester.ensureSemantics();
      try {
        final item = syntheticItem();
        SharedPreferences.setMockInitialValues(<String, Object>{
          'items': jsonEncode(<Object>[item.toJson()]),
        });

        await tester.pumpWidget(harness(SearchResultsScreen(
          queryText: 'Akkuschrauber in Heilbronn',
          results: <Item>[item],
        )));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        final save = find.bySemanticsLabel(
          'Unter Gemerkt speichern: ${item.title}',
        );
        expect(save, findsOneWidget);
        expect(
          tester.getSemantics(save).rect.height,
          greaterThanOrEqualTo(kMinInteractiveDimension),
        );
        await tester.tap(save);
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        await tester.ensureVisible(find.text('Demnächst benötigt'));
        await tester.pumpAndSettle();
        expect(find.text('Demnächst benötigt').hitTestable(), findsOneWidget);
        await tester.tap(find.text('Demnächst benötigt').hitTestable());
        await tester.pumpAndSettle();

        expect(
          await DataService.getWishlistForItem(item.id),
          DataService.wlSoonId,
        );
        expect(
          find.bySemanticsLabel('Aus Gemerkt entfernen: ${item.title}'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );

  testWidgets(
    'rapid repeated save activation opens only one selection flow',
    (tester) async {
      final item = syntheticItem();
      SharedPreferences.setMockInitialValues(<String, Object>{
        'items': jsonEncode(<Object>[item.toJson()]),
      });
      await tester.pumpWidget(harness(SearchResultsScreen(
        queryText: 'Akkuschrauber in Heilbronn',
        results: <Item>[item],
      )));
      await tester.pumpAndSettle();

      final save = find.bySemanticsLabel(
        'Unter Gemerkt speichern: ${item.title}',
      );
      await tester.tap(save);
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(find.text('In welcher Merkliste speichern?'), findsOneWidget);
      await tester.tap(find.text('Demnächst benötigt'));
      await tester.pumpAndSettle();

      expect(find.text('In welcher Merkliste speichern?'), findsNothing);
      expect(
        await DataService.getWishlistForItem(item.id),
        DataService.wlSoonId,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'listing declaration and publication controls survive compact large text',
    (tester) async {
      useCompactLargeText(tester);
      final semantics = tester.ensureSemantics();
      try {
        expect(PrivatePilotConfig.stageANonBindingPilotEnabled, isTrue);
        expect(PrivatePilotConfig.blueOceanListingAssistantEnabled, isTrue);
        final owner = buildTestUser(
          'rw1-listing-owner',
          name: 'RW1 Listing Owner',
          city: 'Heilbronn',
          email: 'rw1-listing-owner@example.invalid',
        );
        final source = syntheticItem();
        final draft = Item.fromJson(<String, dynamic>{
          ...source.toJson(),
          'id': 'rw1-listing-draft',
          'ownerId': owner.id,
          'categoryId': 'cat8',
          'subcategory': 'Bohrmaschinen',
          'description': 'Geprüfter Akkuschrauber mit Zubehör.',
          'condition': 'good',
          'status': 'draft',
          'isActive': false,
          'privateStatusConfirmed': false,
          'offersDeliveryAtDropoff': false,
          'offersPickupAtReturn': false,
          'offersExpressAtDropoff': false,
          'country': 'Deutschland',
        });
        SharedPreferences.setMockInitialValues(<String, Object>{
          'users': jsonEncode(<Object>[owner.toJson()]),
          'currentUser': jsonEncode(owner.toJson()),
          'items': jsonEncode(<Object>[draft.toJson()]),
        });

        await tester.pumpWidget(harness(CreateListingScreen(existing: draft)));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);

        final declaration =
            find.text(PrivatePilotConfig.listingPrivateDeclaration);
        await tester.scrollUntilVisible(
          declaration,
          420,
          scrollable: find.byType(Scrollable).first,
        );
        expect(declaration.hitTestable(), findsOneWidget);
        final declarationNode = tester.getSemantics(declaration);
        expect(
          declarationNode.getSemanticsData().hasAction(SemanticsAction.tap),
          isTrue,
        );

        final publish =
            find.widgetWithText(FilledButton, 'Anzeige veröffentlichen');
        await tester.scrollUntilVisible(
          publish,
          220,
          scrollable: find.byType(Scrollable).first,
        );
        expect(publish.hitTestable(), findsOneWidget);
        expect(
          tester.getSize(publish).height,
          greaterThanOrEqualTo(kMinInteractiveDimension),
        );
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
    skip: !PrivatePilotConfig.stageANonBindingPilotEnabled ||
        !PrivatePilotConfig.blueOceanListingAssistantEnabled,
  );

  testWidgets(
    'non-reserving cart remains usable on compact 200 percent text surface',
    (tester) async {
      useCompactLargeText(tester);
      final semantics = tester.ensureSemantics();
      try {
        final item = syntheticItem();
        SharedPreferences.setMockInitialValues(<String, Object>{
          'items': jsonEncode(<Object>[item.toJson()]),
        });
        final cart = await DataService.addRentalCartItem(
          item: item,
          range: DateTimeRange(
            start: DateTime(2026, 9, 5),
            end: DateTime(2026, 9, 8),
          ),
        );
        expect(cart.reservationCreated, isFalse);

        await tester.pumpWidget(harness(const RentalCartScreen()));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(
            find.text('Im Mietkorb – noch nicht reserviert'), findsOneWidget);
        expect(find.text(item.title), findsOneWidget);
        for (final tooltip in <String>[
          'Projekt zuordnen',
          'Einzelmiete prüfen',
          'Aus Mietkorb entfernen',
        ]) {
          final action = find.byTooltip(tooltip);
          expect(action, findsOneWidget, reason: tooltip);
          expect(
            tester.getSemantics(action).rect.height,
            greaterThanOrEqualTo(kMinInteractiveDimension),
            reason: tooltip,
          );
        }
        await tester.ensureVisible(find.text('Projekt anlegen'));
        await tester.pumpAndSettle();
        expect(find.text('Projekt anlegen').hitTestable(), findsOneWidget);
        await tester.ensureVisible(find.text('Anmelden & synchronisieren'));
        await tester.pumpAndSettle();
        expect(
          find.text('Anmelden & synchronisieren').hitTestable(),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );
}

class _OptionsHost extends StatelessWidget {
  const _OptionsHost({required this.item});

  final Item item;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: FilledButton(
          onPressed: () => showListingOptionsDialog(
            context,
            item: item,
            contextType: ListingOptionsContext.explore,
          ),
          child: const Text('Anzeigenoptionen öffnen'),
        ),
      ),
    );
  }
}
