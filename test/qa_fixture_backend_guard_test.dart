import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  test('backend-bound debug runtime never starts local QA fixture sync', () {
    expect(
      DataService.canSeedQaFixturesForRuntime(
        debugMode: true,
        backendEnabled: true,
        qaRuntimeEnabled: false,
        launchQaSeedingEnabled: true,
      ),
      isFalse,
    );
  });

  test('offline and explicit QA runtimes retain debug fixture seeding', () {
    expect(
      DataService.canSeedQaFixturesForRuntime(
        debugMode: true,
        backendEnabled: false,
        qaRuntimeEnabled: false,
        launchQaSeedingEnabled: true,
      ),
      isTrue,
    );
    expect(
      DataService.canSeedQaFixturesForRuntime(
        debugMode: true,
        backendEnabled: true,
        qaRuntimeEnabled: true,
        launchQaSeedingEnabled: true,
      ),
      isTrue,
    );
    expect(
      DataService.canSeedQaFixturesForRuntime(
        debugMode: false,
        backendEnabled: false,
        qaRuntimeEnabled: true,
        launchQaSeedingEnabled: true,
      ),
      isFalse,
    );
  });

  test(
    'backend-bound current-user read emits no QA fixture HTTP request',
    () async {
      final requests = <String>[];
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 18182);
      final owner = buildTestUser(
        'backend-qa-owner',
        name: 'Backend QA Owner',
        email: 'backend-qa-owner@example.invalid',
      );
      final other = buildTestUser(
        'backend-qa-other',
        name: 'Backend QA Other',
        email: 'backend-qa-other@example.invalid',
      );
      final item = buildTestItem(
        id: 'backend-qa-item',
        ownerId: other.id,
      );
      final subscription = server.listen((request) async {
        requests.add('${request.method} ${request.uri.path}');
        await request.drain<void>();
        request.response.headers.contentType = ContentType.json;
        if (request.method == 'GET' && request.uri.path == '/api/v1/auth/me') {
          request.response.write(jsonEncode({'user': owner.toJson()}));
        } else if (request.method == 'GET' &&
            request.uri.path == '/api/v1/listings') {
          request.response.write(jsonEncode({
            'listings': [item.toJson()]
          }));
        } else if (request.method == 'GET' &&
            request.uri.path == '/api/v1/rental-requests') {
          request.response.write(jsonEncode({'requests': <Object>[]}));
        } else {
          request.response.statusCode = HttpStatus.conflict;
          request.response.write(jsonEncode({
            'error': 'booking_creation_requires_idempotent_endpoint',
          }));
        }
        await request.response.close();
      });
      addTearDown(() async {
        await subscription.cancel();
        await server.close(force: true);
      });

      final now = DateTime.now().toUtc();
      SharedPreferences.setMockInitialValues({
        'users': jsonEncode([owner.toJson(), other.toJson()]),
        'items': jsonEncode([item.toJson()]),
        'rental_requests': '[]',
        'message_threads_v1': '[]',
        'notifications': '[]',
        'currentUser': jsonEncode(owner.toJson()),
        'auth_session_v1': jsonEncode({
          'userId': owner.id,
          'email': owner.email,
          'createdAt': now.toIso8601String(),
          'accessToken': 'synthetic-backend-qa-token',
          'refreshToken': 'synthetic-backend-qa-refresh',
          'sessionId': 'synthetic-backend-qa-session',
          'accessTokenExpiresAt':
              now.add(const Duration(hours: 1)).toIso8601String(),
        }),
      });

      final current = await DataService.getCurrentUser();
      expect(current?.id, owner.id);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(requests, contains('GET /api/v1/auth/me'));
      expect(
        requests,
        isNot(contains('PUT /api/v1/rental-requests/sync')),
      );
    },
    skip: !(BackendConfig.enabled &&
        BackendConfig.apiBaseUrl == 'http://127.0.0.1:18182/api/v1'),
  );
}
