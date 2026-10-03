import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/apple_web_v2_client.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/remote_auth_attempt_transaction.dart';

const token =
    'synthetic-firebase-id-token-with-no-live-value-0000000000000000000000000'
    '000000000000000000000000000000000000000000000000000000000000000000';
const receipt = 'Raaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
final clock = DateTime.utc(2026, 10, 4, 12);

BackendJsonResponse projection(String state, int status,
        {Duration? retryAfter}) =>
    BackendJsonResponse(
      statusCode: status,
      retryAfter: retryAfter,
      body: {
        'appleAuth': {
          'version': 2,
          'receipt': receipt,
          'state': state,
          'expiresAt': '2026-10-04T12:10:00.000Z',
        },
      },
    );

BackendJsonResponse session({bool mfa = false}) => BackendJsonResponse(
      statusCode: mfa ? 202 : 200,
      body: {
        'appleAuth': {
          'version': 2,
          'receipt': receipt,
          'state': 'ready',
          'expiresAt': '2026-10-04T12:10:00.000Z',
        },
        if (mfa) ...{
          'mfaRequired': true,
          'mfaChallenge': 'M' * 43,
          'expiresAt': '2026-10-04T12:05:00.000Z',
        } else
          'session': {'refreshToken': 'synthetic-refresh'},
      },
    );

class Harness {
  int tokens = 0;
  int ids = 0;
  bool current = true;
  final List<Map<String, dynamic>> bodies = [];
  final List<Duration> waits = [];
  late Future<BackendJsonResponse> Function(Map<String, dynamic> body)
      responder;

  AppleWebV2Material get material => AppleWebV2Material(
        authorizationCode: 'synthetic-single-use-code',
        readFreshFirebaseIdToken: () async {
          tokens += 1;
          return token;
        },
      );

  Future<Map<String, dynamic>> run({
    List<Duration> backoff = const [
      Duration(seconds: 2),
      Duration(seconds: 4),
      Duration(seconds: 8),
      Duration(seconds: 30),
    ],
  }) =>
      exchangeAppleWebV2(
        material: material,
        request: (body) {
          bodies.add(body);
          return responder(body);
        },
        createOpaqueId: () {
          ids += 1;
          return String.fromCharCode(64 + ids) * 43;
        },
        requireCurrent: () {
          if (!current) throw const RemoteAuthAttemptSuperseded();
        },
        delay: (duration) async => waits.add(duration),
        now: () => clock,
        statusBackoff: backoff,
      );
}

String operation(Map<String, dynamic> body) =>
    (body['appleAuth'] as Map)['operation'] as String;

