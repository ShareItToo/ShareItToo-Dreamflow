import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/config/booking_group_technical_config.dart';
import 'package:lendify/config/listing_sets_technical_config.dart';
import 'package:lendify/config/planner_technical_config.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/screens/booking_group_technical_screen.dart';
import 'package:lendify/screens/closed_pilot_listing_set_discovery_screen.dart';
import 'package:lendify/screens/closed_pilot_planner_screen.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/private_pilot_checkout_screen.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'rental_cart_surface_principal_http_test.dart' show useRole;
import 'rental_cart_surface_wishlist_test.dart' show role;
import 'support/test_builders.dart';

Map<String, dynamic> navigationCart(String owner, {bool empty = false}) => {
      'projects': [],
      'items': [
        if (!empty)
          for (final n in [1, 2])
            {
              'id': 'synthetic-cart-$owner-$n',
              'listingId': 'synthetic-listing-$owner-$n',
              'startDate': '2026-09-10',
              'endDate': '2026-09-11',
              'listing': {
                'title': '$owner navigation item $n',
                'ownerId': 'synthetic-lender',
                'currency': 'EUR'
              },
            }
      ],
    };

Future<GlobalKey<NavigatorState>> mountCart(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1200, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final nav = GlobalKey<NavigatorState>();
  await tester.pumpWidget(ChangeNotifierProvider<LocalizationController>(
    create: (_) => LocalizationController(),
    child: MaterialApp(navigatorKey: nav, home: const RentalCartScreen()),
  ));
  await tester.pumpAndSettle();
  return nav;
}

http.Response catalog() => http.Response(
    jsonEncode({
      'listings': [
        for (final owner in ['a', 'b'])
          for (final n in [1, 2])
            buildTestItem(
                    id: 'synthetic-listing-$owner-$n',
                    ownerId: 'synthetic-lender')
                .toJson(),
      ]
    }),
    200);

