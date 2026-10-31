import 'package:flutter/foundation.dart';

import '../config/private_pilot_config.dart';
import 'backend_config.dart';
import 'release_identity.dart';
import 'remote_auth_attempt_transaction.dart';

class StagingPasswordEnrollmentEnvironment {
  final bool requested, web, backendEnabled, privatePilot, realPayments;
  final String apiBaseUrl, origin, releaseChannel;
  const StagingPasswordEnrollmentEnvironment({
    required this.requested,
    required this.web,
    required this.backendEnabled,
    required this.privatePilot,
    required this.realPayments,
    required this.apiBaseUrl,
    required this.origin,
    required this.releaseChannel,
  });

  bool get available =>
      requested &&
      web &&
      backendEnabled &&
      privatePilot &&
      !realPayments &&
      apiBaseUrl == 'https://staging.shareittoo.com/api/v1' &&
      origin == 'https://staging.shareittoo.com' &&
      releaseChannel == 'internal';

  static StagingPasswordEnrollmentEnvironment get current =>
      StagingPasswordEnrollmentEnvironment(
        requested: const bool.fromEnvironment(
            'SIT_WEB_PASSWORD_ENROLLMENT_ENABLED',
            defaultValue: false),
        web: kIsWeb,
        backendEnabled: BackendConfig.enabled,
        privatePilot: PrivatePilotConfig.enabled,
        realPayments: PrivatePilotConfig.realPaymentsEnabled,
        apiBaseUrl: BackendConfig.apiBaseUrl,
        origin: kIsWeb ? Uri.base.origin : '',
        releaseChannel: ReleaseIdentity.releaseChannel,
      );
}

class StagingPasswordEnrollmentUnavailable implements Exception {
  const StagingPasswordEnrollmentUnavailable();
}

/// Only transient request memory. Transport receives no authorization header,
/// URL token or retry key; consumed invitations never replay credentials.
Future<T> submitStagingPasswordEnrollment<T>({
  required bool available,
  required String enrollmentToken,
  required String email,
  required String password,
  required String displayName,
  required bool termsAccepted,
  required bool privacyAccepted,
  required bool minimumAgeConfirmed,
  required bool privateUseConfirmed,
  required String registrationActionLabel,
  required Future<Map<String, dynamic>> Function(Map<String, dynamic>) send,
  required bool Function() preflightCurrent,
  required bool Function() actionCurrent,
  required Future<T> Function(Map<String, dynamic>) persist,
  required Future<void> Function(Map<String, dynamic>) discardRemote,
  required Future<bool> Function(T) persistedCurrent,
  required Future<void> Function(T) discardPersisted,
}) async {
  final payload = <String, dynamic>{};
  try {
    enrollmentToken = enrollmentToken.trim();
    if (!available ||
        !RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(enrollmentToken) ||
        !termsAccepted ||
        !privacyAccepted ||
        !minimumAgeConfirmed ||
        !privateUseConfirmed ||
        registrationActionLabel != 'Kostenlos registrieren') {
      throw const StagingPasswordEnrollmentUnavailable();
    }
    payload.addAll({
      'email': email.trim(),
      'password': password,
      'displayName': displayName.trim(),
      'termsAccepted': termsAccepted,
      'privacyAccepted': privacyAccepted,
      'minimumAgeConfirmed': minimumAgeConfirmed,
      'privateUseConfirmed': privateUseConfirmed,
      'registrationActionLabel': registrationActionLabel,
      'enrollmentToken': enrollmentToken,
    });
    enrollmentToken = '';
    return await RemoteAuthAttemptTransaction<Map<String, dynamic>,
            Map<String, dynamic>, T>()
        .run(
      preflightCurrent: preflightCurrent,
      actionCurrent: actionCurrent,
      acquire: () async => payload,
      invokeRemote: send,
      persist: persist,
      discardRemote: discardRemote,
      persistedCurrent: persistedCurrent,
      discardPersisted: discardPersisted,
    );
  } finally {
    enrollmentToken = '';
    password = '';
    payload.clear();
  }
}
