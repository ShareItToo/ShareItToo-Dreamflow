import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/privacy_export_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _syntheticAccountProof = 'synthetic-export-test-proof';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  if (!BackendConfig.enabled) {
    test('disabled backend cannot create an export request', () async {
      final owner = await _useSession('a');
      await http.runWithClient(() async {
        await expectLater(
            BackendRepository.exportAccountData(
                owner: owner, currentPassword: _syntheticAccountProof),
            throwsA(isA<BackendException>()));
      },
          () => MockClient(
              (_) async => throw StateError('Unexpected HTTP request')));
    });
    return;
  }

  test('HTTP export uses captured A credential and password-only body',
      () async {
    final owner = await _useSession('a');
    var calls = 0;
    await http.runWithClient(() async {
      final value = await BackendRepository.exportAccountData(
          owner: owner, currentPassword: _syntheticAccountProof);
      expect(value['accountId'], owner.userId);
    },
        () => MockClient((request) async {
              calls++;
              expect(request.method, 'POST');
              expect(request.url.path, '/api/v1/account/export');
              expect(
                  request.headers['Authorization'], 'Bearer fixture-access-a');
              expect(jsonDecode(request.body),
                  {'currentPassword': _syntheticAccountProof});
              return http.Response(jsonEncode(_document(owner)), 200);
            }));
    expect(calls, 1);
  });

  test('stale A request cannot borrow persisted B credential', () async {
    final owner = await _useSession('a');
    await _useSession('b');
    await http.runWithClient(() async {
      await expectLater(
          BackendRepository.exportAccountData(
              owner: owner, currentPassword: _syntheticAccountProof),
          throwsA(isA<BackendException>()));
    },
        () => MockClient(
            (_) async => throw StateError('Successor credential borrowed')));
  });

  test('401 does not retry an A password against B or refresh B', () async {
    final owner = await _useSession('a');
    var calls = 0;
    await http.runWithClient(() async {
      await expectLater(
          BackendRepository.exportAccountData(
              owner: owner, currentPassword: _syntheticAccountProof),
          throwsA(isA<BackendException>()
              .having((e) => e.code, 'code', 'invalid_credentials')));
    },
        () => MockClient((request) async {
              calls++;
              expect(
                  request.headers['Authorization'], 'Bearer fixture-access-a');
              await _useSession('b');
              return http.Response('{"error":"invalid_credentials"}', 401);
            }));
    expect(calls, 1);
    expect((await AuthService.readSession())!.userId, 'fixture-b');
  });

  test('real HTTP success after A to B is rejected before local data',
      () async {
    final owner = await _useSession('a');
    final service = _NoLocalReads();
    await http.runWithClient(() async {
      await expectLater(
          service.prepare(
              owner: owner, currentPassword: _syntheticAccountProof),
          throwsA(isA<PrivacyExportPrincipalChanged>()));
    },
        () => MockClient((_) async {
              await _useSession('b');
              return http.Response(jsonEncode(_document(owner)), 200);
            }));
    expect(service.localReads, 0);
  });
}

Future<AuthSessionOwner> _useSession(String suffix) async {
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

Map<String, dynamic> _document(AuthSessionOwner owner) => {
      'schemaVersion': '1.0',
      'generatedAt': '2026-09-04T00:00:00Z',
      'accountId': owner.userId,
      'data': <String, dynamic>{},
    };

class _NoLocalReads extends PrivacyExportService {
  int localReads = 0;
  @override
  Future<Map<String, dynamic>> readLocal(PrivacyExportSection section) async {
    localReads++;
    throw StateError('Successor local data must not be read');
  }
}
