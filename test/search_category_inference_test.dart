import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/search_category_inference.dart';

void main() {
  const coarse = <String>[
    'Technik & Elektronik',
    'Werkzeuge & Kleingeräte',
    'Baby & Familie',
  ];
  const vocabularies = <SearchCategoryVocabulary>[
    SearchCategoryVocabulary(
      coarseCategory: 'Technik & Elektronik',
      name: 'Elektronik',
      subcategories: ['VR', 'Kameras'],
    ),
    SearchCategoryVocabulary(
      coarseCategory: 'Werkzeuge & Kleingeräte',
      name: 'Werkzeuge & Maschinen',
      subcategories: ['Bohrmaschinen', 'Sägen'],
    ),
    SearchCategoryVocabulary(
      coarseCategory: 'Baby & Familie',
      name: 'Baby, Kinder & Spielzeug',
      subcategories: ['Kinderwagen', 'Sitze'],
    ),
  ];

  test('short free text SIT does not infer the unrelated Sitze category', () {
    expect(
      inferSearchCoarseCategory(
        raw: 'SIT',
        coarseCategories: coarse,
        vocabularies: vocabularies,
      ),
      isNull,
    );
  });

  test('short category terms still work on exact match', () {
    expect(
      inferSearchCoarseCategory(
        raw: 'VR',
        coarseCategories: coarse,
        vocabularies: vocabularies,
      ),
      'Technik & Elektronik',
    );
  });

  test('explicit short synonyms remain supported', () {
    expect(
      inferSearchCoarseCategory(
        raw: 'PKW',
        coarseCategories: [...coarse, 'Auto & Mobilität'],
        vocabularies: vocabularies,
      ),
      'Auto & Mobilität',
    );
  });

  test('long natural-language category hints remain supported', () {
    expect(
      inferSearchCoarseCategory(
        raw: 'Werkzeug für den Umzug',
        coarseCategories: coarse,
        vocabularies: vocabularies,
      ),
      'Werkzeuge & Kleingeräte',
    );
  });
}
