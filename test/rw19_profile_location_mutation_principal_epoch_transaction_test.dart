import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/change_address_screen.dart';
import 'package:lendify/screens/contact_data_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/contact_verification_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/profile_mutation_interaction.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('profile mutation rejects only exact structured backend contracts', () {
    for (final error in const <BackendException>[
      BackendException(400, 'minimum_age_required'),
      BackendException(400, 'invalid_phone'),
      BackendException(401, 'authentication_required'),
      BackendException(401, 'invalid_or_expired_session'),
      BackendException(401, 'account_not_active'),
      BackendException(404, 'user_not_found'),
    ]) {
      expect(
        ProfileMutationService.classifyBackendFailure(error),
        ProfileMutationFailureKind.rejected,
      );
    }
  });

  test('408 intermediary and unstructured profile failures stay unknown', () {
    for (final error in const <BackendException>[
      BackendException(408, 'request_timeout'),
      BackendException(400, 'request_failed'),
      BackendException(401, 'request_failed'),
      BackendException(403, 'forbidden'),
      BackendException(409, 'conflict'),
      BackendException(422, 'unprocessable_content'),
      BackendException(429, 'rate_limit_exceeded'),
      BackendException(503, 'service_unavailable'),
    ]) {
      expect(
        ProfileMutationService.classifyBackendFailure(error),
        ProfileMutationFailureKind.outcomeUnknown,
      );
    }
  });

  test('Account A is checked immediately before profile mutation', () async {
    final service = _SwitchableProfileMutationService()..activateAccountB();

    await expectLater(
      service.updateProfile(
        context: _contextA,
        updates: const <CurrentUserProfileField, Object?>{
          CurrentUserProfileField.city: 'A-Stadt',
        },
      ),
      throwsA(
        isA<ProfileMutationFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              ProfileMutationFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              false,
            ),
      ),
    );
    expect(service.mutationCalls, 0);
  });

  test('accepted Account A mutation remains accepted truth after switch to B',
      () async {
    final remote = Completer<AccountProfileMutationResult>();
    final service = _SwitchableProfileMutationService(mutation: remote);
    final result = service.updateProfile(
      context: _contextA,
      updates: const <CurrentUserProfileField, Object?>{
        CurrentUserProfileField.city: 'A-Stadt',
      },
    );

    await Future<void>.delayed(Duration.zero);
    expect(service.mutationCalls, 1);
    service.activateAccountB();
    remote.complete(AccountProfileMutationResult(
      user: _userA.copyWith(city: 'A-Stadt'),
      remoteAccepted: true,
    ));

    await expectLater(
      result,
      throwsA(
        isA<ProfileMutationFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              ProfileMutationFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              true,
            ),
      ),
    );
  });

  test('post-acceptance local failure never becomes profile not changed',
      () async {
    final service = _SwitchableProfileMutationService(
      failure: const AccountProfileMutationFailure.localUnavailable(
        'local_profile_persistence_failed',
        remoteAccepted: true,
      ),
    );

    await expectLater(
      service.updateProfile(
        context: _contextA,
        updates: const <CurrentUserProfileField, Object?>{
          CurrentUserProfileField.city: 'A-Stadt',
        },
      ),
      throwsA(
        isA<ProfileMutationFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              ProfileMutationFailureKind.localUnavailable,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              true,
            ),
      ),
    );
  });

  test('profile action owner binds exact context and action epoch', () {
    final owner = ProfileMutationActionOwner(
      context: _contextA,
      actionEpoch: 7,
    );

    expect(
      owner.isSynchronouslyCurrent(
        context: _contextA,
        actionEpoch: 7,
      ),
      isTrue,
    );
    expect(
      owner.isSynchronouslyCurrent(
        context: _contextB,
        actionEpoch: 7,
      ),
      isFalse,
    );
    expect(
      owner.isSynchronouslyCurrent(
        context: _contextA,
        actionEpoch: 8,
      ),
      isFalse,
    );
  });

  testWidgets('dismissing A profile sheet preserves a newer B dialog',
      (tester) async {
    final controller = ProfileMutationInteractionController()
      ..replaceContext(_contextA);
    final owner = controller.capture()!;
    final bHandle = TrackedDialogRouteHandle<void>();
    late BuildContext hostContext;

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            hostContext = context;
            return const Scaffold(body: Text('host'));
          },
        ),
      ),
    );

    unawaited(
      controller.showOwnedSheet<void>(
        context: hostContext,
        owner: owner,
        builder: (_) => const Text('Account A profile sheet'),
      ),
    );
    await tester.pumpAndSettle();
    unawaited(
      showTrackedDialog<void>(
        context: hostContext,
        handle: bHandle,
        barrierLabel: 'Account B dialog',
        builder: (_) => const AlertDialog(title: Text('Account B dialog')),
      ),
    );
    await tester.pumpAndSettle();

    controller.invalidate();
    await tester.pumpAndSettle();

    expect(find.text('Account A profile sheet'), findsNothing);
    expect(find.text('Account B dialog'), findsOneWidget);
    bHandle.dismiss();
    await tester.pumpAndSettle();
    controller.dispose();
  });

  testWidgets('Account A map sheet closes before any mutation under B',
      (tester) async {
    final profile = _SwitchableProfileMutationService();
    final contact = _SwitchableContactContextService(profile);
    await _pumpLarge(
      tester,
      ContactDataScreen(
        contactVerificationService: contact,
        profileMutationService: profile,
      ),
    );

    final mapButton = find.text('Standort auf Karte bestätigen');
    await tester.ensureVisible(mapButton);
    await tester.tap(mapButton);
    await tester.pumpAndSettle();
    expect(find.text('Dein Standort (ungefähr)'), findsOneWidget);

    profile.activateAccountB(notify: true);
    await tester.pumpAndSettle();

    expect(find.text('Dein Standort (ungefähr)'), findsNothing);
    expect(profile.mutationCalls, 0);
    expect(find.text(_userB.email), findsOneWidget);
  });

  testWidgets('accepted A address result cannot surface or navigate under B',
      (tester) async {
    final mutation = Completer<AccountProfileMutationResult>();
    final profile = _SwitchableProfileMutationService(mutation: mutation);
    await _pumpLarge(
      tester,
      ChangeAddressScreen(profileMutationService: profile),
    );

    final field = find.byType(TextField);
    await tester.enterText(field, 'Neue Straße 12, 12345 A-Stadt');
    await tester.tap(find.text('Speichern'));
    await tester.pump();
    expect(profile.mutationCalls, 1);

    profile.activateAccountB(notify: true);
    await tester.pump();
    mutation.complete(AccountProfileMutationResult(
      user: _userA.copyWith(homeLocation: 'Neue Straße 12, 12345 A-Stadt'),
      remoteAccepted: true,
    ));
    await tester.pumpAndSettle();

    expect(find.text('Adresse gespeichert'), findsNothing);
    expect(find.byType(ChangeAddressScreen), findsOneWidget);
    expect(
      tester.widget<TextField>(field).controller?.text,
      _userB.homeLocation,
    );
  });
}

