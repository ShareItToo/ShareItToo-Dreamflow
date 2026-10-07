import 'package:flutter/foundation.dart' show visibleForTesting;

import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_ai_local_rules.dart';

/// Consumer compatibility surface.
///
/// Automatic search/category/range helpers are bounded local rules and are
/// labelled accordingly. The only network-backed helper is the explicit owner
/// price action; it crosses the server boundary and never carries a client
/// provider key. No method claims model output unless a server response says
/// that a provider actually executed.
abstract final class OpenAIConfig {
  static const bool aiHelpersEnabled = true;
  static const bool externalAiNetworkAllowed = false;
  static const bool directAiChatEnabled = false;
  static const bool directAiTransparencyReady = false;

  /// Local rules are always available; provider health is a server concern.
  static bool get isAvailable => true;

  static Future<Map<String, dynamic>> parseSearchQuery(String userInput) async {
    return ListingAiLocalRules.parseSearchQuery(userInput);
  }

  static Future<Map<String, dynamic>> suggestPrice({
    required String title,
    required String description,
    required String category,
    required String condition,
    required String location,
    String strategy = 'quick',
  }) async {
    final request = <String, dynamic>{
      'title': title,
      'description': description,
      'category': category,
      'condition': condition,
      'location': location,
      'strategy': strategy,
    };
    final testRequester = _priceRequesterForTesting;
    if (testRequester != null) return testRequester(request);
    final session = await AuthService.readSession();
    if (session == null) {
      throw const BackendException(401, 'authentication_required');
    }
    final owner = AuthService.captureSessionOwner(session);
    return BackendRepository.requestListingAiPriceForOwner(
      owner: owner,
      title: title,
      description: description,
      category: category,
      condition: condition,
      location: location,
      strategy: strategy,
    );
  }

  static Future<Map<String, dynamic>> suggestDiscountTiers({
    required String title,
    required String description,
    required String category,
    required String condition,
    required String location,
    required String strategy,
  }) async {
    // Discount presets are deterministic product rules, not model output.
    return ListingAiLocalRules.discountTiers(strategy: strategy);
  }

  static Future<String> availabilityDiscountTip({
    required String title,
    required String location,
    required double pricePerDay,
    required List<Map<String, dynamic>> tiers,
  }) async {
    return ListingAiLocalRules.availabilityTip(
      pricePerDay: pricePerDay,
      tiers: tiers,
    );
  }

  static Future<List<String>> suggestCategories({
    required String userInput,
    required List<String> availableCategories,
    int maxResults = 5,
  }) async {
    return ListingAiLocalRules.suggestCategories(
      userInput: userInput,
      availableCategories: availableCategories,
      maxResults: maxResults,
    );
  }

  static Future<Map<String, dynamic>> Function(Map<String, dynamic> request)?
      _priceRequesterForTesting;

  @visibleForTesting
  static void setPriceRequesterForTesting(
    Future<Map<String, dynamic>> Function(Map<String, dynamic> request)?
        requester,
  ) {
    _priceRequesterForTesting = requester;
  }
}
