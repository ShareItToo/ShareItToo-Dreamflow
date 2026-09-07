import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/screens/search_results_screen.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/background_theme_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';
import 'package:lendify/widgets/listing_options_dialog.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Item itemFrom(
    Item source, {
    required String categoryId,
    required String subcategory,
    required String status,
    required bool isActive,
    required bool privateStatusConfirmed,
  }) =>
      Item.fromJson(<String, dynamic>{
        ...source.toJson(),
        'categoryId': categoryId,
        'subcategory': subcategory,
        'status': status,
        'isActive': isActive,
        'description': '${source.title} mit geprüftem Zubehör.',
        'condition': 'good',
        'privateStatusConfirmed': privateStatusConfirmed,
        'offersDeliveryAtDropoff': false,
        'offersPickupAtReturn': false,
        'offersExpressAtDropoff': false,
        'maxDeliveryKmAtDropoff': null,
        'maxPickupKmAtReturn': null,
        'country': 'Deutschland',
      });

  testWidgets(
    'exact reduced Wave-0 journey stays persistent, non-binding and local',
    (tester) async {
      final semantics = tester.ensureSemantics();
      try {
        expect(PrivatePilotConfig.stageANonBindingPilotEnabled, isTrue);
        expect(PrivatePilotConfig.blueOceanListingAssistantEnabled, isTrue);
        expect(PrivatePilotConfig.bindingCheckoutEnabled, isFalse);
        expect(PrivatePilotConfig.realPaymentsEnabled, isFalse);

        final owner = buildTestUser(
          'rw0-owner',
          name: 'RW0 Owner',
          city: 'Heilbronn',
          email: 'rw0-owner@example.invalid',
        );
        final draft = itemFrom(
          buildTestItem(
            id: 'rw0-draft',
            ownerId: owner.id,
            title: 'RW0 Bohrmaschine',
            pricePerDay: 18,
          ),
          categoryId: 'cat8',
          subcategory: 'Bohrmaschinen',
          status: 'draft',
          isActive: false,
          privateStatusConfirmed: false,
        );
        final searchItem = itemFrom(
          buildTestItem(
            id: 'rw0-search-item',
            ownerId: 'rw0-other-owner',
            title: 'RW0 Akkuschrauber',
            pricePerDay: 14,
          ),
          categoryId: 'cat8',
          subcategory: 'Elektrowerkzeuge',
          status: 'active',
          isActive: true,
          privateStatusConfirmed: true,
        );
        final localAuthFixture = List<String>.filled(24, 'r').join();
        SharedPreferences.setMockInitialValues(<String, Object>{
          'users': jsonEncode(<Object>[owner.toJson()]),
          'currentUser': jsonEncode(owner.toJson()),
          'items': jsonEncode(<Object>[draft.toJson(), searchItem.toJson()]),
          'rental_requests': '[]',
          'auth_accounts_v1': jsonEncode(<Map<String, Object>>[
            <String, Object>{
              'email': owner.email,
              'password': localAuthFixture,
              'createdAt': '2026-08-25T00:00:00.000Z',
            },
          ]),
          'auth_seeded_v1': true,
        });
        final signIn = await AuthService.signInWithEmailPassword(
          email: owner.email,
          password: localAuthFixture,
        );
        expect(signIn.ok, isTrue);

        var host = _JourneyHostController(
          const CreateListingScreen(key: ValueKey('rw0-new-listing')),
        );
        await tester.pumpWidget(_JourneyShell(controller: host));
        await tester.pumpAndSettle();
        expect(
          find.text(PrivatePilotConfig.blueOceanStageANonBindingNotice),
          findsOneWidget,
        );

        host.show(CreateListingScreen(
          key: const ValueKey('rw0-edit-listing'),
          existing: draft,
        ));
        await tester.pumpAndSettle();

        final declaration =
            find.text(PrivatePilotConfig.listingPrivateDeclaration);
        await tester.scrollUntilVisible(
          declaration,
          500,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(declaration);
        await tester.pump();

        final publish =
            find.widgetWithText(FilledButton, 'Anzeige veröffentlichen');
        await tester.scrollUntilVisible(
          publish,
          500,
          scrollable: find.byType(Scrollable).first,
        );
        final dynamic publishAction =
            tester.widget<FilledButton>(publish).onPressed;
        expect(publishAction, isNotNull);
        await (publishAction() as Future<void>);
        await tester.pumpAndSettle();
        expect(find.text('Anzeige wurde erstellt'), findsOneWidget);
        await tester.tap(find.text('Schließen'));
        await tester.pumpAndSettle();

        final currentItems = await DataService.getItems();
        final published =
            currentItems.singleWhere((item) => item.id == draft.id);
        expect(published.status, 'active');
        expect(published.isActive, isTrue);
        expect(published.privateStatusConfirmed, isTrue);
        expect(published.offersDeliveryAtDropoff, isFalse);
        expect(published.offersPickupAtReturn, isFalse);
        expect(published.offersExpressAtDropoff, isFalse);

        host.show(SearchResultsScreen(
          queryText: 'Akkuschrauber in Heilbronn',
          results: <Item>[searchItem],
        ));
        await tester.pumpAndSettle();
        expect(find.text(searchItem.title), findsOneWidget);
        final saveAction = find.bySemanticsLabel(
          RegExp(
            RegExp.escape('Unter Gemerkt speichern: ${searchItem.title}'),
          ),
        );
        expect(saveAction, findsOneWidget);
        await tester.tap(saveAction);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Demnächst benötigt'));
        await tester.pump();
        await tester.pump(const Duration(seconds: 2));
        expect(
          await DataService.getWishlistForItem(searchItem.id),
          DataService.wlSoonId,
        );

        var cart = await DataService.addRentalCartItem(
          item: searchItem,
          range: DateTimeRange(
            start: DateTime(2026, 9, 5),
            end: DateTime(2026, 9, 8),
          ),
        );
        expect(cart.reservationCreated, isFalse);
        expect(cart.items, hasLength(1));

        host.show(const RentalCartScreen());
        await tester.pumpAndSettle();
        expect(
            find.text('Im Mietkorb – noch nicht reserviert'), findsOneWidget);
        expect(find.text(searchItem.title), findsOneWidget);
        expect(find.text('Technische Mehrfachanfrage'), findsNothing);

        await tester.tap(find.text('Projekt anlegen'));
        await tester.pumpAndSettle();
        final projectNameField = find.byWidgetPredicate(
          (widget) =>
              widget is TextField &&
              widget.decoration?.hintText ==
                  'z. B. Umzug, Werkzeug, Gartenparty',
        );
        expect(projectNameField, findsOneWidget);
        await tester.enterText(projectNameField, 'Werkbank Herbst');
        await tester.tap(find.text('Erstellen'));
        await tester.pumpAndSettle();
        expect(find.text('Werkbank Herbst'), findsOneWidget);

        await tester.tap(find.byTooltip('Projekt zuordnen'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Werkbank Herbst').last);
        await tester.pumpAndSettle();
        cart = await DataService.getRentalCart();
        expect(cart.projects.single.title, 'Werkbank Herbst');
        expect(cart.items.single.projectId, cart.projects.single.id);
        expect(cart.reservationCreated, isFalse);

        await tester.tap(find.byTooltip('Einzelmiete prüfen'));
        await tester.pumpAndSettle();
        expect(find.text('Unverbindliche Stage-A-Vorschau'), findsOneWidget);
        final simulationRequest = find.text('Test-Mietanfrage senden');
        await tester.scrollUntilVisible(
          simulationRequest,
          500,
          scrollable: find.byType(Scrollable).first,
        );
        expect(
          simulationRequest,
          findsOneWidget,
        );
        expect(find.byType(CheckboxListTile), findsOneWidget);
        await tester.pageBack();
        await tester.pumpAndSettle();

        host.show(_FeedbackHost(item: searchItem));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Anzeigenoptionen öffnen'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Ausblenden / Weniger davon anzeigen'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Zu teuer'));
        await tester.pump();
        await tester.pump(const Duration(seconds: 2));

        final safetyPrivacy =
            await LocalSafetyPrivacyService.exportCurrentPrincipal();
        final feedback = (safetyPrivacy['feedbackLog'] as List<dynamic>)
            .map((entry) => Map<String, dynamic>.from(entry as Map))
            .toList(growable: false);
        expect(feedback, hasLength(1));
        expect(feedback.single['itemId'], searchItem.id);
        expect(feedback.single['reason'], 'too_expensive');

        // Simulate a process restart: dispose every surface, then rebuild from
        // persisted local state without carrying widget state across the boundary.
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        host = _JourneyHostController(const RentalCartScreen());
        await tester.pumpWidget(_JourneyShell(controller: host));
        await tester.pumpAndSettle();
        expect(find.text(searchItem.title), findsOneWidget);
        expect(find.text('Werkbank Herbst'), findsWidgets);
        expect(
            find.text('Im Mietkorb – noch nicht reserviert'), findsOneWidget);
        expect(find.text('Technische Mehrfachanfrage'), findsNothing);

        host.show(SearchResultsScreen(
          queryText: 'Akkuschrauber in Heilbronn',
          results: <Item>[searchItem],
        ));
        await tester.pumpAndSettle();
        expect(
          find.bySemanticsLabel(
            RegExp(
              RegExp.escape('Aus Gemerkt entfernen: ${searchItem.title}'),
            ),
          ),
          findsOneWidget,
        );

        final prefs = await SharedPreferences.getInstance();
        final requests =
            jsonDecode(prefs.getString('rental_requests')!) as List;
        expect(requests, isEmpty);
        expect((await DataService.getRentalCart()).reservationCreated, isFalse);
        expect(prefs.containsKey('payment_intents'), isFalse);
        expect(prefs.containsKey('refunds'), isFalse);
        expect(prefs.containsKey('payouts'), isFalse);
        for (final excludedStore in <String>[
          'booking_selections',
          'handover_return_state_v1',
          'handover_fail_counts',
          'handover_banners',
          'review_reminders_v1',
          'multi_reviews_v1',
        ]) {
          expect(
            prefs.containsKey(excludedStore),
            isFalse,
            reason: excludedStore,
          );
        }
      } finally {
        semantics.dispose();
      }
    },
    skip: !PrivatePilotConfig.stageANonBindingPilotEnabled ||
        !PrivatePilotConfig.blueOceanListingAssistantEnabled,
  );

  testWidgets('listing options open the real listing report flow',
      (tester) async {
    final reporter = buildTestUser(
      'rw0-reporting-renter',
      name: 'RW0 Reporting Renter',
      email: 'rw0-reporting-renter@example.invalid',
    );
    final owner = buildTestUser(
      'rw0-reported-owner',
      name: 'RW0 Reported Owner',
      email: 'rw0-reported-owner@example.invalid',
    );
    final item = itemFrom(
      buildTestItem(
        id: 'rw0-reported-listing',
        ownerId: owner.id,
        title: 'RW0 gemeldete Anzeige',
      ),
      categoryId: 'cat8',
      subcategory: 'Bohrmaschinen',
      status: 'active',
      isActive: true,
      privateStatusConfirmed: true,
    );
    final password = List<String>.filled(24, 's').join();
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[reporter.toJson(), owner.toJson()]),
      'currentUser': jsonEncode(reporter.toJson()),
      'items': jsonEncode(<Object>[item.toJson()]),
      'auth_accounts_v1': jsonEncode(<Map<String, Object>>[
        <String, Object>{
          'email': reporter.email,
          'password': password,
          'createdAt': '2026-09-07T00:00:00.000Z',
        },
      ]),
      'auth_seeded_v1': true,
    });
    final signIn = await AuthService.signInWithEmailPassword(
      email: reporter.email,
      password: password,
    );
    expect(signIn.ok, isTrue);

    await tester.pumpWidget(
      _JourneyShell(
          controller: _JourneyHostController(_FeedbackHost(item: item))),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Anzeigenoptionen öffnen'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Melden'),
      180,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Melden').hitTestable());
    await tester.pumpAndSettle();

    expect(find.text('Anzeige melden'), findsOneWidget);
    expect(find.text(item.title), findsOneWidget);
    expect(find.text('Anzeige melden folgt bald'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

class _JourneyHostController {
  _JourneyHostController(this.initialSurface);

  final Widget initialSurface;
  final navigatorKey = GlobalKey<NavigatorState>();

  void show(Widget next) {
    navigatorKey.currentState!.pushAndRemoveUntil<void>(
      MaterialPageRoute<void>(builder: (_) => next),
      (_) => false,
    );
  }
}

class _JourneyShell extends StatelessWidget {
  final _JourneyHostController controller;

  const _JourneyShell({required this.controller});

  @override
  Widget build(BuildContext context) {
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
        navigatorKey: controller.navigatorKey,
        home: controller.initialSurface,
      ),
    );
  }
}

class _FeedbackHost extends StatelessWidget {
  final Item item;

  const _FeedbackHost({required this.item});

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
