enum SupplyEnrichmentOutcome {
  includedAccessory('included_accessory'),
  separateRental('separate_rental'),
  standaloneListing('standalone_listing'),
  notPart('not_part'),
  wrongDetection('wrong_detection');

  const SupplyEnrichmentOutcome(this.wireValue);
  final String wireValue;
}

class SupplyEnrichmentSuggestion {
  const SupplyEnrichmentSuggestion({
    required this.id,
    required this.label,
    required this.prompt,
    required this.categoryId,
    required this.subcategory,
    required this.projectTag,
    this.outcome,
  });

  final String id;
  final String label;
  final String prompt;
  final String categoryId;
  final String subcategory;
  final String projectTag;
  final String? outcome;

  factory SupplyEnrichmentSuggestion.fromJson(Map<String, dynamic> json) {
    final target =
        Map<String, dynamic>.from(json['target'] as Map? ?? const {});
    return SupplyEnrichmentSuggestion(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      prompt: json['prompt']?.toString() ?? '',
      categoryId: target['categoryId']?.toString() ?? '',
      subcategory: target['subcategory']?.toString() ?? '',
      projectTag: json['projectTag']?.toString() ?? '',
      outcome: json['outcome']?.toString(),
    );
  }
}

class SupplyEnrichmentSession {
  const SupplyEnrichmentSession({
    required this.sourceListingId,
    required this.heuristicVersion,
    required this.suggestions,
    required this.primaryListingCreated,
    required this.primaryListingBlocked,
    required this.externalGenerativeAiUsed,
  });

  final String sourceListingId;
  final String heuristicVersion;
  final List<SupplyEnrichmentSuggestion> suggestions;
  final bool primaryListingCreated;
  final bool primaryListingBlocked;
  final bool externalGenerativeAiUsed;

  factory SupplyEnrichmentSession.fromJson(Map<String, dynamic> json) {
    final rawSuggestions = json['suggestions'];
    if (rawSuggestions is! List || rawSuggestions.length > 3) {
      throw const FormatException('invalid_supply_enrichment_suggestions');
    }
    final suggestions = rawSuggestions
        .whereType<Map>()
        .map((entry) => SupplyEnrichmentSuggestion.fromJson(
              Map<String, dynamic>.from(entry),
            ))
        .toList(growable: false);
    if (suggestions.length != rawSuggestions.length) {
      throw const FormatException('invalid_supply_enrichment_suggestion');
    }
    return SupplyEnrichmentSession(
      sourceListingId: json['sourceListingId']?.toString() ?? '',
      heuristicVersion: json['heuristicVersion']?.toString() ?? '',
      suggestions: suggestions,
      primaryListingCreated: json['primaryListingCreated'] == true,
      primaryListingBlocked: json['primaryListingBlocked'] == true,
      externalGenerativeAiUsed: json['externalGenerativeAiUsed'] == true,
    );
  }
}

class SupplyEnrichmentLink {
  const SupplyEnrichmentLink({
    required this.sourceListingId,
    required this.suggestionId,
    required this.outcome,
  });

  final String sourceListingId;
  final String suggestionId;
  final String outcome;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'sourceListingId': sourceListingId,
        'suggestionId': suggestionId,
        'outcome': outcome,
      };

  factory SupplyEnrichmentLink.fromJson(Map<String, dynamic> json) {
    return SupplyEnrichmentLink(
      sourceListingId: json['sourceListingId']?.toString() ?? '',
      suggestionId: json['suggestionId']?.toString() ?? '',
      outcome: json['outcome']?.toString() ?? '',
    );
  }
}

class SupplyEnrichmentPrefill {
  const SupplyEnrichmentPrefill({
    required this.title,
    required this.categoryId,
    required this.subcategory,
    required this.locationText,
    required this.city,
    required this.country,
    required this.latitude,
    required this.longitude,
    required this.link,
  });

  final String title;
  final String categoryId;
  final String subcategory;
  final String locationText;
  final String city;
  final String country;
  final double latitude;
  final double longitude;
  final SupplyEnrichmentLink link;

  factory SupplyEnrichmentPrefill.fromJson(Map<String, dynamic> json) {
    if (json['pricePrefilled'] != false ||
        json['descriptionPrefilled'] != false ||
        json['photoPrefilled'] != false) {
      throw const FormatException('unsafe_supply_enrichment_prefill');
    }
    return SupplyEnrichmentPrefill(
      title: json['title']?.toString() ?? '',
      categoryId: json['categoryId']?.toString() ?? '',
      subcategory: json['subcategory']?.toString() ?? '',
      locationText: json['locationText']?.toString() ?? '',
      city: json['city']?.toString() ?? '',
      country: json['country']?.toString() ?? '',
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      link: SupplyEnrichmentLink.fromJson(
        Map<String, dynamic>.from(json['link'] as Map? ?? const {}),
      ),
    );
  }
}

class SupplyEnrichmentOutcomeResult {
  const SupplyEnrichmentOutcomeResult({
    required this.suggestionId,
    required this.outcome,
    required this.nextAction,
    this.prefill,
  });

  final String suggestionId;
  final String outcome;
  final String nextAction;
  final SupplyEnrichmentPrefill? prefill;

  factory SupplyEnrichmentOutcomeResult.fromJson(Map<String, dynamic> json) {
    final suggestion =
        Map<String, dynamic>.from(json['suggestion'] as Map? ?? const {});
    final rawPrefill = json['prefill'];
    return SupplyEnrichmentOutcomeResult(
      suggestionId: suggestion['id']?.toString() ?? '',
      outcome: suggestion['outcome']?.toString() ?? '',
      nextAction: json['nextAction']?.toString() ?? '',
      prefill: rawPrefill is Map
          ? SupplyEnrichmentPrefill.fromJson(
              Map<String, dynamic>.from(rawPrefill),
            )
          : null,
    );
  }
}
