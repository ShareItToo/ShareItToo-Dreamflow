import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  String runtimePassword() {
    final letters = List<String>.generate(
      12,
      (index) => String.fromCharCode(65 + ((index * 7) % 26)),
    ).join();
    return '$letters${DateTime.now().microsecond}';
  }

  Future<AuthResult> register({
    required bool age,
    required bool terms,
    required bool privacy,
    bool privateUse = true,
  }) {
    return AuthService.registerLocalAccount(
      email: 'consent-${DateTime.now().microsecondsSinceEpoch}@example.invalid',
      password: runtimePassword(),
      displayName: 'Consent Test',
      minimumAgeConfirmed: age,
      termsAccepted: terms,
      privacyAccepted: privacy,
      privateUseConfirmed: privateUse,
    );
  }

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('registration rejects every missing explicit consent', () async {
    for (final values in [
      (age: false, terms: true, privacy: true),
      (age: true, terms: false, privacy: true),
      (age: true, terms: true, privacy: false),
    ]) {
      final result = await register(
        age: values.age,
        terms: values.terms,
        privacy: values.privacy,
      );
      expect(result.ok, isFalse);
      expect(result.failure, AuthFailure.consentRequired);
    }
    final privateUseMissing = await register(
      age: true,
      terms: true,
      privacy: true,
      privateUse: false,
    );
    expect(privateUseMissing.failure, AuthFailure.consentRequired);
  });

  test('local registration accepts only the complete consent set', () async {
    final result = await register(age: true, terms: true, privacy: true);

    expect(result.ok, isTrue);
    expect(result.session, isNotNull);
  });
}
