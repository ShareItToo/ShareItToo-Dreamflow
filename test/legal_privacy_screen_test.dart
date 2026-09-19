import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('datenschutz ordnet zwecke rechtsgrundlagen und empfaenger getrennt zu',
      () async {
    final text =
        await File('lib/screens/legal_privacy_screen.dart').readAsString();

    expect(text, contains('Rechtsgrundlagen und Empfänger'));
    for (final basis in const [
      'Art. 6 Abs. 1 Buchst. a DSGVO',
      'Art. 6 Abs. 1 Buchst. b DSGVO',
      'Art. 6 Abs. 1 Buchst. c DSGVO',
      'Art. 6 Abs. 1 Buchst. f DSGVO',
    ]) {
      expect(text, contains(basis));
    }
    expect(text, contains('Widerspruch eingelegt werden'));
    expect(
        text,
        contains('Ein deaktivierter Zahlungs-, Social-Login-, '
            'Karten- oder KI-Anbieter'));
    expect(text,
        contains('technische Vorbereitung gilt nicht als rechtliche Freigabe'));
  });
}
