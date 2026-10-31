import 'dart:convert';
import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

Future<LocalPrincipalActionOwner> useSession(String role) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': 'fixture-$role',
        'sessionId': 'fixture-session-$role',
        'email': 'fixture-$role@example.invalid',
        'createdAt': '2026-09-04T00:00:00Z',
        'accessToken': 'fixture-access-$role',
        'refreshToken': 'fixture-refresh-$role',
        'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
      }));
  return LocalPrincipalActionOwner.capture();
}

Future<Map<String, dynamic>> put(AuthSessionOwner owner, bool item) => item
    ? BackendRepository.putRentalCartItemForOwner(
        owner: owner,
        id: 'fixture-item',
        listingId: 'fixture-listing',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
        projectId: 'fixture-project')
    : BackendRepository.putRentalCartProjectForOwner(
        owner: owner, id: 'fixture-project', title: 'Synthetic A project');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  if (!BackendConfig.enabled) {
    test('disabled backend cannot perform a bound cart upsert', () async {
      final owner = await useSession('a');
      var calls = 0;
      await http.runWithClient(() async {
        await expectLater(
            put(owner.sessionOwner!, false), throwsA(isA<BackendException>()));
      },
          () => MockClient((_) async {
                calls++;
                throw StateError('Unexpected request');
              }));
      expect(calls, 0);
    });
    return;
  }

  for (final item in [false, true]) {
    test('bound cart upsert item=$item uses A only', () async {
      final owner = await useSession('a');
      await http.runWithClient(() async {
        expect(await put(owner.sessionOwner!, item),
            {'projects': [], 'items': []});
      },
          () => MockClient((request) async {
                expect(request.method, 'PUT');
                expect(request.headers['Authorization'],
                    'Bearer fixture-access-a');
                expect(
                    request.url.path,
                    item
                        ? '/api/v1/rental-cart/items/fixture-item'
                        : '/api/v1/rental-cart/projects/fixture-project');
                return http.Response(
                    '{"cart":{"projects":[],"items":[]}}', 200);
              }));
    });
    test('stale cart upsert item=$item never sends B credentials', () async {
      final owner = await useSession('a');
      await useSession('b');
      var calls = 0;
      await http.runWithClient(() async {
        await expectLater(
            put(owner.sessionOwner!, item), throwsA(isA<BackendException>()));
      },
          () => MockClient((_) async {
                calls++;
                return http.Response('{}', 200);
              }));
      expect(calls, 0);
    });
    test('cart upsert item=$item 401 cannot refresh/retry as B', () async {
      final owner = await useSession('a');
      var calls = 0;
      await http.runWithClient(() async {
        await expectLater(
            put(owner.sessionOwner!, item), throwsA(isA<BackendException>()));
      },
          () => MockClient((request) async {
                calls++;
                expect(request.headers['Authorization'],
                    'Bearer fixture-access-a');
                await useSession('b');
                return http.Response('{"error":"session_expired"}', 401);
              }));
      expect(calls, 1);
      expect((await AuthService.readSession())?.userId, 'fixture-b');
    });
  }

  test('server confirms A project after B switch: result rejected, B preserved',
      () async {
    final owner = await useSession('a');
    var calls = 0;
    await http.runWithClient(() async {
      await expectLater(
          DataService.addRentalCartProject(
              title: 'Synthetic A project', expectedOwner: owner),
          throwsStateError);
    },
        () => MockClient((request) async {
              calls++;
              expect(
                  request.headers['Authorization'], 'Bearer fixture-access-a');
              expect(request.method, 'PUT');
              expect(request.url.path,
                  startsWith('/api/v1/rental-cart/projects/'));
              await useSession('b');
              return http.Response(
                  jsonEncode({
                    'cart': {
                      'projects': [
                        {
                          'id': request.url.pathSegments.last,
                          'title': 'Synthetic A project'
                        }
                      ],
                      'items': []
                    }
                  }),
                  200);
            }));
    expect(calls, 1);
    expect((await AuthService.readSession())?.userId, 'fixture-b');
  });

  test('concurrent identical remote intent performs one stable upsert',
      () async {
    final owner = await useSession('a');
    final item = buildTestItem(
        id: 'fixture-listing-deduplicated', ownerId: 'fixture-owner');
    final range = DateTimeRange(
      start: DateTime(2026, 9, 10),
      end: DateTime(2026, 9, 12),
    );
    var revision = 0;
    var putCalls = 0;
    Map<String, dynamic>? stored;
    Map<String, dynamic> cart() => <String, dynamic>{
          'schemaVersion': 1,
          'revision': revision,
          'reservationCreated': false,
          'projects': <dynamic>[],
          'items': stored == null ? <dynamic>[] : <dynamic>[stored],
        };

    await http.runWithClient(() async {
      final results = await Future.wait([
        DataService.addRentalCartItem(
            item: item, range: range, expectedOwner: owner),
        DataService.addRentalCartItem(
            item: item, range: range, expectedOwner: owner),
      ]);
      expect(results.last.items, hasLength(1));
      expect(results.last.reservationCreated, isFalse);
    },
        () => MockClient((request) async {
              expect(
                  request.headers['Authorization'], 'Bearer fixture-access-a');
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/rental-cart') {
                return http.Response(
                    jsonEncode(<String, dynamic>{'cart': cart()}), 200);
              }
              expect(request.method, 'PUT');
              expect(request.url.path,
                  startsWith('/api/v1/rental-cart/items/cartitem_'));
              putCalls++;
              final body = jsonDecode(request.body) as Map<String, dynamic>;
              stored = <String, dynamic>{
                'id': request.url.pathSegments.last,
                'listingId': body['listingId'],
                'projectId': body['projectId'],
                'startDate': body['startDate'],
                'endDate': body['endDate'],
                'sortOrder': 0,
                'quoteStatus': 'needs_recheck',
                'listing': <String, dynamic>{'title': item.title},
              };
              revision++;
              return http.Response(
                  jsonEncode(<String, dynamic>{'cart': cart()}), 200);
            }));

    expect(putCalls, 1);
    expect(stored?['id'], matches(RegExp(r'^cartitem_[0-9a-f]{64}$')));
  });

  test('lost remote response is reconciled before an explicit retry', () async {
    final owner = await useSession('a');
    final item = buildTestItem(
        id: 'fixture-listing-reconciled', ownerId: 'fixture-owner');
    final range = DateTimeRange(
      start: DateTime(2026, 9, 15),
      end: DateTime(2026, 9, 17),
    );
    var putCalls = 0;
    Map<String, dynamic>? stored;
    Map<String, dynamic> cart() => <String, dynamic>{
          'schemaVersion': 1,
          'revision': stored == null ? 0 : 1,
          'reservationCreated': false,
          'projects': <dynamic>[],
          'items': stored == null ? <dynamic>[] : <dynamic>[stored],
        };

    await http.runWithClient(() async {
      await expectLater(
        DataService.addRentalCartItem(
            item: item, range: range, expectedOwner: owner),
        throwsA(isA<http.ClientException>()),
      );
      final reconciled = await DataService.addRentalCartItem(
          item: item, range: range, expectedOwner: owner);
      expect(reconciled.items, hasLength(1));
      expect(reconciled.items.single.id, stored?['id']);
      expect(reconciled.reservationCreated, isFalse);
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/rental-cart') {
                return http.Response(
                    jsonEncode(<String, dynamic>{'cart': cart()}), 200);
              }
              putCalls++;
              final body = jsonDecode(request.body) as Map<String, dynamic>;
              stored = <String, dynamic>{
                'id': request.url.pathSegments.last,
                'listingId': body['listingId'],
                'projectId': body['projectId'],
                'startDate': body['startDate'],
                'endDate': body['endDate'],
                'sortOrder': 0,
                'quoteStatus': 'needs_recheck',
                'listing': <String, dynamic>{'title': item.title},
              };
              throw http.ClientException('synthetic response loss');
            }));

    expect(putCalls, 1);
  });

  test('pre-existing duplicate remote intents fail closed without mutation',
      () async {
    final owner = await useSession('a');
    final item = buildTestItem(
        id: 'fixture-listing-duplicate-state', ownerId: 'fixture-owner');
    final range = DateTimeRange(
      start: DateTime(2026, 9, 21),
      end: DateTime(2026, 9, 23),
    );
    var putCalls = 0;
    Map<String, dynamic> stored(String id) => <String, dynamic>{
          'id': id,
          'listingId': item.id,
          'projectId': null,
          'startDate': '2026-09-21',
          'endDate': '2026-09-23',
          'sortOrder': 0,
          'quoteStatus': 'needs_recheck',
          'listing': <String, dynamic>{'title': item.title},
        };
    final cart = <String, dynamic>{
      'schemaVersion': 1,
      'revision': 2,
      'reservationCreated': false,
      'projects': <dynamic>[],
      'items': <dynamic>[
        stored('legacy-random-a'),
        stored('legacy-random-b'),
      ],
    };

    await http.runWithClient(() async {
      await expectLater(
        DataService.addRentalCartItem(
            item: item, range: range, expectedOwner: owner),
        throwsA(isA<StateError>()),
      );
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/rental-cart') {
                return http.Response(
                    jsonEncode(<String, dynamic>{'cart': cart}), 200);
              }
              putCalls++;
              return http.Response('unexpected mutation', 500);
            }));

    expect(putCalls, 0);
  });

  test('guest sync interrupted after A upsert retains original guest intent',
      () async {
    await DataService.addRentalCartProject(title: 'Guest intent');
    final owner = await useSession('a');
    var calls = 0;
    await http.runWithClient(() async {
      await expectLater(
          DataService.syncGuestRentalCartAfterAuthentication(
              expectedOwner: owner),
          throwsStateError);
    },
        () => MockClient((request) async {
              calls++;
              expect(
                  request.headers['Authorization'], 'Bearer fixture-access-a');
              await useSession('b');
              return http.Response('{"cart":{"projects":[],"items":[]}}', 200);
            }));
    expect(calls, 1);
    final prefs = await SharedPreferences.getInstance();
    final registry = jsonDecode(prefs.getString('rental_cart_v2')!) as Map;
    final guest = registry['principals']['guest'] as Map;
    expect(guest['cart']['projects'].single['title'], 'Guest intent');
    expect(guest['syncOwnerToken'], owner.principal.token);
    expect((await AuthService.readSession())?.userId, 'fixture-b');
  });
}
