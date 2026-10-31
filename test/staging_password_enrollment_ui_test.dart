import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/screens/legal_terms_screen.dart';
import 'package:lendify/screens/legal_privacy_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'staging_password_enrollment_client_test.dart'
    show environment, invitation, credential;

const fieldKey = ValueKey('staging-password-invitation');
InvitedRegistration callback(
        Future<AuthResult> Function(Map<String, Object?>) run) =>
    ({
      required email,
      required password,
      required displayName,
      required enrollmentToken,
      required expectedSessionEpoch,
      required isActionCurrent,
      required termsAccepted,
      required privacyAccepted,
      required minimumAgeConfirmed,
      required privateUseConfirmed,
      required registrationActionLabel,
    }) =>
        run({
          'email': email,
          'password': password,
          'displayName': displayName,
          'enrollmentToken': enrollmentToken,
          'termsAccepted': termsAccepted,
          'privacyAccepted': privacyAccepted,
          'minimumAgeConfirmed': minimumAgeConfirmed,
          'privateUseConfirmed': privateUseConfirmed,
          'registrationActionLabel': registrationActionLabel,
          'isActionCurrent': isActionCurrent
        });

Future<void> fill(WidgetTester tester, {bool validForm = true}) async {
  final fields = find.byType(TextFormField);
  await tester.enterText(fields.at(0), validForm ? 'Synthetic Person' : '');
  await tester.enterText(fields.at(1), 'synthetic@example.invalid');
  await tester.enterText(fields.at(2), credential());
  await tester.ensureVisible(find.byKey(fieldKey));
  await tester.enterText(find.byKey(fieldKey), '  ${invitation()}  ');
}

