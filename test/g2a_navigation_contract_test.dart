import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/navigation/main_navigation.dart';

void main() {
  test('G2A primary navigation keeps the approved five destinations in order',
      () {
    expect(
      mainNavigationLabelKeys,
      const <String>[
        'Entdecken',
        'Mietkorb',
        'Buchungen',
        'Nachrichten',
        'Mein SIT',
      ],
    );
  });
}
