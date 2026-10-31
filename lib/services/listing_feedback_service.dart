import 'package:lendify/services/local_safety_privacy_service.dart';

class ListingFeedbackService {
  static Future<Set<String>> getHiddenItemIds() =>
      LocalSafetyPrivacyService.getHiddenItemIds();

  static Future<void> hideItem(String itemId) =>
      LocalSafetyPrivacyService.hideItem(itemId);

  static Future<void> recordFeedback({
    required String itemId,
    required String reason,
    String? categoryId,
    double? pricePerDay,
    String? city,
    bool hideOnlyThisItem = false,
  }) =>
      LocalSafetyPrivacyService.recordFeedback(
        itemId: itemId,
        reason: reason,
        categoryId: categoryId,
        pricePerDay: pricePerDay,
        city: city,
        hideOnlyThisItem: hideOnlyThisItem,
      );
}
