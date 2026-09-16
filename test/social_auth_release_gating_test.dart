import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';

void main() {
  test('social providers remain fail-closed without release defines', () {
    for (final provider in AuthSocialProvider.values) {
      expect(
        AuthService.socialProviderEnabled(provider),
        isFalse,
        reason: '${provider.name} must require an explicit release opt-in',
      );
    }
  });
}
