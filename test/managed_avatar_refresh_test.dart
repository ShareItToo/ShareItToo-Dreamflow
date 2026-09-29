import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/user_avatar.dart';
import 'package:shared_preferences/shared_preferences.dart';

const avatar =
    'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp';

String session(String owner, String token) => jsonEncode({
      'userId': owner,
      'email': '$owner@example.invalid',
      'sessionId': 'session-$owner',
      'createdAt': '2026-01-01T00:00:00Z',
      'accessToken': token,
      'refreshToken': 'synthetic-refresh-$owner',
      'accessTokenExpiresAt':
          DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
    });

Widget surface() => const MaterialApp(
    home: Scaffold(body: SitUserAvatar(url: avatar, radius: 24)));

NetworkImage renderedImage(WidgetTester tester) =>
    tester.widget<Image>(find.byType(Image)).image as NetworkImage;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'same avatar URL reloads owner-bound credentials on profile and account refresh',
      (tester) async {
    SharedPreferences.setMockInitialValues(
        {'auth_session_v1': session('owner-a', 'synthetic-token-a')});
    await tester.pumpWidget(surface());
    await tester.pumpAndSettle();
    final first = renderedImage(tester);
    expect(first.headers, {'Authorization': 'Bearer synthetic-token-a'});
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        'auth_session_v1', session('owner-a', 'synthetic-token-renewed'));
    SharedPersistenceSync.notify(SharedPersistenceSync.profileStateKey);
    await tester.pumpAndSettle();
    final renewed = renderedImage(tester);
    expect(renewed.url, first.url);
    expect(
        renewed.headers, {'Authorization': 'Bearer synthetic-token-renewed'});
    expect(renewed, isNot(equals(first)),
        reason: 'image-cache identity must include credentials');

    await prefs.setString(
        'auth_session_v1', session('owner-b', 'synthetic-token-b'));
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();
    final successor = renderedImage(tester);
    expect(successor.headers, {'Authorization': 'Bearer synthetic-token-b'});
    expect(successor, isNot(equals(renewed)));

    await prefs.remove('auth_session_v1');
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();
    expect(find.byType(Image), findsNothing,
        reason:
            'signed-out managed image must not fetch anonymously or retain an old owner');
    expect(tester.takeException(), isNull);
  }, skip: !BackendConfig.enabled);

  testWidgets(
      'persisted avatar and session render after widget restart with no stale cache owner',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'auth_session_v1': session('owner-a', 'synthetic-token-a'),
      'currentUser': jsonEncode({'id': 'owner-a', 'photoURL': avatar}),
    });
    final prefs = await SharedPreferences.getInstance();
    Future<void> mountFromStorage() async {
      await prefs.reload();
      final current =
          jsonDecode(prefs.getString('currentUser')!) as Map<String, dynamic>;
      await tester.pumpWidget(MaterialApp(
          home: SitUserAvatar(url: current['photoURL'] as String, radius: 24)));
      await tester.pumpAndSettle();
      expect(renderedImage(tester).url, avatar);
      expect(renderedImage(tester).headers,
          {'Authorization': 'Bearer synthetic-token-a'});
    }

    await mountFromStorage();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await mountFromStorage();
    expect(tester.takeException(), isNull);
  }, skip: !BackendConfig.enabled);
}
