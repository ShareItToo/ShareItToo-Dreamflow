import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/utils/registration_input_policy.dart';

void main() {
  test('registration keeps display name and email input separate', () {
    expect(registrationDisplayNameError('Walid Chraibi'), isNull);
    expect(
      registrationDisplayNameError('name@example.invalid'),
      'Bitte gib hier deinen Namen ein – nicht deine E-Mail-Adresse.',
    );
  });
}
