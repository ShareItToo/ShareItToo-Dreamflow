import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/message.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

final _accountA = buildTestUser(
  'thread-owner-a',
  name: 'Thread Owner A',
  email: 'thread-owner-a@example.invalid',
);
final _accountB = buildTestUser(
  'thread-owner-b',
  name: 'Thread Owner B',
  email: 'thread-owner-b@example.invalid',
);

String _sessionJson(User user, String suffix) => jsonEncode(<String, Object?>{
      'userId': user.id,
      'sessionId': 'thread-session-$suffix',
      'email': user.email,
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': 'thread-access-$suffix',
      'refreshToken': 'thread-refresh-$suffix',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    });

Future<void> _useAccount(User user, String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('currentUser', jsonEncode(user.toJson()));
  await prefs.setString('auth_session_v1', _sessionJson(user, suffix));
}

MessageThread _thread({required String id, required User participant}) =>
    MessageThread(
      id: id,
      requestId: 'request-$id',
      itemId: 'item-$id',
      itemTitle: 'Synthetic thread',
      user1Id: participant.id,
      user2Id: 'synthetic-counterparty',
      messages: <Message>[
        Message(
          id: 'message-$id',
          senderId: participant.id,
          text: 'Synthetic message',
          timestamp: DateTime.utc(2026, 10, 31),
        ),
      ],
      createdAt: DateTime.utc(2026, 10, 31),
    );

