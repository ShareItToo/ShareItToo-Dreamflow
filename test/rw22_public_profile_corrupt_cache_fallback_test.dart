import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'public profile lookup isolates corrupt local cache without rewriting it',
    () async {
      final valid = User(
        id: 'legacy-owner',
        displayName: 'Legacy Owner',
        email: 'legacy@example.invalid',
        preferredLanguage: 'de',
        isVerified: false,
        isBanned: false,
        role: 'user',
        createdAt: DateTime.utc(2026),
        avgRating: 0,
        reviewCount: 0,
        languages: const <String>[],
        interests: const <String>[],
      ).toJson();
      final corrupt = jsonEncode(<Object?>[
        valid,
        <String, Object?>{...valid, 'id': 'corrupt-owner', 'email': ''},
      ]);
      SharedPreferences.setMockInitialValues(<String, Object>{
        'users': corrupt,
      });

      expect(await DataService.getUserById('missing-owner'), isNull);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('users'), corrupt);
      await expectLater(DataService.getUsers(), throwsFormatException);
    },
  );

  test(
    'authoritative authentication hydration replaces only a corrupt cache',
    () async {
      final current = User(
        id: 'authenticated-owner',
        displayName: 'Authenticated Owner',
        email: 'authenticated@example.invalid',
        preferredLanguage: 'de',
        isVerified: false,
        isBanned: false,
        role: 'user',
        createdAt: DateTime.utc(2026),
        avgRating: 0,
        reviewCount: 0,
        languages: const <String>[],
        interests: const <String>[],
      );
      final corrupt = jsonEncode(<Object?>[
        <String, Object?>{...current.toJson(), 'email': ''},
      ]);
      SharedPreferences.setMockInitialValues(<String, Object>{
        'users': corrupt,
      });

      await expectLater(
        DataService.setCurrentUser(current),
        throwsFormatException,
      );
      var prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('users'), corrupt);

      await DataService.setCurrentUser(
        current,
        recoverCorruptBackendProfileCache: true,
      );

      prefs = await SharedPreferences.getInstance();
      final users = await DataService.getUsers();
      expect(users.map((entry) => entry.id), <String>[current.id]);
      expect(prefs.getString('users'), isNot(corrupt));
      expect((await DataService.getCurrentUser())?.id, current.id);
    },
  );
}
