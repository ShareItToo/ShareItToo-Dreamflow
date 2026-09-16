import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final baseA = buildTestUser(
    'rw9-account-a',
    name: 'RW9 Account A',
    email: 'rw9-account-a@example.invalid',
  );
  final accountA = User.fromJson(<String, dynamic>{
    ...baseA.toJson(),
    'phone': '+49111111111',
    'emailVerified': true,
    'phoneVerified': true,
    'isVerified': true,
    'role': 'admin',
    'payoutAccountId': 'rw9-payout-protected',
    'avgRating': 4.75,
    'reviewCount': 8,
    'bio': 'Vorherige Bio',
    'city': 'Köln',
    'country': 'Deutschland',
    'languages': <String>['Deutsch'],
    'interests': <String>['Werkzeug'],
    'showBioPublic': true,
    'socialInstagram': 'https://instagram.com/rw9',
    'addressStreet': 'Altstraße',
    'addressHouseNumber': '1',
    'addressPostalCode': '50667',
    'addressCity': 'Köln',
    'addressCountry': 'Deutschland',
  });
  final accountB = buildTestUser(
    'rw9-account-b',
    name: 'RW9 Account B',
    email: 'rw9-account-b@example.invalid',
  );

  setUp(QaRuntimeService.reset);
  tearDown(QaRuntimeService.reset);

  String sessionFor(User user) => jsonEncode(<String, Object>{
        'userId': user.id,
        'email': user.email,
        'createdAt': '2026-08-25T12:00:00.000Z',
      });

  Map<String, Object> state({
    User? current,
    List<User>? users,
    bool includeSession = true,
  }) {
    final effectiveCurrent = current ?? accountA;
    final effectiveUsers = users ?? <User>[accountA, accountB];
    return <String, Object>{
      'users': jsonEncode(
        effectiveUsers.map((entry) => entry.toJson()).toList(),
      ),
      'currentUser': jsonEncode(effectiveCurrent.toJson()),
      if (includeSession) 'auth_session_v1': sessionFor(effectiveCurrent),
      'qa_messages_notifs_seeded_v3_for_${effectiveCurrent.id}': true,
    };
  }

  Future<User> update(Map<CurrentUserProfileField, Object?> updates) =>
      DataService.updateCurrentUserProfile(
        expectedUserId: accountA.id,
        updates: updates,
      );

  test('guest, foreign and stale sessions cannot mutate the cached profile',
      () async {
    SharedPreferences.setMockInitialValues(
      state(includeSession: false),
    );
    final prefs = await SharedPreferences.getInstance();
    final originalCurrent = prefs.getString('currentUser');
    final originalUsers = prefs.getString('users');

    await expectLater(
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.bio: 'Guest write',
      }),
      throwsStateError,
    );

    await prefs.setString('auth_session_v1', sessionFor(accountB));
    await expectLater(
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.bio: 'Foreign write',
      }),
      throwsStateError,
    );
    await expectLater(
      DataService.updateCurrentUserProfile(
        expectedUserId: accountB.id,
        updates: <CurrentUserProfileField, Object?>{
          CurrentUserProfileField.bio: 'Stale write',
        },
      ),
      throwsStateError,
    );

    expect(prefs.getString('currentUser'), originalCurrent);
    expect(prefs.getString('users'), originalUsers);
  });

  test('field patches preserve protected truth and support explicit clears',
      () async {
    SharedPreferences.setMockInitialValues(state());

    final updated = await update(<CurrentUserProfileField, Object?>{
      CurrentUserProfileField.bio: null,
      CurrentUserProfileField.phone: '+49222222222',
      CurrentUserProfileField.socialInstagram: null,
      CurrentUserProfileField.showBioPublic: false,
      CurrentUserProfileField.city: 'Bonn',
    });

    expect(updated.bio, isNull);
    expect(updated.socialInstagram, isNull);
    expect(updated.phone, '+49222222222');
    expect(updated.phoneVerified, isFalse);
    expect(updated.city, 'Bonn');
    expect(updated.addressStreet, accountA.addressStreet);
    expect(updated.languages, accountA.languages);
    expect(updated.interests, accountA.interests);
    expect(updated.id, accountA.id);
    expect(updated.email, accountA.email);
    expect(updated.emailVerified, accountA.emailVerified);
    expect(updated.role, accountA.role);
    expect(updated.isVerified, accountA.isVerified);
    expect(updated.isBanned, accountA.isBanned);
    expect(updated.payoutAccountId, accountA.payoutAccountId);
    expect(updated.avgRating, accountA.avgRating);
    expect(updated.reviewCount, accountA.reviewCount);
    expect(updated.createdAt, accountA.createdAt);
    expect(updated.isDeactivated, accountA.isDeactivated);
    expect(updated.deactivatedAt, accountA.deactivatedAt);

    final prefs = await SharedPreferences.getInstance();
    final current = User.fromJson(
      jsonDecode(prefs.getString('currentUser')!) as Map<String, dynamic>,
    );
    final users = (jsonDecode(prefs.getString('users')!) as List)
        .map((entry) => User.fromJson(Map<String, dynamic>.from(entry as Map)))
        .toList();
    expect(current.toJson(), updated.toJson());
    expect(
      users.singleWhere((entry) => entry.id == accountA.id).toJson(),
      updated.toJson(),
    );
    expect(
      users.singleWhere((entry) => entry.id == accountB.id).toJson(),
      accountB.toJson(),
    );
  });

  test('parallel disjoint patches serialize without lost updates', () async {
    SharedPreferences.setMockInitialValues(state());

    await Future.wait(<Future<User>>[
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.bio: 'Parallel bio',
      }),
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.socialX: 'https://x.com/rw9',
      }),
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.interests: <String>['Werkzeug', 'Garten'],
      }),
    ]);

    final persisted = await DataService.getCurrentUser();
    expect(persisted, isNotNull);
    expect(persisted!.bio, 'Parallel bio');
    expect(persisted.socialX, 'https://x.com/rw9');
    expect(persisted.interests, <String>['Werkzeug', 'Garten']);
    expect(persisted.addressStreet, accountA.addressStreet);
  });

  test('failed paired write restores exact bytes and queue recovers', () async {
    SharedPreferences.setMockInitialValues(state());
    final prefs = await SharedPreferences.getInstance();
    final originalCurrent = prefs.getString('currentUser');
    final originalUsers = prefs.getString('users');
    DataService.failNextAccountProfilePersistenceForTesting();

    await expectLater(
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.bio: 'Must roll back',
      }),
      throwsStateError,
    );
    expect(prefs.getString('currentUser'), originalCurrent);
    expect(prefs.getString('users'), originalUsers);

    final recovered = await update(<CurrentUserProfileField, Object?>{
      CurrentUserProfileField.bio: 'Recovered',
    });
    expect(recovered.bio, 'Recovered');
    expect((await DataService.getCurrentUser())!.bio, 'Recovered');
  });

  test('session replacement during paired write rolls both documents back',
      () async {
    SharedPreferences.setMockInitialValues(state());
    final prefs = await SharedPreferences.getInstance();
    final originalCurrent = prefs.getString('currentUser');
    final originalUsers = prefs.getString('users');
    DataService.clearSessionDuringNextAccountProfilePersistenceForTesting();

    await expectLater(
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.bio: 'Stale in-flight write',
      }),
      throwsStateError,
    );
    expect(prefs.getString('currentUser'), originalCurrent);
    expect(prefs.getString('users'), originalUsers);
    expect(prefs.getString('auth_session_v1'), isNull);
  });

  test('corrupt current profile fails closed and preserves exact bytes',
      () async {
    final corruptMap = <String, dynamic>{
      ...accountA.toJson(),
      'createdAt': 'not-a-date',
    };
    final corrupt = jsonEncode(corruptMap);
    final initial = state()..['currentUser'] = corrupt;
    SharedPreferences.setMockInitialValues(initial);

    await expectLater(DataService.getCurrentUser(), throwsFormatException);
    await expectLater(
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.bio: 'Must not repair',
      }),
      throwsFormatException,
    );
    expect(
      (await SharedPreferences.getInstance()).getString('currentUser'),
      corrupt,
    );
  });

  test('duplicate account identity fails closed without sanitizing users',
      () async {
    final duplicateEmail = User.fromJson(<String, dynamic>{
      ...accountB.toJson(),
      'email': accountA.email.toUpperCase(),
    });
    final raw = jsonEncode(<Object>[
      accountA.toJson(),
      duplicateEmail.toJson(),
    ]);
    final initial = state()..['users'] = raw;
    SharedPreferences.setMockInitialValues(initial);

    await expectLater(DataService.getUsers(), throwsFormatException);
    await expectLater(
      DataService.exportCurrentAccountProfileForPrivacy(),
      throwsFormatException,
    );
    await expectLater(
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.bio: 'Must not sanitize',
      }),
      throwsFormatException,
    );
    expect((await SharedPreferences.getInstance()).getString('users'), raw);
  });

  test('divergent paired profile fails closed for mutation export and deletion',
      () async {
    final divergent = User.fromJson(<String, dynamic>{
      ...accountA.toJson(),
      'bio': 'Divergent cached profile',
    });
    final initial = state(users: <User>[divergent, accountB]);
    SharedPreferences.setMockInitialValues(initial);
    final prefs = await SharedPreferences.getInstance();
    final originalCurrent = prefs.getString('currentUser');
    final originalUsers = prefs.getString('users');

    await expectLater(
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.city: 'Must not reconcile',
      }),
      throwsStateError,
    );
    await expectLater(
      DataService.exportCurrentAccountProfileForPrivacy(),
      throwsStateError,
    );
    await expectLater(
      DataService.anonymizeAndDeactivateUser(userId: accountA.id),
      throwsStateError,
    );
    expect(prefs.getString('currentUser'), originalCurrent);
    expect(prefs.getString('users'), originalUsers);
  });

  test('oversized field input fails before either document is changed',
      () async {
    SharedPreferences.setMockInitialValues(state());
    final prefs = await SharedPreferences.getInstance();
    final originalCurrent = prefs.getString('currentUser');
    final originalUsers = prefs.getString('users');

    await expectLater(
      update(<CurrentUserProfileField, Object?>{
        CurrentUserProfileField.bio: List<String>.filled(10001, 'x').join(),
      }),
      throwsArgumentError,
    );
    expect(prefs.getString('currentUser'), originalCurrent);
    expect(prefs.getString('users'), originalUsers);
  });

  test('bounded account capacity rejects overflow without pruning', () async {
    final full = <User>[
      accountA,
      for (var index = 1; index < DataService.maxLocalUsersForTesting; index++)
        buildTestUser(
          'rw9-capacity-$index',
          name: 'RW9 Capacity $index',
          email: 'rw9-capacity-$index@example.invalid',
        ),
    ];
    SharedPreferences.setMockInitialValues(state(users: full));
    final prefs = await SharedPreferences.getInstance();
    final originalCurrent = prefs.getString('currentUser');
    final originalUsers = prefs.getString('users');
    final overflow = buildTestUser(
      'rw9-capacity-overflow',
      name: 'RW9 Capacity Overflow',
      email: 'rw9-capacity-overflow@example.invalid',
    );

    await expectLater(DataService.setCurrentUser(overflow), throwsStateError);
    expect(prefs.getString('currentUser'), originalCurrent);
    expect(prefs.getString('users'), originalUsers);
  });

  test('completed paired write survives process-style recreation', () async {
    SharedPreferences.setMockInitialValues(state());
    await update(<CurrentUserProfileField, Object?>{
      CurrentUserProfileField.bio: 'Persisted before restart',
      CurrentUserProfileField.addressExtra: 'Hinterhof',
    });
    final beforeRestart = await SharedPreferences.getInstance();
    final persistedCurrent = beforeRestart.getString('currentUser')!;
    final persistedUsers = beforeRestart.getString('users')!;
    final persistedSession = beforeRestart.getString('auth_session_v1')!;

    SharedPreferences.setMockInitialValues(<String, Object>{
      'currentUser': persistedCurrent,
      'users': persistedUsers,
      'auth_session_v1': persistedSession,
      'qa_messages_notifs_seeded_v3_for_${accountA.id}': true,
    });

    final restored = await DataService.getCurrentUser();
    expect(restored!.bio, 'Persisted before restart');
    expect(restored.addressExtra, 'Hinterhof');
    final updatedAfterRestart = await update(<CurrentUserProfileField, Object?>{
      CurrentUserProfileField.city: 'Düsseldorf',
    });
    expect(updatedAfterRestart.city, 'Düsseldorf');
    expect(updatedAfterRestart.addressExtra, 'Hinterhof');
  });

  test('privacy export is exact-current-account and excludes cache/session',
      () async {
    SharedPreferences.setMockInitialValues(state());

    final export = await DataService.exportCurrentAccountProfileForPrivacy();
    expect(export['scope'], 'current-authenticated-account');
    expect(export['accountId'], accountA.id);
    expect(export['otherCachedProfilesExcluded'], isTrue);
    expect(export['authenticationSessionExcluded'], isTrue);
    expect((export['profile'] as Map)['email'], accountA.email);
    expect(jsonEncode(export), isNot(contains(accountB.email)));
    expect(jsonEncode(export), isNot(contains('auth_session_v1')));

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_session_v1', sessionFor(accountB));
    await expectLater(
      DataService.exportCurrentAccountProfileForPrivacy(),
      throwsStateError,
    );
  });

  test('deactivation is exact-current-account and paired-profile scoped',
      () async {
    SharedPreferences.setMockInitialValues(state());
    final prefs = await SharedPreferences.getInstance();
    final originalCurrent = prefs.getString('currentUser');
    final originalUsers = prefs.getString('users');

    await expectLater(
      DataService.anonymizeAndDeactivateUser(userId: accountB.id),
      throwsStateError,
    );
    expect(prefs.getString('currentUser'), originalCurrent);
    expect(prefs.getString('users'), originalUsers);

    await DataService.anonymizeAndDeactivateUser(userId: accountA.id);
    final current = User.fromJson(
      jsonDecode(prefs.getString('currentUser')!) as Map<String, dynamic>,
    );
    final users = (jsonDecode(prefs.getString('users')!) as List)
        .map((entry) => User.fromJson(Map<String, dynamic>.from(entry as Map)))
        .toList();
    final storedA = users.singleWhere((entry) => entry.id == accountA.id);
    final storedB = users.singleWhere((entry) => entry.id == accountB.id);
    expect(current.toJson(), storedA.toJson());
    expect(current.isDeactivated, isTrue);
    expect(current.displayName, 'Gelöschter Nutzer');
    expect(current.email, 'deleted+${accountA.id}@shareittoo.invalid');
    expect(current.phone, isNull);
    expect(current.photoURL, isNull);
    expect(current.city, isNull);
    expect(current.country, isNull);
    expect(current.payoutAccountId, isNull);
    expect(current.addressStreet, isNull);
    expect(current.socialInstagram, isNull);
    expect(current.languages, isEmpty);
    expect(current.interests, isEmpty);
    expect(storedB.toJson(), accountB.toJson());

    await expectLater(
      DataService.updateCurrentUserProfile(
        expectedUserId: accountA.id,
        updates: <CurrentUserProfileField, Object?>{
          CurrentUserProfileField.bio: 'Must stay closed',
        },
      ),
      throwsStateError,
    );
  });
}
