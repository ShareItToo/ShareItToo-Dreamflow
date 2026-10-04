import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  for (final scenario in [
    (name: 'weekly title-only edit', unit: 'week', raw: 70.0, changed: null),
    (name: 'daily title-only edit', unit: 'day', raw: 10.0, changed: null),
    (
      name: 'intentional daily price edit',
      unit: 'week',
      raw: 70.0,
      changed: '12,50'
    ),
  ]) {
    testWidgets('${scenario.name} survives draft save and editor reload',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(1000, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = _PersistedDraftService();
      final draft = Item.fromJson({
        ...buildTestItem(
          id: 'price-preservation-draft',
          ownerId: service.context.user.id,
          title: 'Synthetischer Preisentwurf',
          pricePerDay: 10,
        ).toJson(),
        'description': 'Synthetischer Entwurf ohne reale Veröffentlichung.',
        'categoryId': 'cat8',
        'subcategory': 'Bohrmaschinen',
        'priceUnit': scenario.unit,
        'priceRaw': scenario.raw,
        'status': 'draft',
        'isActive': false,
        'photos': <String>[],
        'condition': 'good',
        'country': 'Deutschland',
        'offersDeliveryAtDropoff': false,
        'offersPickupAtReturn': false,
        'offersExpressAtDropoff': false,
        'privateStatusConfirmed': false,
      });
      await service.persist(draft);
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(
        navigatorKey: navigator,
        home: const Scaffold(body: Text('Entwurfsübersicht')),
      ));

      Future<void> openSavedDraft() async {
        final saved = await service.read();
        unawaited(navigator.currentState!.push(MaterialPageRoute<void>(
          builder: (_) => CreateListingScreen(
            existing: saved,
            listingMutationService: service,
          ),
        )));
        await tester.pumpAndSettle();
      }

      Future<void> tapVisible(Finder finder) async {
        await tester.scrollUntilVisible(finder, 400,
            scrollable: find.byType(Scrollable).first);
        await tester.pumpAndSettle();
        expect(finder.hitTestable(), findsOneWidget);
        await tester.tap(finder.hitTestable(), warnIfMissed: true);
        await tester.pumpAndSettle();
      }

      final titleField = find.byWidgetPredicate((widget) =>
          widget is TextField && widget.decoration?.labelText == 'Titel');
      final priceField = find.byWidgetPredicate((widget) =>
          widget is TextField && widget.decoration?.hintText == '0,00');
      final next = find.widgetWithText(FilledButton, 'Weiter');
      await openSavedDraft();
      await tester.enterText(titleField, 'Nur der Titel wurde geändert');
      await tapVisible(next);
      expect(tester.widget<TextField>(priceField).controller!.text, '10');
      if (scenario.changed case final changed?) {
        await tester.ensureVisible(priceField);
        await tester.enterText(priceField, changed);
      }
      await tapVisible(next);
      await tapVisible(
          find.widgetWithText(OutlinedButton, 'Entwurf speichern'));
      expect(find.text('Entwurfsübersicht'), findsOneWidget);
      expect(service.mutations, 1);
      final saved = await service.read();
      final expectedPrice = scenario.changed == null ? 10.0 : 12.5;
      expect(saved.title, 'Nur der Titel wurde geändert');
      expect(saved.pricePerDay, expectedPrice);
      expect(saved.priceRaw, expectedPrice);
      expect(saved.priceUnit, 'day');
      expect(saved.status, 'draft');
      expect(saved.isActive, isFalse);

      await openSavedDraft();
      expect(tester.widget<TextField>(titleField).controller!.text,
          'Nur der Titel wurde geändert');
      await tapVisible(next);
      expect(tester.widget<TextField>(priceField).controller!.text,
          scenario.changed == null ? '10' : '12.50');
      expect(service.mutations, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }
}

// Exercise the real editor and mutation ownership pipeline with a serialized,
// local-only store. No backend, publication, provider or monetary effect.
class _PersistedDraftService extends ListingMutationService {
  static const storageKey = 'synthetic-draft-price-preservation';
  int mutations = 0;
  final ListingMutationContext context;

  _PersistedDraftService() : context = _context();

  static ListingMutationContext _context() {
    final user = buildTestUser('draft-price-owner',
        name: 'Synthetic Draft Owner', email: 'draft-price@example.invalid');
    return ListingMutationContext(
      user: user,
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: user.id,
          sessionId: 'synthetic-draft-price-session',
          email: user.email,
          createdAt: DateTime.utc(2026, 10, 4),
          epoch: 1,
        ),
        profileUserId: user.id,
      ),
    );
  }

  Future<void> persist(Item item) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(storageKey, jsonEncode(item.toJson()));
  }

  Future<Item> read() async {
    final prefs = await SharedPreferences.getInstance();
    return Item.fromJson(
        jsonDecode(prefs.getString(storageKey)!) as Map<String, dynamic>);
  }

  @override
  Future<ListingMutationContext?> loadCurrentContext() async => context;

  @override
  Future<bool> isContextCurrent(ListingMutationContext observed) async =>
      identical(observed, context);

  @override
  Future<ListingAiCapability> loadBlueOceanListingCapability({
    required ListingMutationContext context,
  }) async =>
      throw const ListingMutationFailure.rejected(
          'synthetic-provider-disabled');

  @override
  Future<AccountListingMutationResult> performListingMutation({
    required ListingMutationContext context,
    required ListingMutationCommand command,
  }) async {
    expect(command.operation, ListingMutationOperation.update);
    mutations++;
    await persist(command.item);
    return AccountListingMutationResult(
        item: await read(), remoteAccepted: false);
  }
}
