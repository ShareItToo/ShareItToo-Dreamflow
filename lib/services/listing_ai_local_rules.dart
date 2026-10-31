import 'package:flutter/foundation.dart' show visibleForTesting;

/// Bounded, local and non-provider helpers used by automatic UI paths.
/// Results are intentionally labelled as rules, never as model output.
class ListingAiLocalRules {
  ListingAiLocalRules._();

  static const Map<String, List<String>> _categoryTerms = {
    'Technik & Elektronik': [
      'kamera',
      'smartphone',
      'tablet',
      'laptop',
      'audio',
      'elektronik'
    ],
    'Werkzeuge & Kleingeräte': [
      'werkzeug',
      'bohrmaschine',
      'bohrer',
      'säge',
      'schleifer'
    ],
    'Haushalt & Wohnen': [
      'haushalt',
      'staubsauger',
      'mixer',
      'kaffee',
      'möbel',
      'tisch',
      'stuhl'
    ],
    'Sport & Hobbys': [
      'sport',
      'fahrrad',
      'ski',
      'gitarre',
      'gaming',
      'konsole'
    ],
    'Garten & Outdoor': [
      'garten',
      'rasenmäher',
      'heckenschere',
      'camping',
      'zelt'
    ],
    'Events & Feiern': ['party', 'event', 'pavillon', 'deko'],
    'Baby & Familie': ['baby', 'kind', 'familie'],
    'Reisen & Camping': ['reise', 'rucksack', 'koffer', 'schlafsack'],
    'Kleidung & Anlässe': ['kleidung', 'jacke', 'anzug', 'schuhe', 'tasche'],
    'Büro & Lernen': ['büro', 'drucker', 'monitor', 'präsentation'],
  };

  static const Set<String> _stopWords = {
    'ich',
    'suche',
    'miete',
    'mieten',
    'für',
    'fuer',
    'in',
    'aus',
    'von',
    'am',
    'vom',
    'bis',
    'der',
    'die',
    'das',
    'ein',
    'eine',
    'einen',
    'und',
    'mit',
  };

  static String _normalize(String value) => value
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[^\wäöüß€.,:/-]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ');

  static Map<String, dynamic> parseSearchQuery(String input, {DateTime? now}) {
    final value = input.trim();
    if (value.isEmpty || value.length > 500) return _emptySearch;
    final lower = _normalize(value);
    final dates =
        RegExp(r'\b(?:morgen|\d{1,2}\.\d{1,2}\.\d{4}|20\d{2}-\d{2}-\d{2})\b')
            .allMatches(value)
            .map((match) => _parseDate(match.group(0)!, now ?? DateTime.now()))
            .whereType<String>()
            .toList(growable: false);
    final where = RegExp(
      r'\b(?:in|am|vom)\s+([\p{L}][\p{L}\s-]{1,50}?)(?=\s+(?:für|fuer|am|vom|bis|ab|unter|morgen|\d{1,2}\.\d{1,2}\.\d{4}|20\d{2}-\d{2}-\d{2}|\d+\s*€)|$)',
      unicode: true,
    ).firstMatch(value)?.group(1)?.trim();
    final money = _parseMoney(value);
    final whereMatch = RegExp(
      r'\b(?:in|am|vom)\s+[\p{L}][\p{L}\s-]{1,50}?(?=\s+(?:für|fuer|am|vom|bis|ab|unter|morgen|\d{1,2}\.\d{1,2}\.\d{4}|20\d{2}-\d{2}-\d{2}|\d+\s*€)|$)',
      unicode: true,
    ).firstMatch(value);
    final what = lower
        .replaceAll(whereMatch?.group(0)?.toLowerCase() ?? '', ' ')
        .replaceAll(
            RegExp(r'\b(?:für|fuer)\s+\d{1,3}\s+(?:tage?|wochen?)\b'), ' ')
        .replaceAll(
            RegExp(r'\b(?:in|am|vom|bis|morgen|heute|wochenende)\b'), ' ')
        .replaceAll(
            RegExp(
                r'\b(?:morgen|\d{1,2}\.\d{1,2}\.\d{4}|20\d{2}-\d{2}-\d{2})\b'),
            ' ')
        .replaceAll(RegExp(r'\b\d{1,5}(?:[,.]\d{1,2})?\s*€?'), ' ')
        .split(RegExp(r'\s+'))
        .where((entry) => entry.isNotEmpty && !_stopWords.contains(entry))
        .take(8)
        .join(' ')
        .trim();
    return <String, dynamic>{
      'what': what.isEmpty ? null : what,
      'where': where?.isEmpty == true ? null : where,
      'whenStart': dates.isEmpty ? null : dates.first,
      'whenEnd':
          dates.length < 2 ? (dates.isEmpty ? null : dates.first) : dates[1],
      'priceMin': money.$1,
      'priceMax': money.$2,
      'category':
          suggestCategories(userInput: value, availableCategories: const [])
              .firstOrNull,
      'source': 'local_rules',
      'providerExecuted': false,
    };
  }

