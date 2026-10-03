import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/web_google_auth.dart';

void main() {
  const backendCases = {
    'staging_account_not_allowlisted': AuthFailure.pilotAccountDenied,
    'staging_google_identity_not_allowlisted': AuthFailure.pilotAccountDenied,
    'staging_registration_disabled': AuthFailure.pilotRegistrationClosed,
    'staging_google_identity_conflict': AuthFailure.socialIdentityConflict,
    'social_identity_conflict': AuthFailure.socialIdentityConflict,
    'social_identity_changed': AuthFailure.socialIdentityConflict,
    'invalid_social_token': AuthFailure.socialTokenInvalid,
    'staging_google_registration_replay': AuthFailure.socialTokenInvalid,
    'social_registration_consents_required': AuthFailure.consentRequired,
    'registration_action_label_required': AuthFailure.consentRequired,
    'registration_action_label_mismatch': AuthFailure.consentRequired,
    'mfa_required': AuthFailure.mfaRequired,
    'mfa_reauthentication_required': AuthFailure.mfaRequired,
    'mfa_code_invalid': AuthFailure.mfaCodeRejected,
    'mfa_temporarily_locked': AuthFailure.mfaLocked,
    'mfa_challenge_expired': AuthFailure.mfaChallengeExpired,
    'mfa_challenge_invalid': AuthFailure.mfaChallengeInvalid,
    'invalid_mfa_challenge': AuthFailure.mfaChallengeInvalid,
  };
  for (final entry in backendCases.entries) {
    test('exact backend code ${entry.key} has a typed safe outcome', () {
      expect(AuthService.classifySocialBackendError(entry.key), entry.value);
      expect(
          AuthService.classifySocialBackendError(
              '${entry.key}:private-subject'),
          AuthFailure.network);
    });
  }
  const providerCases = {
    'popup-closed-by-user': AuthFailure.socialCancelled,
    'cancelled-popup-request': AuthFailure.socialCancelled,
    'web-context-cancelled': AuthFailure.socialCancelled,
    'canceled': AuthFailure.socialCancelled,
    'popup-blocked': AuthFailure.socialPopupBlocked,
    'network-request-failed': AuthFailure.network,
    'unauthorized-domain': AuthFailure.providerUnavailable,
    'operation-not-allowed': AuthFailure.providerUnavailable,
    'private-subject': AuthFailure.providerUnavailable,
  };
  for (final entry in providerCases.entries) {
    test('only typed SDK code ${entry.key} is classified', () {
      expect(
          AuthService.classifySocialProviderError(FirebaseAuthException(
            code: entry.key,
            message: 'private-email@example.invalid private-token',
          )),
          entry.value);
      expect(AuthService.classifySocialProviderError(StateError(entry.key)),
          AuthFailure.providerUnavailable);
    });
  }
  test('native SDK cancellation is distinct from an interruption', () {
    for (final code in GoogleSignInExceptionCode.values) {
      expect(
          AuthService.classifySocialProviderError(GoogleSignInException(
            code: code,
            description: 'private-token popup-blocked',
          )),
          code == GoogleSignInExceptionCode.canceled
              ? AuthFailure.socialCancelled
              : AuthFailure.providerUnavailable);
    }
  });
  test('sanitized web failures reach the service without raw provider data',
      () {
    for (final entry in {
      'popup_cancelled': AuthFailure.socialCancelled,
      'popup_blocked': AuthFailure.socialPopupBlocked,
      'network_request_failed': AuthFailure.network,
      'popup_unavailable': AuthFailure.providerUnavailable,
      'private-token': AuthFailure.providerUnavailable,
    }.entries) {
      expect(
          AuthService.classifySocialProviderError(
              WebGoogleAuthFailure(entry.key)),
          entry.value);
    }
  });
  test('Apple revocation availability is shown as a provider hold', () {
    expect(
      AuthService.classifySocialBackendError('apple_revocation_unavailable'),
      AuthFailure.providerUnavailable,
    );
  });

  test('Apple revocation exchange failures retain the provider hold mapping',
      () {
    for (final code in [
      'apple_revocation_exchange_unavailable',
      'apple_revocation_exchange_claim_lost',
    ]) {
      expect(
        AuthService.classifySocialBackendError(code),
        AuthFailure.providerUnavailable,
      );
    }
  });

  test('Apple v2 ownership terminal failures retain exact safe categories', () {
    for (final code in [
      'apple_ownership_status_unavailable',
      'apple_ownership_pending',
      'apple_attempt_unavailable',
      'apple_ownership_deadline_elapsed',
      'apple_ownership_unresolved',
      'apple_ownership_exchange_unresolved',
      'apple_ownership_cleanup_required',
      'apple_session_delivery_unavailable',
      'apple_session_delivery_uncertain',
    ]) {
      expect(
        AuthService.classifySocialBackendError(code),
        AuthFailure.appleOwnershipUnresolved,
        reason: code,
      );
    }
    for (final code in [
      'apple_ownership_request_conflict',
      'apple_authorization_code_reused',
      'apple_ownership_material_conflict',
      'apple_ownership_late_material_conflict',
      'apple_ownership_not_ready',
      'apple_delivery_superseded',
      'apple_session_delivery_exhausted',
    ]) {
      expect(
        AuthService.classifySocialBackendError(code),
        AuthFailure.socialIdentityConflict,
        reason: code,
      );
    }
    for (final code in [
      'apple_ownership_receipt_expired',
      'apple_ownership_status_rate_limited',
      'apple_ownership_binding_unavailable',
      'apple_ownership_coordination_unavailable',
      'apple_ownership_crypto_unavailable',
      'apple_ownership_delivery_unavailable',
      'apple_ownership_material_unreadable',
      'apple_ownership_profile_unavailable',
      'apple_ownership_upgrade_required',
    ]) {
      expect(
        AuthService.classifySocialBackendError(code),
        AuthFailure.providerUnavailable,
        reason: code,
      );
    }
  });

  test('unknown social backend failures remain non-specific', () {
    expect(
      AuthService.classifySocialBackendError('synthetic_unknown_error'),
      AuthFailure.network,
    );
  });
}