Future<void> submit(WidgetTester tester) async {
  final action = find.text('Kostenlos registrieren');
  await tester.pumpAndSettle();
  await tester.ensureVisible(action);
  await tester.pumpAndSettle();
  expect(action.hitTestable(), findsOneWidget);
  await tester.tap(action.hitTestable());
  await tester.pump();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });
  testWidgets(
      'ordinary and native/foreign/disabled gates never expose invitation',
      (tester) async {
    for (final env in [
      null,
      environment(requested: false),
      environment(web: false),
      environment(origin: 'https://shareittoo.com'),
      environment(backend: false)
    ]) {
      await tester.pumpWidget(
          MaterialApp(home: RegisterScreen(debugEnrollmentEnvironment: env)));
      await tester.pumpAndSettle();
      expect(find.byKey(fieldKey), findsNothing);
    }
  });

  testWidgets(
      'gated field is obscured and clears synchronously even for invalid form',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(
        home: RegisterScreen(
            debugEnrollmentEnvironment: environment(),
            debugInvitedRegistration: callback((_) async {
              calls++;
              return const AuthResult.failure(AuthFailure.network);
            }))));
    await tester.pumpAndSettle();
    final field = tester.widget<TextField>(find.byKey(fieldKey));
    expect(field.obscureText, isTrue);
    expect(field.enableSuggestions, isFalse);
    expect(field.enableIMEPersonalizedLearning, isFalse);
    expect(field.autofillHints, isEmpty);
    await fill(tester, validForm: false);
    await submit(tester);
    expect(field.controller!.text, isEmpty);
    expect(calls, 0);
  });

  testWidgets(
      'trimmed invitation submits exact consent action and stays empty after generic denial',
      (tester) async {
    Map<String, Object?>? captured;
    final completion = Completer<AuthResult>();
    await tester.pumpWidget(MaterialApp(
        home: RegisterScreen(
            debugEnrollmentEnvironment: environment(),
            debugInvitedRegistration: callback((input) {
              captured = input;
              return completion.future;
            }))));
    await tester.pumpAndSettle();
    final controller =
        tester.widget<TextField>(find.byKey(fieldKey)).controller!;
    await fill(tester);
    await submit(tester);
    expect(controller.text, isEmpty);
    expect(captured!['enrollmentToken'], invitation());
    for (final key in [
      'termsAccepted',
      'privacyAccepted',
      'minimumAgeConfirmed',
      'privateUseConfirmed'
    ]) {
      expect(captured![key], isTrue);
    }
    expect(captured!['registrationActionLabel'], 'Kostenlos registrieren');
    completion.complete(
        const AuthResult.failure(AuthFailure.pilotRegistrationClosed));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(controller.text, isEmpty);
    expect(find.text('Einladung nicht verfügbar'), findsOneWidget);
    expect(find.textContaining(invitation()), findsNothing);
    expect(
        (await SharedPreferences.getInstance())
            .getKeys()
            .any((key) => key.contains('invitation')),
        isFalse);
    await tester.tap(find.bySemanticsLabel('Schließen'));
    await tester.pumpAndSettle();
  });

  testWidgets(
      'legal reading preserves code and paste caps after trimming; edits clear old error',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: RegisterScreen(debugEnrollmentEnvironment: environment())));
    await tester.pumpAndSettle();
    final controller =
        tester.widget<TextField>(find.byKey(fieldKey)).controller!;
    await tester.enterText(find.byKey(fieldKey), '  ${invitation()}extra  ');
    expect(controller.text, invitation());
    for (final legal in ['SIT-Plattformbedingungen', 'Datenschutzerklärung']) {
      final link = find.text(legal).first;
      await tester.ensureVisible(link);
      await tester.pumpAndSettle();
      expect(link.hitTestable(), findsOneWidget);
      await tester.tap(link);
      await tester.pumpAndSettle();
      expect(
          find.byType(legal == 'SIT-Plattformbedingungen'
              ? LegalTermsScreen
              : LegalPrivacyScreen),
          findsOneWidget);
      expect(controller.text, invitation());
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(controller.text, invitation());
    }
    await fill(tester);
    await tester.enterText(find.byKey(fieldKey), 'short');
    await submit(tester);
    expect(controller.text, isEmpty);
    expect(find.text('Bitte gib deinen Einladungscode erneut ein.'),
        findsOneWidget);
    await tester.ensureVisible(find.byKey(fieldKey));
    await tester.enterText(find.byKey(fieldKey), 's');
    await tester.pump();
    expect(
        find.text('Bitte gib deinen Einladungscode erneut ein.'), findsNothing);
  });

  testWidgets('secret-bearing exception never reaches UI or debug output',
      (tester) async {
    final logs = <String>[];
    final oldPrint = debugPrint;
    debugPrint = (String? message, {int? wrapWidth}) {
      logs.add(message ?? '');
    };
    addTearDown(() => debugPrint = oldPrint);
    await tester.pumpWidget(MaterialApp(
        home: RegisterScreen(
            debugEnrollmentEnvironment: environment(),
            debugInvitedRegistration:
                callback((_) async => throw StateError(invitation())))));
    await tester.pumpAndSettle();
    final controller =
        tester.widget<TextField>(find.byKey(fieldKey)).controller!;
    await fill(tester);
    await submit(tester);
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Registrierung nicht bestätigt'), findsOneWidget);
    expect(find.textContaining(invitation()), findsNothing);
    expect(logs.join(), isNot(contains(invitation())));
    expect(controller.text, isEmpty);
    await tester.tap(find.bySemanticsLabel('Schließen'));
    await tester.pumpAndSettle();
    expect(controller.text, isEmpty);
    debugPrint = oldPrint;
  });

  testWidgets(
      'disposal clears unsubmitted token and makes pending action obsolete',
      (tester) async {
    Map<String, Object?>? captured;
    final completion = Completer<AuthResult>();
    await tester.pumpWidget(MaterialApp(
        home: RegisterScreen(
            debugEnrollmentEnvironment: environment(),
            debugInvitedRegistration: callback((input) {
              captured = input;
              return completion.future;
            }))));
    await tester.pumpAndSettle();
    await fill(tester);
    await submit(tester);
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    expect((captured!['isActionCurrent'] as bool Function())(), isFalse);
    completion.complete(const AuthResult.failure(AuthFailure.network));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(MaterialApp(
        home: RegisterScreen(debugEnrollmentEnvironment: environment())));
    await tester.pumpAndSettle();
    final controller =
        tester.widget<TextField>(find.byKey(fieldKey)).controller!;
    var last = '';
    controller.addListener(() {
      last = controller.text;
    });
    await tester.enterText(find.byKey(fieldKey), invitation());
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    expect(last, isEmpty);
  });
}