String _response(Iterable<MessageThread> threads) =>
    jsonEncode(<String, Object>{
      'threads': threads.map((thread) => thread.toJson()).toList(),
    });

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{
        'users': jsonEncode(<Object>[_accountA.toJson(), _accountB.toJson()]),
      }));

  test('stable authenticated owner reads and persists its thread snapshot',
      () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'a');
    final thread = _thread(id: 'stable-a-thread', participant: _accountA);
    await http.runWithClient(() async {
      final result = await DataService.getMessageThreadsForUser(_accountA.id);
      expect(result.map((entry) => entry.id), [thread.id]);
      final raw = (await SharedPreferences.getInstance())
          .getString('message_threads_v1')!;
      expect((jsonDecode(raw) as List).single['id'], thread.id);
    },
        () => MockClient((request) async {
              if (request.url.path == '/api/v1/listings' ||
                  request.url.path == '/api/v1/listings/mine') {
                return http.Response('{"listings":[]}', 200);
              }
              expect(request.method, 'GET');
              expect(request.url.path, '/api/v1/message-threads');
              expect(
                  request.headers['Authorization'], 'Bearer thread-access-a');
              return http.Response(_response([thread]), 200);
            }));
  });

  test('A to B before response rejects A rows and preserves exact cache bytes',
      () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'a-before-read');
    const oldCache = '[{"exact":"previous-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('message_threads_v1', oldCache);
    final readStarted = Completer<void>();
    final releaseRead = Completer<void>();
    final thread = _thread(id: 'a-during-read', participant: _accountA);

    await http.runWithClient(() async {
      final pending = DataService.getMessageThreadsForUser(_accountA.id);
      await readStarted.future;
      await _useAccount(_accountB, 'b-after-read');
      releaseRead.complete();
      await expectLater(pending, throwsA(isA<StateError>()));
      expect(prefs.getString('message_threads_v1'), oldCache);
    },
        () => MockClient((request) async {
              if (request.url.path == '/api/v1/listings' ||
                  request.url.path == '/api/v1/listings/mine') {
                return http.Response('{"listings":[]}', 200);
              }
              expect(request.headers['Authorization'],
                  'Bearer thread-access-a-before-read');
              readStarted.complete();
              await releaseRead.future;
              return http.Response(_response([thread]), 200);
            }));
  });

  test('logout before response rejects the thread snapshot', () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'logout-before-read');
    final ownerA = AuthService.captureSessionOwner(
      (await AuthService.readSession())!,
    );
    const oldCache = '[{"exact":"logout-prior-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('message_threads_v1', oldCache);
    final started = Completer<void>();
    final release = Completer<void>();
    final thread =
        _thread(id: 'thread-read-before-logout', participant: _accountA);

    await http.runWithClient(() async {
      final pending = DataService.getMessageThreadsForUser(_accountA.id);
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
      expect(prefs.getString('message_threads_v1'), oldCache);
    },
        () => MockClient((request) async {
              if (request.url.path == '/api/v1/listings' ||
                  request.url.path == '/api/v1/listings/mine') {
                return http.Response('{"listings":[]}', 200);
              }
              started.complete();
              await release.future;
              return http.Response(_response([thread]), 200);
            }));
  });

  test('A to B after write rolls back exact prior cache bytes', () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'a-after-write');
    const oldCache = '[{"exact":"previous-thread-cache"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('message_threads_v1', oldCache);
    final thread = _thread(id: 'a-before-rollback', participant: _accountA);
    String? observedWrite;
    DataService.afterNextMessageThreadPersistenceWriteForTesting((prefs) async {
      observedWrite = prefs.getString('message_threads_v1');
      await prefs.setString('currentUser', jsonEncode(_accountB.toJson()));
      await prefs.setString(
        'auth_session_v1',
        _sessionJson(_accountB, 'b-after-write'),
      );
    });

    await http.runWithClient(() async {
      await expectLater(
        DataService.getMessageThreadsForUser(_accountA.id),
        throwsA(isA<StateError>()),
      );
      expect(observedWrite, contains(thread.id));
      expect(prefs.getString('message_threads_v1'), oldCache);
    },
        () => MockClient(
              (request) async {
                if (request.url.path == '/api/v1/listings' ||
                    request.url.path == '/api/v1/listings/mine') {
                  return http.Response('{"listings":[]}', 200);
                }
                return http.Response(_response([thread]), 200);
              },
            ));
  });

  test('logout after write rolls back exact prior cache bytes', () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'logout-after-write');
    final ownerA = AuthService.captureSessionOwner(
      (await AuthService.readSession())!,
    );
    const oldCache = '[{"exact":"logout-rollback-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('message_threads_v1', oldCache);
    final thread =
        _thread(id: 'thread-write-before-logout', participant: _accountA);
    String? written;
    DataService.afterNextMessageThreadPersistenceWriteForTesting((prefs) async {
      written = prefs.getString('message_threads_v1');
      await AuthService.clearSessionOwnerIfMatches(
        ownerA,
        runLogoutCleanup: false,
      );
    });

    await http.runWithClient(() async {
      await expectLater(
        DataService.getMessageThreadsForUser(_accountA.id),
        throwsStateError,
      );
      expect(written, contains(thread.id));
      expect(prefs.getString('message_threads_v1'), oldCache);
    },
        () => MockClient((request) async {
              if (request.url.path == '/api/v1/listings' ||
                  request.url.path == '/api/v1/listings/mine') {
                return http.Response('{"listings":[]}', 200);
              }
              return http.Response(_response([thread]), 200);
            }));
  });

  test('remote failure never returns the global thread cache', () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'remote-failure');
    final stale = _thread(id: 'unproven-stale-thread', participant: _accountA);
    final prefs = await SharedPreferences.getInstance();
    final oldCache = jsonEncode(<Object>[stale.toJson()]);
    await prefs.setString('message_threads_v1', oldCache);

    await http.runWithClient(() async {
      await expectLater(
        DataService.getMessageThreadsForUser(_accountA.id),
        throwsA(isA<Exception>()),
      );
      expect(prefs.getString('message_threads_v1'), oldCache);
    },
        () => MockClient((request) async {
              if (request.url.path == '/api/v1/listings' ||
                  request.url.path == '/api/v1/listings/mine') {
                return http.Response('{"listings":[]}', 200);
              }
              return http.Response('{"error":"upstream_unavailable"}', 503);
            }));
  });

  test('guest thread snapshot is rejected without an authenticated GET',
      () async {
    if (!BackendConfig.enabled) return;
    var calls = 0;
    await http.runWithClient(() async {
      await expectLater(
        AuthService.clearSession(),
        completes,
      );
      await expectLater(
        BackendRepository.getMessageThreadsSnapshot(),
        throwsA(isA<Exception>()),
      );
      expect(calls, 0);
    },
        () => MockClient((request) async {
              calls++;
              throw StateError('Guest must not issue private thread reads');
            }));
  });
}
