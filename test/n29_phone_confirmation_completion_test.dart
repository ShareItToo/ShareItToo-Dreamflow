import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/contact_data_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/contact_verification_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('manual phone confirmation closes its sheet and reports success',
      (tester) async {
    final service = _PhoneScreenService();
    await _openCodeSheet(tester, service);
    await _confirm(tester);
    expect(service.confirmCalls, 1);
    expect(service.refreshCalls, 1);
    expect(_codeField, findsNothing);
    expect(find.text('Telefonnummer verifiziert'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('invalid code stays rejected without claiming confirmation',
      (tester) async {
    final service = _PhoneScreenService()
      ..confirmFailure = const ContactActionFailure.rejected('invalidCode');
    await _openCodeSheet(tester, service);
    await _confirm(tester);
    expect(service.confirmCalls, 1);
    expect(service.refreshCalls, 0);
    expect(_codeField, findsOneWidget);
    expect(find.textContaining('SMS-Code prüfen'), findsOneWidget);
    expect(find.text('Telefonnummer verifiziert'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('confirmed provider cleanup failure preserves confirmed truth',
      (tester) async {
    final service = _PhoneScreenService()
      ..confirmFailure = const ContactActionFailure.localUnavailable(
        'confirmedLocalIdentityCleanupFailed',
        remoteAcceptedOrConfirmed: true,
      );
    await _openCodeSheet(tester, service);
    await _confirm(tester);
    expect(find.textContaining('Telefonnummer bestätigt'), findsOneWidget);
    expect(find.textContaining('Ergebnisstatus ist unbekannt'), findsNothing);
    expect(service.refreshCalls, 0);
    _expectConfirmationDisabled(tester);
    expect(tester.takeException(), isNull);
  });

  for (final retryFailure in <ContactActionFailure?>[
    null,
    const ContactActionFailure.rejected('invalidCode'),
    const ContactActionFailure.outcomeUnknown(),
  ]) {
    testWidgets(
        'retry clears prior rejection before ${retryFailure?.kind.name ?? 'success'}',
        (tester) async {
      final service = _PhoneScreenService()
        ..confirmFailure = const ContactActionFailure.rejected('invalidCode');
      await _openCodeSheet(tester, service);
      await _confirm(tester);
      expect(find.textContaining('SMS-Code prüfen'), findsOneWidget);
      final pending = Completer<void>();
      service
        ..confirmFailure = retryFailure
        ..pendingConfirmation = pending;
      await tester.enterText(_codeField, '654321');
      await tester.tap(find.widgetWithText(FilledButton, 'Bestätigen'));
      await tester.pump();
      expect(service.confirmCalls, 2);
      expect(find.textContaining('SMS-Code prüfen'), findsNothing);
      expect(find.text('Telefonnummer verifiziert'), findsNothing);
      pending.complete();
      await tester.pumpAndSettle();
      if (retryFailure == null) {
        expect(_codeField, findsNothing);
        expect(find.text('Telefonnummer verifiziert'), findsOneWidget);
      } else {
        expect(_codeField, findsOneWidget);
        expect(find.text('Telefonnummer verifiziert'), findsNothing);
        expect(
            find.textContaining(
                retryFailure.kind == ContactActionFailureKind.rejected
                    ? 'SMS-Code prüfen'
                    : 'Ergebnisstatus'),
            findsOneWidget);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('post-confirmation refresh error cannot erase accepted truth',
      (tester) async {
    final service = _PhoneScreenService()
      ..refreshFailure = StateError('synthetic profile read unavailable');
    await _openCodeSheet(tester, service);
    await _confirm(tester);
    expect(service.confirmCalls, 1);
    expect(service.refreshCalls, 1);
    expect(find.textContaining('Telefonnummer bestätigt'), findsOneWidget);
    expect(find.textContaining('Ergebnisstatus ist unbekannt'), findsNothing);
    _expectConfirmationDisabled(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('late A confirmation never appears under B and A sheet closes',
      (tester) async {
    final pending = Completer<void>();
    final service = _PhoneScreenService()..pendingConfirmation = pending;
    await _openCodeSheet(tester, service);
    await tester.tap(find.widgetWithText(FilledButton, 'Bestätigen'));
    await tester.pump();
    expect(service.confirmCalls, 1);
    service.activateAccountB();
    await tester.pump();
    pending.complete();
    await tester.pumpAndSettle();
    expect(_codeField, findsNothing);
    expect(find.text('Telefonnummer verifiziert'), findsNothing);
    expect(service.refreshCalls, 0);
    expect(find.text(_userB.email), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'typed refresh rejection does not reject an accepted confirmation',
      (tester) async {
    final service = _PhoneScreenService()
      ..refreshFailure = const ContactActionFailure.rejected('sessionExpired');
    await _openCodeSheet(tester, service);
    await _confirm(tester);
    expect(find.textContaining('Telefonnummer bestätigt'), findsOneWidget);
    expect(find.textContaining('Erneut anmelden'), findsNothing);
    _expectConfirmationDisabled(tester);
    expect(service.confirmCalls, 1);
    expect(tester.takeException(), isNull);
  });

  for (final failure in <Object>[
    const ContactActionFailure.outcomeUnknown(),
    StateError('synthetic confirmation transport failure'),
  ]) {
    testWidgets('unconfirmed ${failure.runtimeType} remains unknown',
        (tester) async {
      final service = _PhoneScreenService()..confirmFailure = failure;
      await _openCodeSheet(tester, service);
      await _confirm(tester);
      expect(find.textContaining('Telefonnummer bestätigt'), findsNothing);
      expect(find.text('Telefonnummer verifiziert'), findsNothing);
      expect(find.textContaining('Ergebnisstatus'), findsOneWidget);
      expect(service.refreshCalls, 0);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('late A confirmation cannot close a newly opened B dialog',
      (tester) async {
    final pending = Completer<void>();
    final service = _PhoneScreenService()..pendingConfirmation = pending;
    await _openCodeSheet(tester, service);
    await tester.tap(find.widgetWithText(FilledButton, 'Bestätigen'));
    await tester.pump();
    service.activateAccountB();
    await tester.pumpAndSettle();
    _openForeignDialog(tester);
    await tester.pumpAndSettle();
    pending.complete();
    await tester.pumpAndSettle();
    expect(find.text('Unrelated current dialog'), findsOneWidget);
    expect(find.text('Telefonnummer verifiziert'), findsNothing);
    expect(_codeField, findsNothing);
    expect(service.refreshCalls, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('dismissed pending SMS sheet cannot navigate on late completion',
      (tester) async {
    final pending = Completer<void>();
    final service = _PhoneScreenService()..pendingConfirmation = pending;
    await _openCodeSheet(tester, service);
    await tester.tap(find.widgetWithText(FilledButton, 'Bestätigen'));
    await tester.pump();
    Navigator.of(tester.element(_codeField)).pop();
    await tester.pump(); // Route result received, exit animation still running.
    _openForeignDialog(tester);
    pending.complete();
    await tester.pumpAndSettle();
    expect(find.text('Unrelated current dialog'), findsOneWidget);
    expect(find.text('Telefonnummer verifiziert'), findsNothing);
    expect(service.refreshCalls, 0);
    expect(tester.takeException(), isNull);
  });
}

void _expectConfirmationDisabled(WidgetTester tester) {
  expect(tester.widget<TextField>(_codeField).readOnly, isTrue);
  expect(
    tester
        .widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Bestätigen'),
        )
        .onPressed,
    isNull,
  );
}

void _openForeignDialog(WidgetTester tester) {
  unawaited(showDialog<void>(
    context: tester.element(find.byType(ContactDataScreen)),
    builder: (_) => const AlertDialog(title: Text('Unrelated current dialog')),
  ));
}

final _codeField = find.byWidgetPredicate((widget) =>
    widget is TextField && widget.decoration?.labelText == 'SMS‑Code');

Future<void> _openCodeSheet(
  WidgetTester tester,
  _PhoneScreenService service,
) async {
  tester.view.physicalSize = const Size(900, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: ContactDataScreen(contactVerificationService: service),
  ));
  await tester.pumpAndSettle();
  final verify =
      find.widgetWithText(FilledButton, 'Telefonnummer verifizieren');
  await tester.ensureVisible(verify);
  await tester.tap(verify);
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(FilledButton, 'Code senden'));
  await tester.pumpAndSettle();
  expect(service.requestCalls, 1);
  await tester.enterText(_codeField, '123456');
  await tester.pumpAndSettle();
}

Future<void> _confirm(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(FilledButton, 'Bestätigen'));
  await tester.pumpAndSettle();
}

final _userA =
    buildTestUser('n29-a', name: 'N29 A', email: 'n29-a@example.invalid')
        .copyWith(phone: '+4915112345678');
final _userB =
    buildTestUser('n29-b', name: 'N29 B', email: 'n29-b@example.invalid');

ContactVerificationContext _context(User user, int epoch) =>
    ContactVerificationContext(
      user: user,
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: user.id,
          sessionId: 'n29-session-$epoch',
          email: user.email,
          createdAt: DateTime.utc(2026, 9, 3, epoch),
          epoch: epoch,
        ),
        profileUserId: user.id,
      ),
    );

class _PhoneScreenService extends ContactVerificationService {
  final contextA = _context(_userA, 1);
  final contextB = _context(_userB, 2);
  bool accountBActive = false;
  int requestCalls = 0;
  int confirmCalls = 0;
  int refreshCalls = 0;
  Object? confirmFailure;
  Object? refreshFailure;
  Completer<void>? pendingConfirmation;

  @override
  bool get backendEnabled => true;

  @override
  Future<ContactVerificationContext?> loadCurrentContext() async =>
      accountBActive ? contextB : contextA;

  @override
  Future<bool> isContextCurrent(ContactVerificationContext context) async =>
      identical(context, accountBActive ? contextB : contextA);

  @override
  Future<PhoneVerificationChallenge> requestPhoneVerification({
    required ContactVerificationContext context,
    required String phoneNumber,
  }) async {
    requestCalls += 1;
    return PhoneVerificationChallenge(
      phoneNumber: phoneNumber,
      verificationId: 'synthetic-challenge',
      owner: context.owner.authOwner,
      attemptEpoch: 1,
    );
  }

  @override
  Future<PhoneVerificationConfirmationReceipt> confirmPhoneVerification({
    required ContactVerificationContext context,
    required PhoneVerificationChallenge challenge,
    required String smsCode,
  }) async {
    confirmCalls += 1;
    if (pendingConfirmation case final pending?) await pending.future;
    if (confirmFailure case final failure?) throw failure;
    return PhoneVerificationConfirmationReceipt(
      context: context,
      phoneNumber: challenge.phoneNumber,
    );
  }

  @override
  Future<ContactProfileRefreshResult> refreshVerifiedProfile(
    ContactVerificationContext context,
  ) async {
    refreshCalls += 1;
    if (refreshFailure case final failure?) throw failure;
    return ContactProfileRefreshResult.refreshed(
      context.user.copyWith(phoneVerified: true),
    );
  }

  void activateAccountB() {
    accountBActive = true;
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
  }
}
