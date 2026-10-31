import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

final _ownerA = buildTestUser(
  'notification-mutation-owner-a',
  name: 'Notification Mutation Owner A',
  email: 'notification-mutation-owner-a@example.invalid',
);
final _ownerB = buildTestUser(
  'notification-mutation-owner-b',
  name: 'Notification Mutation Owner B',
  email: 'notification-mutation-owner-b@example.invalid',
);

String _sessionJson(User user, String suffix) => jsonEncode(<String, Object?>{
      'userId': user.id,
      'sessionId': 'notification-mutation-session-$suffix',
      'email': user.email,
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': 'notification-mutation-access-$suffix',
      'refreshToken': 'notification-mutation-refresh-$suffix',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    });

Future<AuthSessionOwner> _useOwner(User user, String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('currentUser', jsonEncode(user.toJson()));
  await prefs.setString(
    'users',
    jsonEncode(<Object>[_ownerA.toJson(), _ownerB.toJson()]),
  );
  await prefs.setString('auth_session_v1', _sessionJson(user, suffix));
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

Map<String, Object?> _notice([User? user]) => <String, Object?>{
      'id': 'synthetic-notification',
      'userId': (user ?? _ownerA).id,
      'category': 'bookings',
      'priority': 2,
      'title': 'Synthetic notice',
      'body': 'Private synthetic notification.',
      'ts': '2026-10-31T10:00:00Z',
      'read': false,
      'archived': false,
    };

String _cacheBytes() => jsonEncode(<Map<String, Object?>>[_notice()]);

String _cacheBytesWithWhitespace() => '[ ${jsonEncode(_notice())} ]';

final class _ActionCase {
  const _ActionCase({
    required this.name,
    required this.method,
    required this.path,
    required this.expectedBody,
    required this.run,
  });

  final String name;
  final String method;
  final String path;
  final Map<String, Object?> expectedBody;
  final Future<void> Function(AuthSessionOwner owner) run;

  bool matches(Map<String, dynamic> row) => switch (name) {
        'mark-one-read' => row['read'] == true,
        'mark-all-read' => row['read'] == true,
        'archive' => row['archived'] == true,
        _ => false,
      };
}

final _actions = <_ActionCase>[
  _ActionCase(
    name: 'mark-one-read',
    method: 'PATCH',
    path: '/api/v1/notifications/synthetic-notification',
    expectedBody: <String, Object?>{'read': true},
    run: (owner) => DataService.markNotificationRead(
      userId: _ownerA.id,
      notificationId: 'synthetic-notification',
      expectedSessionOwner: owner,
    ),
  ),
  _ActionCase(
    name: 'mark-all-read',
    method: 'POST',
    path: '/api/v1/notifications/read-all',
    expectedBody: const <String, Object?>{},
    run: (owner) => DataService.markAllNotificationsRead(
      _ownerA.id,
      expectedSessionOwner: owner,
    ),
  ),
  _ActionCase(
    name: 'archive',
    method: 'PATCH',
    path: '/api/v1/notifications/synthetic-notification',
    expectedBody: <String, Object?>{'archived': true},
    run: (owner) => DataService.archiveNotification(
      userId: _ownerA.id,
      notificationId: 'synthetic-notification',
      expectedSessionOwner: owner,
    ),
  ),
];

MockClient _client({
  required User Function() currentUser,
  required Future<int> Function() mutationStatus,
  required void Function() onMutation,
  required _ActionCase action,
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
      if (request.method == action.method && request.url.path == action.path) {
        expect(
          request.headers['Authorization'],
          startsWith('Bearer notification-mutation-access-a'),
        );
        if (request.body.isNotEmpty) {
          expect(jsonDecode(request.body), action.expectedBody);
        } else {
          expect(action.expectedBody, isEmpty);
        }
        onMutation();
        final status = await mutationStatus();
        return http.Response(
          status == 200 ? '{"ok":true}' : '{"error":"synthetic_failure"}',
          status,
        );
      }
      throw StateError(
        'Unexpected request ${request.method} ${request.url.path}',
      );
    });

Future<void> _switchToB(SharedPreferences prefs) async {
  await prefs.setString('currentUser', jsonEncode(_ownerB.toJson()));
  await prefs.setString('auth_session_v1', _sessionJson(_ownerB, 'successor'));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

  for (final action in _actions) {
    test('${action.name}: delayed remote success is owner-bound and persists',
        () async {
      if (!BackendConfig.enabled) return;
      final owner = await _useOwner(_ownerA, 'a');
      final prefs = await SharedPreferences.getInstance();
      final prior = _cacheBytes();
      await prefs.setString('notifications', prior);
      final requested = Completer<void>();
      final release = Completer<int>();

      await http.runWithClient(() async {
        final pending = action.run(owner);
        await requested.future;
        release.complete(200);
        await pending;
        final stored = jsonDecode(prefs.getString('notifications')!) as List;
        expect(
            action.matches(Map<String, dynamic>.from(stored.single)), isTrue);
      },
          () => _client(
                currentUser: () => _ownerA,
                mutationStatus: () => release.future,
                onMutation: () => requested.complete(),
                action: action,
              ));
    });

    for (final status in [401, 503]) {
      test('${action.name}: late $status leaves exact cache untouched',
          () async {
        if (!BackendConfig.enabled) return;
        final owner = await _useOwner(_ownerA, 'a-status-$status');
        final prefs = await SharedPreferences.getInstance();
        final prior = _cacheBytesWithWhitespace();
        await prefs.setString('notifications', prior);
        final requested = Completer<void>();
        final release = Completer<int>();

        await http.runWithClient(() async {
          final pending = action.run(owner);
          await requested.future;
          release.complete(status);
          await expectLater(pending, throwsA(isA<Exception>()));
          expect(prefs.getString('notifications'), prior);
        },
            () => _client(
                  currentUser: () => _ownerA,
                  mutationStatus: () => release.future,
                  onMutation: () => requested.complete(),
                  action: action,
                ));
      });
    }

    for (final successor in ['account-b', 'logout']) {
      test('${action.name}: late 200 cannot persist after $successor switch',
          () async {
        if (!BackendConfig.enabled) return;
        final owner = await _useOwner(_ownerA, 'a-before-$successor');
        final prefs = await SharedPreferences.getInstance();
        final prior = _cacheBytesWithWhitespace();
        await prefs.setString('notifications', prior);
        final requested = Completer<void>();
        final release = Completer<int>();
        var activeUser = _ownerA;

        await http.runWithClient(() async {
          final pending = action.run(owner);
          await requested.future;
          if (successor == 'account-b') {
            activeUser = _ownerB;
            await _switchToB(prefs);
          } else {
            await AuthService.clearSessionOwnerIfMatches(
              owner,
              runLogoutCleanup: false,
            );
          }
          release.complete(200);
          await expectLater(pending, throwsStateError);
          expect(prefs.getString('notifications'), prior);
        },
            () => _client(
                  currentUser: () => activeUser,
                  mutationStatus: () => release.future,
                  onMutation: () => requested.complete(),
                  action: action,
                ));
      });
    }

    for (final successor in ['account-b', 'logout', 'account-b-cache']) {
      test('${action.name}: $successor after write preserves cache ownership',
          () async {
        if (!BackendConfig.enabled) return;
        final owner = await _useOwner(_ownerA, 'a-after-write-$successor');
        final prefs = await SharedPreferences.getInstance();
        final prior = _cacheBytesWithWhitespace();
        final successorCache = jsonEncode(<Map<String, Object?>>[
          _notice(_ownerB),
        ]);
        await prefs.setString('notifications', prior);
        var activeUser = _ownerA;
        DataService.afterNextNotificationPersistenceWriteForTesting(
            (prefs) async {
          if (successor == 'account-b') {
            activeUser = _ownerB;
            await _switchToB(prefs);
          } else if (successor == 'account-b-cache') {
            activeUser = _ownerB;
            await _switchToB(prefs);
            await prefs.setString('notifications', successorCache);
          } else {
            await AuthService.clearSessionOwnerIfMatches(
              owner,
              runLogoutCleanup: false,
            );
          }
        });

        await http.runWithClient(() async {
          await expectLater(action.run(owner), throwsStateError);
          expect(
            prefs.getString('notifications'),
            successor == 'account-b-cache' ? successorCache : prior,
          );
        },
            () => _client(
                  currentUser: () => activeUser,
                  mutationStatus: () async => 200,
                  onMutation: () {},
                  action: action,
                ));
      });
    }
  }
}
