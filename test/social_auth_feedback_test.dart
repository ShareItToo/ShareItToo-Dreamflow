import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/widgets/social_auth_feedback.dart';

void main() {
  final cases = <String, String>{
    'staging_account_not_allowlisted':
        'Mit diesem Konto ist die Anmeldung im Privatpiloten nicht möglich. Nutze dein eingeladenes Konto oder wende dich an den SIT-Support.',
    'staging_registration_disabled':
        'Neue Konten können im Privatpiloten nur mit Einladung angelegt werden. Nutze dein bestehendes SIT-Konto oder wende dich an den SIT-Support.',
    'staging_google_identity_conflict':
        'Diese Anmeldung konnte nicht deinem SIT-Konto zugeordnet werden. Nutze deine bisherige Anmeldung oder wende dich an den SIT-Support.',
    'social_identity_conflict':
        'Diese Anmeldung konnte nicht deinem SIT-Konto zugeordnet werden. Nutze deine bisherige Anmeldung oder wende dich an den SIT-Support.',
    'invalid_social_token':
        'Die Google-Anmeldung ist nicht mehr gültig. Starte die Anmeldung erneut.',
    'social_registration_consents_required':
        'Für dein erstes SIT-Konto bestätige bitte Alter, private Nutzung, AGB und Datenschutz in der Registrierung.',
    'mfa_required':
        'Für diese Anmeldung ist eine Zwei-Faktor-Bestätigung nötig. Starte die Anmeldung erneut und bestätige den Sicherheitscode.',
    'mfa_code_invalid':
        'Der Sicherheitscode wurde nicht akzeptiert. Prüfe den Code und versuche es erneut.',
    'mfa_temporarily_locked':
        'Die Zwei-Faktor-Anmeldung ist vorübergehend gesperrt. Warte etwas und versuche es erneut.',
    'mfa_challenge_expired':
        'Die Sicherheitsanforderung ist abgelaufen oder ungültig. Starte die Anmeldung erneut.',
    'mfa_challenge_invalid':
        'Die Sicherheitsanforderung ist abgelaufen oder ungültig. Starte die Anmeldung erneut.',
    'private-subject private-email@example.invalid private-token':
        'Die Anmeldung konnte nicht abgeschlossen werden. Prüfe deine Verbindung und versuche es erneut.',
  };
  for (final entry in cases.entries) {
    testWidgets('${entry.key} renders exact sanitized German feedback',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: Builder(
        builder: (context) => TextButton(
          onPressed: () => showSocialAuthFailure(context,
              failure: AuthService.classifySocialBackendError(entry.key),
              provider: AuthSocialProvider.google),
          child: const Text('Anmelden'),
        ),
      ))));
      final action = find.text('Anmelden').hitTestable();
      expect(action, findsOneWidget);
      await tester.tap(action);
      await tester.pumpAndSettle();
      expect(find.text(entry.value), findsOneWidget);
      expect(find.textContaining('private-token'), findsNothing);
      expect(find.textContaining('private-subject'), findsNothing);
      expect(find.textContaining('noch nicht freigeschaltet'), findsNothing);
      await tester.tap(find.bySemanticsLabel('Schließen').hitTestable());
      await tester.pumpAndSettle();
      expect(find.text(entry.value), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
  test('popup and unavailable hints do not invent provider activation state',
      () {
    expect(
        socialAuthFailureMessage(
            AuthFailure.socialPopupBlocked, AuthSocialProvider.google),
        'Der Browser hat das Anmeldefenster blockiert. Erlaube Pop-ups für diese Seite und versuche es erneut.');
    expect(
        socialAuthFailureMessage(
            AuthFailure.providerUnavailable, AuthSocialProvider.google),
        'Die Google-Anmeldung ist derzeit nicht verfügbar. Versuche es später erneut oder nutze deine bisherige Anmeldung.');
    for (final failure in [
      AuthFailure.socialCancelled,
      AuthFailure.principalChanged
    ]) {
      expect(
          socialAuthFailureMessage(failure, AuthSocialProvider.google), isNull);
    }
  });
  test(
      'both entry screens use classified feedback and never log raw social errors',
      () {
    for (final name in ['login_screen', 'register_screen']) {
      final source = File('lib/screens/$name.dart').readAsStringSync();
      expect(source, contains('await showSocialAuthFailure('));
      expect(source, contains('failure: result.failure'));
      expect(source, isNot(contains('ist noch nicht freigeschaltet')));
      expect(
          RegExp(r"social (sign-in|registration) failed: \$error")
              .hasMatch(source),
          isFalse);
    }
    final auth = File('lib/services/auth_service.dart').readAsStringSync();
    final social = auth.substring(
        auth.indexOf(
            'static Future<AuthResult> _signInWithSocialProviderOwned('),
        auth.indexOf('static AuthMfaChallenge? _parseMfaChallenge'));
    expect(social, isNot(contains(r'${error.cause}')));
    expect(social, isNot(contains(r'failed: $error')));
    expect(social, contains(r'${failure.name}'));
  });
}
