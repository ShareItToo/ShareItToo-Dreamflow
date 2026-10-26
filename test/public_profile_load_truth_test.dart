import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/public_profile_screen.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/safety_action_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/user_avatar.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('public profile starts independent public reads before awaiting them',
      () async {
    final source =
        await File('lib/screens/public_profile_screen.dart').readAsString();
    final loadStart = source.indexOf('Future<void> _load() async');
    final supportStart = source.indexOf(
      'Future<void> _openProfileSupportFlow',
      loadStart,
    );
    final load = source.substring(loadStart, supportStart);
    final contextStart = load.indexOf(
      'final actionContextFuture = _safetyService.loadCurrentContext()',
    );
    final catalogStart = load.indexOf(
      'final publicCatalogFuture = DataService.getPublicCatalogSnapshot()',
    );
    final firstAwait = load.indexOf('final actionContext = await');

    expect(contextStart, greaterThanOrEqualTo(0));
    expect(catalogStart, greaterThan(contextStart));
    expect(firstAwait, greaterThan(catalogStart));
    expect(load, isNot(contains('final items = await DataService.getItems()')));
    expect(load, contains('canViewPublicProfileFromBlockedUsers'));
    expect(load, contains('filterVisiblePublicItemsFromBlockedUsers'));
    expect(load, isNot(contains('await ProfileEcosystemService.canView')));
  });

  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{
        'items': '[]',
      }));

  Widget app({required PublicProfileUserLoader loadUser}) {
    return ChangeNotifierProvider(
      create: (_) => LocalizationController(),
      child: MaterialApp(
        home: PublicProfileScreen(
          userId: 'profile-under-test',
          safetyActionService: const _GuestSafetyActionService(),
          loadUser: loadUser,
        ),
      ),
    );
  }

  testWidgets('missing public profile is an explicit error, never a spinner',
      (tester) async {
    await tester.pumpWidget(app(loadUser: (_) async => null));
    await tester.pumpAndSettle();

    expect(find.text('Profil konnte nicht geladen werden'), findsOneWidget);
    expect(find.text('Erneut laden'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byIcon(Icons.more_vert), findsNothing);
  });

  testWidgets('public profile retry can replace an unavailable read',
      (tester) async {
    var calls = 0;
    final recovered = buildTestUser(
      'recovered-profile',
      name: 'Wieder geladenes Profil',
    );
    await tester.pumpWidget(app(loadUser: (_) async {
      calls += 1;
      return calls == 1 ? null : recovered;
    }));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Erneut laden'));
    await tester.pumpAndSettle();

    expect(calls, 2);
    expect(find.text('Wieder geladenes Profil'), findsWidgets);
    expect(find.text('Profil konnte nicht geladen werden'), findsNothing);
    expect(find.byIcon(Icons.more_vert), findsOneWidget);
    expect(find.byTooltip('Mehr Optionen'), findsOneWidget);
  });

  testWidgets('profile state refreshes the mounted public avatar by user id',
      (tester) async {
    var calls = 0;
    final loadedIds = <String>[];
    final initial = buildTestUser(
      'profile-under-test',
      name: 'Öffentliches Profil',
    ).copyWith(photoURL: 'https://example.invalid/avatar-before.webp');
    final refreshed = initial.copyWith(
      photoURL: 'https://example.invalid/avatar-after.webp',
    );

    await tester.pumpWidget(app(loadUser: (id) async {
      loadedIds.add(id);
      calls += 1;
      return calls == 1 ? initial : refreshed;
    }));
    await tester.pumpAndSettle();
    expect(
      tester.widget<SitUserAvatar>(find.byType(SitUserAvatar).first).url,
      'https://example.invalid/avatar-before.webp',
    );

    SharedPersistenceSync.notify(SharedPersistenceSync.profileStateKey);
    await tester.pumpAndSettle();

    expect(calls, 2);
    expect(loadedIds, ['profile-under-test', 'profile-under-test']);
    expect(
      tester.widget<SitUserAvatar>(find.byType(SitUserAvatar).first).url,
      'https://example.invalid/avatar-after.webp',
    );
  });

  testWidgets(
      'profile refresh cannot leak the viewer avatar into another profile',
      (tester) async {
    var calls = 0;
    final loadedIds = <String>[];
    final other = buildTestUser('other-profile', name: 'Anderes Profil')
        .copyWith(photoURL: 'https://example.invalid/other-avatar.webp');
    final refreshedOther = other.copyWith(
      photoURL: 'https://example.invalid/other-avatar-refreshed.webp',
    );
    final viewerAvatar =
        'https://example.invalid/viewer-avatar-must-not-appear.webp';

    await tester.pumpWidget(ChangeNotifierProvider(
      create: (_) => LocalizationController(),
      child: MaterialApp(
        home: PublicProfileScreen(
          userId: 'other-profile',
          safetyActionService: const _GuestSafetyActionService(),
          loadUser: (id) async {
            loadedIds.add(id);
            calls += 1;
            return calls == 1 ? other : refreshedOther;
          },
        ),
      ),
    ));
    await tester.pumpAndSettle();

    SharedPersistenceSync.notify(SharedPersistenceSync.profileStateKey);
    await tester.pumpAndSettle();

    expect(loadedIds, ['other-profile', 'other-profile']);
    final avatarUrl =
        tester.widget<SitUserAvatar>(find.byType(SitUserAvatar).first).url;
    expect(avatarUrl, 'https://example.invalid/other-avatar-refreshed.webp');
    expect(avatarUrl, isNot(viewerAvatar));
  });

  testWidgets('disposed public profile ignores later profile notifications',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(app(loadUser: (_) async {
      calls += 1;
      return buildTestUser('profile-under-test', name: 'Profil');
    }));
    await tester.pumpAndSettle();
    expect(calls, 1);

    await tester.pumpWidget(const SizedBox.shrink());
    SharedPersistenceSync.notify(SharedPersistenceSync.profileStateKey);
    await tester.pump();

    expect(calls, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('session refresh clears the old profile before the next await',
      (tester) async {
    final nextProfile = Completer<User?>();
    var calls = 0;
    final oldProfile = buildTestUser('profile-a', name: 'Profil A');
    final newProfile = buildTestUser('profile-b', name: 'Profil B');
    await tester.pumpWidget(app(loadUser: (_) {
      calls += 1;
      return calls == 1 ? Future.value(oldProfile) : nextProfile.future;
    }));
    await tester.pumpAndSettle();
    expect(find.text('Profil A'), findsWidgets);

    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pump();

    expect(calls, 2);
    expect(find.text('Profil A'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    nextProfile.complete(newProfile);
    await tester.pumpAndSettle();
    expect(find.text('Profil B'), findsWidgets);
    expect(find.text('Profil A'), findsNothing);
  });

  testWidgets('a delayed pre-switch response cannot replace current truth',
      (tester) async {
    final staleProfile = Completer<User?>();
    final currentProfile = Completer<User?>();
    var calls = 0;
    await tester.pumpWidget(app(loadUser: (_) {
      calls += 1;
      return calls == 1 ? staleProfile.future : currentProfile.future;
    }));
    await tester.pump();

    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pump();
    expect(calls, 2);

    currentProfile.complete(
      buildTestUser('profile-b', name: 'Aktuelles Profil B'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Aktuelles Profil B'), findsWidgets);

    staleProfile.complete(
      buildTestUser('profile-a', name: 'Verspätetes Profil A'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Aktuelles Profil B'), findsWidgets);
    expect(find.text('Verspätetes Profil A'), findsNothing);
  });
}

class _GuestSafetyActionService extends SafetyActionService {
  const _GuestSafetyActionService();

  @override
  Future<SafetyActionContext?> loadCurrentContext() async => null;
}