void main() {
  test('exact acquire then session, fresh token per command', () async {
    final h = Harness();
    h.responder = (body) async => switch (operation(body)) {
          'acquire' => projection('ready', 200),
          'session' => session(),
          _ => throw StateError('unexpected operation'),
        };
    final response = await h.run();
    expect(response['session'], isA<Map>());
    expect(h.tokens, 2);
    expect(h.bodies.map(operation), ['acquire', 'session']);
    expect(h.bodies.first, {
      'idToken': token,
      'appleAuth': {
        'version': 2,
        'operation': 'acquire',
        'requestId': 'A' * 43,
        'authorizationCode': 'synthetic-single-use-code',
      },
    });
  });

  test('lost acquire response recovers by requestId and never resends code',
      () async {
    final h = Harness();
    h.responder = (body) async {
      switch (operation(body)) {
        case 'acquire':
          throw TimeoutException('synthetic lost response');
        case 'status':
          expect((body['appleAuth'] as Map)['requestId'], 'A' * 43);
          return projection('ready', 200);
        case 'session':
          return session();
      }
      throw StateError('unexpected operation');
    };
    await h.run();
    expect(h.bodies.map(operation), ['acquire', 'status', 'session']);
    expect(
        h.bodies.where((body) => operation(body) == 'acquire'), hasLength(1));
    expect(
        h.bodies.where((body) => body.toString().contains('single-use-code')),
        hasLength(1));
    expect(h.waits, [const Duration(seconds: 2)]);
  });

  test('429 Retry-After is bounded and consumes a fixed polling slot',
      () async {
    final h = Harness();
    var statusCalls = 0;
    h.responder = (body) async {
      switch (operation(body)) {
        case 'acquire':
          return projection('pending', 202);
        case 'status':
          statusCalls += 1;
          return statusCalls == 1
              ? const BackendJsonResponse(
                  statusCode: 429,
                  body: {'error': 'apple_ownership_status_rate_limited'},
                  retryAfter: Duration(seconds: 60),
                )
              : projection('ready', 200);
        case 'session':
          return session();
      }
      throw StateError('unexpected operation');
    };
    await h.run();
    expect(h.waits, const [Duration(seconds: 2), Duration(seconds: 60)]);
    expect(
        h.bodies.where((body) => operation(body) == 'acquire'), hasLength(1));
  });

  for (final entry in [
    ('pending', 200),
    ('ready', 202),
    ('closed', 409),
    ('unresolved', 410),
  ]) {
    test('projection ${entry.$1} rejects wrong status ${entry.$2}', () async {
      final h = Harness();
      h.responder = (_) async => projection(entry.$1, entry.$2);
      await expectLater(
          h.run(backoff: const []),
          throwsA(isA<AppleWebV2Failure>().having((error) => error.code, 'code',
              'invalid_apple_ownership_response')));
    });
  }

  test('pending Retry-After replaces rather than adds to slot backoff',
      () async {
    final h = Harness();
    h.responder = (body) async => switch (operation(body)) {
          'acquire' =>
            projection('pending', 202, retryAfter: const Duration(seconds: 6)),
          'status' => projection('ready', 200),
          'session' => session(),
          _ => throw StateError('unexpected operation'),
        };
    await h.run();
    expect(h.waits, const [Duration(seconds: 6)]);
  });

  test(
      'status transport and parse failures consume slots without acquire replay',
      () async {
    final h = Harness();
    var statuses = 0;
    h.responder = (body) async {
      switch (operation(body)) {
        case 'acquire':
          return projection('pending', 202);
        case 'status':
          statuses += 1;
          if (statuses == 1) throw TimeoutException('synthetic transport');
          if (statuses == 2) {
            throw const BackendException(200, 'invalid_server_response');
          }
          return projection('ready', 200);
        case 'session':
          return session();
      }
      throw StateError('unexpected operation');
    };
    await h.run();
    expect(h.bodies.map(operation),
        ['acquire', 'status', 'status', 'status', 'session']);
    expect(
        h.bodies.where((body) => operation(body) == 'acquire'), hasLength(1));
    expect(h.waits, const [
      Duration(seconds: 2),
      Duration(seconds: 4),
      Duration(seconds: 8),
    ]);
  });

  test('absolute deadline rejects oversized Retry-After before another read',
      () async {
    var currentTime = clock;
    final bodies = <Map<String, dynamic>>[];
    final material = AppleWebV2Material(
      authorizationCode: 'synthetic-single-use-code',
      readFreshFirebaseIdToken: () async => token,
    );
    await expectLater(
      exchangeAppleWebV2(
        material: material,
        request: (body) async {
          bodies.add(body);
          return projection('pending', 202,
              retryAfter: const Duration(seconds: 60));
        },
        createOpaqueId: () => 'A' * 43,
        requireCurrent: () {},
        delay: (duration) async => currentTime = currentTime.add(duration),
        now: () => currentTime,
        maxElapsed: const Duration(seconds: 30),
      ),
      throwsA(isA<AppleWebV2Failure>().having(
          (error) => error.code, 'code', 'apple_ownership_deadline_elapsed')),
    );
    expect(bodies.map(operation), ['acquire']);
  });

  for (final entry in [('closed', 410), ('unresolved', 409)]) {
    test('${entry.$1} is terminal and never requests a session', () async {
      final h = Harness();
      h.responder = (body) async {
        if (operation(body) == 'acquire') return projection('pending', 202);
        return projection(entry.$1, entry.$2);
      };
      await expectLater(
          h.run(),
          throwsA(isA<AppleWebV2Failure>().having(
              (error) => error.code, 'code', 'apple_ownership_${entry.$1}')));
      expect(h.bodies.map(operation), ['acquire', 'status']);
    });
  }

  test('uncertain session is replaced by fresh delivery and may return MFA',
      () async {
    final h = Harness();
    var deliveries = 0;
    h.responder = (body) async {
      switch (operation(body)) {
        case 'acquire':
          return projection('ready', 200);
        case 'session':
          deliveries += 1;
          if (deliveries == 1) throw TimeoutException('lost session response');
          return session(mfa: true);
      }
      throw StateError('unexpected operation');
    };
    final response = await h.run();
    expect(response['mfaRequired'], isTrue);
    final sessionBodies =
        h.bodies.where((body) => operation(body) == 'session').toList();
    expect(sessionBodies, hasLength(2));
    expect((sessionBodies[0]['appleAuth'] as Map)['deliveryId'], 'B' * 43);
    expect((sessionBodies[1]['appleAuth'] as Map)['deliveryId'], 'C' * 43);
    expect(h.tokens, 3);
  });

  test('three uncertain deliveries stop without a fourth generation', () async {
    final h = Harness();
    h.responder = (body) async {
      if (operation(body) == 'acquire') return projection('ready', 200);
      throw TimeoutException('synthetic ambiguous delivery');
    };
    await expectLater(
        h.run(),
        throwsA(isA<AppleWebV2Failure>().having((error) => error.code, 'code',
            'apple_session_delivery_uncertain')));
    expect(
        h.bodies.where((body) => operation(body) == 'session'), hasLength(3));
    expect(h.ids, 4); // request + exactly three delivery IDs.
  });

  test('stale owner after acquire cannot poll or request a session', () async {
    final h = Harness();
    h.responder = (body) async {
      h.current = false;
      return projection('ready', 200);
    };
    await expectLater(h.run(), throwsA(isA<RemoteAuthAttemptSuperseded>()));
    expect(h.bodies, hasLength(1));
  });

  test('typed failures and material never stringify secrets', () {
    final material = Harness().material;
    expect(material.toString(), 'AppleWebV2Material(redacted)');
    expect(const AppleWebV2Failure('failed').toString(),
        'AppleWebV2Failure(failed)');
    expect(material.toString(), isNot(contains('single-use-code')));
  });
}
