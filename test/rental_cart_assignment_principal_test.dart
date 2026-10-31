import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/models/rental_cart.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/test_builders.dart';

Future<void> useRole(String role, {bool notify = true}) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    jsonEncode({
      'userId': 'synthetic-assignment-$role',
      'sessionId': 'synthetic-assignment-session-$role',
      'email': 'assignment-$role@example.invalid',
      'createdAt': '2026-09-04T00:00:00Z',
      'accessToken': 'synthetic-access-$role',
      'refreshToken': 'synthetic-refresh-$role',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    }),
  );
  if (notify) {
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
  }
}

Future<void> clearRole() async {
  final session = (await AuthService.readSession())!;
  final receipt = await AuthService.clearSessionOwnerIfMatches(
      AuthService.captureSessionOwner(session),
      runLogoutCleanup: false);
  expect(receipt, isNotNull);
}

Future<GlobalKey<NavigatorState>> openAssignment(
  WidgetTester tester, {
  Future<RentalCart> Function(String, String?, LocalPrincipalActionOwner)?
      assigner,
}) async {
  tester.view.physicalSize = const Size(1200, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await DataService.addRentalCartProject(title: 'A private project');
  await DataService.addRentalCartItem(
      item:
          buildTestItem(id: 'synthetic-listing-a', ownerId: 'synthetic-lender'),
      range: DateTimeRange(
          start: DateTime(2026, 9, 10), end: DateTime(2026, 9, 11)));
  final navigator = GlobalKey<NavigatorState>();
  await tester.pumpWidget(ChangeNotifierProvider<LocalizationController>(
    create: (_) => LocalizationController(),
    child: MaterialApp(
        navigatorKey: navigator,
        home: RentalCartScreen(projectAssigner: assigner)),
  ));
  await tester.pumpAndSettle();
  await tester.tap(find.byTooltip('Projekt zuordnen'));
  await tester.pumpAndSettle();
  expect(find.text('Die Zuordnung ändert keine Reservierung.'), findsOneWidget);
  return navigator;
}

void pushForeignDialog(GlobalKey<NavigatorState> navigator) {
  unawaited(navigator.currentState!.push<void>(DialogRoute<void>(
      context: navigator.currentContext!,
      builder: (_) => const AlertDialog(title: Text('B owned dialog')))));
}

final serverCart = <String, dynamic>{
  'projects': [
    {'id': 'synthetic-project-a', 'title': 'A private project'},
  ],
  'items': [
    {
      'id': 'synthetic-cart-item-a',
      'listingId': 'synthetic-listing-a',
      'startDate': '2026-09-10',
      'endDate': '2026-09-11',
      'listing': {'title': 'A private cart item'},
    },
  ],
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({'items': '[]'});
    await useRole('a');
  });

  if (BackendConfig.enabled) {
    for (final switchDuringRead in [false, true]) {
      test(
        'assignment HTTP control: switchDuringRead=$switchDuringRead',
        () async {
          var reads = 0;
          final writeRoles = <String>[];
          Object? failure;
          await http.runWithClient(
            () async {
              try {
                await DataService.assignRentalCartItemToProject(
                  itemId: 'synthetic-cart-item-a',
                  projectId: 'synthetic-project-a',
                );
              } catch (error) {
                failure = error;
              }
            },
            () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/rental-cart') {
                reads++;
                expect(
                  request.headers['Authorization'],
                  'Bearer synthetic-access-a',
                );
                if (switchDuringRead) await useRole('b');
                return http.Response(jsonEncode({'cart': serverCart}), 200);
              }
              expect(request.method, 'PUT');
              expect(
                request.url.path,
                '/api/v1/rental-cart/items/synthetic-cart-item-a',
              );
              writeRoles.add(request.headers['Authorization'] ?? 'absent');
              expect(
                jsonDecode(request.body)['listingId'],
                'synthetic-listing-a',
              );
              return http.Response(jsonEncode({'cart': serverCart}), 200);
            }),
          );
          expect(reads, 1);
          expect(
            writeRoles,
            switchDuringRead ? isEmpty : ['Bearer synthetic-access-a'],
            reason:
                'An A cart read must never become an item upsert authenticated as B.',
          );
          if (switchDuringRead) {
            expect(failure, isNotNull);
            expect(
              (await AuthService.readSession())?.userId,
              'synthetic-assignment-b',
            );
          } else {
            expect(failure, isNull);
          }
        },
      );
    }
    for (final stage in ['read-401', 'write-401', 'write-success']) {
      test('assignment rejects late A $stage without B retry', () async {
        var calls = 0;
        await http.runWithClient(() async {
          await expectLater(
              DataService.assignRentalCartItemToProject(
                  itemId: 'synthetic-cart-item-a',
                  projectId: 'synthetic-project-a'),
              stage == 'write-success'
                  ? throwsStateError
                  : throwsA(isA<BackendException>()
                      .having((e) => e.statusCode, 'status', 401)
                      .having((e) => e.code, 'code', 'session_expired')));
        },
            () => MockClient((request) async {
                  calls++;
                  expect(request.headers['Authorization'],
                      'Bearer synthetic-access-a');
                  if (calls == 1 && stage != 'read-401') {
                    expect(request.method, 'GET');
                    return http.Response(jsonEncode({'cart': serverCart}), 200);
                  }
                  expect(request.method, stage == 'read-401' ? 'GET' : 'PUT');
                  await useRole('b');
                  return stage == 'write-success'
                      ? http.Response(jsonEncode({'cart': serverCart}), 200)
                      : http.Response('{"error":"session_expired"}', 401);
                }));
        expect(calls, stage == 'read-401' ? 1 : 2);
        expect((await AuthService.readSession())?.userId,
            'synthetic-assignment-b');
      });
    }
    for (final sameIdentity in [false, true]) {
      test(
          'stale explicit owner rejects all reads/writes; reloginA=$sameIdentity',
          () async {
        final owner = await LocalPrincipalActionOwner.capture();
        await clearRole();
        await useRole(sameIdentity ? 'a' : 'b');
        var calls = 0;
        await http.runWithClient(() async {
          await expectLater(DataService.getRentalCart(expectedOwner: owner),
              throwsStateError);
          await expectLater(
              DataService.assignRentalCartItemToProject(
                  itemId: 'synthetic-cart-item-a', expectedOwner: owner),
              throwsStateError);
        },
            () => MockClient((_) async {
                  calls++;
                  return http.Response('{}', 200);
                }));
        expect(calls, 0);
      });
    }
    return;
  }

  for (final switchWhileOpen in [false, true]) {
    testWidgets('assignment sheet control: switchWhileOpen=$switchWhileOpen', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1200, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final project = await DataService.addRentalCartProject(
        title: 'A private project',
      );
      final item = buildTestItem(
        id: 'synthetic-listing-a',
        ownerId: 'synthetic-lender',
      );
      await DataService.addRentalCartItem(
        item: item,
        range: DateTimeRange(
          start: DateTime(2026, 9, 10),
          end: DateTime(2026, 9, 11),
        ),
      );
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        ChangeNotifierProvider<LocalizationController>(
          create: (_) => LocalizationController(),
          child: MaterialApp(
            navigatorKey: navigator,
            home: const RentalCartScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Projekt zuordnen'));
      await tester.pumpAndSettle();
      expect(
        find.text('Die Zuordnung ändert keine Reservierung.'),
        findsOneWidget,
      );
      if (switchWhileOpen) {
        await useRole('b');
        unawaited(
          navigator.currentState!.push<void>(
            DialogRoute<void>(
              context: navigator.currentContext!,
              builder: (_) => const AlertDialog(title: Text('B owned dialog')),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('B owned dialog'), findsOneWidget);
        expect(
          find.text(
            'Die Zuordnung ändert keine Reservierung.',
            skipOffstage: false,
          ),
          findsNothing,
          reason: 'A assignment sheet must close, without removing B route.',
        );
      } else {
        await tester.tap(find.widgetWithText(ListTile, 'A private project'));
        await tester.pumpAndSettle();
        expect(
          (await DataService.getRentalCart()).items.single.projectId,
          project.id,
        );
      }
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }

  testWidgets('silent B switch cannot dispatch old A sheet completion',
      (tester) async {
    await openAssignment(tester);
    await useRole('b', notify: false);
    await tester.tap(find.widgetWithText(ListTile, 'A private project'));
    await tester.pumpAndSettle();
    expect((await DataService.getRentalCart()).items, isEmpty);
    expect(find.text('Projektzuordnung konnte nicht bestätigt werden'),
        findsNothing);
  });

  testWidgets('old sheet completion removes only A route, never B route',
      (tester) async {
    final navigator = await openAssignment(tester);
    final completeA = tester
        .widget<ListTile>(find.widgetWithText(ListTile, 'A private project'))
        .onTap!;
    await useRole('b', notify: false);
    pushForeignDialog(navigator);
    await tester.pumpAndSettle();
    completeA();
    await tester.pumpAndSettle();
    expect(find.text('B owned dialog'), findsOneWidget);
    expect(
        find.text('Die Zuordnung ändert keine Reservierung.',
            skipOffstage: false),
        findsNothing);
    expect((await DataService.getRentalCart()).items, isEmpty);
  });

  for (final success in [true, false]) {
    testWidgets('late A assignment success=$success cannot display under B',
        (tester) async {
      final reply = Completer<RentalCart>();
      var calls = 0;
      final navigator =
          await openAssignment(tester, assigner: (item, project, owner) {
        calls++;
        expect(owner.sessionOwner?.userId, 'synthetic-assignment-a');
        return reply.future;
      });
      final oldCart = await DataService.getRentalCart();
      await tester.tap(find.widgetWithText(ListTile, 'A private project'));
      await tester.pumpAndSettle();
      expect(calls, 1);
      await useRole('b');
      pushForeignDialog(navigator);
      if (success) {
        reply.complete(oldCart);
      } else {
        reply.completeError(TimeoutException('Synthetic uncertain A outcome'));
      }
      await tester.pumpAndSettle();
      expect(find.text('B owned dialog'), findsOneWidget);
      expect(find.text('A private project', skipOffstage: false), findsNothing);
      expect(find.text('Projektzuordnung konnte nicht bestätigt werden'),
          findsNothing);
      expect((await DataService.getRentalCart()).items, isEmpty);
    });
  }

  for (final changeAccount in [false, true]) {
    testWidgets('confirmed guest assignment; signInB=$changeAccount',
        (tester) async {
      await clearRole();
      await openAssignment(tester);
      if (changeAccount) await useRole('b', notify: false);
      await tester.tap(find.widgetWithText(ListTile, 'A private project'));
      await tester.pumpAndSettle();
      final cart = await DataService.getRentalCart();
      if (changeAccount) {
        expect(cart.items, isEmpty);
      } else {
        expect(cart.items.single.projectId, cart.projects.single.id);
      }
    });
  }

  testWidgets('actual logout and relogin A cannot revive the old assignment',
      (tester) async {
    await openAssignment(tester);
    final completeA = tester
        .widget<ListTile>(find.widgetWithText(ListTile, 'A private project'))
        .onTap!;
    final epoch = AuthService.sessionEpoch;
    await clearRole();
    await useRole('a');
    expect(AuthService.sessionEpoch, greaterThan(epoch));
    completeA();
    await tester.pumpAndSettle();
    expect((await DataService.getRentalCart()).items.single.projectId, isNull);
  });

  testWidgets('late A completion preserves a newer B assignment handle',
      (tester) async {
    final reply = Completer<RentalCart>();
    await openAssignment(tester, assigner: (_, __, ___) => reply.future);
    final oldCart = await DataService.getRentalCart();
    await tester.tap(find.widgetWithText(ListTile, 'A private project'));
    await tester.pumpAndSettle();
    await useRole('b');
    await DataService.addRentalCartProject(title: 'B private project');
    await DataService.addRentalCartItem(
        item: buildTestItem(
            id: 'synthetic-listing-b', ownerId: 'synthetic-lender'),
        range: DateTimeRange(
            start: DateTime(2026, 9, 10), end: DateTime(2026, 9, 11)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Projekt zuordnen'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'B private project'), findsOneWidget);
    reply.complete(oldCart);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'B private project'), findsOneWidget);
    await useRole('c');
    await tester.pumpAndSettle();
    expect(
        find.text('Die Zuordnung ändert keine Reservierung.',
            skipOffstage: false),
        findsNothing);
  });

  testWidgets(
      'uncertain assignment notice stays uncertain and belongs only to A',
      (tester) async {
    final navigator =
        await openAssignment(tester, assigner: (_, __, ___) async {
      throw TimeoutException('Synthetic response lost');
    });
    await tester.tap(find.widgetWithText(ListTile, 'A private project'));
    await tester.pumpAndSettle();
    expect(find.text('Projektzuordnung konnte nicht bestätigt werden'),
        findsOneWidget);
    expect(find.text('Projektzuordnung konnte nicht gespeichert werden'),
        findsNothing);
    await useRole('b');
    pushForeignDialog(navigator);
    await tester.pumpAndSettle();
    expect(find.text('B owned dialog'), findsOneWidget);
    expect(
        find.text('Projektzuordnung konnte nicht bestätigt werden',
            skipOffstage: false),
        findsNothing);
    // Cross the existing toast's exact two-second deadline on Flutter's
    // virtual clock; its late callback must still leave B's route intact.
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.text('B owned dialog'), findsOneWidget);
  });

  test('malformed auth cannot authorize a cart read or assignment as guest',
      () async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_session_v1', '{invalid');
    await expectLater(DataService.getRentalCart(), throwsStateError);
    await expectLater(
        DataService.assignRentalCartItemToProject(itemId: 'synthetic'),
        throwsStateError);
  });
}
