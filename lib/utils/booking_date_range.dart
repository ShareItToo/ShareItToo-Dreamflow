/// Resolve only the authoritative ISO fields, never the localized display text.
/// DateTime keeps explicit-offset values as exact UTC instants; local ISO values
/// retain the existing local-time representation used by RentalRequest.
(DateTime, DateTime)? resolveBookingDateRange(Map<String, dynamic> booking) {
  DateTime? parse(Object? value) {
    if (value is! String) return null;
    final match = RegExp(
      r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))?$',
    ).firstMatch(value);
    if (match == null) return null;
    final parts = [for (var i = 1; i <= 6; i++) int.parse(match.group(i)!)];
    final date = DateTime.utc(parts[0], parts[1], parts[2]);
    if (date.year != parts[0] ||
        date.month != parts[1] ||
        date.day != parts[2] ||
        parts[3] > 23 ||
        parts[4] > 59 ||
        parts[5] > 59 ||
        (int.tryParse(match.group(7) ?? '0') ?? 24) > 23 ||
        (int.tryParse(match.group(8) ?? '0') ?? 60) > 59) {
      return null;
    }
    final parsed = DateTime.tryParse(value);
    if (parsed != null &&
        !parsed.isUtc &&
        (parsed.year != parts[0] ||
            parsed.month != parts[1] ||
            parsed.day != parts[2] ||
            parsed.hour != parts[3] ||
            parsed.minute != parts[4] ||
            parsed.second != parts[5])) {
      return null; // Do not silently repair a nonexistent local DST time.
    }
    return parsed;
  }

  final start = parse(booking['startIso']);
  final end = parse(booking['endIso']);
  if (start == null || end == null || !end.isAfter(start)) return null;
  return (start, end);
}
