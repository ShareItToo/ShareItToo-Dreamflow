import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_realtime_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

Future<AuthSessionOwner> _writeSession(String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    jsonEncode(<String, Object?>{
      'userId': 'search-owner-$suffix',
      'sessionId': 'search-session-$suffix',
      'email': 'search-owner-$suffix@example.invalid',
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': 'search-access-$suffix',
      'refreshToken': 'search-refresh-$suffix',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    }),
  );
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await BackendRealtimeService.disconnect();
  });

  tearDown(() => BackendRealtimeService.disconnect());

  test('stable authenticated search overlay failure fails closed', () async {
    if (!BackendConfig.enabled) return;
    final owner = await _writeSession('stable');
    var listingReads = 0;
    var blockReads = 0;

    await http.runWithClient(
      () async {
        await expectLater(
          DataService.searchPublicItems(
            query: 'synthetic query',
            sort: 'price_asc',
          ),
          throwsA(
            isA<BackendException>()
                .having((error) => error.statusCode, 'statusCode', 503)
                .having((error) => error.code, 'code', 'upstream_unavailable'),
          ),
        );
        expect(listingReads, 1);
        expect(blockReads, 1);
        expect((await AuthService.readSession())?.sessionId, owner.sessionId);
      },
      () => MockClient((request) async {
        if (request.method == 'GET' && request.url.path == '/api/v1/listings') {
          listingReads++;
          expect(request.url.queryParameters['q'], 'synthetic query');
          expect(request.url.queryParameters['sort'], 'price_asc');
          expect(
            request.headers['Authorization'],
            'Bearer search-access-stable',
          );
          final item = buildTestItem(
            id: 'stable-search-listing',
            ownerId: 'stable-search-owner',
          );
          return http.Response(
            jsonEncode({
              'listings': <Map<String, dynamic>>[item.toJson()]
            }),
            200,
          );
        }
        if (request.method == 'GET' &&
            request.url.path == '/api/v1/user-blocks') {
          blockReads++;
          expect(
            request.headers['Authorization'],
            'Bearer search-access-stable',
          );
          return http.Response('{"error":"upstream_unavailable"}', 503);
        }
        throw StateError('Unexpected search request ${request.url.path}');
      }),
    );
  });

  test('A-to-guest retries the complete search with guest-local overlay',
      () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('guest');
    final principalA =
        LocalPrincipalScope.fromSession(await AuthService.readSession());
    final itemA = buildTestItem(id: 'a-result', ownerId: 'a-owner');
    final guestItem = buildTestItem(id: 'guest-result', ownerId: 'guest-owner');
    final blockReadStarted = Completer<void>();
    final releaseBlockRead = Completer<void>();
    var listingReads = 0;
    var blockReads = 0;

    await http.runWithClient(() async {
      final pending = DataService.searchPublicItems(
        query: 'portable',
        categoryIds: const ['cat-1'],
        conditions: const ['good'],
        minPrice: 2,
        maxPrice: 20,
        latitude: 49.1,
        longitude: 9.2,
        radiusKm: 60,
        sort: 'distance',
        limit: 7,
      );
      await blockReadStarted.future;
      expect(
        await AuthService.clearSessionOwnerIfMatches(
          ownerA,
          runLogoutCleanup: false,
        ),
        isNotNull,
      );
      releaseBlockRead.complete();

      final results = await pending;
      expect(results.map((item) => item.id), [guestItem.id]);
      expect(listingReads, 2);
      expect(blockReads, 1);
      expect(await AuthService.readSession(), isNull);
      expect(
        await LocalSafetyPrivacyService.getBlockedUserIdsForPrincipal(
          principalA,
        ),
        isEmpty,
      );
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                listingReads++;
                expect(request.url.queryParameters['q'], 'portable');
                expect(request.url.queryParameters['categories'], 'cat-1');
                expect(request.url.queryParameters['conditions'], 'good');
                expect(request.url.queryParameters['minPrice'], '2.0');
                expect(request.url.queryParameters['maxPrice'], '20.0');
                expect(request.url.queryParameters['lat'], '49.1');
                expect(request.url.queryParameters['lng'], '9.2');
                expect(request.url.queryParameters['radiusKm'], '60.0');
                expect(request.url.queryParameters['sort'], 'distance');
                expect(request.url.queryParameters['limit'], '7');
                if (listingReads == 1) {
                  expect(
                    request.headers['Authorization'],
                    'Bearer search-access-guest',
                  );
                  return http.Response(
                    jsonEncode({
                      'listings': <Map<String, dynamic>>[itemA.toJson()]
                    }),
                    200,
                  );
                }
                expect(request.headers['Authorization'], isNull);
                return http.Response(
                  jsonEncode({
                    'listings': <Map<String, dynamic>>[guestItem.toJson()]
                  }),
                  200,
                );
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/user-blocks') {
                blockReads++;
                expect(
                  request.headers['Authorization'],
                  'Bearer search-access-guest',
                );
                blockReadStarted.complete();
                await releaseBlockRead.future;
                return http.Response(
                  '{"blocks":[{"userId":"a-only-blocked-owner"}]}',
                  200,
                );
              }
              throw StateError(
                  'Unexpected A-to-guest request ${request.url.path}');
            }));
  });

  test('A-to-B search discards A rows and uses B overlay', () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('a');
    final principalA =
        LocalPrincipalScope.fromSession(await AuthService.readSession());
    final aItem = buildTestItem(id: 'a-search-result', ownerId: 'a-owner');
    final bVisible =
        buildTestItem(id: 'b-search-visible', ownerId: 'b-visible');
    final bHidden = buildTestItem(id: 'b-search-hidden', ownerId: 'b-hidden');
    final aBlockReadStarted = Completer<void>();
    final releaseABlockRead = Completer<void>();
    var listingReads = 0;
    var blockReads = 0;

    await http.runWithClient(() async {
      final pending = DataService.searchPublicItems(query: 'camera');
      await aBlockReadStarted.future;
      expect(
        await AuthService.clearSessionOwnerIfMatches(
          ownerA,
          runLogoutCleanup: false,
        ),
        isNotNull,
      );
      final ownerB = await _writeSession('b');
      final principalB =
          LocalPrincipalScope.fromSession(await AuthService.readSession());
      releaseABlockRead.complete();

      final results = await pending;
      expect(results.map((item) => item.id), [bVisible.id]);
      expect(listingReads, 2);
      expect(blockReads, 2);
      expect((await AuthService.readSession())?.sessionId, ownerB.sessionId);
      expect(
        await LocalSafetyPrivacyService.getBlockedUserIdsForPrincipal(
          principalA,
        ),
        isEmpty,
      );
      expect(
        await LocalSafetyPrivacyService.getBlockedUserIdsForPrincipal(
          principalB,
        ),
        ['b-hidden'],
      );
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                listingReads++;
                expect(request.url.queryParameters['q'], 'camera');
                if (listingReads == 1) {
                  expect(
                    request.headers['Authorization'],
                    'Bearer search-access-a',
                  );
                  return http.Response(
                    jsonEncode({
                      'listings': <Map<String, dynamic>>[aItem.toJson()]
                    }),
                    200,
                  );
                }
                expect(
                  request.headers['Authorization'],
                  'Bearer search-access-b',
                );
                return http.Response(
                  jsonEncode({
                    'listings': <Map<String, dynamic>>[
                      bVisible.toJson(),
                      bHidden.toJson(),
                    ],
                  }),
                  200,
                );
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/user-blocks') {
                blockReads++;
                if (blockReads == 1) {
                  expect(
                    request.headers['Authorization'],
                    'Bearer search-access-a',
                  );
                  aBlockReadStarted.complete();
                  await releaseABlockRead.future;
                  return http.Response(
                    '{"blocks":[{"userId":"a-hidden"}]}',
                    200,
                  );
                }
                expect(
                  request.headers['Authorization'],
                  'Bearer search-access-b',
                );
                return http.Response(
                  '{"blocks":[{"userId":"b-hidden"}]}',
                  200,
                );
              }
              throw StateError('Unexpected A-to-B request ${request.url.path}');
            }));
  });

  test('exact invalid search session clears and quiesces only its transport',
      () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('expired');
    final aItem = buildTestItem(id: 'expired-a-result', ownerId: 'a-owner');
    final guestItem = buildTestItem(
      id: 'guest-search-after-clear',
      ownerId: 'guest-search-owner',
    );
    BackendRealtimeService.scheduleReconnectForTesting(
      'search-access-expired',
    );
    var listingReads = 0;
    var blockReads = 0;

    await http.runWithClient(() async {
      final results = await DataService.searchPublicItems(query: 'tripod');
      expect(results.map((item) => item.id), [guestItem.id]);
      expect(listingReads, 2);
      expect(blockReads, 1);
      expect(await AuthService.readSession(), isNull);
      expect(BackendRealtimeService.hasScheduledReconnectForTesting, isFalse);
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                listingReads++;
                expect(request.url.queryParameters['q'], 'tripod');
                if (listingReads == 1) {
                  expect(
                    request.headers['Authorization'],
                    'Bearer search-access-expired',
                  );
                  expect(ownerA.sessionId, 'search-session-expired');
                  return http.Response(
                    jsonEncode({
                      'listings': <Map<String, dynamic>>[aItem.toJson()]
                    }),
                    200,
                  );
                }
                expect(request.headers['Authorization'], isNull);
                return http.Response(
                  jsonEncode({
                    'listings': <Map<String, dynamic>>[guestItem.toJson()]
                  }),
                  200,
                );
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/user-blocks') {
                blockReads++;
                expect(
                  request.headers['Authorization'],
                  'Bearer search-access-expired',
                );
                return http.Response(
                  '{"error":"invalid_or_expired_session"}',
                  401,
                );
              }
              throw StateError(
                  'Unexpected invalid-session request ${request.url.path}');
            }));
  });
}
