import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/contact_data_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/contact_verification_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('email change rejects only exact structured backend contracts', () {
    const rejected = <BackendException>[
      BackendException(400, 'invalid_email'),
      BackendException(400, 'email_unchanged'),
      BackendException(401, 'authentication_required'),
      BackendException(401, 'invalid_or_expired_session'),
      BackendException(401, 'account_not_active'),
      BackendException(401, 'invalid_credentials'),
      BackendException(409, 'email_in_use'),
      BackendException(429, 'rate_limit_exceeded'),
    ];
    for (final error in rejected) {
      expect(
        ContactVerificationService.classifyEmailChangeFailure(error),
        ContactActionFailureKind.rejected,
      );
    }
  });

  test('408 intermediary and unstructured email failures stay unknown', () {
    const unknown = <BackendException>[
      BackendException(408, 'request_timeout'),
      BackendException(400, 'request_failed'),
      BackendException(401, 'request_failed'),
      BackendException(403, 'forbidden'),
      BackendException(409, 'conflict'),
      BackendException(422, 'unprocessable_content'),
      BackendException(429, 'request_failed'),
      BackendException(503, 'service_unavailable'),
    ];
    for (final error in unknown) {
      expect(
        ContactVerificationService.classifyEmailChangeFailure(error),
        ContactActionFailureKind.outcomeUnknown,
      );
    }
  });

  test('email verification has its own narrow rejection allowlist', () {
    expect(
      ContactVerificationService.classifyEmailVerificationFailure(
        const BackendException(429, 'rate_limit_exceeded'),
      ),
      ContactActionFailureKind.rejected,
    );
    for (final error in const <BackendException>[
      BackendException(408, 'request_timeout'),
      BackendException(400, 'request_failed'),
      BackendException(429, 'request_failed'),
      BackendException(503, 'service_unavailable'),
    ]) {
      expect(
        ContactVerificationService.classifyEmailVerificationFailure(error),
        ContactActionFailureKind.outcomeUnknown,
      );
    }
  });

  test('Account A is checked immediately before an email-change request',
      () async {
    final service = _SwitchableContactService();
    service.activateAccountB();

    await expectLater(
      service.requestEmailChange(
        context: _contextA,
        newEmail: 'next-a@example.invalid',
        currentPassword: _syntheticAccountProof,
      ),
      throwsA(
        isA<ContactActionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              ContactActionFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAcceptedOrConfirmed,
              'remote accepted',
              false,
            ),
      ),
    );
    expect(service.emailChangeCalls, 0);
  });

  test('accepted Account A request remains accepted truth after switch to B',
      () async {
    final remote = Completer<Map<String, dynamic>>();
    final service = _SwitchableContactService(emailChange: remote);
    final result = service.requestEmailChange(
      context: _contextA,
      newEmail: 'next-a@example.invalid',
      currentPassword: _syntheticAccountProof,
    );

    await Future<void>.delayed(Duration.zero);
    expect(service.emailChangeCalls, 1);
    service.activateAccountB();
    remote.complete(const <String, dynamic>{'accepted': true});

    await expectLater(
      result,
      throwsA(
        isA<ContactActionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              ContactActionFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAcceptedOrConfirmed,
              'remote accepted',
              true,
            ),
      ),
    );
  });

  test('automatic phone confirmation keeps confirmed truth after switch to B',
      () async {
    final phone = Completer<PhoneVerificationChallenge>();
    final service = _SwitchableContactService(phoneChallenge: phone);
    final result = service.requestPhoneVerification(
      context: _contextA,
      phoneNumber: '+4915112345678',
    );

    await Future<void>.delayed(Duration.zero);
    service.activateAccountB();
    phone.complete(
      PhoneVerificationChallenge(
        phoneNumber: '+4915112345678',
        automaticallyVerified: true,
        owner: _contextA.owner.authOwner,
        attemptEpoch: 1,
      ),
    );

    await expectLater(
      result,
      throwsA(
        isA<ContactActionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              ContactActionFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAcceptedOrConfirmed,
              'remote confirmed',
              true,
            ),
      ),
    );
  });

  test('phone challenge is inseparable from A owner and attempt epoch', () {
    final challenge = PhoneVerificationChallenge(
      phoneNumber: '+4915112345678',
      verificationId: 'synthetic-verification-id',
      owner: _contextA.owner.authOwner,
      attemptEpoch: 7,
    );

    expect(challenge.owner, same(_contextA.owner.authOwner));
    expect(challenge.attemptEpoch, 7);
  });

  test('phone cleanup cannot sign out a newer attempt with the same uid', () {
    expect(
      AuthService.shouldCleanUpPhoneIdentity(
        attemptEpoch: 4,
        currentAttemptEpoch: 4,
        signedInUid: 'synthetic-phone-uid',
        currentUid: 'synthetic-phone-uid',
      ),
      isTrue,
    );
    expect(
      AuthService.shouldCleanUpPhoneIdentity(
        attemptEpoch: 4,
        currentAttemptEpoch: 5,
        signedInUid: 'synthetic-phone-uid',
        currentUid: 'synthetic-phone-uid',
      ),
      isFalse,
    );
    expect(
      AuthService.shouldCleanUpPhoneIdentity(
        attemptEpoch: 4,
        currentAttemptEpoch: 4,
        signedInUid: 'synthetic-phone-uid-a',
        currentUid: 'synthetic-phone-uid-b',
      ),
      isFalse,
    );
  });

  test('phone backend rejects only exact structured contracts', () {
    const rejected = <BackendException, PhoneVerificationFailure>{
      BackendException(400, 'invalid_phone'):
          PhoneVerificationFailure.invalidPhone,
      BackendException(401, 'invalid_phone_verification_token'):
          PhoneVerificationFailure.invalidToken,
      BackendException(401, 'invalid_phone_verification_provider'):
          PhoneVerificationFailure.invalidToken,
      BackendException(401, 'authentication_required'):
          PhoneVerificationFailure.sessionExpired,
      BackendException(401, 'invalid_or_expired_session'):
          PhoneVerificationFailure.sessionExpired,
      BackendException(401, 'account_not_active'):
          PhoneVerificationFailure.sessionExpired,
      BackendException(404, 'user_not_found'):
          PhoneVerificationFailure.sessionExpired,
      BackendException(409, 'phone_already_verified'):
          PhoneVerificationFailure.phoneAlreadyVerified,
      BackendException(409, 'phone_identity_cleanup_unsafe'):
          PhoneVerificationFailure.unavailable,
      BackendException(422, 'phone_verification_mismatch'):
          PhoneVerificationFailure.phoneMismatch,
      BackendException(429, 'rate_limit_exceeded'):
          PhoneVerificationFailure.rateLimited,
      BackendException(503, 'phone_verification_unavailable'):
          PhoneVerificationFailure.unavailable,
      BackendException(502, 'phone_identity_cleanup_failed'):
          PhoneVerificationFailure.unavailable,
    };
    for (final MapEntry(:key, :value) in rejected.entries) {
      expect(AuthService.classifyPhoneBackendFailure(key), value);
    }
  });

  test('408 intermediary and unstructured phone failures stay unknown', () {
    const unknown = <BackendException>[
      BackendException(408, 'request_timeout'),
      BackendException(400, 'request_failed'),
      BackendException(401, 'request_failed'),
      BackendException(403, 'forbidden'),
      BackendException(409, 'conflict'),
      BackendException(422, 'unprocessable_content'),
      BackendException(429, 'request_failed'),
      BackendException(500, 'internal_error'),
      BackendException(503, 'service_unavailable'),
    ];
    for (final error in unknown) {
      expect(
        AuthService.classifyPhoneBackendFailure(error),
        PhoneVerificationFailure.outcomeUnknown,
      );
    }
  });

  test('confirmed phone cleanup failure preserves remote confirmation truth',
      () {
    final mapped = ContactVerificationService.mapPhoneFailure(
      const PhoneVerificationException(
        PhoneVerificationFailure.confirmedLocalIdentityCleanupFailed,
        remoteAcceptedOrConfirmed: true,
      ),
    );

    expect(mapped.kind, ContactActionFailureKind.localUnavailable);
    expect(mapped.remoteAcceptedOrConfirmed, isTrue);
    expect(mapped.code, 'confirmedLocalIdentityCleanupFailed');
  });

  test('unconfirmed phone cleanup failure never claims confirmation', () {
    final mapped = ContactVerificationService.mapPhoneFailure(
      const PhoneVerificationException(
        PhoneVerificationFailure.localIdentityCleanupFailed,
      ),
    );

    expect(mapped.kind, ContactActionFailureKind.localUnavailable);
    expect(mapped.remoteAcceptedOrConfirmed, isFalse);
  });

  test('changed login email or action epoch invalidates resend ownership', () {
    const owner = LoginEmailVerificationOwner(
      normalizedEmail: 'account-a@example.invalid',
      actionEpoch: 11,
    );

    expect(
      owner.isCurrent(
        email: ' ACCOUNT-A@example.invalid ',
        actionEpoch: 11,
      ),
      isTrue,
    );
    expect(
      owner.isCurrent(
        email: 'account-b@example.invalid',
        actionEpoch: 11,
      ),
      isFalse,
    );
    expect(
      owner.isCurrent(
        email: 'account-a@example.invalid',
        actionEpoch: 12,
      ),
      isFalse,
    );
  });

  testWidgets('dismissing A modal sheet preserves a newer B dialog',
      (tester) async {
    final aHandle = TrackedDialogRouteHandle<void>();
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
      showTrackedModalBottomSheet<void>(
        context: hostContext,
        handle: aHandle,
        isScrollControlled: true,
        builder: (_) => const Text('Account A sheet'),
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

    aHandle.dismiss();
    await tester.pumpAndSettle();

    expect(find.text('Account A sheet'), findsNothing);
    expect(find.text('Account B dialog'), findsOneWidget);
    bHandle.dismiss();
    await tester.pumpAndSettle();
  });

  testWidgets('delayed Account A email request cannot open a sheet under B',
      (tester) async {
    final remote = Completer<EmailVerificationRequestReceipt>();
    final service = _SwitchableContactScreenService(emailVerification: remote);
    await _pumpContactData(tester, service);

    final verifyEmail = find.text('E‑Mail bestätigen');
    await tester.ensureVisible(verifyEmail);
    await tester.tap(verifyEmail);
    await tester.pump();
    expect(service.emailVerificationCalls, 1);

    service.activateAccountB();
    await tester.pump();
    remote.complete(
      const EmailVerificationRequestReceipt(
        normalizedEmail: 'account-a@example.invalid',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Wir haben dir einen Bestätigungslink gesendet.'),
        findsNothing);
    expect(find.text(_userB.email), findsOneWidget);
  });

  testWidgets('Account A phone consent closes before any request under B',
      (tester) async {
    final service = _SwitchableContactScreenService();
    await _pumpContactData(tester, service);

    final verifyPhone = find.text('Telefonnummer verifizieren');
    await tester.ensureVisible(verifyPhone);
    await tester.tap(verifyPhone);
    await tester.pumpAndSettle();
    expect(find.text('SMS-Code anfordern?'), findsOneWidget);

    service.activateAccountB();
    await tester.pumpAndSettle();

    expect(find.text('SMS-Code anfordern?'), findsNothing);
    expect(service.phoneRequestCalls, 0);
  });

  testWidgets('closing Account A consent preserves a newer B-owned dialog',
      (tester) async {
    final service = _SwitchableContactScreenService();
    await _pumpContactData(tester, service);

    final verifyPhone = find.text('Telefonnummer verifizieren');
    await tester.ensureVisible(verifyPhone);
    await tester.tap(verifyPhone);
    await tester.pumpAndSettle();
    expect(find.text('SMS-Code anfordern?'), findsOneWidget);

    service.activateAccountB(notify: false);
    final bHandle = TrackedDialogRouteHandle<void>();
    unawaited(
      showTrackedDialog<void>(
        context: tester.element(find.byType(ContactDataScreen)),
        handle: bHandle,
        barrierLabel: 'Account B eigener Dialog',
        builder: (_) => const AlertDialog(
          title: Text('Account B eigener Dialog'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    service.notifyAccountChange();
    await tester.pumpAndSettle();

    expect(find.text('SMS-Code anfordern?'), findsNothing);
    expect(find.text('Account B eigener Dialog'), findsOneWidget);
    expect(service.phoneRequestCalls, 0);
    bHandle.dismiss();
    await tester.pumpAndSettle();
  });
}

const _syntheticAccountProof = 'synthetic-account-proof';

final _userA = buildTestUser(
  'account-a',
  name: 'Account A',
  email: 'account-a@example.invalid',
).copyWith(phone: '+4915112345678');
final _userB = buildTestUser(
  'account-b',
  name: 'Account B',
  email: 'account-b@example.invalid',
).copyWith(phone: '+4915223456789');

ContactVerificationContext _context(String id, User user, int epoch) =>
    ContactVerificationContext(
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

Future<void> _pumpContactData(
  WidgetTester tester,
  ContactVerificationService service,
) async {
  tester.view.physicalSize = const Size(900, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: ContactDataScreen(contactVerificationService: service),
    ),
  );
  await tester.pumpAndSettle();
}

class _SwitchableContactScreenService extends ContactVerificationService {
  final Completer<EmailVerificationRequestReceipt>? emailVerification;
  bool accountBActive = false;
  int emailVerificationCalls = 0;
  int phoneRequestCalls = 0;

  _SwitchableContactScreenService({this.emailVerification});

  @override
  bool get backendEnabled => true;

  @override
  Future<ContactVerificationContext?> loadCurrentContext() async =>
      accountBActive ? _contextB : _contextA;

  @override
  Future<bool> isContextCurrent(ContactVerificationContext context) async =>
      accountBActive
          ? identical(context, _contextB)
          : identical(context, _contextA);

  @override
  Future<EmailVerificationRequestReceipt> requestContactEmailVerification(
    ContactVerificationContext context,
  ) {
    emailVerificationCalls += 1;
    return emailVerification?.future ??
        Future<EmailVerificationRequestReceipt>.value(
          EmailVerificationRequestReceipt(
            normalizedEmail: context.user.email.toLowerCase(),
          ),
        );
  }

  @override
  Future<PhoneVerificationChallenge> requestPhoneVerification({
    required ContactVerificationContext context,
    required String phoneNumber,
  }) {
    phoneRequestCalls += 1;
    return Future<PhoneVerificationChallenge>.value(
      PhoneVerificationChallenge(
        phoneNumber: phoneNumber,
        verificationId: 'synthetic-verification-id',
        owner: context.owner.authOwner,
        attemptEpoch: 1,
      ),
    );
  }

  void activateAccountB({bool notify = true}) {
    accountBActive = true;
    if (notify) notifyAccountChange();
  }

  void notifyAccountChange() {
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
  }
}

class _SwitchableContactService extends ContactVerificationService {
  final Completer<Map<String, dynamic>>? emailChange;
  final Completer<PhoneVerificationChallenge>? phoneChallenge;
  bool accountBActive = false;
  int emailChangeCalls = 0;

  _SwitchableContactService({this.emailChange, this.phoneChallenge});

  @override
  bool get backendEnabled => true;

  @override
  Future<bool> isContextCurrent(ContactVerificationContext context) async =>
      accountBActive
          ? identical(context, _contextB)
          : identical(context, _contextA);

  @override
  Future<String?> accessTokenForOwner(
      ContactVerificationContext context) async {
    return await isContextCurrent(context) ? 'synthetic-access-token' : null;
  }

  @override
  Future<Map<String, dynamic>> sendEmailChangeRemote({
    required String accessToken,
    required String newEmail,
    required String currentPassword,
  }) {
    emailChangeCalls += 1;
    return emailChange?.future ??
        Future<Map<String, dynamic>>.value(
          const <String, dynamic>{'accepted': true},
        );
  }

  @override
  Future<PhoneVerificationChallenge> startPhoneVerificationProvider({
    required AuthSessionOwner owner,
    required String phoneNumber,
  }) =>
      phoneChallenge?.future ??
      Future<PhoneVerificationChallenge>.value(
        PhoneVerificationChallenge(
          phoneNumber: phoneNumber,
          owner: owner,
          attemptEpoch: 1,
        ),
      );

  void activateAccountB() {
    accountBActive = true;
  }
}
