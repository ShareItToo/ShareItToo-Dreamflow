import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_realtime_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<AuthSessionOwner> _writeSession(String id, String accessToken) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    jsonEncode(<String, Object?>{
      'userId': 'synthetic-user-$id',
      'sessionId': 'synthetic-session-$id',
      'email': 'synthetic-$id@example.invalid',
      'createdAt': '2026-10-31T10:00:00Z',
      'accessToken': accessToken,
      'refreshToken': 'synthetic-refresh-$id',
      'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
    }),
  );
  return AuthService.captureSessionOwner((await AuthService.readSession())!);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await BackendRealtimeService.disconnect();
  });

  tearDown(() => BackendRealtimeService.disconnect());

  test('exact stale-session clear stops its authenticated reconnect loop',
      () async {
    final owner = await _writeSession('a', 'synthetic-access-a');
    BackendRealtimeService.scheduleReconnectForTesting('synthetic-access-a');
    expect(BackendRealtimeService.hasScheduledReconnectForTesting, isTrue);

    final receipt = await AuthService.clearSessionOwnerIfMatches(
      owner,
      runLogoutCleanup: false,
    );

    expect(receipt, isNotNull);
    expect(await AuthService.readSession(), isNull);
    expect(BackendRealtimeService.hasScheduledReconnectForTesting, isFalse);
  });

  test('stale A transport cleanup cannot disconnect successor B', () async {
    final ownerA = await _writeSession('a', 'synthetic-access-a');
    BackendRealtimeService.scheduleReconnectForTesting('synthetic-access-a');
    final receipt = await AuthService.clearSessionOwnerIfMatches(
      ownerA,
      runLogoutCleanup: false,
    );
    expect(receipt, isNotNull);

    await _writeSession('b', 'synthetic-access-b');
    BackendRealtimeService.scheduleReconnectForTesting('synthetic-access-b');
    final disconnected =
        await BackendRealtimeService.disconnectIfAccessTokenMatches(
      'synthetic-access-a',
    );

    expect(disconnected, isFalse);
    expect(BackendRealtimeService.hasScheduledReconnectForTesting, isTrue);
  });
}
