class SearchCategoryVocabulary {
  final String coarseCategory;
  final String name;
  final List<String> subcategories;

  const SearchCategoryVocabulary({
    required this.coarseCategory,
    required this.name,
    required this.subcategories,
  });
}

/// Infers a coarse category only when the free text is sufficiently specific.
///
/// Short inputs remain useful when they are an exact category/subcategory or
/// an explicit synonym. They must not match an unrelated longer word by
/// substring (for example `SIT` -> `Sitze`).
String? inferSearchCoarseCategory({
  required String raw,
  required List<String> coarseCategories,
  required Iterable<SearchCategoryVocabulary> vocabularies,
}) {
  final query = raw.trim().toLowerCase();
  if (query.isEmpty) return null;

  for (final category in coarseCategories) {
    if (category.toLowerCase() == query) return category;
  }

  const synonymHints = <String, String>{
    'auto': 'Auto & Mobilität',
    'wagen': 'Auto & Mobilität',
    'pkw': 'Auto & Mobilität',
    'mercedes': 'Auto & Mobilität',
    'bmw': 'Auto & Mobilität',
    'audi': 'Auto & Mobilität',
    'transporter': 'Auto & Mobilität',
    'wohnmobil': 'Auto & Mobilität',
    'fahrrad': 'Auto & Mobilität',
    'ebike': 'Auto & Mobilität',
    'e-bike': 'Auto & Mobilität',
    'e scooter': 'Auto & Mobilität',
    'e-scooter': 'Auto & Mobilität',
    'camping': 'Reisen & Camping',
    'zelt': 'Reisen & Camping',
    'reise': 'Reisen & Camping',
    'urlaub': 'Reisen & Camping',
    'party': 'Events & Feiern',
    'feier': 'Events & Feiern',
    'hochzeit': 'Events & Feiern',
    'geburtstag': 'Events & Feiern',
    'werkzeug': 'Werkzeuge & Kleingeräte',
    'bohrer': 'Werkzeuge & Kleingeräte',
    'säge': 'Werkzeuge & Kleingeräte',
    'saege': 'Werkzeuge & Kleingeräte',
    'kleidung': 'Kleidung & Anlässe',
    'anzug': 'Kleidung & Anlässe',
    'kleid': 'Kleidung & Anlässe',
    'kostüm': 'Kleidung & Anlässe',
    'kostuem': 'Kleidung & Anlässe',
    'baby': 'Baby & Familie',
    'familie': 'Baby & Familie',
    'kinderwagen': 'Baby & Familie',
    'garten': 'Garten & Outdoor',
    'grill': 'Garten & Outdoor',
    'büro': 'Büro & Lernen',
    'buero': 'Büro & Lernen',
    'office': 'Büro & Lernen',
    'schule': 'Büro & Lernen',
  };
  for (final hint in synonymHints.entries) {
    if (query.contains(hint.key) && coarseCategories.contains(hint.value)) {
      return hint.value;
    }
  }

  // Three-character free text is too ambiguous for substring inference.
  // Exact values above and explicit synonyms remain supported at any length.
  final allowSubstringInference = query.runes.length >= 4;
  for (final vocabulary in vocabularies) {
    if (!coarseCategories.contains(vocabulary.coarseCategory)) continue;
    final name = vocabulary.name.toLowerCase();
    if (name == query ||
        (allowSubstringInference &&
            (name.contains(query) || query.contains(name)))) {
      return vocabulary.coarseCategory;
    }
    for (final subcategory in vocabulary.subcategories) {
      final candidate = subcategory.toLowerCase();
      if (candidate == query ||
          (allowSubstringInference &&
              (candidate.contains(query) || query.contains(candidate)))) {
        return vocabulary.coarseCategory;
      }
    }
  }

  if (allowSubstringInference) {
    for (final category in coarseCategories) {
      final candidate = category.toLowerCase();
      if (candidate.contains(query) || query.contains(candidate)) {
        return category;
      }
    }
  }
  return null;
}
