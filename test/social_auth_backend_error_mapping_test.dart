import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';

void main() {
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

  test('unknown social backend failures remain non-specific', () {
    expect(
      AuthService.classifySocialBackendError('synthetic_unknown_error'),
      AuthFailure.network,
    );
  });
}
