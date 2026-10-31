import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/services/backend_http.dart';

void main() {
  test('response seam exposes only bounded typed Retry-After', () async {
    await http.runWithClient(() async {
      final response = await BackendHttp.requestJsonResponse(
        method: 'POST',
        path: '/synthetic',
        body: const {'safe': true},
      );
      expect(response.statusCode, 429);
      expect(response.body, {'error': 'rate_limited'});
      expect(response.retryAfter, const Duration(seconds: 60));
      expect(() => (response as dynamic).headers, throwsNoSuchMethodError);
    },
        () => MockClient((request) async {
              return http.Response(
                '{"error":"rate_limited"}',
                429,
                headers: const {
                  'retry-after': '60',
                  'set-cookie': 'private-cookie=must-not-surface',
                  'x-private-debug': 'private-value',
                },
              );
            }));
  });

  for (final raw in ['0', '-1', '301', 'Thu, 01 Jan 2026 00:00:00 GMT']) {
    test('unbounded or non-integer Retry-After is ignored: $raw', () async {
      await http.runWithClient(() async {
        final response = await BackendHttp.requestJsonResponse(
          method: 'GET',
          path: '/synthetic',
        );
        expect(response.retryAfter, isNull);
      },
          () => MockClient((_) async =>
              http.Response('{}', 200, headers: {'retry-after': raw})));
    });
  }

  test('legacy requestJson still returns decoded success body', () async {
    await http.runWithClient(() async {
      expect(
        await BackendHttp.requestJson(method: 'GET', path: '/synthetic'),
        {'ok': true},
      );
    }, () => MockClient((_) async => http.Response('{"ok":true}', 200)));
  });

  test('legacy requestJson still throws same status, code, and details',
      () async {
    await http.runWithClient(() async {
      await expectLater(
        BackendHttp.requestJson(method: 'GET', path: '/synthetic'),
        throwsA(isA<BackendException>()
            .having((error) => error.statusCode, 'status', 409)
            .having((error) => error.code, 'code', 'synthetic_conflict')
            .having((error) => error.details, 'details', {'safe': true}).having(
                (error) => error.retryAfterSeconds, 'retry-after', 45)),
      );
    },
        () => MockClient((_) async => http.Response(
                '{"error":"synthetic_conflict","details":{"safe":true}}', 409,
                headers: const {
                  'retry-after': '45',
                  'x-private-debug': 'must-not-surface',
                })));
  });
}
