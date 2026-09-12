import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('search overlay guards every asynchronous UI update after disposal', () {
    final source = File('lib/widgets/search_overlay.dart').readAsStringSync();

    expect(
      source,
      matches(RegExp(
        r'items = await DataService\.getPublicItems\(\);\s+'
        r'if \(!mounted\) return;\s+'
        r'users = await DataService\.getUsers\(\);\s+'
        r'if \(!mounted\) return;\s+'
        r'me = await DataService\.getCurrentUser\(\);\s+'
        r'if \(!mounted\) return;\s+'
        r'categories = await DataService\.getCategories\(\);\s+'
        r'if \(!mounted\) return;',
      )),
    );
    expect(
      source,
      contains('''final result = await OpenAIConfig.parseSearchQuery(prompt);
    if (!mounted) return;'''),
    );
    expect(
      RegExp(
        r'final items = await DataService\.getItems\(\);\s+if \(!mounted\) return;',
      ).allMatches(source).length,
      greaterThanOrEqualTo(2),
    );
    expect(
      source,
      contains('''if (!mounted) return;
      setState(() {
        _displayNearby = available.take(16).toList();'''),
    );
  });
}
