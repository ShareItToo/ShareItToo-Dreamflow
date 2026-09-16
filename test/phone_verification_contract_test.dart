import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';

void main() {
  test('phone verification accepts only normalized E.164 input', () {
    expect(
      AuthService.normalizePhoneNumber('00 49 (152) 123-45678'),
      '+4915212345678',
    );
    expect(
      AuthService.normalizePhoneNumber('+49 152 12345678'),
      '+4915212345678',
    );
    expect(AuthService.normalizePhoneNumber('0152 12345678'), isNull);
    expect(AuthService.normalizePhoneNumber('+0123456789'), isNull);
    expect(AuthService.normalizePhoneNumber('+49<script>'), isNull);
  });

  test('release phone flow contains no local SMS code or verification bypass',
      () {
    final source =
        File('lib/screens/contact_data_screen.dart').readAsStringSync();
    expect(source, isNot(contains('Demo SMS code')));
    expect(source, isNot(contains('phoneVerified: true')));
    expect(source, contains('Firebase Authentication (Google)'));
    expect(source, contains('ShareItToo speichert keinen SMS-Code'));
    expect(source, contains('.confirmPhoneVerification('));
    expect(source, contains('showTrackedModalBottomSheet'));
    expect(source, contains("'SMS-Code prüfen'"));
    expect(source, contains('gehört zu einer älteren SMS'));
    expect(source, contains('Die Ländervorwahl fehlt'));
    expect(source, contains('ungültige Länge'));
    expect(source, contains('Der Ergebnisstatus ist unbekannt'));
    expect(source, contains('serverseitig verarbeitet'));
    expect(source, isNot(contains('Telefonprüfung noch nicht verfügbar')));
    final coordinatorSource = File(
      'lib/services/contact_verification_service.dart',
    ).readAsStringSync();
    expect(
      coordinatorSource,
      contains('AuthService.confirmPhoneVerification'),
    );
    expect(source, isNot(contains('AuthService.confirmPhoneVerification')));
    final authSource =
        File('lib/services/auth_service.dart').readAsStringSync();
    expect(authSource, contains('/auth/phone-verification/status'));
    expect(authSource, contains("status['available'] != true"));
  });
}
