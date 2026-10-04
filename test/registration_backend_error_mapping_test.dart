import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';

void main() {
  test('only exact structured 403 maps to the closed-pilot outcome', () {
    expect(
      AuthService.classifyRegistrationBackendError(
        const BackendException(403, 'staging_registration_disabled'),
      ),
      AuthFailure.pilotRegistrationClosed,
    );
  });

  test(
      'unknown unstructured and mismatched failures remain uncertain network outcomes',
      () {
    for (final error in [
      const BackendException(403, 'request_failed'),
      const BackendException(403, 'invalid_server_response'),
      const BackendException(403, 'origin_not_allowed'),
      const BackendException(403, 'forbidden'),
      const BackendException(403, 'staging_registration_disabled_other'),
      const BackendException(403, ' staging_registration_disabled'),
      const BackendException(500, 'staging_registration_disabled'),
      const BackendException(0, 'staging_registration_disabled'),
    ]) {
      expect(AuthService.classifyRegistrationBackendError(error),
          AuthFailure.network);
    }
  });

  test('existing consent password and delivery outcomes are preserved', () {
    for (final code in [
      'password_too_short',
      'password_too_long',
      'password_too_weak'
    ]) {
      expect(
          AuthService.classifyRegistrationBackendError(
              BackendException(400, code)),
          AuthFailure.weakPassword);
    }
    for (final code in [
      'registration_consents_required',
      'registration_action_label_required',
      'registration_action_label_mismatch'
    ]) {
      expect(
          AuthService.classifyRegistrationBackendError(
              BackendException(400, code)),
          AuthFailure.consentRequired);
    }
    expect(
        AuthService.classifyRegistrationBackendError(
            const BackendException(503, 'verification_delivery_unavailable')),
        AuthFailure.verificationDeliveryUnavailable);
  });
}