final _userA = buildTestUser(
  'account-a',
  name: 'Account A',
  email: 'account-a@example.invalid',
).copyWith(
  homeLocation: 'A Straße 1, 74072 A-Stadt',
  addressStreet: 'A Straße',
  addressHouseNumber: '1',
  addressPostalCode: '74072',
  addressCity: 'A-Stadt',
  addressCountry: 'Deutschland',
);
final _userB = buildTestUser(
  'account-b',
  name: 'Account B',
  email: 'account-b@example.invalid',
).copyWith(
  homeLocation: 'B Straße 2, 74074 B-Stadt',
  addressStreet: 'B Straße',
  addressHouseNumber: '2',
  addressPostalCode: '74074',
  addressCity: 'B-Stadt',
  addressCountry: 'Deutschland',
);

ProfileMutationContext _context(String id, User user, int epoch) =>
    ProfileMutationContext(
      user: user,
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: id,
          sessionId: 'session-$id',
          email: user.email,
          createdAt: DateTime.utc(2026, 8, 26, epoch),
          epoch: epoch,
        ),
        profileUserId: id,
      ),
    );

final _contextA = _context('account-a', _userA, 1);
final _contextB = _context('account-b', _userB, 2);

Future<void> _pumpLarge(WidgetTester tester, Widget child) async {
  tester.view.physicalSize = const Size(900, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: child));
  await tester.pumpAndSettle();
}

class _SwitchableProfileMutationService extends ProfileMutationService {
  final Completer<AccountProfileMutationResult>? mutation;
  final AccountProfileMutationFailure? failure;
  bool accountBActive = false;
  int mutationCalls = 0;

  _SwitchableProfileMutationService({this.mutation, this.failure});

  @override
  Future<ProfileMutationContext?> loadCurrentContext() async =>
      accountBActive ? _contextB : _contextA;

  @override
  Future<bool> isContextCurrent(ProfileMutationContext context) async =>
      accountBActive
          ? identical(context, _contextB)
          : identical(context, _contextA);

  @override
  Future<AccountProfileMutationResult> performProfileMutation({
    required ProfileMutationContext context,
    required Map<CurrentUserProfileField, Object?> updates,
  }) {
    mutationCalls += 1;
    if (failure case final failure?) {
      return Future<AccountProfileMutationResult>.error(failure);
    }
    return mutation?.future ??
        Future<AccountProfileMutationResult>.value(
          AccountProfileMutationResult(
            user: context.user,
            remoteAccepted: false,
          ),
        );
  }

  void activateAccountB({bool notify = false}) {
    accountBActive = true;
    if (notify) {
      SharedPersistenceSync.notify(
        SharedPersistenceSync.accountSecurityStateKey,
      );
    }
  }
}

class _SwitchableContactContextService extends ContactVerificationService {
  final _SwitchableProfileMutationService profile;

  _SwitchableContactContextService(this.profile);

  @override
  Future<ContactVerificationContext?> loadCurrentContext() async {
    final context = profile.accountBActive ? _contextB : _contextA;
    return ContactVerificationContext(
      user: context.user,
      owner: context.owner,
    );
  }

  @override
  Future<bool> isContextCurrent(ContactVerificationContext context) async {
    final expected = profile.accountBActive ? _contextB : _contextA;
    return context.user.id == expected.user.id &&
        identical(context.owner, expected.owner);
  }
}
