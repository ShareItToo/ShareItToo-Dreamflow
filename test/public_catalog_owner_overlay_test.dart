import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

Future<AuthSessionOwner> _writeSession(String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    jsonEncode(<String, Object?>{
      'userId': 'catalog-owner-$suffix',
      'sessionId': 'catalog-session-$suffix',
      'email': 'catalog-owner-$suffix@example.invalid',
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': 'catalog-access-$suffix',
      'refreshToken': 'catalog-refresh-$suffix',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    }),
  );
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('stable authenticated block-overlay failure fails closed', () async {
    if (!BackendConfig.enabled) return;
    final owner = await _writeSession('stable-error');
    var listingReads = 0;
    var blockReads = 0;

    await http.runWithClient(() async {
      await expectLater(
        DataService.getPublicItems(),
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
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                listingReads++;
                expect(
                  request.headers['Authorization'],
                  'Bearer catalog-access-stable-error',
                );
                final item = buildTestItem(
                  id: 'stable-listing',
                  ownerId: 'stable-listing-owner',
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
                  'Bearer catalog-access-stable-error',
                );
                return http.Response('{"error":"upstream_unavailable"}', 503);
              }
              throw StateError(
                  'Unexpected stable-overlay request ${request.url.path}');
            }));
  });

  test('A-to-guest transition retries catalog with guest block overlay',
      () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('guest');
    final principalA =
        LocalPrincipalScope.fromSession(await AuthService.readSession());
    final listingA = buildTestItem(
      id: 'public-listing-after-a-clear',
      ownerId: 'public-owner',
      title: 'Public listing after clear',
    );
    final listingGuest = buildTestItem(
      id: 'public-listing-as-guest',
      ownerId: 'guest-public-owner',
      title: 'Guest public listing',
    );
    final blockReadStarted = Completer<void>();
    final releaseBlockRead = Completer<void>();
    var listingReads = 0;
    var blockReads = 0;

    await http.runWithClient(() async {
      final pending = DataService.getPublicItems();
      await blockReadStarted.future;
      final receipt = await AuthService.clearSessionOwnerIfMatches(
        ownerA,
        runLogoutCleanup: false,
      );
      expect(receipt, isNotNull);
      releaseBlockRead.complete();

      final items = await pending;
      expect(items.map((item) => item.id), [listingGuest.id]);
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
                if (listingReads == 1) {
                  expect(
                    request.headers['Authorization'],
                    'Bearer catalog-access-guest',
                  );
                  return http.Response(
                    jsonEncode({
                      'listings': <Map<String, dynamic>>[listingA.toJson()]
                    }),
                    200,
                  );
                }
                expect(request.headers['Authorization'], isNull);
                return http.Response(
                  jsonEncode({
                    'listings': <Map<String, dynamic>>[listingGuest.toJson()]
                  }),
                  200,
                );
              }
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/user-blocks') {
                blockReads++;
                expect(
                  request.headers['Authorization'],
                  'Bearer catalog-access-guest',
                );
                blockReadStarted.complete();
                await releaseBlockRead.future;
                return http.Response(
                  jsonEncode({
                    'blocks': <Map<String, String>>[
                      {'userId': 'a-only-blocked-owner'},
                    ]
                  }),
                  200,
                );
              }
              throw StateError(
                  'Unexpected A-to-guest request ${request.url.path}');
            }));
  });

  test('A block overlay is never applied after B replaces A', () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _writeSession('a');
    final principalA =
        LocalPrincipalScope.fromSession(await AuthService.readSession());
    final listingA = buildTestItem(
      id: 'a-public-listing',
      ownerId: 'a-public-owner',
    );
    final bVisible = buildTestItem(
      id: 'b-visible-listing',
      ownerId: 'b-visible-owner',
    );
    final bHidden = buildTestItem(
      id: 'b-hidden-listing',
      ownerId: 'b-hidden-owner',
    );
    final aBlockReadStarted = Completer<void>();
    final releaseABlockRead = Completer<void>();
    var listingReads = 0;
    var blockReads = 0;

    await http.runWithClient(() async {
      final pending = DataService.getPublicItems();
      await aBlockReadStarted.future;
      final receipt = await AuthService.clearSessionOwnerIfMatches(
        ownerA,
        runLogoutCleanup: false,
      );
      expect(receipt, isNotNull);
      final ownerB = await _writeSession('b');
      final principalB =
          LocalPrincipalScope.fromSession(await AuthService.readSession());
      releaseABlockRead.complete();

      final items = await pending;
      expect(items.map((item) => item.id), [bVisible.id]);
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
        ['b-hidden-owner'],
      );
    },
        () => MockClient((request) async {
              if (request.method == 'GET' &&
                  request.url.path == '/api/v1/listings') {
                listingReads++;
                if (listingReads == 1) {
                  expect(
                    request.headers['Authorization'],
                    'Bearer catalog-access-a',
                  );
                  return http.Response(
                    jsonEncode({
                      'listings': <Map<String, dynamic>>[listingA.toJson()]
                    }),
                    200,
                  );
                }
                expect(
                  request.headers['Authorization'],
                  'Bearer catalog-access-b',
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
                    'Bearer catalog-access-a',
                  );
                  aBlockReadStarted.complete();
                  await releaseABlockRead.future;
                  return http.Response(
                    '{"blocks":[{"userId":"a-only-blocked-owner"}]}',
                    200,
                  );
                }
                expect(
                  request.headers['Authorization'],
                  'Bearer catalog-access-b',
                );
                return http.Response(
                  '{"blocks":[{"userId":"b-hidden-owner"}]}',
                  200,
                );
              }
              throw StateError('Unexpected A-to-B request ${request.url.path}');
            }));
  });
}
