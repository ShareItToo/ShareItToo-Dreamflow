/// Centralized strings for the unified cancellation policy used across the app.
/// Keep this as the single source of truth so all info cards stay consistent.
class CancellationPolicyText {
  static const String header = 'Stornierungsbedingungen';

  static const String _intro =
      'Solange deine Anfrage noch nicht akzeptiert ist, kannst du sie kostenlos jederzeit zurückziehen.';

  static const String _rules = 'Nach Bestätigung gelten:\n\n'
      '• Mindestens 24 Stunden vor Mietbeginn: vollständige Erstattung.\n'
      '• Weniger als 24 Stunden vor Mietbeginn: 50 % des Mietpreises bleiben grundsätzlich geschuldet; von der SIT-Plattformgebühr bleibt 10 % dieses verbleibenden Mietpreises, höchstens die gebuchte Plattformgebühr.\n'
      '• Bei einer kurzfristig bestätigten Buchung gilt eine kostenfreie Karenz von 60 Minuten, höchstens bis Mietbeginn.\n'
      '• Ab Mietbeginn oder bei Nicht-Erscheinen gibt es keine starre Stornopauschale. Ersatzvermietung, ersparte Aufwendungen und ein nachgewiesener geringerer Schaden werden berücksichtigt.';

  static const String _note = '📌 Hinweis:\n\n'
      'Mietpreis und SIT-Plattformgebühr werden als getrennte Erstattungen ausgewiesen. Im Privat-Launch werden keine Liefer-, Zahlungs-, Refund- oder sonstigen Zusatzgebühren erhoben.\n\n'
      'Wenn der Vermieter nach Annahme deiner Anfrage storniert, erhältst du den vollen Betrag automatisch zurück, '
      'inklusive aller gezahlten Gebühren.';

  /// Full body used in info cards.
  static String body() => '$_intro\n\n$_rules\n\n$_note';

  /// Owner-facing variant for the create-listing info card.
  /// This phrasing addresses the landlord directly and clarifies effects on reliability.
  static String get bodyForOwnerListingCard =>
      'Solange du eine Anfrage noch nicht akzeptiert hast, kann der Mieter sie jederzeit kostenlos zurückziehen.\n\n'
      'Nach deiner Bestätigung gelten für den Mieter folgende Stornierungsbedingungen:\n\n'
      '• Mindestens 24 Stunden vor Mietbeginn: vollständige Erstattung\n'
      '• Weniger als 24 Stunden: 50 % des Mietpreises bleiben grundsätzlich geschuldet\n'
      '• Kurzfristige Bestätigung: 60 Minuten kostenfreie Karenz, höchstens bis Mietbeginn\n'
      '• Ab Mietbeginn oder bei Nicht-Erscheinen: keine starre Pauschale; tatsächliche Ersatzvermietung, ersparte Aufwendungen und ein nachgewiesener geringerer Schaden werden berücksichtigt\n\n'
      '📌 Hinweis:\n'
      'Mietpreis und SIT-Plattformgebühr werden getrennt berechnet und ausgewiesen.\n\n'
      'Wichtiger Hinweis für Vermieter:\n'
      'Wenn du eine bestätigte Anfrage stornierst, kann sich das auf deine Zuverlässigkeit und Sichtbarkeit in der App auswirken. '
      'Nimm Anfragen daher bitte nur an, wenn die Vermietung sicher stattfinden kann.';

  /// Short, compact summary for confirmation popups.
  static String compactSummary() =>
      'Bitte beachte die Stornierungsbedingungen.\n\n'
      'Mindestens 24 Stunden vorher: vollständig.\n'
      'Weniger als 24 Stunden: grundsätzlich 50 % des Mietpreises.\n'
      'Bei kurzfristiger Bestätigung: 60 Minuten Karenz, höchstens bis Mietbeginn.\n'
      'Ab Mietbeginn oder bei Nicht-Erscheinen: individuelle Abrechnung statt starrer 100-%-Pauschale.';
}
