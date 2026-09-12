/// Compatibility surface for the previously prototyped external-AI helpers.
///
/// The current pilot and release candidate contain no external-AI transport,
/// endpoint, prompt, model, credential or direct user chat. Callers keep their
/// existing method signatures and receive deterministic local fallbacks. A
/// future AI feature requires a separately reviewed provider/data-flow design,
/// a user-visible transparency surface and a new build gate.
abstract final class OpenAIConfig {
  static const bool aiHelpersEnabled = false;
  static const bool externalAiNetworkAllowed = false;
  static const bool directAiChatEnabled = false;
  static const bool directAiTransparencyReady = false;

  static bool get isAvailable => false;

  static Future<Map<String, dynamic>> parseSearchQuery(String userInput) async {
    return const {
      'what': null,
      'where': null,
      'whenStart': null,
      'whenEnd': null,
      'priceMin': null,
      'priceMax': null,
      'category': null,
    };
  }

  static Future<Map<String, dynamic>> suggestPrice({
    required String title,
    required String description,
    required String category,
    required String condition,
    required String location,
  }) async {
    return {
      'dailyPrice': 10.0,
      'weeklyPrice': 50.0,
      'reasoning': title.trim().isEmpty
          ? 'Bitte Titel eingeben für Preisvorschlag'
          : 'KI nicht konfiguriert',
    };
  }

  static Future<Map<String, dynamic>> suggestDiscountTiers({
    required String title,
    required String description,
    required String category,
    required String condition,
    required String location,
    required String strategy,
  }) async {
    return const {
      'tiers': [
        {'days': 3, 'discount': 10},
        {'days': 5, 'discount': 20},
        {'days': 8, 'discount': 30},
      ],
    };
  }

  static Future<String> availabilityDiscountTip({
    required String title,
    required String location,
    required double pricePerDay,
    required List<Map<String, dynamic>> tiers,
  }) async {
    return 'Tipp 💡: Länger mieten = günstiger. '
        'Z.B. ab 3/5/8 Tagen: -10/-20/-30%';
  }

  static Future<List<String>> suggestCategories({
    required String userInput,
    required List<String> availableCategories,
    int maxResults = 5,
  }) async {
    return const [];
  }
}
