import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';

void main() {
  final base = <String, dynamic>{
    'userId': 'user-a',
    'email': 'Owner@Example.test',
    'sessionId': 'session-a',
    'createdAt': '2026-09-26T10:00:00.000Z',
    'accessToken': 'access-a',
    'refreshToken': 'refresh-a',
    'accessTokenExpiresAt': '2026-09-26T10:15:00.000Z',
  };

  test('accepts token and expiry refresh for the same logical session', () {
    final refreshed = <String, dynamic>{
      ...base,
      'accessToken': 'access-b',
      'refreshToken': 'refresh-b',
      'accessTokenExpiresAt': '2026-09-26T10:30:00.000Z',
      'email': ' owner@example.test ',
    };

    expect(
      AuthService.sameLogicalSessionIdentityForTesting(base, refreshed),
      isTrue,
    );
  });

  for (final entry in <String, dynamic>{
    'userId': 'user-b',
    'sessionId': 'session-b',
    'email': 'other@example.test',
    'createdAt': '2026-09-26T10:00:01.000Z',
  }.entries) {
    test('rejects ${entry.key} identity drift', () {
      final changed = <String, dynamic>{...base, entry.key: entry.value};

      expect(
        AuthService.sameLogicalSessionIdentityForTesting(base, changed),
        isFalse,
      );
    });
  }

  test('rejects missing or malformed identity fields fail-closed', () {
    final missing = <String, dynamic>{...base}..remove('sessionId');
    final malformed = <String, dynamic>{...base, 'createdAt': 'not-a-date'};

    expect(
      AuthService.sameLogicalSessionIdentityForTesting(base, missing),
      isFalse,
    );
    expect(
      AuthService.sameLogicalSessionIdentityForTesting(malformed, base),
      isFalse,
    );
    expect(
      AuthService.sameLogicalSessionIdentityForTesting(null, base),
      isFalse,
    );
  });
}
