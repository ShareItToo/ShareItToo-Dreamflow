import 'package:flutter/foundation.dart';

/// Formats category labels that contain a conjunction into a stacked two-line label.
///
/// Examples:
///  - "Technik & Elektronik" => "Technik\n& Elektronik"
///  - "Büro & Gewerbe" => "Büro\n& Gewerbe"
/// If no ampersand is present, returns the original label.
String stackCategoryLabel(String label) {
  try {
    final raw = label.trim();

    // Special-case: ensure "Haustierbedarf" breaks into two lines as
    // "Haustier-" (with hyphen) on the first line and "bedarf" on the second.
    // This matches the requested layout in filters and category grids.
    if (raw.toLowerCase() == 'haustierbedarf') {
      return 'Haustier-\nbedarf';
    }
    // Prefer splitting on ampersand which we use across coarse categories
    final ampIndex = raw.indexOf('&');
    if (ampIndex > 0 && ampIndex < raw.length - 1) {
      final first = raw.substring(0, ampIndex).trim();
      final second = raw.substring(ampIndex + 1).trim();
      if (first.isNotEmpty && second.isNotEmpty) {
        return '$first\n& $second';
      }
    }
    // Fallback: if exactly two words separated by space, stack them
    final parts = raw.split(RegExp(r"\s+")).where((e) => e.isNotEmpty).toList();
    if (parts.length == 2) {
      return '${parts[0]}\n${parts[1]}';
    }
    return label;
  } catch (e) {
    debugPrint('stackCategoryLabel error for "$label": $e');
    return label;
  }
}
