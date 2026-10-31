import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

final _accountA = buildTestUser(
  'rental-owner-a',
  name: 'Rental Owner A',
  email: 'rental-owner-a@example.invalid',
);
final _accountB = buildTestUser(
  'rental-owner-b',
  name: 'Rental Owner B',
  email: 'rental-owner-b@example.invalid',
);

String _sessionJson(User user, String suffix) => jsonEncode(<String, Object?>{
      'userId': user.id,
      'sessionId': 'rental-session-$suffix',
      'email': user.email,
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': 'rental-access-$suffix',
      'refreshToken': 'rental-refresh-$suffix',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    });

Future<AuthSessionOwner> _useAccount(User user, String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('currentUser', jsonEncode(user.toJson()));
  await prefs.setString('auth_session_v1', _sessionJson(user, suffix));
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

RentalRequest _request(String id, User owner) => buildTestRequest(
      id: id,
      itemId: 'item-$id',
      ownerId: owner.id,
      renterId: 'synthetic-renter',
      status: 'pending',
    );

String _response(Iterable<RentalRequest> requests) =>
    jsonEncode(<String, Object>{
      'requests': requests.map((request) => request.toJson()).toList(),
    });

Future<void> _writeCurrentUserAndSession(
  SharedPreferences prefs,
  User user,
  String suffix,
) async {
  await prefs.setString('currentUser', jsonEncode(user.toJson()));
  await prefs.setString('auth_session_v1', _sessionJson(user, suffix));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{
        'users': jsonEncode(<Object>[_accountA.toJson(), _accountB.toJson()]),
      }));

  test('stable authenticated snapshot persists and returns the owner rows',
      () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'stable');
    final request = _request('stable-request', _accountA);
    await http.runWithClient(() async {
      final result = await DataService.getAllRentalRequestsForTesting();
      expect(result.map((entry) => entry.id), [request.id]);
      final raw =
          (await SharedPreferences.getInstance()).getString('rental_requests')!;
      expect((jsonDecode(raw) as List).single['id'], request.id);
    },
        () => MockClient((httpRequest) async {
              expect(httpRequest.method, 'GET');
              expect(httpRequest.url.path, '/api/v1/rental-requests');
              expect(httpRequest.headers['Authorization'],
                  'Bearer rental-access-stable');
              return http.Response(_response([request]), 200);
            }));
  });

  test('A to B before response rejects A rows and preserves cache bytes',
      () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'a-before-read');
    const oldCache = '[{"exact":"prior-rental-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rental_requests', oldCache);
    final started = Completer<void>();
    final release = Completer<void>();
    final request = _request('a-read-race', _accountA);

    await http.runWithClient(() async {
      final pending = DataService.getAllRentalRequestsForTesting();
      await started.future;
      await _writeCurrentUserAndSession(prefs, _accountB, 'b-after-read');
      release.complete();
      await expectLater(pending, throwsStateError);
      expect(prefs.getString('rental_requests'), oldCache);
    },
        () => MockClient((httpRequest) async {
              expect(httpRequest.headers['Authorization'],
                  'Bearer rental-access-a-before-read');
              started.complete();
              await release.future;
              return http.Response(_response([request]), 200);
            }));
  });

  test('logout before response rejects the rental snapshot', () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _useAccount(_accountA, 'logout-before-read');
    const oldCache = '[{"exact":"logout-prior-rental-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rental_requests', oldCache);
    final started = Completer<void>();
    final release = Completer<void>();
    final request = _request('logout-read-race', _accountA);

    await http.runWithClient(() async {
      final pending = DataService.getAllRentalRequestsForTesting();
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
      expect(prefs.getString('rental_requests'), oldCache);
    },
        () => MockClient((httpRequest) async {
              started.complete();
              await release.future;
              return http.Response(_response([request]), 200);
            }));
  });

  test('A to B after write rolls back exact prior bytes', () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'a-after-write');
    const oldCache = '[{"exact":"prior-after-write-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rental_requests', oldCache);
    final request = _request('a-write-race', _accountA);
    String? observedWrite;
    DataService.afterNextRentalRequestPersistenceWriteForTesting((prefs) async {
      observedWrite = prefs.getString('rental_requests');
      await _writeCurrentUserAndSession(prefs, _accountB, 'b-after-write');
    });

    await http.runWithClient(() async {
      await expectLater(
        DataService.getAllRentalRequestsForTesting(),
        throwsStateError,
      );
      expect(observedWrite, contains(request.id));
      expect(prefs.getString('rental_requests'), oldCache);
    }, () => MockClient((_) async => http.Response(_response([request]), 200)));
  });

  test('logout after write rolls back exact prior bytes', () async {
    if (!BackendConfig.enabled) return;
    final ownerA = await _useAccount(_accountA, 'logout-after-write');
    const oldCache = '[{"exact":"logout-after-write-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rental_requests', oldCache);
    final request = _request('logout-write-race', _accountA);
    String? observedWrite;
    DataService.afterNextRentalRequestPersistenceWriteForTesting((prefs) async {
      observedWrite = prefs.getString('rental_requests');
      await AuthService.clearSessionOwnerIfMatches(
        ownerA,
        runLogoutCleanup: false,
      );
    });

    await http.runWithClient(() async {
      await expectLater(
        DataService.getAllRentalRequestsForTesting(),
        throwsStateError,
      );
      expect(observedWrite, contains(request.id));
      expect(prefs.getString('rental_requests'), oldCache);
    }, () => MockClient((_) async => http.Response(_response([request]), 200)));
  });

  test('stable owner-bound read persists only while exact owner stays current',
      () async {
    if (!BackendConfig.enabled) return;
    final owner = await _useAccount(_accountA, 'owner-read');
    final request = _request('owner-bound-request', _accountA);
    await http.runWithClient(() async {
      final result = await DataService.getAllRentalRequestsForOwnerForTesting(
        owner: owner,
        verifyAuthorization: () async {
          if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
            throw StateError('principal_changed');
          }
        },
      );
      expect(result.map((entry) => entry.id), [request.id]);
      final raw =
          (await SharedPreferences.getInstance()).getString('rental_requests')!;
      expect((jsonDecode(raw) as List).single['id'], request.id);
    }, () => MockClient((_) async => http.Response(_response([request]), 200)));
  });

  test('owner-bound A to B during cache write restores prior bytes', () async {
    if (!BackendConfig.enabled) return;
    final owner = await _useAccount(_accountA, 'owner-write-race');
    const oldCache = '[{"exact":"owner-prior-bytes"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rental_requests', oldCache);
    final request = _request('owner-write-race-request', _accountA);
    DataService.afterNextRentalRequestPersistenceWriteForTesting((prefs) async {
      await _writeCurrentUserAndSession(
          prefs, _accountB, 'owner-write-successor');
    });

    await http.runWithClient(() async {
      await expectLater(
        DataService.getAllRentalRequestsForOwnerForTesting(
          owner: owner,
          verifyAuthorization: () async {
            if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
              throw StateError('principal_changed');
            }
          },
        ),
        throwsStateError,
      );
      expect(prefs.getString('rental_requests'), oldCache);
    }, () => MockClient((_) async => http.Response(_response([request]), 200)));
  });

  test('backend failure never returns a cached rental-request document',
      () async {
    if (!BackendConfig.enabled) return;
    await _useAccount(_accountA, 'remote-failure');
    const oldCache = '[{"exact":"unproven-cache"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rental_requests', oldCache);

    await http.runWithClient(() async {
      await expectLater(
        DataService.getAllRentalRequestsForTesting(),
        throwsA(isA<Exception>()),
      );
      expect(prefs.getString('rental_requests'), oldCache);
    },
        () => MockClient((_) async =>
            http.Response('{"error":"upstream_unavailable"}', 503)));
  });

  test('guest rental-request snapshot fails closed without a GET', () async {
    if (!BackendConfig.enabled) return;
    var calls = 0;
    const oldCache = '[{"exact":"guest-unproven-cache"}]';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rental_requests', oldCache);
    await http.runWithClient(() async {
      await expectLater(AuthService.clearSession(), completes);
      await expectLater(
        DataService.getAllRentalRequestsForTesting(),
        throwsA(isA<Exception>()),
      );
      expect(calls, 0);
      expect(prefs.getString('rental_requests'), oldCache);
    },
        () => MockClient((_) async {
              calls++;
              throw StateError('Guest must not issue private rental reads');
            }));
  });
}