  static List<String> suggestCategories({
    required String userInput,
    required List<String> availableCategories,
    int maxResults = 5,
  }) {
    final query = _normalize(userInput);
    final allowed = availableCategories
        .map((entry) => entry.trim())
        .where((entry) => entry.isNotEmpty)
        .toSet();
    final ranked = <MapEntry<String, int>>[];
    for (final entry in _categoryTerms.entries) {
      if (allowed.isNotEmpty && !allowed.contains(entry.key)) continue;
      final score = entry.value.where(query.contains).length;
      if (score > 0) ranked.add(MapEntry(entry.key, score));
    }
    ranked.sort((a, b) => b.value.compareTo(a.value));
    final limit = maxResults.clamp(1, 10).toInt();
    return ranked.take(limit).map((entry) => entry.key).toList(growable: false);
  }

  static Map<String, dynamic> discountTiers({required String strategy}) =>
      <String, dynamic>{
        'tiers': strategy == 'premium'
            ? const [
                {'days': 3, 'discount': 8},
                {'days': 5, 'discount': 15},
                {'days': 8, 'discount': 25},
              ]
            : const [
                {'days': 3, 'discount': 10},
                {'days': 5, 'discount': 20},
                {'days': 8, 'discount': 30},
              ],
        'source': 'local_rules',
        'providerExecuted': false,
      };

  static String availabilityTip(
      {required double pricePerDay,
      required List<Map<String, dynamic>> tiers}) {
    final valid = tiers.where((entry) {
      final days = entry['days'];
      final discount = entry['discount'];
      return days is int &&
          days >= 2 &&
          days <= 60 &&
          discount is num &&
          discount >= 0 &&
          discount <= 90;
    }).toList()
      ..sort((a, b) => (a['days'] as int).compareTo(b['days'] as int));
    if (valid.isEmpty) {
      return 'Keine Rabattstufe hinterlegt. Verfügbarkeit und Preis werden beim Buchen erneut geprüft.';
    }
    final tier = valid.first;
    final days = tier['days'] as int;
    final discount = (tier['discount'] as num).toDouble();
    final saving = pricePerDay.clamp(0, 100000) * days * discount / 100;
    return 'Ab $days Tagen sind ${discount.toStringAsFixed(0)}% Rabatt hinterlegt (rechnerische Ersparnis ${saving.toStringAsFixed(2)} € bei diesem Tagespreis).';
  }

  static const Map<String, dynamic> _emptySearch = {
    'what': null,
    'where': null,
    'whenStart': null,
    'whenEnd': null,
    'priceMin': null,
    'priceMax': null,
    'category': null,
    'source': 'local_rules',
    'providerExecuted': false,
  };

  static (double?, double?) _parseMoney(String value) {
    final euroMatches = RegExp(r'(\d{1,5}(?:[,.]\d{1,2})?)\s*€',
            caseSensitive: false)
        .allMatches(value)
        .map((match) => double.tryParse(match.group(1)!.replaceAll(',', '.')))
        .whereType<double>();
    final qualifiedMatches = RegExp(
            r'\b(?:budget|maximal|ab|unter|bis)\s+(\d{1,5}(?:[,.]\d{1,2})?)\s*(?:€|euro)',
            caseSensitive: false)
        .allMatches(value)
        .map((match) => double.tryParse(match.group(1)!.replaceAll(',', '.')))
        .whereType<double>();
    final matches = [...euroMatches, ...qualifiedMatches]
        .where((entry) => entry >= 1 && entry <= 100000)
        .toList();
    if (matches.isEmpty) return (null, null);
    if (RegExp(
      r'\b(?:unter|bis)\s+\d{1,5}(?:[,.]\d{1,2})?\s*(?:€|euro)',
      caseSensitive: false,
    ).hasMatch(value)) {
      return (null, matches.reduce((a, b) => a > b ? a : b));
    }
    if (RegExp(
      r'\bab\s+\d{1,5}(?:[,.]\d{1,2})?\s*(?:€|euro)',
      caseSensitive: false,
    ).hasMatch(value)) {
      return (matches.reduce((a, b) => a < b ? a : b), null);
    }
    return (
      matches.reduce((a, b) => a < b ? a : b),
      matches.length > 1 ? matches.reduce((a, b) => a > b ? a : b) : null
    );
  }

  static String? _parseDate(String value, DateTime now) {
    final match = RegExp(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})$').firstMatch(value);
    if (match != null) {
      final year = int.parse(match.group(3)!);
      final month = int.parse(match.group(2)!);
      final day = int.parse(match.group(1)!);
      final date = DateTime(year, month, day);
      if (date.year == year && date.month == month && date.day == day) {
        return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      }
      return null;
    }
    if (RegExp(r'^20\d{2}-\d{2}-\d{2}$').hasMatch(value)) {
      final date = DateTime.tryParse(value);
      if (date != null && date.toIso8601String().startsWith(value)) {
        return value;
      }
    }
    if (value.toLowerCase() == 'morgen') {
      final date = now.add(const Duration(days: 1));
      return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    }
    return null;
  }

  @visibleForTesting
  static Map<String, dynamic> emptySearchForTesting() =>
      Map<String, dynamic>.from(_emptySearch);
}

extension<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
