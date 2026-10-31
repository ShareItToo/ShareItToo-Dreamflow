/// Produces the backend profile document without changing local persistence.
/// Birth dates are calendar dates, never instants to convert between zones.
Map<String, dynamic> profileForWire(Map<String, dynamic> profile) {
  final result = Map<String, dynamic>.from(profile);
  if (!profile.containsKey('birthDate')) return result;
  final value = profile['birthDate'];
  if (value == null) return result;

  int year;
  int month;
  int day;
  if (value is DateTime) {
    year = value.year;
    month = value.month;
    day = value.day;
  } else if (value is String) {
    final match = RegExp(
      r'^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))?)?$',
    ).firstMatch(value);
    if (match == null ||
        match.end != value.length ||
        (match[4] != null &&
            (int.parse(match[4]!) > 23 ||
                int.parse(match[5]!) > 59 ||
                int.parse(match[6]!) > 59)) ||
        (match[7] != null &&
            (int.parse(match[8]!) > 23 || int.parse(match[9]!) > 59))) {
      throw const FormatException('Invalid profile birth date');
    }
    year = int.parse(match[1]!);
    month = int.parse(match[2]!);
    day = int.parse(match[3]!);
  } else {
    throw const FormatException('Invalid profile birth date');
  }
  final checked = DateTime.utc(year, month, day);
  if (year < 1 ||
      year > 9999 ||
      checked.year != year ||
      checked.month != month ||
      checked.day != day) {
    throw const FormatException('Invalid profile birth date');
  }
  result['birthDate'] = '${year.toString().padLeft(4, '0')}-'
      '${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
  return result;
}