http.Response defaultRead(http.Request request) {
  expect(request.method, 'GET',
      reason: 'No unplanned business/provider mutation in origin tests.');
  final isB =
      request.headers['Authorization'] == 'Bearer synthetic-direct-access-b';
  if (request.url.path == '/api/v1/rental-cart') {
    return http.Response(
        jsonEncode({'cart': navigationCart(isB ? 'b' : 'a')}), 200);
  }
  if (request.url.path == '/api/v1/listings' ||
      request.url.path == '/api/v1/listings/mine') {
    return catalog();
  }
  // Destination loading may fail without invalidating the origin/lifetime
  // assertion. These fixtures do NOT certify planner/group/checkout business.
  return http.Response('{"error":"synthetic_unavailable"}', 503);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({'items': '[]', 'users': '[]'});
    await useRole('a');
  });
  if (!BackendConfig.enabled) {
    for (final entry in ['item', 'sync']) {
      testWidgets(
          'guest $entry login origin is owned and closes on account replacement',
          (tester) async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('auth_session_v1');
        await DataService.addRentalCartItem(
            item: buildTestItem(
                id: 'synthetic-guest-item', ownerId: 'synthetic-lender'),
            range: DateTimeRange(
                start: DateTime(2026, 9, 10), end: DateTime(2026, 9, 11)));
        final nav = await mountCart(tester);
        await tester.tap(entry == 'item'
            ? find.byTooltip('Einzelmiete prüfen')
            : find.text('Anmelden & synchronisieren'));
        await tester.pumpAndSettle();
        expect(find.byType(LoginScreen), findsOneWidget);
        final owned = ModalRoute.of(tester.element(find.byType(LoginScreen)))!;
        await role('b');
        final foreign = MaterialPageRoute<void>(
            builder: (_) =>
                const Scaffold(body: Text('B unrelated login page')));
        unawaited(nav.currentState!.push(foreign));
        await tester.pumpAndSettle();
        expect(owned.isActive, isFalse);
        expect(foreign.isCurrent, isTrue);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      });
    }
    return;
  }

  test('enabled navigation lane is nonbinding with all three origin flags', () {
    expect(PrivatePilotConfig.stageANonBindingPilotEnabled, isTrue);
    expect(PrivatePilotConfig.bindingCheckoutEnabled, isFalse);
    expect(BookingGroupTechnicalConfig.available, isTrue);
    expect(PlannerTechnicalConfig.available, isTrue);
    expect(ListingSetsTechnicalConfig.available, isTrue);
  });
  for (final entry in ['group', 'planner', 'set']) {
    for (final mode in ['stable-then-switch', 'silent-before-click']) {
      testWidgets('$entry origin $mode preserves foreign B page',
          (tester) async {
        await http.runWithClient(() async {
          final nav = await mountCart(tester);
          final finder = switch (entry) {
            'group' => find.text('2 Artikel gemeinsam prüfen'),
            'planner' => find.text('SIT Planer'),
            _ => find.ancestor(
                of: find.byIcon(Icons.view_carousel_outlined).first,
                matching: find.byType(ListTile)),
          };
          if (mode == 'silent-before-click') {
            // Keep A's rendered callback while replacing only persisted auth.
            final prefs = await SharedPreferences.getInstance();
            final a = jsonDecode(prefs.getString('auth_session_v1')!)
                as Map<String, dynamic>;
            a['userId'] = 'synthetic-direct-b';
            a['sessionId'] = 'synthetic-direct-session-b';
            a['accessToken'] = 'synthetic-direct-access-b';
            await prefs.setString('auth_session_v1', jsonEncode(a));
          }
          await tester.ensureVisible(finder);
          await tester.tap(finder);
          await tester.pumpAndSettle();
          final type = switch (entry) {
            'group' => BookingGroupTechnicalScreen,
            'planner' => ClosedPilotPlannerScreen,
            _ => ClosedPilotListingSetDiscoveryScreen,
          };
          Route<dynamic>? owned;
          if (mode == 'stable-then-switch') {
            expect(find.byType(type), findsOneWidget);
            owned = ModalRoute.of(tester.element(find.byType(type)))!;
            expect(owned.isCurrent, isTrue);
          } else {
            expect(find.byType(type, skipOffstage: false), findsNothing);
          }
          await useRole('b');
          final foreign = MaterialPageRoute<void>(
              builder: (_) =>
                  const Scaffold(body: Text('B foreign navigation')));
          unawaited(nav.currentState!.push(foreign));
          await tester.pumpAndSettle();
          expect(owned?.isActive ?? false, isFalse);
          expect(find.byType(type, skipOffstage: false), findsNothing);
          expect(foreign.isCurrent, isTrue);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }, () => MockClient((request) async => defaultRead(request)));
      });
    }
  }

  for (final aOutcome in ['success', 'error']) {
    testWidgets('old A $aOutcome finally cannot clear newer B busy checkout',
        (tester) async {
      final replies = {
        'a': Completer<http.Response>(),
        'b': Completer<http.Response>()
      };
      final started = <String>[];
      await http.runWithClient(() async {
        await mountCart(tester);
        await tester.tap(find.byTooltip('Einzelmiete prüfen').first);
        await tester.pump();
        await tester.pump();
        expect(started, ['a']);
        await useRole('b');
        await tester.pumpAndSettle();
        expect(find.text('b navigation item 1'), findsWidgets);
        await tester.tap(find.byTooltip('Einzelmiete prüfen').first);
        await tester.pump();
        await tester.pump();
        expect(started, ['a', 'b']);
        replies['a']!.complete(aOutcome == 'error'
            ? http.Response('{"error":"synthetic_unavailable"}', 503)
            : http.Response(jsonEncode({'cart': navigationCart('a')}), 200));
        await tester.pump();
        await tester.pump();
        final button = tester.widget<IconButton>(find
            .byWidgetPredicate(
                (w) => w is IconButton && w.tooltip == 'Einzelmiete prüfen')
            .first);
        expect(button.onPressed, isNull,
            reason: 'Old A finally must not re-enable B action.');
        expect(
            find.descendant(
                of: find.byWidget(button),
                matching: find.byType(CircularProgressIndicator)),
            findsOneWidget);
        expect(find.byType(PrivatePilotCheckoutScreen), findsNothing);
        replies['b']!.complete(
            http.Response(jsonEncode({'cart': navigationCart('b')}), 200));
        await tester.pumpAndSettle();
        final destination = tester.widget<PrivatePilotCheckoutScreen>(
            find.byType(PrivatePilotCheckoutScreen));
        expect(destination.item.id, 'synthetic-listing-b-1');
        expect(started, ['a', 'b']);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      },
          () => MockClient((request) async {
                if (request.url.path == '/api/v1/rental-cart/recheck') {
                  expect(request.method, 'POST');
                  final owner = request.headers['Authorization'] ==
                          'Bearer synthetic-direct-access-b'
                      ? 'b'
                      : 'a';
                  started.add(owner);
                  return replies[owner]!.future;
                }
                return defaultRead(request);
              }));
    });
  }

  for (final stage in [
    'stable',
    'missing',
    'recheck',
    'catalog',
    'late-error'
  ]) {
    testWidgets('item origin $stage guards recheck/catalog/destination',
        (tester) async {
      final held = Completer<http.Response>();
      var started = false;
      var rechecked = false;
      var checks = 0;
      await http.runWithClient(() async {
        final nav = await mountCart(tester);
        await tester.tap(find.byTooltip('Einzelmiete prüfen').first);
        // Drain mock microtasks without waiting for the intentional busy spinner.
        await tester.pump();
        await tester.pump();
        if (['recheck', 'catalog', 'late-error'].contains(stage)) {
          expect(started, isTrue);
          await useRole('b');
          await tester.pump();
          final foreign = MaterialPageRoute<void>(
              builder: (_) =>
                  const Scaffold(body: Text('B foreign checkout page')));
          unawaited(nav.currentState!.push(foreign));
          await tester.pumpAndSettle();
          held.complete(stage == 'catalog'
              ? catalog()
              : stage == 'late-error'
                  ? http.Response('{"error":"synthetic_unavailable"}', 503)
                  : http.Response(
                      jsonEncode({'cart': navigationCart('a')}), 200));
          await tester.pumpAndSettle();
          expect(find.byType(PrivatePilotCheckoutScreen, skipOffstage: false),
              findsNothing);
          expect(foreign.isCurrent, isTrue);
          expect(find.text('Serverprüfung konnte nicht bestätigt werden'),
              findsNothing);
        } else {
          await tester.pumpAndSettle();
          if (stage == 'missing') {
            expect(find.text('Artikel nicht mehr im Mietkorb'), findsOneWidget);
            expect(find.byType(PrivatePilotCheckoutScreen), findsNothing);
          } else {
            expect(find.byType(PrivatePilotCheckoutScreen), findsOneWidget);
            final owned = ModalRoute.of(
                tester.element(find.byType(PrivatePilotCheckoutScreen)))!;
            await useRole('b');
            final foreign = MaterialPageRoute<void>(
                builder: (_) =>
                    const Scaffold(body: Text('B unrelated checkout')));
            unawaited(nav.currentState!.push(foreign));
            await tester.pumpAndSettle();
            expect(owned.isActive, isFalse);
            expect(foreign.isCurrent, isTrue);
          }
        }
        expect(checks, 1);
        await tester.pump(const Duration(seconds: 2));
        await tester.pumpAndSettle();
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
          () => MockClient((request) async {
                if (request.url.path == '/api/v1/rental-cart/recheck') {
                  expect(request.method, 'POST');
                  expect(request.headers['Authorization'],
                      'Bearer synthetic-direct-access-a');
                  checks++;
                  rechecked = true;
                  if (stage == 'recheck' || stage == 'late-error') {
                    started = true;
                    return held.future;
                  }
                  return http.Response(
                      jsonEncode({
                        'cart': navigationCart('a', empty: stage == 'missing')
                      }),
                      200);
                }
                if (stage == 'catalog' &&
                    rechecked &&
                    !started &&
                    request.url.path == '/api/v1/listings') {
                  started = true;
                  return held.future;
                }
                return defaultRead(request);
              }));
    });
  }
}
