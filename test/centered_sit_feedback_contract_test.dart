import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('app feedback does not regress to bottom SnackBars', () {
    final dartFiles = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => file.path.endsWith('.dart'));

    for (final file in dartFiles) {
      final source = file.readAsStringSync();
      expect(
        RegExp(r'\bSnackBar\s*\(').hasMatch(source),
        isFalse,
        reason: '${file.path} must use the centered SIT popup system.',
      );
      expect(
        source.contains('showSnackBar('),
        isFalse,
        reason: '${file.path} must not show bottom feedback.',
      );
    }
  });
}
