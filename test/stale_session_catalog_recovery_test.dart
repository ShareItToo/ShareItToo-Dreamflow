import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

Future<AuthSessionOwner> _writeSession(String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    jsonEncode(<String, Object?>{
      'userId': 'synthetic-owner-$suffix',
      'sessionId': 'synthetic-session-$suffix',
      'email': 'synthetic-owner-$suffix@example.invalid',
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': 'synthetic-access-$suffix',
      'refreshToken': 'synthetic-refresh-$suffix',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    }),
  );
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('cold-start getItems clears exact invalid owner and recovers as guest',
      () async {
    if (!BackendConfig.enabled) return;
    final owner = await _writeSession('cold');
    final cachedUser = buildTestUser(
      'synthetic-cached-user',
      name: 'Synthetic Cached User',
      email: 'cached@example.invalid',
    );
    final cachedItem = buildTestItem(
      id: 'synthetic-cached-item',
      ownerId: cachedUser.id,
    );
    final recoveredItem = buildTestItem(
      id: 'synthetic-public-after-recovery',
      ownerId: 'synthetic-public-owner',
      title: 'Synthetic recovered catalog item',
    );
    final prefs = await SharedPreferences.getInstance();
    final currentUserRaw = jsonEncode(cachedUser.toJson());
    final usersRaw = jsonEncode(<Map<String, dynamic>>[cachedUser.toJson()]);
    final requestsRaw = '[{"preserve":"unrelated"}]';
    await prefs.setString('currentUser', currentUserRaw);
    await prefs.setString('users', usersRaw);
    await prefs.setString(
        'items',
        jsonEncode(<Map<String, dynamic>>[
          cachedItem.toJson(),
        ]));
    await prefs.setString('rental_requests', requestsRaw);
    await prefs.setString('synthetic_unrelated_key', 'keep-me');

    var publicReads = 0;
    var privateReads = 0;
    Future<List<dynamic>>? notificationReload;
    late StreamSubscription<String> subscription;
    await http.runWithClient(() async {
      subscription = SharedPersistenceSync.changes.listen((key) {
        if (key == SharedPersistenceSync.accountSecurityStateKey &&
            notificationReload == null) {
          notificationReload = DataService.getItems();
        }
      });
      final items = await DataService.getItems();
      await notificationReload;
      await subscription.cancel();

      expect(items.map((entry) => entry.id), [recoveredItem.id]);
      expect(notificationReload, isNotNull);
      expect(publicReads, 2);
      expect(privateReads, 1);
      expect(await AuthService.readSession(), isNull);
      expect(prefs.getString('currentUser'), currentUserRaw);
      expect(prefs.getString('users'), usersRaw);
      expect(prefs.getString('rental_requests'), requestsRaw);
      expect(prefs.getString('synthetic_unrelated_key'), 'keep-me');
      expect(prefs.getString('auth_session_v1'), isNull);
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                expect(request.headers['Authorization'], isNull);
                publicReads++;
                final item = publicReads == 1 ? cachedItem : recoveredItem;
                return http.Response(
                  jsonEncode({
                    'listings': <Map<String, dynamic>>[item.toJson()]
                  }),
                  200,
                );
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                expect(
                  request.headers['Authorization'],
                  'Bearer synthetic-access-cold',
                );
                privateReads++;
                return http.Response(
                  '{"error":"invalid_or_expired_session"}',
                  401,
                );
              }
              throw StateError(
                  'Unexpected cold-start request ${request.url.path}');
            }));

    expect(owner.userId, 'synthetic-owner-cold');
  });

  test('A public read returns its snapshot after exact A-to-guest clear',
      () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('public-read-clear');
    final publicItem = buildTestItem(
      id: 'synthetic-public-after-parallel-auth-clear',
      ownerId: 'synthetic-public-owner',
      title: 'Synthetic public catalog after clear',
    );
    final prefs = await SharedPreferences.getInstance();
    final usersRaw = '[{"unrelated":"users"}]';
    final requestsRaw = '[{"unrelated":"requests"}]';
    final cachedItemsRaw = '[{"unrelated":"catalog-cache"}]';
    await prefs.setString('users', usersRaw);
    await prefs.setString('rental_requests', requestsRaw);
    await prefs.setString('items', cachedItemsRaw);
    final publicStarted = Completer<void>();
    final releasePublic = Completer<void>();
    var publicReads = 0;
    var privateReads = 0;

    await http.runWithClient(() async {
      final aRead = DataService.getItems();
      await publicStarted.future;
      final receipt = await AuthService.clearSessionOwnerIfMatches(
        ownerA,
        runLogoutCleanup: false,
      );
      expect(receipt, isNotNull);
      releasePublic.complete();

      final items = await aRead;
      expect(items.map((entry) => entry.id), [publicItem.id]);
      expect(publicReads, 1);
      expect(privateReads, 0);
      expect(await AuthService.readSession(), isNull);
      expect(prefs.getString('users'), usersRaw);
      expect(prefs.getString('rental_requests'), requestsRaw);
      expect(prefs.getString('items'), isNot(cachedItemsRaw));
    },
        () => MockClient((request) async {
              expect(request.method, 'GET');
              if (request.url.path == '/api/v1/listings') {
                publicReads++;
                expect(request.headers['Authorization'], isNull);
                publicStarted.complete();
                await releasePublic.future;
                return http.Response(
                  jsonEncode({
                    'listings': <Map<String, dynamic>>[publicItem.toJson()],
                  }),
                  200,
                );
              }
              if (request.url.path == '/api/v1/listings/mine') privateReads++;
              throw StateError(
                  'Unexpected public-read request ${request.url.path}');
            }));
  });

  test('A public read never falls through after B replaces A', () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('public-read-a');
    final prefs = await SharedPreferences.getInstance();
    final cachedItemsRaw = '[{"preserve":"while B signs in"}]';
    await prefs.setString('items', cachedItemsRaw);
    final publicStarted = Completer<void>();
    final releasePublic = Completer<void>();
    var publicReads = 0;
    var privateReads = 0;

    await http.runWithClient(() async {
      final aRead = DataService.getItems();
      await publicStarted.future;
      final receipt = await AuthService.clearSessionOwnerIfMatches(
        ownerA,
        runLogoutCleanup: false,
      );
      expect(receipt, isNotNull);
      final ownerB = await _writeSession('public-read-b');
      expect(ownerB.userId, 'synthetic-owner-public-read-b');
      releasePublic.complete();

      await expectLater(aRead, throwsA(isA<StateError>()));
      expect(publicReads, 1);
      expect(privateReads, 0);
      expect(
        (await AuthService.readSession())?.sessionId,
        'synthetic-session-public-read-b',
      );
      expect(prefs.getString('items'), cachedItemsRaw);
    },
        () => MockClient((request) async {
              expect(request.method, 'GET');
              if (request.url.path == '/api/v1/listings') {
                publicReads++;
                publicStarted.complete();
                await releasePublic.future;
                return http.Response('{"listings":[]}', 200);
              }
              if (request.url.path == '/api/v1/listings/mine') privateReads++;
              throw StateError(
                  'Unexpected A-to-B public-read ${request.url.path}');
            }));
  });

  test('A invalid-session response cannot clear B or trigger guest retry',
      () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('a');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('users', '[{"retained":"users"}]');
    await prefs.setString('rental_requests', '[{"retained":"requests"}]');
    await prefs.setString('synthetic_unrelated_key', 'retained');
    final originalUsers = prefs.getString('users');
    final originalRequests = prefs.getString('rental_requests');
    final release401 = Completer<void>();
    final privateStarted = Completer<void>();
    var publicReads = 0;
    var privateReads = 0;

    await http.runWithClient(() async {
      final aRead = DataService.getItems();
      await privateStarted.future;

      final clearedA = await AuthService.clearSessionOwnerIfMatches(
        ownerA,
        runLogoutCleanup: false,
      );
      expect(clearedA, isNotNull);
      final ownerB = await _writeSession('b');
      expect(ownerB.userId, 'synthetic-owner-b');
      release401.complete();

      await expectLater(aRead, throwsA(isA<BackendException>()));
      expect(publicReads, 1);
      expect(privateReads, 1);
      expect((await AuthService.readSession())?.userId, 'synthetic-owner-b');
      expect(prefs.getString('users'), originalUsers);
      expect(prefs.getString('rental_requests'), originalRequests);
      expect(prefs.getString('synthetic_unrelated_key'), 'retained');
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                publicReads++;
                return http.Response('{"listings":[]}', 200);
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                expect(
                  request.headers['Authorization'],
                  'Bearer synthetic-access-a',
                );
                privateReads++;
                privateStarted.complete();
                await release401.future;
                return http.Response(
                  '{"error":"invalid_or_expired_session"}',
                  401,
                );
              }
              throw StateError('Unexpected A→B request ${request.url.path}');
            }));
  });

  test('guest retry finishing after B signs in is discarded', () async {
    if (!BackendConfig.enabled) return;
    await _writeSession('guest-transition');
    final prefs = await SharedPreferences.getInstance();
    final cachedItem = buildTestItem(
      id: 'synthetic-preserved-during-guest-transition',
      ownerId: 'synthetic-cached-owner',
    );
    final originalItems = jsonEncode(<Map<String, dynamic>>[
      cachedItem.toJson(),
    ]);
    await prefs.setString('items', originalItems);
    final guestRetryStarted = Completer<void>();
    final releaseGuestRetry = Completer<void>();
    var publicReads = 0;
    var privateReads = 0;

    await http.runWithClient(() async {
      final staleRead = DataService.getItems();
      await guestRetryStarted.future;
      final ownerB = await _writeSession('guest-transition-b');
      expect(ownerB.userId, 'synthetic-owner-guest-transition-b');
      releaseGuestRetry.complete();

      await expectLater(staleRead, throwsA(isA<StateError>()));
      expect(publicReads, 2);
      expect(privateReads, 1);
      expect(
        (await AuthService.readSession())?.sessionId,
        'synthetic-session-guest-transition-b',
      );
      expect(prefs.getString('items'), originalItems);
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                publicReads++;
                if (publicReads == 1) {
                  return http.Response('{"listings":[]}', 200);
                }
                expect(request.headers['Authorization'], isNull);
                guestRetryStarted.complete();
                await releaseGuestRetry.future;
                final item = buildTestItem(
                  id: 'synthetic-guest-response-after-switch',
                  ownerId: 'synthetic-guest-owner',
                );
                return http.Response(
                  jsonEncode({
                    'listings': <Map<String, dynamic>>[item.toJson()]
                  }),
                  200,
                );
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                privateReads++;
                return http.Response(
                  '{"error":"invalid_or_expired_session"}',
                  401,
                );
              }
              throw StateError(
                  'Unexpected guest-switch request ${request.url.path}');
            }));
  });

  test('transient 5xx preserves owner and propagates without public retry',
      () async {
    if (!BackendConfig.enabled) return;
    final owner = await _writeSession('server-error');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('synthetic_unrelated_key', 'keep-on-5xx');
    var publicReads = 0;
    var privateReads = 0;

    await http.runWithClient(() async {
      await expectLater(
        DataService.getItems(),
        throwsA(
          isA<BackendException>()
              .having((error) => error.statusCode, 'statusCode', 503)
              .having((error) => error.code, 'code', 'upstream_unavailable'),
        ),
      );
      expect(publicReads, 1);
      expect(privateReads, 1);
      expect((await AuthService.readSession())?.sessionId, owner.sessionId);
      expect(prefs.getString('synthetic_unrelated_key'), 'keep-on-5xx');
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                publicReads++;
                return http.Response('{"listings":[]}', 200);
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                privateReads++;
                return http.Response('{"error":"upstream_unavailable"}', 503);
              }
              throw StateError('Unexpected 5xx request ${request.url.path}');
            }));
  });

  test('unrelated 401 does not clear session or retry public catalog',
      () async {
    if (!BackendConfig.enabled) return;
    final owner = await _writeSession('other-401');
    var publicReads = 0;
    var privateReads = 0;

    await http.runWithClient(() async {
      await expectLater(
        DataService.getItems(),
        throwsA(
          isA<BackendException>()
              .having((error) => error.statusCode, 'statusCode', 401)
              .having((error) => error.code, 'code', 'authentication_required'),
        ),
      );
      expect(publicReads, 1);
      expect(privateReads, 1);
      expect((await AuthService.readSession())?.sessionId, owner.sessionId);
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                publicReads++;
                return http.Response('{"listings":[]}', 200);
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                privateReads++;
                return http.Response(
                    '{"error":"authentication_required"}', 401);
              }
              throw StateError('Unexpected 401 request ${request.url.path}');
            }));
  });

  test('network failure preserves owner and propagates without retry',
      () async {
    if (!BackendConfig.enabled) return;
    final owner = await _writeSession('network-error');
    var publicReads = 0;
    var privateReads = 0;

    await http.runWithClient(() async {
      await expectLater(
        DataService.getItems(),
        throwsA(isA<SocketException>()),
      );
      expect(publicReads, 1);
      expect(privateReads, 1);
      expect((await AuthService.readSession())?.sessionId, owner.sessionId);
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                publicReads++;
                return http.Response('{"listings":[]}', 200);
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                privateReads++;
                throw const SocketException('synthetic offline');
              }
              throw StateError(
                  'Unexpected network-error request ${request.url.path}');
            }));
  });
}
