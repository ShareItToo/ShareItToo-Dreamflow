import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import 'app_popup.dart';

/// User feedback accepts only classified failures, never provider/server text.
String? socialAuthFailureMessage(
    AuthFailure? failure, AuthSocialProvider provider) {
  final label = switch (provider) {
    AuthSocialProvider.google => 'Google',
    AuthSocialProvider.apple => 'Apple',
    AuthSocialProvider.facebook => 'Facebook',
  };
  return switch (failure) {
    AuthFailure.socialCancelled || AuthFailure.principalChanged => null,
    AuthFailure.pilotAccountDenied =>
      'Mit diesem Konto ist die Anmeldung im Privatpiloten nicht möglich. Nutze dein eingeladenes Konto oder wende dich an den SIT-Support.',
    AuthFailure.pilotRegistrationClosed =>
      'Neue Konten können im Privatpiloten nur mit Einladung angelegt werden. Nutze dein bestehendes SIT-Konto oder wende dich an den SIT-Support.',
    AuthFailure.socialIdentityConflict ||
    AuthFailure.socialProviderAlreadyLinked =>
      'Diese Anmeldung konnte nicht deinem SIT-Konto zugeordnet werden. Nutze deine bisherige Anmeldung oder wende dich an den SIT-Support.',
    AuthFailure.socialTokenInvalid =>
      'Die $label-Anmeldung ist nicht mehr gültig. Starte die Anmeldung erneut.',
    AuthFailure.socialPopupBlocked =>
      'Der Browser hat das Anmeldefenster blockiert. Erlaube Pop-ups für diese Seite und versuche es erneut.',
    AuthFailure.providerUnavailable =>
      'Die $label-Anmeldung ist derzeit nicht verfügbar. Versuche es später erneut oder nutze deine bisherige Anmeldung.',
    AuthFailure.consentRequired =>
      'Für dein erstes SIT-Konto bestätige bitte Alter, private Nutzung, AGB und Datenschutz in der Registrierung.',
    AuthFailure.socialEmailRequired =>
      '$label hat keine E-Mail-Adresse übermittelt. Gib sie dort frei oder nutze deine bisherige Anmeldung.',
    AuthFailure.socialEmailVerificationRequired =>
      'Bestätige deine E-Mail-Adresse bei $label und melde dich erneut an.',
    AuthFailure.socialAccountLinkRequiresReauthentication =>
      'Nutze zunächst deine bisherige SIT-Anmeldung, bevor du $label verbindest.',
    AuthFailure.accountNotActive =>
      'Dieses SIT-Konto ist derzeit nicht aktiv. Wende dich an den SIT-Support.',
    AuthFailure.mfaRequired =>
      'Für diese Anmeldung ist eine Zwei-Faktor-Bestätigung nötig. Starte die Anmeldung erneut und bestätige den Sicherheitscode.',
    AuthFailure.mfaCodeRejected =>
      'Der Sicherheitscode wurde nicht akzeptiert. Prüfe den Code und versuche es erneut.',
    AuthFailure.mfaLocked =>
      'Die Zwei-Faktor-Anmeldung ist vorübergehend gesperrt. Warte etwas und versuche es erneut.',
    AuthFailure.mfaChallengeExpired ||
    AuthFailure.mfaChallengeInvalid =>
      'Die Sicherheitsanforderung ist abgelaufen oder ungültig. Starte die Anmeldung erneut.',
    _ =>
      'Die Anmeldung konnte nicht abgeschlossen werden. Prüfe deine Verbindung und versuche es erneut.',
  };
}

Future<void> showSocialAuthFailure(
  BuildContext context, {
  required AuthFailure? failure,
  required AuthSocialProvider provider,
}) async {
  final message = socialAuthFailureMessage(failure, provider);
  if (message == null) return;
  await AppPopup.error(context,
      title: 'Anmeldung nicht möglich', message: message);
}
