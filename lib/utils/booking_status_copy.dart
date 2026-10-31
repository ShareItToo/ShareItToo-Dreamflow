String bookingCardStatusLabel({
  required String category,
  required DateTime? start,
  required DateTime? end,
  Map<String, dynamic>? booking,
  DateTime? now,
}) {
  if (booking?['simulationOnly'] == true) {
    return 'Pilot-Simulation';
  }
  final current = now ?? DateTime.now();
  switch (category) {
    case 'upcoming':
      final handoverLabel = booking?['ownerDeliversAtDropoffChosen'] == true
          ? 'Lieferung'
          : 'Abholung';
      final toPickup = start?.difference(current);
      final txt = toPickup == null
          ? null
          : _formatCountdownDays(
              toPickup.isNegative ? Duration.zero : toPickup,
            );
      return txt == null ? '$handoverLabel geplant' : '$handoverLabel in $txt';
    case 'ongoing':
      final returnLabel = booking?['ownerPicksUpAtReturnChosen'] == true
          ? 'Abholung'
          : 'Rückgabe';
      final endText = end == null ? '' : _formatGermanDate(end);
      return endText.isEmpty
          ? '$returnLabel läuft'
          : '$returnLabel bis $endText';
    case 'pending':
      Duration? remain;
      final expReq = booking?['expressRequested'] == true;
      final expStatus = booking?['expressStatus'] as String?;
      final expAtIso = booking?['expressRequestedAt'] as String?;
      if (expReq &&
          (expStatus == null || expStatus == 'pending') &&
          expAtIso != null &&
          expAtIso.isNotEmpty) {
        final expAt = DateTime.tryParse(expAtIso);
        if (expAt != null) {
          final endAt = expAt.add(const Duration(minutes: 30));
          final left = endAt.difference(current);
          remain = left.isNegative ? Duration.zero : left;
        }
      }
      return remain != null
          ? 'Priorität: ${_formatCountdownDays(remain)}'
          : 'Wartet auf Bestätigung';
    case 'completed':
      final rawStatus = booking?['rawStatus'] as String?;
      if (rawStatus == 'cancelled' || booking?['status'] == 'Storniert') {
        return 'Storniert';
      }
      if (rawStatus == 'declined' || booking?['status'] == 'Abgelehnt') {
        return 'Abgelehnt';
      }
      return booking?['needsReview'] == true ? 'In Prüfung' : 'Abgeschlossen';
    default:
      return '—';
  }
}

String _formatCountdownDays(Duration d) {
  final days = d.inDays;
  if (days <= 1) return '1 Tag';
  return '$days Tage';
}

String _formatGermanDate(DateTime d) {
  const months = [
    'Jan',
    'Feb',
    'Mär',
    'Apr',
    'Mai',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Okt',
    'Nov',
    'Dez',
  ];
  final mm = months[d.month - 1];
  final dd = d.day.toString().padLeft(2, '0');
  return '$dd. $mm';
}
