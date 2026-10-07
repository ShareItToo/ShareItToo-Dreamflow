import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<AuthSessionOwner> useSession(String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': 'fixture-$suffix',
        'sessionId': 'fixture-session-$suffix',
        'email': 'fixture-$suffix@example.invalid',
        'createdAt': '2026-09-04T00:00:00Z',
        'accessToken': 'fixture-access-$suffix',
        'refreshToken': 'fixture-refresh-$suffix',
        'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
      }));
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

Future<Map<String, dynamic>> submit(AuthSessionOwner owner, bool handover) =>
    handover
        ? BackendRepository.reportHandoverException(
            owner: owner,
            bookingId: 'fixture-booking',
            intake: {'kind': 'fixture-kind'},
            idempotencyKey: 'fixture-support-command')
        : BackendRepository.createSupportCase(
            owner: owner,
            intake: {'summary': 'Synthetic support test'},
            idempotencyKey: 'fixture-support-command');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  if (!BackendConfig.enabled) {
    test('disabled backend sends no support intake', () async {
      final owner = await useSession('a');
      await http.runWithClient(() async {
        await expectLater(
            submit(owner, false), throwsA(isA<BackendException>()));
      }, () => MockClient((_) async => throw StateError('Unexpected request')));
    });
    return;
  }
  for (final handover in [false, true]) {
    test('support $handover keeps A credential and idempotency header',
        () async {
      final owner = await useSession('a');
      await http.runWithClient(() async {
        expect((await submit(owner, handover))['id'], 'fixture-case');
      },
          () => MockClient((request) async {
                expect(request.headers['Authorization'],
                    'Bearer fixture-access-a');
                expect(request.headers['Idempotency-Key'],
                    'fixture-support-command');
                expect(
                    request.url.path,
                    handover
                        ? '/api/v1/bookings/fixture-booking/handover-exceptions'
                        : '/api/v1/support/cases');
                return http.Response(
                    '{"supportCase":{"id":"fixture-case"}}', 200);
              }));
    });
    test('stale support $handover cannot send with B credential', () async {
      final owner = await useSession('a');
      await useSession('b');
      var calls = 0;
      await http.runWithClient(() async {
        await expectLater(
            submit(owner, handover), throwsA(isA<BackendException>()));
      },
          () => MockClient((_) async {
                calls++;
                return http.Response(
                    '{"error":"authentication_required"}', 401);
              }));
      expect(calls, 0);
    });
    test('support $handover 401 after switch does not refresh B or retry',
        () async {
      final owner = await useSession('a');
      var calls = 0;
      await http.runWithClient(() async {
        await expectLater(
            submit(owner, handover), throwsA(isA<BackendException>()));
      },
          () => MockClient((request) async {
                calls++;
                if (calls == 1) {
                  expect(request.headers['Authorization'],
                      'Bearer fixture-access-a');
                  await useSession('b');
                }
                return http.Response('{"error":"session_expired"}', 401);
              }));
      expect(calls, 1);
      expect((await AuthService.readSession())?.userId, 'fixture-b');
    });
  }
}
