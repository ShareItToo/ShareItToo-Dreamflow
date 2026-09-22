/// The exact pickup and return instants bound to a booking quote/contract.
///
/// The product pilot only accepts Europe/Berlin wall-clock selections here.
/// The serialized instants always carry an explicit UTC offset (`Z`), so a
/// client cannot silently turn a missing time into local midnight.
class BookingTimeSnapshot {
  static const version = 'booking-time-v1';
  static const timezone = 'Europe/Berlin';

  final DateTime handoverAt;
  final DateTime returnAt;

  const BookingTimeSnapshot({
    required this.handoverAt,
    required this.returnAt,
  });

  factory BookingTimeSnapshot.fromLocal({
    required DateTime handover,
    required DateTime returned,
  }) {
    final handoverUtc = _berlinWallTimeToUtc(handover);
    final returnUtc = _berlinWallTimeToUtc(returned);
    if (!returnUtc.isAfter(handoverUtc)) {
      throw const FormatException('Rückgabe muss nach der Übergabe liegen.');
    }
    return BookingTimeSnapshot(
      handoverAt: handoverUtc,
      returnAt: returnUtc,
    );
  }

  factory BookingTimeSnapshot.fromJson(Object? value) {
    if (value is! Map) {
      throw const FormatException('Exakte Mietzeiten fehlen.');
    }
    final json = Map<String, dynamic>.from(value);
    if (json['version'] != version || json['timezone'] != timezone) {
      throw const FormatException('Unbekannte Mietzeit-Version.');
    }
    final handover = _parseExplicitInstant(json['handoverAt']);
    final returned = _parseExplicitInstant(json['returnAt']);
    if (!returned.isAfter(handover)) {
      throw const FormatException('Rückgabe muss nach der Übergabe liegen.');
    }
    return BookingTimeSnapshot(
      handoverAt: handover,
      returnAt: returned,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'version': version,
        'handoverAt': handoverAt.toUtc().toIso8601String(),
        'returnAt': returnAt.toUtc().toIso8601String(),
        'timezone': timezone,
      };

  String displayHandover() => display(handoverAt);

  String displayReturn() => display(returnAt);

  static String display(DateTime instant) {
    final local = _berlinInstantToWallTime(instant.toUtc());
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(local.day)}.${two(local.month)}.${local.year}, '
        '${two(local.hour)}:${two(local.minute)} Uhr';
  }

  static DateTime _parseExplicitInstant(Object? value) {
    if (value is! String ||
        !RegExp(r'[zZ]|[+-]\d{2}:?\d{2}$').hasMatch(value.trim())) {
      throw const FormatException('Mietzeit braucht einen expliziten Offset.');
    }
    final parsed = DateTime.tryParse(value);
    if (parsed == null) {
      throw const FormatException('Ungültige exakte Mietzeit.');
    }
    return parsed.toUtc();
  }

  static DateTime _berlinWallTimeToUtc(DateTime wall) {
    final clean = DateTime.utc(
      wall.year,
      wall.month,
      wall.day,
      wall.hour,
      wall.minute,
    );
    final offset = _berlinOffsetForWallTime(clean);
    return DateTime.utc(
      clean.year,
      clean.month,
      clean.day,
      clean.hour,
      clean.minute,
    ).subtract(Duration(hours: offset));
  }

  static DateTime _berlinInstantToWallTime(DateTime utc) {
    final normalized = utc.toUtc();
    final offset = _berlinOffsetForInstant(normalized);
    return normalized.add(Duration(hours: offset));
  }

  static int _berlinOffsetForWallTime(DateTime wall) {
    final start = _lastSunday(wall.year, 3, 2);
    final end = _lastSunday(wall.year, 10, 3);
    // The spring-forward hour [02:00, 03:00) does not exist. Reject it
    // instead of silently moving the appointment to a different instant.
    if (wall.year == start.year &&
        wall.month == 3 &&
        wall.day == start.day &&
        wall.hour == 2) {
      throw const FormatException(
        'Diese Berliner Uhrzeit existiert wegen der Zeitumstellung nicht.',
      );
    }
    // The autumn 02:xx hour occurs twice. Until the UI can expose an explicit
    // CET/CEST choice, reject it instead of silently choosing one occurrence.
    if (wall.year == end.year &&
        wall.month == 10 &&
        wall.day == end.day &&
        wall.hour == 2) {
      throw const FormatException(
        'Diese Berliner Uhrzeit ist wegen der Zeitumstellung doppelt.',
      );
    }
    if (wall.isBefore(start)) return 1;
    if (wall.isBefore(end)) return 2;
    return 1;
  }

  static int _berlinOffsetForInstant(DateTime utc) {
    final startUtc = DateTime.utc(
      utc.year,
      3,
      _lastSunday(utc.year, 3, 1).day,
      1,
    );
    final endUtc = DateTime.utc(
      utc.year,
      10,
      _lastSunday(utc.year, 10, 1).day,
      1,
    );
    if (!utc.isBefore(startUtc) && utc.isBefore(endUtc)) return 2;
    return 1;
  }

  static DateTime _lastSunday(int year, int month, int hour) {
    var date = DateTime.utc(year, month + 1, 0, hour);
    while (date.weekday != DateTime.sunday) {
      date = date.subtract(const Duration(days: 1));
    }
    return date;
  }
}

/// Validates that a quote readback carries the exact snapshot the user chose.
/// A server response without this echo is not safe to submit against.
BookingTimeSnapshot requireMatchingBookingTimeSnapshot({
  required BookingTimeSnapshot expected,
  required Object? actual,
}) {
  final received = BookingTimeSnapshot.fromJson(actual);
  final same = received.handoverAt == expected.handoverAt &&
      received.returnAt == expected.returnAt;
  if (!same) {
    throw const FormatException(
        'Serverangebot und Mietzeiten stimmen nicht überein.');
  }
  return received;
}
