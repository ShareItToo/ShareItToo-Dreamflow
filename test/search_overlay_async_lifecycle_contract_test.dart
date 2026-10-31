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
    expect(source,
        contains('result = await OpenAIConfig.parseSearchQuery(prompt);'));
    expect(source, contains('if (!mounted) return;'));
    expect(source, contains('Suchen und übernehmen'));
    expect(source, contains('_parsingSmartSearch'));
    expect(source, contains('final LatestSearchRecompute _nearbyRecompute'));
    expect(
      source,
      contains(
        '_nearbyRecompute.schedule(_recomputeNearbySuggestionsForGeneration)',
      ),
    );
    expect(source, contains('_nearbyRecompute.dispose();'));
    expect(
      RegExp(
        r'if \(!mounted \|\| !_nearbyRecompute\.isCurrent\(generation\)\) return;',
      ).allMatches(source).length,
      greaterThanOrEqualTo(2),
    );
    expect(
      source,
      contains(
        'if (mounted && _nearbyRecompute.isCurrent(generation))',
      ),
    );
    expect(
      source,
      contains('onTapOutside: (_) => _whatFocus.unfocus()'),
    );
    expect(
      source,
      matches(RegExp(
        r'Future<void> _openCategoryPicker\(\) async \{\s+'
        r'FocusScope\.of\(context\)\.unfocus\(\);\s+'
        r'_aiFocus\.unfocus\(\);\s+'
        r'_whatFocus\.unfocus\(\);\s+'
        r'_whereFocus\.unfocus\(\);\s+'
        r'_hideWhatOverlay\(\);\s+'
        r'_hideWhereOverlay\(\);\s+'
        r'await WidgetsBinding\.instance\.endOfFrame;\s+'
        r'if \(!mounted\) return;',
      )),
    );
  });
}
