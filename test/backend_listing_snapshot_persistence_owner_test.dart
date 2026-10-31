import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

Future<AuthSessionOwner> _writeSession(String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    _sessionJson(suffix, 'listing-access-$suffix'),
  );
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

String _sessionJson(String suffix, String accessToken) => jsonEncode(
      <String, Object?>{
        'userId': 'listing-owner-$suffix',
        'sessionId': 'listing-session-$suffix',
        'email': 'listing-owner-$suffix@example.invalid',
        'createdAt': '2026-10-31T10:00:00Z',
        'accessToken': accessToken,
        'refreshToken': 'listing-refresh-$suffix',
        'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
      },
    );

String _listingResponse(Iterable<Object> items) => jsonEncode({
      'listings': items.map((item) {
        if (item is Map<String, dynamic>) return item;
        return (item as dynamic).toJson() as Map<String, dynamic>;
      }).toList(),
    });

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

  test('stable A snapshot persists and returns A public plus private rows',
      () async {
    if (!BackendConfig.enabled) return;
    await _writeSession('a');
    final publicItem = buildTestItem(
      id: 'a-public-listing',
      ownerId: 'public-owner',
      title: 'A public listing',
    );
    final privateItem = buildTestItem(
      id: 'a-private-listing',
      ownerId: 'listing-owner-a',
      title: 'A private listing',
    );

    await http.runWithClient(() async {
      final items = await DataService.getItems();
      expect(items.map((item) => item.id).toSet(),
          {publicItem.id, privateItem.id});
      final prefs = await SharedPreferences.getInstance();
      expect(
        (jsonDecode(prefs.getString('items')!) as List)
            .map((row) => (row as Map)['id'])
            .toSet(),
        {publicItem.id, privateItem.id},
      );
      expect((await AuthService.readSession())?.sessionId, 'listing-session-a');
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                expect(request.headers['Authorization'], isNull);
                return http.Response(
                    _listingResponse([publicItem.toJson()]), 200);
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                expect(
                  request.headers['Authorization'],
                  'Bearer listing-access-a',
                );
                return http.Response(
                    _listingResponse([privateItem.toJson()]), 200);
              }
              throw StateError(
                  'Unexpected snapshot request ${request.url.path}');
            }));
  });

  test('confirmed A-to-guest recovery persists only repository public rows',
      () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('guest');
    final aPublicItem = buildTestItem(
      id: 'a-public-before-clear',
      ownerId: 'a-public-owner',
    );
    final priorPrivateCache = buildTestItem(
      id: 'stale-a-private-cache',
      ownerId: 'listing-owner-guest',
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'items',
      jsonEncode(<Object>[priorPrivateCache.toJson()]),
    );
    final publicReadStarted = Completer<void>();
    final releasePublicRead = Completer<void>();
    var listingReads = 0;
    var privateReads = 0;

    await http.runWithClient(() async {
      final pending = DataService.getItems();
      await publicReadStarted.future;
      expect(
        await AuthService.clearSessionOwnerIfMatches(
          ownerA,
          runLogoutCleanup: false,
        ),
        isNotNull,
      );
      releasePublicRead.complete();

      final items = await pending;
      expect(items.map((item) => item.id), [aPublicItem.id]);
      expect(listingReads, 1);
      expect(privateReads, 0);
      final cachedIds = (jsonDecode(prefs.getString('items')!) as List)
          .map((row) => (row as Map)['id']);
      expect(cachedIds, [aPublicItem.id]);
      expect(await AuthService.readSession(), isNull);
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                listingReads++;
                expect(request.headers['Authorization'], isNull);
                publicReadStarted.complete();
                await releasePublicRead.future;
                return http.Response(
                  _listingResponse([aPublicItem.toJson()]),
                  200,
                );
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                privateReads++;
              }
              throw StateError(
                  'Unexpected A-to-guest request ${request.url.path}');
            }));
  });

  test('A-to-B during private read rejects result and preserves cache bytes',
      () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('private-read');
    final oldCache = '[{"id":"synthetic-prior-cache-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('items', oldCache);
    final publicItem = buildTestItem(id: 'a-public-race', ownerId: 'a-owner');
    final privateItem = buildTestItem(id: 'a-private-race', ownerId: 'a-owner');
    final privateReadStarted = Completer<void>();
    final releasePrivateRead = Completer<void>();

    await http.runWithClient(() async {
      final pending = DataService.getItems();
      await privateReadStarted.future;
      expect(
        await AuthService.clearSessionOwnerIfMatches(
          ownerA,
          runLogoutCleanup: false,
        ),
        isNotNull,
      );
      await _writeSession('successor');
      releasePrivateRead.complete();

      await expectLater(pending, throwsA(isA<StateError>()));
      expect(prefs.getString('items'), oldCache);
      expect(
        (await AuthService.readSession())?.sessionId,
        'listing-session-successor',
      );
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                expect(request.headers['Authorization'], isNull);
                return http.Response(
                    _listingResponse([publicItem.toJson()]), 200);
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                expect(
                  request.headers['Authorization'],
                  'Bearer listing-access-private-read',
                );
                privateReadStarted.complete();
                await releasePrivateRead.future;
                return http.Response(
                    _listingResponse([privateItem.toJson()]), 200);
              }
              throw StateError('Unexpected A-to-B request ${request.url.path}');
            }));
  });

  test('A-to-B after cache write rolls back the entire A snapshot', () async {
    if (!BackendConfig.enabled) return;
    await _writeSession('write-race');
    final oldCache = '[{"id":"prior-cache-exact-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('items', oldCache);
    final publicItem = buildTestItem(id: 'a-public-written', ownerId: 'a');
    final privateItem = buildTestItem(id: 'a-private-written', ownerId: 'a');
    String? observedWrittenCache;
    DataService.afterNextListingPersistenceWriteForTesting((prefs) async {
      observedWrittenCache = prefs.getString('items');
      await prefs.setString(
        'auth_session_v1',
        _sessionJson('successor-write', 'listing-access-successor-write'),
      );
    });

    await http.runWithClient(() async {
      await expectLater(DataService.getItems(), throwsA(isA<StateError>()));
      expect(observedWrittenCache, contains('a-private-written'));
      expect(prefs.getString('items'), oldCache);
      expect(
        (await AuthService.readSession())?.sessionId,
        'listing-session-successor-write',
      );
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                return http.Response(
                    _listingResponse([publicItem.toJson()]), 200);
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                expect(
                  request.headers['Authorization'],
                  'Bearer listing-access-write-race',
                );
                return http.Response(
                    _listingResponse([privateItem.toJson()]), 200);
              }
              throw StateError(
                  'Unexpected A persistence request ${request.url.path}');
            }));
  });

  test('guest-to-B during persistence rejects and restores prior cache',
      () async {
    if (!BackendConfig.enabled) return;
    final oldCache = '[{"id":"guest-prior-cache-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('items', oldCache);
    final guestItem = buildTestItem(id: 'guest-public-row', ownerId: 'public');
    var privateReads = 0;
    DataService.afterNextListingPersistenceWriteForTesting((prefs) async {
      await prefs.setString(
        'auth_session_v1',
        _sessionJson('guest-successor', 'listing-access-guest-successor'),
      );
    });

    await http.runWithClient(() async {
      await expectLater(DataService.getItems(), throwsA(isA<StateError>()));
      expect(prefs.getString('items'), oldCache);
      expect(
        (await AuthService.readSession())?.sessionId,
        'listing-session-guest-successor',
      );
      expect(privateReads, 0);
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                expect(request.headers['Authorization'], isNull);
                return http.Response(
                    _listingResponse([guestItem.toJson()]), 200);
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                privateReads++;
              }
              throw StateError(
                  'Unexpected guest-to-B request ${request.url.path}');
            }));
  });

  test('persistence failure leaves exact prior cache bytes', () async {
    if (!BackendConfig.enabled) return;
    await _writeSession('failed-write');
    final oldCache = '[{"id":"persistence-prior-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('items', oldCache);
    final publicItem =
        buildTestItem(id: 'a-before-persist-failure', ownerId: 'a');
    final privateItem =
        buildTestItem(id: 'a-mine-before-persist-failure', ownerId: 'a');
    var afterWriteHookInvoked = false;
    DataService.afterNextListingPersistenceWriteForTesting((_) async {
      afterWriteHookInvoked = true;
    });
    DataService.failNextListingPersistenceForTesting();

    await http.runWithClient(() async {
      await expectLater(DataService.getItems(), throwsA(isA<StateError>()));
      expect(prefs.getString('items'), oldCache);
      expect(afterWriteHookInvoked, isFalse);
      final recovered = await DataService.getItems();
      expect(recovered.map((item) => item.id).toSet(),
          {publicItem.id, privateItem.id});
      expect(afterWriteHookInvoked, isFalse);
      expect((await AuthService.readSession())?.sessionId,
          'listing-session-failed-write');
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                return http.Response(
                    _listingResponse([publicItem.toJson()]), 200);
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings/mine') {
                expect(
                  request.headers['Authorization'],
                  'Bearer listing-access-failed-write',
                );
                return http.Response(
                    _listingResponse([privateItem.toJson()]), 200);
              }
              throw StateError(
                  'Unexpected failed-write request ${request.url.path}');
            }));
  });
}
