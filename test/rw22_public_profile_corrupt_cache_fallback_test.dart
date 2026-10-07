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

  test(
    'authoritative hydration prunes stale principal aliases and retains foreign profiles',
    () async {
      final current = User(
        id: 'authoritative-owner',
        displayName: 'Authoritative Owner',
        email: 'owner@example.invalid',
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
      final staleEmailAlias = User.fromJson(<String, dynamic>{
        ...current.toJson(),
        'id': 'legacy-owner-id',
        'displayName': 'Stale Owner',
      });
      final foreign = User(
        id: 'unrelated-renter',
        displayName: 'Unrelated Renter',
        email: 'renter@example.invalid',
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
      final raw = jsonEncode(<Object?>[
        staleEmailAlias.toJson(),
        foreign.toJson(),
      ]);
      SharedPreferences.setMockInitialValues(<String, Object>{
        'users': raw,
      });

      await DataService.setCurrentUser(
        current,
        recoverCorruptBackendProfileCache: true,
      );

      final users = await DataService.getUsers();
      expect(users.map((entry) => entry.id), <String>[foreign.id, current.id]);
      expect(users.singleWhere((entry) => entry.id == current.id).toJson(),
          current.toJson());
      expect(users.singleWhere((entry) => entry.id == foreign.id).toJson(),
          foreign.toJson());
    },
  );

  test(
    'authoritative hydration replaces duplicate principal ids without foreign loss',
    () async {
      final current = User(
        id: 'duplicate-owner',
        displayName: 'Authoritative Owner',
        email: 'duplicate-owner@example.invalid',
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
      final duplicate = User.fromJson(<String, dynamic>{
        ...current.toJson(),
        'email': 'stale-owner@example.invalid',
        'displayName': 'Duplicate Owner',
      });
      final foreign = User(
        id: 'duplicate-owner-foreign',
        displayName: 'Foreign Profile',
        email: 'foreign@example.invalid',
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
      SharedPreferences.setMockInitialValues(<String, Object>{
        'users': jsonEncode(<Object?>[
          duplicate.toJson(),
          foreign.toJson(),
          current.toJson(),
        ]),
      });

      await DataService.setCurrentUser(
        current,
        recoverCorruptBackendProfileCache: true,
      );

      final users = await DataService.getUsers();
      expect(users.map((entry) => entry.id), <String>[foreign.id, current.id]);
      expect(users.singleWhere((entry) => entry.id == current.id).toJson(),
          current.toJson());
      expect(users.singleWhere((entry) => entry.id == foreign.id).toJson(),
          foreign.toJson());
    },
  );

  test('non-authoritative hydration remains fail-closed for duplicate profiles',
      () async {
    final current = User(
      id: 'strict-owner',
      displayName: 'Strict Owner',
      email: 'strict-owner@example.invalid',
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
    final duplicate = User.fromJson(<String, dynamic>{
      ...current.toJson(),
      'displayName': 'Duplicate Strict Owner',
    });
    final raw = jsonEncode(<Object?>[
      current.toJson(),
      duplicate.toJson(),
    ]);
    SharedPreferences.setMockInitialValues(<String, Object>{'users': raw});

    await expectLater(
        DataService.setCurrentUser(current), throwsFormatException);
    expect((await SharedPreferences.getInstance()).getString('users'), raw);
  });
}
