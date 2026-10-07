import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/profile_info_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(const <String, Object>{});
  });

  testWidgets(
    'self-generated profile refresh preserves save owner and closes only profile route',
    (tester) async {
      final service = _SelfNotifyingProfileService();
      await _openProfileEditor(tester, service);

      await tester.tap(find.text('Speichern'));
      await tester.pump();

      expect(service.updateCalls, 1);
      expect(
        service.loadCalls,
        1,
        reason: 'the save-owned profile event must be deferred',
      );

      service.completeSuccess();
      await tester.pump();
      await tester.pump();

      expect(find.text('Gespeichert'), findsOneWidget);
      expect(
        service.loadCalls,
        1,
        reason: 'the authoritative mutation result supersedes its own event',
      );

      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      expect(find.text('launcher'), findsOneWidget);
      expect(find.byType(ProfileInfoScreen), findsNothing);
    },
  );

  testWidgets(
    'failed self-notifying save clears busy state and performs one coalesced refresh',
    (tester) async {
      final service = _SelfNotifyingProfileService();
      await _openProfileEditor(tester, service);

      await tester.tap(find.text('Speichern'));
      await tester.pump();
      service.completeUnknownFailure();
      await tester.pump();
      await tester.pump();
      await tester.pump();

      expect(find.text('Serverseitig gespeichert'), findsOneWidget);
      expect(service.loadCalls, 1);

      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      expect(find.byType(ProfileInfoScreen), findsOneWidget);
      expect(find.text('Speichern…'), findsNothing);
      final save = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Speichern'),
      );
      expect(save.onPressed, isNotNull);
      expect(
        service.loadCalls,
        2,
        reason:
            'the uncertain result requires exactly one authoritative reload',
      );
    },
  );
}

Future<void> _openProfileEditor(
  WidgetTester tester,
  ProfileMutationService service,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<LocalizationController>(
      create: (_) => LocalizationController(),
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (_) =>
                      ProfileInfoScreen(profileMutationService: service),
                ),
              ),
              child: const Text('launcher'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('launcher'));
  await tester.pumpAndSettle();
  expect(find.byType(ProfileInfoScreen), findsOneWidget);
  expect(find.text('Speichern'), findsOneWidget);
}

final User _user = buildTestUser(
  'profile-save-user',
  name: 'Profile Save',
  email: 'profile-save@example.invalid',
).copyWith(photoURL: 'https://example.invalid/original.png');

final ProfileMutationContext _context = ProfileMutationContext(
  user: _user,
  owner: SessionTransitionOwner(
    authOwner: AuthSessionOwner(
      userId: _user.id,
      sessionId: 'profile-save-session',
      email: _user.email,
      createdAt: DateTime.utc(2026, 9, 28),
      epoch: 1,
    ),
    profileUserId: _user.id,
  ),
);

class _SelfNotifyingProfileService extends ProfileMutationService {
  final Completer<AccountProfileMutationResult> _result =
      Completer<AccountProfileMutationResult>();
  int loadCalls = 0;
  int updateCalls = 0;

  @override
  Future<ProfileMutationContext?> loadCurrentContext() async {
    loadCalls += 1;
    return _context;
  }

  @override
  Future<bool> isContextCurrent(ProfileMutationContext context) async =>
      identical(context, _context) || context.owner == _context.owner;

  @override
  Future<AccountProfileMutationResult> updateProfile({
    required ProfileMutationContext context,
    required Map<CurrentUserProfileField, Object?> updates,
  }) {
    updateCalls += 1;
    SharedPersistenceSync.notify(SharedPersistenceSync.profileStateKey);
    return _result.future;
  }

  void completeSuccess() {
    _result.complete(
      AccountProfileMutationResult(
        user: _user.copyWith(photoURL: 'https://example.invalid/persisted.png'),
        remoteAccepted: true,
      ),
    );
  }

  void completeUnknownFailure() {
    _result.completeError(
      const ProfileMutationFailure.outcomeUnknown(
        'profile_projection_unavailable',
        remoteAccepted: true,
      ),
    );
  }
}
