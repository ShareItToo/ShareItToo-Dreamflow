import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support_intake_backend_owner_test.dart' show useSession;

Future<Object> request(AuthSessionOwner owner, String operation) =>
    switch (operation) {
      'list' => BackendRepository.getMySupportCases(owner: owner),
      'detail' =>
        BackendRepository.getSupportCase('fixture-case', owner: owner),
      'appeal' => BackendRepository.submitSupportAppeal(
          owner: owner,
          caseId: 'fixture-case',
          grounds: 'Synthetic grounds',
          expectedVersion: 2,
          idempotencyKey: 'fixture-command'),
      _ => BackendRepository.completeSupportDsaNoticeLocator(
          owner: owner,
          caseId: 'fixture-case',
          contentLocator: 'https://example.invalid/fixture',
          expectedVersion: 2,
          idempotencyKey: 'fixture-command'),
    };

Map<String, dynamic> responseFor(String operation) => switch (operation) {
      'list' => {'supportCases': []},
      'detail' => {
          'supportCase': {'id': 'fixture-case'},
          'finalDecision': null,
          'appeal': null,
          'messages': [
            {'text': 'synthetic-public-message'}
          ],
          'events': []
        },
      'appeal' => {
          'appeal': {'id': 'fixture-appeal'}
        },
      _ => {
          'supportCase': {'id': 'fixture-case'}
        },
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  if (!BackendConfig.enabled) {
    test('disabled backend makes no support case request', () async {
      final owner = await useSession('a');
      await http.runWithClient(() async {
        await expectLater(
            request(owner, 'list'), throwsA(isA<BackendException>()));
      }, () => MockClient((_) async => throw StateError('Unexpected network')));
    });
    return;
  }
  for (final operation in ['list', 'detail', 'appeal', 'locator']) {
    test('$operation same-A credentials and idempotency control', () async {
      final owner = await useSession('a');
      var calls = 0;
      await http.runWithClient(() async {
        await request(owner, operation);
      },
          () => MockClient((req) async {
                calls++;
                expect(req.headers['Authorization'], 'Bearer fixture-access-a');
                expect(req.method,
                    ['list', 'detail'].contains(operation) ? 'GET' : 'POST');
                if (req.method == 'POST') {
                  expect(req.headers['Idempotency-Key'], 'fixture-command');
                }
                return http.Response(jsonEncode(responseFor(operation)), 200);
              }));
      expect(calls, 1);
    });
    test('$operation stale A must never select B credentials', () async {
      final owner = await useSession('a');
      await useSession('b');
      var calls = 0;
      await http.runWithClient(() async {
        await expectLater(
            request(owner, operation), throwsA(isA<BackendException>()));
      },
          () => MockClient((_) async {
                calls++;
                return http.Response(
                    '{"error":"authentication_required"}', 401);
              }));
      expect(calls, 0);
    });
    test('$operation A401 cannot refresh B or retry', () async {
      final owner = await useSession('a');
      var calls = 0;
      await http.runWithClient(() async {
        await expectLater(
            request(owner, operation), throwsA(isA<BackendException>()));
      },
          () => MockClient((req) async {
                calls++;
                if (calls == 1) {
                  expect(
                      req.headers['Authorization'], 'Bearer fixture-access-a');
                  await useSession('b');
                }
                return http.Response('{"error":"session_expired"}', 401);
              }));
      expect(calls, 1);
      expect((await AuthService.readSession())?.userId, 'fixture-b');
    });
  }
  for (final value in [
    null,
    {},
    'invalid',
    [
      {'id': 'valid'},
      'invalid'
    ]
  ]) {
    test('malformed list $value cannot become an empty or filtered list',
        () async {
      final owner = await useSession('a');
      await http.runWithClient(() async {
        await expectLater(request(owner, 'list'),
            throwsA(anyOf(isA<BackendException>(), isA<FormatException>())));
      },
          () => MockClient((_) async =>
              http.Response(jsonEncode({'supportCases': value}), 200)));
    });
  }
  test('real detail transport preserves server public messages', () async {
    final owner = await useSession('a');
    await http.runWithClient(() async {
      final detail = await request(owner, 'detail') as Map<String, dynamic>;
      expect(detail['messages'], [
        {'text': 'synthetic-public-message'}
      ]);
    },
        () => MockClient((_) async =>
            http.Response(jsonEncode(responseFor('detail')), 200)));
  });
  for (final value in [
    null,
    ['invalid']
  ]) {
    test('missing or malformed detail messages $value cannot become empty',
        () async {
      final owner = await useSession('a');
      await http.runWithClient(() async {
        await expectLater(request(owner, 'detail'),
            throwsA(anyOf(isA<BackendException>(), isA<FormatException>())));
      },
          () => MockClient((_) async => http.Response(
              jsonEncode({...responseFor('detail'), 'messages': value}), 200)));
    });
  }
}
