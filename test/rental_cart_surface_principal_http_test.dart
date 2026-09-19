import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/models/rental_cart.dart';
import 'package:lendify/widgets/saved_cart_intent.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/test_builders.dart';

Future<void> useRole(String role) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    jsonEncode({
      'userId': 'synthetic-direct-$role',
      'sessionId': 'synthetic-direct-session-$role',
      'email': 'direct-$role@example.invalid',
      'createdAt': '2026-09-04T00:00:00Z',
      'accessToken': 'synthetic-direct-access-$role',
      'refreshToken': 'synthetic-direct-refresh-$role',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    }),
  );
  SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
}

Map<String, dynamic> cartFor(String role) => {
      'projects': [
        {'id': 'synthetic-project-$role', 'title': '$role private project'},
      ],
      'items': [
        {
          'id': 'synthetic-item-$role',
          'listingId': 'synthetic-listing-$role',
          'startDate': '2026-09-10',
          'endDate': '2026-09-11',
          'listing': {'title': '$role private item'},
        },
      ],
    };

Future<RentalCart> action(String operation,
        {LocalPrincipalActionOwner? owner}) =>
    switch (operation) {
      'add' => DataService.addRentalCartItem(
          expectedOwner: owner,
          item: buildTestItem(
              id: 'synthetic-listing-a', ownerId: 'synthetic-lender'),
          range: DateTimeRange(
            start: DateTime(2026, 9, 10),
            end: DateTime(2026, 9, 11),
          ),
        ),
      'delete-item' => DataService.removeRentalCartItem('synthetic-item-a',
          expectedOwner: owner),
      'delete-project' => DataService.removeRentalCartProject(
          'synthetic-project-a',
          expectedOwner: owner,
        ),
      'recheck' => DataService.recheckRentalCart(expectedOwner: owner),
      _ => throw StateError('Unknown synthetic operation'),
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({'items': '[]'});
    await useRole('a');
  });
  if (!BackendConfig.enabled) {
    for (final operation in [
      'add',
      'delete-item',
      'delete-project',
      'recheck'
    ]) {
      test('local $operation rejects stale explicit owner before queue write',
          () async {
        final owner = await LocalPrincipalActionOwner.capture();
        await useRole('b');
        final prefs = await SharedPreferences.getInstance();
        final before = prefs.getString('rental_cart_v2');
        await expectLater(action(operation, owner: owner), throwsStateError);
        expect(prefs.getString('rental_cart_v2'), before);
        expect((await DataService.getRentalCart()).items, isEmpty);
      });
      test('local $operation rejects malformed session as unknown, not guest',
          () async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('auth_session_v1', '{broken');
        await expectLater(action(operation), throwsA(anything));
        expect(prefs.getString('auth_session_v1'), '{broken');
        expect(prefs.getString('rental_cart_v2'), isNull);
      });
    }
    test('confirmed guest keeps local add/remove/project/recheck functionality',
        () async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('auth_session_v1');
      final owner = await LocalPrincipalActionOwner.capture();
      expect(owner.principal.authenticated, isFalse);
      final project = await DataService.addRentalCartProject(
          title: 'Guest project', expectedOwner: owner);
      final cart = await action('add', owner: owner);
      expect(cart.localDeviceOnly, isTrue);
      expect(cart.items.single.listingId, 'synthetic-listing-a');
      final checked = await DataService.recheckRentalCart(expectedOwner: owner);
      expect(checked.items.single.id, cart.items.single.id);
      await DataService.removeRentalCartItem(cart.items.single.id,
          expectedOwner: owner);
      await DataService.removeRentalCartProject(project.id,
          expectedOwner: owner);
      final empty = await DataService.getRentalCart(expectedOwner: owner);
      expect(empty.items, isEmpty);
      expect(empty.projects, isEmpty);
      expect(empty.localDeviceOnly, isTrue);
    });
    return;
  }
  for (final operation in ['add', 'delete-item', 'delete-project', 'recheck']) {
    for (final outcome in ['stable', 'late-success', 'late-401']) {
      test('$operation $outcome retains initiating owner', () async {
        var requests = 0;
        var foreignRefreshes = 0;
        RentalCart? result;
        Object? failure;
        await http.runWithClient(
          () async {
            try {
              result = await action(operation);
            } catch (error) {
              failure = error;
            }
          },
          () => MockClient((request) async {
            requests++;
            if (request.url.path == '/api/v1/auth/refresh') {
              expect(
                jsonDecode(request.body)['refreshToken'],
                'synthetic-direct-refresh-b',
              );
              foreignRefreshes++;
              return http.Response(
                '{"error":"synthetic_refresh_unavailable"}',
                503,
              );
            }
            expect(
              request.headers['Authorization'],
              'Bearer synthetic-direct-access-a',
            );
            expect(request.url.path, startsWith('/api/v1/rental-cart'));
            if (operation == 'add' && request.method == 'GET') {
              return http.Response(
                jsonEncode({
                  'cart': {'projects': [], 'items': []},
                }),
                200,
              );
            }
            if (outcome != 'stable') await useRole('b');
            final confirmed = cartFor('a');
            if (operation == 'add') {
              confirmed['items'] = [
                {
                  'id': request.url.pathSegments.last,
                  ...Map<String, dynamic>.from(jsonDecode(request.body) as Map)
                },
              ];
            }
            return outcome == 'late-401'
                ? http.Response('{"error":"session_expired"}', 401)
                : http.Response(jsonEncode({'cart': confirmed}), 200);
          }),
        );
        expect(
          foreignRefreshes,
          0,
          reason:
              'An A action must never refresh B credentials after A returns 401.',
        );
        expect(requests, operation == 'add' ? 2 : 1);
        if (outcome == 'stable') {
          expect(failure, isNull);
          expect(result!.projects.single.title, 'a private project');
        } else {
          expect(
            failure,
            isNotNull,
            reason:
                'A result must be rejected after the current principal becomes B.',
          );
          expect(result, isNull);
          expect(
            (await AuthService.readSession())?.userId,
            'synthetic-direct-b',
          );
        }
      });
    }
  }

  for (final operation in ['add', 'delete-item', 'delete-project', 'recheck']) {
    for (final malformed in [
      <String, dynamic>{},
      <String, dynamic>{'projects': [], 'items': null},
      <String, dynamic>{
        'projects': [false],
        'items': []
      },
    ]) {
      test(
          'truth $operation rejects malformed cart instead of empty success: $malformed',
          () async {
        await http.runWithClient(() async {
          await expectLater(action(operation), throwsFormatException);
        },
            () => MockClient((request) async =>
                http.Response(jsonEncode({'cart': malformed}), 200)));
      });
    }
  }
  test('truth add rejects unrelated nonempty cart as save acknowledgement',
      () async {
    var calls = 0;
    await http.runWithClient(() async {
      await expectLater(action('add'), throwsStateError);
    },
        () => MockClient((request) async {
              calls++;
              return http.Response(
                jsonEncode({
                  'cart': calls == 1
                      ? <String, dynamic>{'projects': [], 'items': []}
                      : cartFor('b'),
                }),
                200,
              );
            }));
    expect(calls, 2);
  });

  for (final stage in [
    'stable',
    'public-read',
    'private-read',
    'private-401'
  ]) {
    test('saved-folder catalog prerequisite retains owner at $stage', () async {
      final owner = await LocalPrincipalActionOwner.capture();
      var calls = 0;
      Object? failure;
      await http.runWithClient(() async {
        try {
          final result =
              await DataService.getItemsByWishlist(expectedOwner: owner);
          expect(result, isEmpty);
        } catch (error) {
          failure = error;
        }
      },
          () => MockClient((request) async {
                calls++;
                expect(request.method, 'GET');
                if (calls == 1) {
                  expect(request.url.path, '/api/v1/listings');
                  expect(request.headers['Authorization'], isNull);
                  if (stage == 'public-read') await useRole('b');
                } else {
                  expect(request.url.path, '/api/v1/listings/mine');
                  expect(request.headers['Authorization'],
                      'Bearer synthetic-direct-access-a');
                  if (stage == 'private-read' || stage == 'private-401') {
                    await useRole('b');
                  }
                }
                return stage == 'private-401' && calls == 2
                    ? http.Response('{"error":"session_expired"}', 401)
                    : http.Response('{"listings":[]}', 200);
              }));
      expect(calls, stage == 'public-read' ? 1 : 2);
      expect(failure, stage == 'stable' ? isNull : isNotNull);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('items'), '[]',
          reason:
              'Owned private reads must not replace the global catalog cache.');
    });
  }

  for (final outcome in [
    'stable',
    'unrelated-cart',
    'server-error',
    'late-success',
    'late-error'
  ]) {
    testWidgets('listing cart intent $outcome never misreports or closes B',
        (tester) async {
      final nav = GlobalKey<NavigatorState>();
      final started = Completer<void>();
      final reply = Completer<http.Response>();
      Map<String, dynamic>? acknowledged;
      var calls = 0;
      await http.runWithClient(() async {
        Future<void>? pending;
        await tester.pumpWidget(MaterialApp(
            navigatorKey: nav,
            home: Scaffold(
                body: Builder(
                    builder: (context) => TextButton(
                          onPressed: () {
                            pending = saveListingToRentalCart(context,
                                item: buildTestItem(
                                    id: 'synthetic-listing-a',
                                    ownerId: 'synthetic-lender'),
                                range: DateTimeRange(
                                    start: DateTime(2026, 9, 10),
                                    end: DateTime(2026, 9, 11)));
                          },
                          child: const Text('Add listing fixture'),
                        )))));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Add listing fixture'));
        await tester.pumpAndSettle();
        expect(started.isCompleted, isTrue);
        if (outcome.startsWith('late')) {
          await useRole('b');
          unawaited(nav.currentState!.push<void>(DialogRoute<void>(
              context: nav.currentContext!,
              builder: (_) =>
                  const AlertDialog(title: Text('B foreign dialog')))));
          await tester.pumpAndSettle();
        }
        reply.complete(outcome.endsWith('error')
            ? http.Response('{"error":"synthetic_unavailable"}', 503)
            : http.Response(
                jsonEncode({
                  'cart':
                      outcome == 'unrelated-cart' ? cartFor('a') : acknowledged
                }),
                200));
        await tester.pumpAndSettle();
        expect(calls, 2);
        if (outcome.startsWith('late')) {
          expect(find.text('B foreign dialog'), findsOneWidget);
          expect(find.textContaining('Im Mietkorb'), findsNothing);
          expect(find.textContaining('Speichern im Mietkorb'), findsNothing);
        } else if (outcome == 'stable') {
          expect(
              find.text('Im Mietkorb – noch nicht reserviert'), findsOneWidget);
        } else {
          expect(
              find.text('Speichern im Mietkorb konnte nicht bestätigt werden'),
              findsOneWidget);
          expect(
              find.text('Im Mietkorb – noch nicht reserviert'), findsNothing);
        }
        await tester.pump(const Duration(seconds: 2));
        await tester.pumpAndSettle();
        expect(pending, isNotNull);
        await pending;
        if (outcome.startsWith('late')) {
          expect(find.text('B foreign dialog'), findsOneWidget);
        }
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      },
          () => MockClient((request) async {
                calls++;
                if (request.method == 'GET' &&
                    request.url.path == '/api/v1/rental-cart') {
                  return http.Response(
                    jsonEncode({
                      'cart': {'projects': [], 'items': []},
                    }),
                    200,
                  );
                }
                expect(request.method, 'PUT');
                expect(request.headers['Authorization'],
                    'Bearer synthetic-direct-access-a');
                acknowledged = {
                  'projects': [],
                  'items': [
                    {
                      'id': request.url.pathSegments.last,
                      ...Map<String, dynamic>.from(
                          jsonDecode(request.body) as Map)
                    },
                  ]
                };
                started.complete();
                return reply.future;
              }));
    });
  }

  for (final operation in ['delete-item', 'delete-project', 'recheck']) {
    for (final switchToB in [false, true]) {
      testWidgets('$operation UI late result; switchToB=$switchToB', (
        tester,
      ) async {
        tester.view.physicalSize = const Size(1200, 1800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final reply = Completer<http.Response>();
        final started = Completer<void>();
        var mutationCalls = 0;
        var bRead = false;
        final navigator = GlobalKey<NavigatorState>();
        await http.runWithClient(
          () async {
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
            expect(find.text('a private project'), findsOneWidget);
            if (operation == 'delete-project') {
              final chip = find.widgetWithText(Chip, 'a private project');
              final deleteLabel = MaterialLocalizations.of(
                tester.element(chip),
              ).deleteButtonTooltip;
              await tester.tap(
                find.descendant(
                  of: chip,
                  matching: find.byTooltip(deleteLabel),
                ),
              );
            } else {
              await tester.tap(
                find.byTooltip(
                  operation == 'delete-item'
                      ? 'Aus Mietkorb entfernen'
                      : 'Verfügbarkeit und Preis neu prüfen',
                ),
              );
            }
            await tester.pumpAndSettle();
            expect(started.isCompleted, isTrue);
            if (switchToB) {
              await useRole('b');
              await tester.pumpAndSettle();
              expect(bRead, isTrue);
              expect(find.text('a private project'), findsNothing);
              expect(find.text('b private project'), findsOneWidget);
              unawaited(
                navigator.currentState!.push<void>(
                  DialogRoute<void>(
                    context: navigator.currentContext!,
                    builder: (_) =>
                        const AlertDialog(title: Text('B foreign dialog')),
                  ),
                ),
              );
              await tester.pumpAndSettle();
            }
            reply.complete(
              http.Response(jsonEncode({'cart': cartFor('a')}), 200),
            );
            await tester.pumpAndSettle();
            expect(mutationCalls, 1);
            if (switchToB) {
              expect(find.text('B foreign dialog'), findsOneWidget);
              expect(
                find.text('a private project', skipOffstage: false),
                findsNothing,
                reason:
                    'Late A cart result cannot overwrite the current B snapshot.',
              );
              expect(
                find.text('b private project', skipOffstage: false),
                findsOneWidget,
              );
            } else {
              expect(find.text('a private project'), findsOneWidget);
            }
            await tester.pumpWidget(const SizedBox.shrink());
            await tester.pumpAndSettle();
          },
          () => MockClient((request) async {
            if (request.method == 'GET' &&
                [
                  '/api/v1/listings',
                  '/api/v1/listings/mine',
                ].contains(request.url.path)) {
              return http.Response('{"listings":[]}', 200);
            }
            if (request.method == 'GET' &&
                request.url.path == '/api/v1/rental-cart') {
              final isB = request.headers['Authorization'] ==
                  'Bearer synthetic-direct-access-b';
              if (isB) bRead = true;
              return http.Response(
                jsonEncode({'cart': cartFor(isB ? 'b' : 'a')}),
                200,
              );
            }
            expect(
              request.headers['Authorization'],
              'Bearer synthetic-direct-access-a',
            );
            expect(request.url.path, startsWith('/api/v1/rental-cart'));
            expect(request.method, operation == 'recheck' ? 'POST' : 'DELETE');
            mutationCalls++;
            if (!started.isCompleted) started.complete();
            return reply.future;
          }),
        );
      });
    }
  }
}
