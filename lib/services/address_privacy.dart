import 'package:flutter/foundation.dart';

/// Utilities for address privacy: obfuscate house numbers to a range
/// and compose user-facing approximate strings.
class AddressPrivacy {
  /// Single-sentence privacy notice for address visibility across the app.
  /// Exact address requires counterparty-confirmed appointment and server gate.
  static String privacyNotice() =>
      'Die genaue Adresse wird frühestens sechs Stunden vor dem beidseitig bestätigten Termin angezeigt.';

  /// Contextual notice for Abholung (pickup) only.
  /// Copy spec (DE): same as general notice.
  static String privacyNoticePickup() =>
      'Die genaue Adresse wird frühestens sechs Stunden vor dem beidseitig bestätigten Termin angezeigt.';

  /// Deterministic clock helper for the explicitly local demo/QA branch.
  /// Backend-enabled product flows must use the server reveal decision.
  static bool shouldRevealExactAddressForLocalDemoOrQa({
    required DateTime? handoverAt,
    DateTime? now,
  }) {
    if (handoverAt == null) return false;
    final currentTime = now ?? DateTime.now();
    return !currentTime.isBefore(
      handoverAt.subtract(const Duration(hours: 6)),
    );
  }

  /// Returns an approximate address where the house number is rounded
  /// to a 10-range (e.g., 27 -> "20–30").
  ///
  /// Input is expected like "Musterstraße 27, 12345 Berlin" but the
  /// function is defensive and will return the original string on
  /// unrecognized formats.
  static String approximate(String address) {
    try {
      final raw = address.trim();
      if (raw.isEmpty) return raw;

      // Split first line and the rest (ZIP, city, etc.)
      final parts = raw.split(',');
      final line1 = parts.first.trim();
      final rest = parts.length > 1 ? parts.sublist(1).join(',').trim() : '';

      // Find trailing house number in the first line (e.g., "Musterstraße 27a")
      final reg = RegExp(r'^(.*?)(\s+)(\d+[a-zA-Z]?)\s*$');
      final m = reg.firstMatch(line1);
      if (m == null) {
        // No number found; try alternative: number at the beginning (rare)
        final reg2 = RegExp(r'^(\d+[a-zA-Z]?)\s+(.*)$');
        final m2 = reg2.firstMatch(line1);
        if (m2 == null) return raw; // give up, keep input
        final houseRaw = m2.group(1)!.trim();
        final street = m2.group(2)!.trim();
        final number =
            int.tryParse(RegExp(r'\d+').firstMatch(houseRaw)?.group(0) ?? '');
        if (number == null) return raw;
        final low = (number ~/ 10) * 10;
        final high = low + 10;
        final approx = '$street $low–$high';
        return rest.isNotEmpty ? '$approx, $rest' : approx;
      }

      final street = m.group(1)!.trim();
      final houseRaw = m.group(3)!.trim();
      final number =
          int.tryParse(RegExp(r'\d+').firstMatch(houseRaw)?.group(0) ?? '');
      if (number == null) return raw;
      final low = (number ~/ 10) * 10;
      final high = low + 10;
      final approx = '$street $low–$high';
      return rest.isNotEmpty ? '$approx, $rest' : approx;
    } catch (e) {
      debugPrint('[AddressPrivacy] approximate failed: $e');
      return address;
    }
  }

  /// Compose a sentence like "Abholung in der Nähe von Musterstraße 20–30, 12345 Berlin".
  static String nearbySentence(
      {required String kindLabel, required String address}) {
    final approx = approximate(address);
    return '$kindLabel in der Nähe von $approx';
  }

  /// Short version without appending any location string.
  /// Example: "Abholung in der Nähe von" or "Rückgabe in der Nähe von"
  static String nearbyShort({required String kindLabel}) {
    // Per latest copy spec: no trailing period
    return '$kindLabel in der Nähe von';
  }
}
