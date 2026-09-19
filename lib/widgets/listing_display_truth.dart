import 'package:lendify/services/private_pilot_pricing.dart';

/// Returns a real rating that is safe to show, or `null` when no valid
/// rating exists. A zero value means the owner has not been rated yet.
double? listingRatingForDisplay(double? rating) {
  if (rating == null || !rating.isFinite || rating <= 0 || rating > 5) {
    return null;
  }
  return rating;
}

/// Returns an owner's real average only when at least one review exists.
///
/// This keeps inconsistent backend data (for example, an average with a zero
/// review count) from becoming a trust signal in the listing UI.
double? ownerRatingForDisplay({
  required double? averageRating,
  required int? reviewCount,
}) {
  if (reviewCount == null || reviewCount <= 0) return null;
  return listingRatingForDisplay(averageRating);
}

/// Normalizes the user's configured city without inventing a default.
String? configuredUserCity(String? city) {
  final normalized = city?.trim() ?? '';
  return normalized.isEmpty ? null : normalized;
}

/// Produces a truthful location label for a listing card.
///
/// Distance is only shown when it was calculated from a real user location.
/// Otherwise the listing city is shown, or the supplied unavailable label.
String listingLocationLabel({
  required double? distanceKm,
  required String listingCity,
  required String unavailableLabel,
}) {
  if (distanceKm != null && distanceKm.isFinite && distanceKm >= 0) {
    return '${distanceKm.toStringAsFixed(distanceKm < 10 ? 1 : 0)} km';
  }

  final city = listingCity.trim();
  return city.isNotEmpty ? city : unavailableLabel;
}

/// Public catalogue prices are renter end-prices. The owner's configured
/// amount remains the pricing basis, but is never shown as if it were the
/// renter's final price.
double listingCustomerPrice(double ownerPrice) =>
    PrivatePilotPricing.minorToEuros(
      PrivatePilotPricing.customerUnitPriceMinor(ownerPrice),
    );

String listingCustomerPriceText(
  double ownerPrice, {
  String currency = 'EUR',
}) =>
    PrivatePilotPricing.formatMinor(
      PrivatePilotPricing.customerUnitPriceMinor(ownerPrice),
      currency: currency,
    );
