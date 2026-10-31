import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

final _accountA = buildTestUser(
  'notification-owner-a',
  name: 'Notification Owner A',
  email: 'notification-owner-a@example.invalid',
);
final _accountB = buildTestUser(
  'notification-owner-b',
  name: 'Notification Owner B',
  email: 'notification-owner-b@example.invalid',
);

String _sessionJson(User user, String suffix) => jsonEncode(<String, Object?>{
      'userId': user.id,
      'sessionId': 'notification-session-$suffix',
      'email': user.email,
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': 'notification-access-$suffix',
      'refreshToken': 'notification-refresh-$suffix',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    });

Future<AuthSessionOwner> _useAccount(User user, String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('currentUser', jsonEncode(user.toJson()));
  await prefs.setString(
      'users',
      jsonEncode(<Object>[
        _accountA.toJson(),
        _accountB.toJson(),
      ]));
  await prefs.setString('auth_session_v1', _sessionJson(user, suffix));
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

Map<String, Object?> _notice(String id, User user) => <String, Object?>{
      'id': id,
      'userId': user.id,
      'category': 'bookings',
      'priority': 2,
      'title': 'Synthetic booking notice',
      'body': 'Synthetic private notification.',
      'ts': '2026-10-31T10:00:00Z',
      'read': false,
    };

String _response(Iterable<Map<String, Object?>> notices) =>
    jsonEncode(<String, Object>{'notifications': notices.toList()});

Future<void> _switchAccount(
  SharedPreferences prefs,
  User user,
  String suffix,
) async {
  await prefs.setString('currentUser', jsonEncode(user.toJson()));
  await prefs.setString('auth_session_v1', _sessionJson(user, suffix));
}

MockClient _mockClient({
  required User Function() currentUser,
  required Future<http.Response> Function() notificationResponse,
  required void Function() onNotificationRead,
}) =>
    MockClient((request) async {
      if (request.method == 'GET' && request.url.path == '/api/v1/auth/me') {
        return http.Response(
          jsonEncode(<String, Object>{'user': currentUser().toJson()}),
          200,
        );
      }
      if (request.method == 'GET' &&
          (request.url.path == '/api/v1/listings' ||
              request.url.path == '/api/v1/listings/mine')) {
        return http.Response('{"listings":[]}', 200);
      }
      if (request.method == 'GET' &&
          request.url.path == '/api/v1/notifications') {
        expect(
          request.headers['Authorization'],
          startsWith('Bearer notification-access-'),
        );
        onNotificationRead();
        return notificationResponse();
      }
      throw StateError(
          'Unexpected request ${request.method} ${request.url.path}');
    });

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

  test('stable owner snapshot normalizes, persists and returns its feed',
      () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'stable');
    final notice = _notice('stable-notice', _accountA);
    var notificationReads = 0;

    await http.runWithClient(() async {
      final feed = await DataService.getNotificationFeedForUser(_accountA.id);
      expect(feed.map((entry) => entry['id']), ['stable-notice']);
      expect(feed.single['userId'], _accountA.id);
      final raw =
          (await SharedPreferences.getInstance()).getString('notifications')!;
      expect((jsonDecode(raw) as List).single['id'], 'stable-notice');
      expect(notificationReads, 1);
    },
        () => _mockClient(
              currentUser: () => _accountA,
              notificationResponse: () async =>
                  http.Response(_response([notice]), 200),
              onNotificationRead: () => notificationReads++,
            ));
  });

  test('A to B before response rejects A and preserves exact cache bytes',
      () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'a-before-read');
    const oldCache = '[{"exact":"previous-notification-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('notifications', oldCache);
    final started = Completer<void>();
    final release = Completer<void>();
    var activeUser = _accountA;

    await http.runWithClient(() async {
      final pending = DataService.getNotificationFeedForUser(_accountA.id);
      await started.future;
      activeUser = _accountB;
      await _switchAccount(prefs, _accountB, 'b-after-read');
      release.complete();
      await expectLater(pending, throwsStateError);
      expect(prefs.getString('notifications'), oldCache);
    },
        () => _mockClient(
              currentUser: () => activeUser,
              notificationResponse: () async {
                await release.future;
                return http.Response(
                    _response([_notice('a-read-race', _accountA)]), 200);
              },
              onNotificationRead: () => started.complete(),
            ));
  });

  test('logout before response rejects A and preserves exact cache bytes',
      () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _useAccount(_accountA, 'logout-before-read');
    const oldCache = '[{"exact":"logout-prior-notification-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('notifications', oldCache);
    final started = Completer<void>();
    final release = Completer<void>();

    await http.runWithClient(() async {
      final pending = DataService.getNotificationFeedForUser(_accountA.id);
      await started.future;
      expect(
        await AuthService.clearSessionOwnerIfMatches(
          ownerA,
          runLogoutCleanup: false,
        ),
        isNotNull,
      );
      release.complete();
      await expectLater(pending, throwsStateError);
      expect(prefs.getString('notifications'), oldCache);
    },
        () => _mockClient(
              currentUser: () => _accountA,
              notificationResponse: () async {
                await release.future;
                return http.Response(
                    _response([_notice('logout-read-race', _accountA)]), 200);
              },
              onNotificationRead: () => started.complete(),
            ));
  });

  test('A to B after write rolls back exact prior bytes', () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'a-after-write');
    const oldCache = '[{"exact":"previous-notification-write-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('notifications', oldCache);
    final notice = _notice('a-write-race', _accountA);
    String? observedWrite;
    DataService.afterNextNotificationPersistenceWriteForTesting((prefs) async {
      observedWrite = prefs.getString('notifications');
      await _switchAccount(prefs, _accountB, 'b-after-write');
    });

    await http.runWithClient(() async {
      await expectLater(
        DataService.getNotificationFeedForUser(_accountA.id),
        throwsStateError,
      );
      expect(observedWrite, contains('a-write-race'));
      expect(prefs.getString('notifications'), oldCache);
    },
        () => _mockClient(
              currentUser: () => _accountA,
              notificationResponse: () async =>
                  http.Response(_response([notice]), 200),
              onNotificationRead: () {},
            ));
  });

  test('logout after write rolls back exact prior bytes', () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _useAccount(_accountA, 'logout-after-write');
    const oldCache = '[{"exact":"logout-prior-notification-write-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('notifications', oldCache);
    String? observedWrite;
    DataService.afterNextNotificationPersistenceWriteForTesting((prefs) async {
      observedWrite = prefs.getString('notifications');
      await AuthService.clearSessionOwnerIfMatches(
        ownerA,
        runLogoutCleanup: false,
      );
    });

    await http.runWithClient(() async {
      await expectLater(
        DataService.getNotificationFeedForUser(_accountA.id),
        throwsStateError,
      );
      expect(observedWrite, contains('logout-after-write'));
      expect(prefs.getString('notifications'), oldCache);
    },
        () => _mockClient(
              currentUser: () => _accountA,
              notificationResponse: () async => http.Response(
                _response([_notice('logout-after-write', _accountA)]),
                200,
              ),
              onNotificationRead: () {},
            ));
  });

  test('remote failure keeps exact cache bytes and returns no stale feed',
      () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'remote-failure');
    const oldCache = '[{"exact":"unproven-notification-cache"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('notifications', oldCache);

    await http.runWithClient(() async {
      await expectLater(
        DataService.getNotificationFeedForUser(_accountA.id),
        throwsA(isA<Exception>()),
      );
      expect(prefs.getString('notifications'), oldCache);
    },
        () => _mockClient(
              currentUser: () => _accountA,
              notificationResponse: () async =>
                  http.Response('{"error":"upstream_unavailable"}', 503),
              onNotificationRead: () {},
            ));
  });

  test('malformed successful feed fails closed without cache replacement',
      () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'malformed-feed');
    const oldCache = '[{"exact":"malformed-prior-cache"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('notifications', oldCache);

    await http.runWithClient(() async {
      await expectLater(
        DataService.getNotificationFeedForUser(_accountA.id),
        throwsA(isA<BackendException>()),
      );
      expect(prefs.getString('notifications'), oldCache);
    },
        () => _mockClient(
              currentUser: () => _accountA,
              notificationResponse: () async => http.Response(
                jsonEncode(<String, Object>{
                  'notifications': <Object>[
                    _notice('valid-notice', _accountA),
                    'not-an-object',
                  ],
                }),
                200,
              ),
              onNotificationRead: () {},
            ));
  });

  test('foreign-owner row is rejected before any feed cache write', () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'foreign-feed-row');
    const oldCache = '[{"exact":"foreign-row-prior-cache"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('notifications', oldCache);

    await http.runWithClient(() async {
      await expectLater(
        DataService.getNotificationFeedForUser(_accountA.id),
        throwsA(isA<BackendException>().having(
          (error) => error.code,
          'code',
          'notification_owner_mismatch',
        )),
      );
      expect(prefs.getString('notifications'), oldCache);
    },
        () => _mockClient(
              currentUser: () => _accountA,
              notificationResponse: () async => http.Response(
                _response([_notice('foreign-row', _accountB)]),
                200,
              ),
              onNotificationRead: () {},
            ));
  });

  test('guest feed fails closed without a request or cache fallback', () async {
    if (!BackendConfig.enabled) return;
    final prefs = await SharedPreferences.getInstance();
    const oldCache = '[{"exact":"guest-must-not-see-this"}]';
    await prefs.setString('notifications', oldCache);
    var calls = 0;

    await http.runWithClient(() async {
      await expectLater(AuthService.clearSession(), completes);
      await prefs.remove('currentUser');
      await expectLater(
        DataService.getNotificationFeedForUser(_accountA.id),
        throwsA(isA<Exception>()),
      );
      expect(calls, 0);
      expect(prefs.getString('notifications'), oldCache);
    },
        () => MockClient((_) async {
              calls++;
              throw StateError('Guest must not issue a private request');
            }));
  });
}
