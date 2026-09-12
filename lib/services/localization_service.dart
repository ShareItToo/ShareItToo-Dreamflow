import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppLanguage { de, en, es, fr, it, nl, pl, pt, tr, ar }

class LocalizationController extends ChangeNotifier {
  static const _prefsKey = 'app_language_code';
  AppLanguage _language = AppLanguage.de;

  AppLanguage get language => _language;
  String get code {
    switch (_language) {
      case AppLanguage.de:
        return 'de';
      case AppLanguage.en:
        return 'en';
      case AppLanguage.es:
        return 'es';
      case AppLanguage.fr:
        return 'fr';
      case AppLanguage.it:
        return 'it';
      case AppLanguage.nl:
        return 'nl';
      case AppLanguage.pl:
        return 'pl';
      case AppLanguage.pt:
        return 'pt';
      case AppLanguage.tr:
        return 'tr';
      case AppLanguage.ar:
        return 'ar';
    }
  }

  static AppLanguage _fromCode(String? code) {
    switch ((code ?? '').toLowerCase()) {
      case 'de':
      case 'de-de':
        return AppLanguage.de;
      case 'en':
      case 'en-us':
      case 'en-gb':
        return AppLanguage.en;
      case 'es':
      case 'es-es':
      case 'fr':
      case 'fr-fr':
      case 'it':
      case 'it-it':
      case 'nl':
      case 'nl-nl':
      case 'pl':
      case 'pl-pl':
      case 'pt':
      case 'pt-pt':
      case 'pt-br':
      case 'tr':
      case 'tr-tr':
      case 'ar':
      case 'ar-sa':
        // Older builds offered these choices but silently displayed the
        // maintained English table. Keep that effective language while the
        // unavailable choices are removed from the selector.
        return AppLanguage.en;
      default:
        return AppLanguage.de;
    }
  }

  Future<void> loadFromPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _language = _fromCode(prefs.getString(_prefsKey));
      notifyListeners();
    } catch (_) {
      // ignore
    }
  }

  Future<void> setLanguage(AppLanguage lang) async {
    if (_language == lang) return;
    _language = lang;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, code);
    } catch (_) {
      // ignore
    }
  }

  String t(String key) {
    // Currently only DE and EN tables are maintained.
    // For all non-DE languages we fall back to EN until translations are added.
    final table = _language == AppLanguage.de ? _de : _en;
    return table[key] ?? key;
  }

  static const Map<String, String> _de = {
    // Navigation
    'Entdecken': 'Entdecken',
    'Mietkorb': 'Mietkorb',
    'Mein SIT': 'Mein SIT',
    'Gemerkt': 'Gemerkt',
    'Noch keine Merklisten': 'Noch keine Merklisten',
    'Unter Gemerkt speichern': 'Unter Gemerkt speichern',
    'saved.nonBindingSemantics':
        'Gemerkt. Unverbindlich gespeichert. Keine Reservierung.',
    'saved.nonBindingNotice':
        'Unverbindlich gespeichert – keine Reservierung. Verfügbarkeit und Mietanfrage werden erst beim direkten Buchen geprüft.',
    'Erkunden': 'Erkunden',
    'Wunschlisten': 'Wunschlisten',
    'Buchungen': 'Buchungen',
    'Nachrichten': 'Nachrichten',
    'Profil': 'Profil',

    // Common actions/labels
    'Alle ansehen': 'Alle ansehen',
    'Alle Kategorien': 'Alle Kategorien',
    'Sprache': 'Sprache',
    'Deutsch': 'Deutsch',
    'English': 'English',
    'Abbrechen': 'Abbrechen',
    'Bald verfügbar': 'Bald verfügbar',
    'Nicht verfügbar': 'Nicht verfügbar',
    'Ort hinzufügen': 'Ort hinzufügen',
    'Noch keine Anzeigen': 'Noch keine Anzeigen',
    'Noch keine Daten': 'Noch keine Daten',
    'Sobald die ersten Anzeigen veröffentlicht sind, erscheinen sie hier.':
        'Sobald die ersten Anzeigen veröffentlicht sind, erscheinen sie hier.',
    'Wähle eine andere Kategorie oder setze die Filter zurück.':
        'Wähle eine andere Kategorie oder setze die Filter zurück.',
    'Jetzt suchen': 'Jetzt suchen',
    'Zurücksetzen': 'Zurücksetzen',
    'Anwenden': 'Anwenden',

    // Explore
    'Willkommen 👋': 'Willkommen 👋',
    'Sieh dir Details zu deiner letzten Miete an':
        'Sieh dir Details zu deiner letzten Miete an',
    'Am meisten gebucht': 'Am meisten gebucht',
    'Neue Angebote': 'Neue Angebote',
    'Weitere Angebote': 'Weitere Angebote',
    'Kunden gefällt auch …': 'Kunden gefällt auch …',
    'Kunden gefällt auch': 'Kunden gefällt auch',
    'Kunden teilen auch gerne': 'Kunden teilen auch gerne',
    'Gefiltert nach:': 'Gefiltert nach:',
    'Nicht verifiziert': 'Nicht verifiziert',
    'Verifiziert': 'Verifiziert',
    'Identität bestätigt': 'Identität bestätigt',
    'Identität noch nicht geprüft': 'Identität noch nicht geprüft',
    'Nicht angemeldet': 'Nicht angemeldet',
    'Eingestellt am': 'Eingestellt am',
    '€/Tag': '€/Tag',

    // Listing details
    'Verfügbarkeit prüfen': 'Verfügbarkeit prüfen',
    'Reservieren': 'Reservieren',
    'Anfrage senden': 'Anfrage senden',
    'Anfragen': 'Anfragen',
    'Anfrage gesendet (Demo)': 'Anfrage gesendet (Demo)',
    'Zum Profil': 'Zum Profil',
    'Profil des Anbieters': 'Profil des Anbieters',
    'Öffentliches Profil und Bewertungen (Demoseite).':
        'Öffentliches Profil und Bewertungen (Demoseite).',
    'Anbieter': 'Anbieter',
    'Laden …': 'Laden …',
    'Verliehen': 'Verliehen',

    // Category labels (used as keys)
    'Elektronik': 'Elektronik',
    'Kameras & Foto': 'Kameras & Foto',
    'Werkzeuge': 'Werkzeuge',
    'Fahrzeuge': 'Fahrzeuge',
    'Freizeit & Sport': 'Freizeit & Sport',
    'Outdoor & Camping': 'Outdoor & Camping',
    'Möbel & Zuhause': 'Möbel & Zuhause',
    'Haushaltsgeräte': 'Haushaltsgeräte',
    'Garten': 'Garten',
    'Instrumente': 'Instrumente',
    'Party & Events': 'Party & Events',
    'Bücher & Medien': 'Bücher & Medien',
    'Büro/IT': 'Büro/IT',
    'Gaming': 'Gaming',
    'Baby & Kinder': 'Baby & Kinder',
    'Mode & Accessoires': 'Mode & Accessoires',

    // Filters
    'Filter': 'Filter',
    'Ort': 'Ort',
    'Preis pro Tag': 'Preis pro Tag',
    'Entfernung (bis zu)': 'Entfernung (bis zu)',
    'aufsteigend': 'aufsteigend',
    'absteigend': 'absteigend',
    'Verifizierung': 'Verifizierung',
    'Nur verifiziert': 'Nur verifiziert',
    'Zustand': 'Zustand',
    'Neu': 'Neu',
    'Gebraucht': 'Gebraucht',
    'Egal': 'Egal',
    'Entfernung': 'Entfernung',
    'Kategorien': 'Kategorien',
    'Verfügbarkeit (optional)': 'Verfügbarkeit (optional)',
    'Zeitraum wählen': 'Zeitraum wählen',
    'Sortieren nach': 'Sortieren nach',
    'Preis': 'Preis',
    'Bewertung': 'Bewertung',
    'Neueste': 'Neueste',

    // Profile
    'Benachrichtigungen': 'Benachrichtigungen',
    'Hier siehst du künftig deine Benachrichtigungen.':
        'Hier siehst du künftig deine Benachrichtigungen.',
    'Mein Profil anzeigen': 'Mein Profil anzeigen',
    // New i18n namespaced keys
    'profile.action.verifyNow': 'Jetzt verifizieren',
    'profile.action.verificationUnavailable':
        'Identitätsprüfung noch nicht verfügbar',
    'profile.action.viewMyProfile': 'Mein Profil anzeigen',
    'profile.menu.myListings': 'Meine Anzeigen',
    'profile.menu.rentalRequests': 'Mietanfragen',
    'profile.menu.myBookings': 'Meine Buchungen',
    'profile.menu.accountSettings': 'Kontoeinstellungen',
    'profile.menu.helpCenter': 'Hilfe-Center',
    'profile.menu.legal': 'Rechtliches',
    'profile.menu.language': 'Sprache',
    'profile.menu.logout': 'Abmelden',
    'profile.action.feedback': 'Feedback zur App',
    // Account settings sections/items
    'account.section.personalData': 'Persönliche Daten',
    'account.item.profileInfo': 'Profilinformationen',
    'account.item.contactData': 'Kontaktinformationen',
    'account.section.verification': 'Verifizierung',
    'account.item.verification': 'Verifizierung',
    'account.section.security': 'Sicherheit',
    'account.item.changePassword': 'Passwort ändern',
    'account.section.payments': 'Zahlungen',
    'account.item.paymentMethods': 'Zahlungsmethoden',
    'account.item.payoutMethods': 'Auszahlungsmethoden',
    'account.item.invoices': 'Rechnungen & Belege',
    'account.section.notifications': 'Benachrichtigungen',
    'account.item.notifications': 'Benachrichtigungen',
    'account.section.privacyAccount': 'Datenschutz & Konto',
    'account.item.dataPrivacyInfo': 'Datenschutz-Infos',
    'account.item.deleteAccount': 'Konto löschen',
    'Bewertungen': 'Bewertungen',
    'Ø Bewertung': 'Ø Bewertung',
    'Dabei seit': 'Dabei seit',

    'Vergangene Buchungen': 'Vergangene Buchungen',
    'Kontakte': 'Kontakte',
    'Kontoeinstellungen': 'Kontoeinstellungen',
    'Hilfe-Center': 'Hilfe-Center',
    'Rechtliches': 'Rechtliches',
    'Abmelden': 'Abmelden',
    'Abmelden?': 'Abmelden?',
    'Du kannst dich jederzeit wieder anmelden.':
        'Du kannst dich jederzeit wieder anmelden.',
    'Abgemeldet (Demo)': 'Abgemeldet (Demo)',
    'Hier erscheinen deine abgeschlossenen Buchungen.':
        'Hier erscheinen deine abgeschlossenen Buchungen.',
    'Verwalte deine Kontakte und Vermieter.':
        'Verwalte deine Kontakte und Vermieter.',
    'Profil, Sicherheit und Benachrichtigungen.':
        'Profil, Sicherheit und Benachrichtigungen.',
    'FAQ und Support.': 'FAQ und Support.',
    'AGB, Datenschutz und Impressum.': 'AGB, Datenschutz und Impressum.',

    // Own Profile
    'Mein Profil': 'Mein Profil',
    'Profil-Link kopiert': 'Profil-Link kopiert',
    'Anzeigen': 'Anzeigen',
    'Interessen': 'Interessen',
    'Über mich': 'Über mich',
    'Keine Anzeigen': 'Keine Anzeigen',
    'pro Tag': 'pro Tag',
    'Aktiv': 'Aktiv',
    'Keine Historie': 'Keine Historie',
    'Abgeschlossen': 'Abgeschlossen',
    'Nutzer': 'Nutzer',
    'Sehr freundliche Kommunikation und schnelle Abwicklung.':
        'Sehr freundliche Kommunikation und schnelle Abwicklung.',
    'Kurzbeschreibung': 'Kurzbeschreibung',
    'Erzähle etwas über dich…': 'Erzähle etwas über dich…',
    'Speichern': 'Speichern',
    'Vertrauen & Leistung': 'Vertrauen & Leistung',
    'Reaktionszeit (90T)': 'Reaktionszeit (90T)',
    'Storno-Rate (90T)': 'Storno-Rate (90T)',
    'Trust Meter': 'Trust Meter',

    // New
    'Meine Anzeigen': 'Meine Anzeigen',
    'Laufend': 'Laufend',
    'für später gespeichert': 'für später gespeichert',
    'Akzeptieren': 'Akzeptieren',
    'Ablehnen': 'Ablehnen',
    'Anfrage': 'Anfrage',
    'Zeitraum': 'Zeitraum',
    'Language': 'Sprache',
    'Noch keine gespeicherten Elemente': 'Noch keine gespeicherten Elemente',
    'Noch keine Bewertungen': 'Noch keine Bewertungen',
    'Noch keine Bewertungen vorhanden.': 'Noch keine Bewertungen vorhanden.',
    'Keine Bewertung': 'Keine Bewertung',
    'Keine Bewertung vorhanden.': 'Keine Bewertung vorhanden.',
    'Du antwortest durchschnittlich in': 'Du antwortest durchschnittlich in',
    'Zur Wunschliste hinzugefügt': 'Zur Wunschliste hinzugefügt',

    // Actions on details sheet
    'Anzeige ansehen': 'Anzeige ansehen',
    'Zu Wunschlisten hinzufügen': 'Zu Wunschlisten hinzufügen',

    // Monetize teaser
    'you want to make money with any item you posess?':
        'Willst du mit jedem Gegenstand, den du besitzt, Geld verdienen?',
    'Neue Anzeige erstellen': 'Neue Anzeige erstellen',
    'Starte eine neue Anzeige in wenigen Schritten.':
        'Starte eine neue Anzeige in wenigen Schritten.',
    'Erstelle eine neue Anzeige': 'Erstelle eine neue Anzeige',

    // Language screen
    'language.title': 'Sprache auswählen',
    'language.subtitle':
        'Wähle Deutsch oder Englisch. Die Änderung wird sofort übernommen und auf diesem Gerät gespeichert. Weitere vollständig übersetzte Sprachen folgen.',
  };

  static const Map<String, String> _en = {
    // Navigation
    'Entdecken': 'Discover',
    'Mietkorb': 'Rental cart',
    'Mein SIT': 'My SIT',
    'Gemerkt': 'Saved',
    'Noch keine Merklisten': 'No saved lists yet',
    'Unter Gemerkt speichern': 'Save for later',
    'saved.nonBindingSemantics':
        'Saved. Non-binding. This is not a reservation.',
    'saved.nonBindingNotice':
        'Saved without obligation – this is not a reservation. Availability and the rental request are checked only when you book the individual item.',
    'Erkunden': 'Explore',
    'Wunschlisten': 'Wishlists',
    'Buchungen': 'Bookings',
    'Nachrichten': 'Messages',
    'Profil': 'Profile',

    // Common actions/labels
    'Alle ansehen': 'See all',
    'Alle Kategorien': 'All categories',
    'Sprache': 'Language',
    'Deutsch': 'German',
    'English': 'English',
    'Abbrechen': 'Cancel',
    'Bald verfügbar': 'Coming soon',
    'Nicht verfügbar': 'Unavailable',
    'Ort hinzufügen': 'Add location',
    'Noch keine Anzeigen': 'No listings yet',
    'Noch keine Daten': 'No data yet',
    'Sobald die ersten Anzeigen veröffentlicht sind, erscheinen sie hier.':
        'The first published listings will appear here.',
    'Wähle eine andere Kategorie oder setze die Filter zurück.':
        'Choose another category or reset the filters.',
    'Jetzt suchen': 'Search now',
    'Zurücksetzen': 'Reset',
    'Anwenden': 'Apply',

    // Explore
    'Willkommen 👋': 'Welcome 👋',
    'Sieh dir Details zu deiner letzten Miete an':
        'See details of your last rental',
    'Am meisten gebucht': 'Most booked',
    'Neue Angebote': 'New listings',
    'Weitere Angebote': 'More listings',
    'Kunden gefällt auch …': 'Customers also like …',
    'Kunden gefällt auch': 'Customers also like',
    'Kunden teilen auch gerne': 'Customers also love to share',
    'Gefiltert nach:': 'Filtered by:',
    'Nicht verifiziert': 'Not verified',
    'Verifiziert': 'Verified',
    'Identität bestätigt': 'Identity verified',
    'Identität noch nicht geprüft': 'Identity not yet verified',
    'Nicht angemeldet': 'Not signed in',
    'Eingestellt am': 'Listed on',
    '€/Tag': '€/day',

    // Listing details
    'Verfügbarkeit prüfen': 'Check availability',
    'Reservieren': 'Reserve',
    'Anfrage senden': 'Send request',
    'Anfragen': 'Request',
    'Anfrage gesendet (Demo)': 'Request sent (demo)',
    'Zum Profil': 'View profile',
    'Profil des Anbieters': 'Owner profile',
    'Öffentliches Profil und Bewertungen (Demoseite).':
        'Public profile and reviews (demo).',
    'Anbieter': 'Owner',
    'Laden …': 'Loading …',
    'Verliehen': 'Times lent',

    // Category labels (keys are DE)
    'Elektronik': 'Electronics',
    'Kameras & Foto': 'Cameras & photography',
    'Werkzeuge': 'Tools',
    'Fahrzeuge': 'Vehicles',
    'Freizeit & Sport': 'Leisure & sports',
    'Outdoor & Camping': 'Outdoor & camping',
    'Möbel & Zuhause': 'Furniture & home',
    'Haushaltsgeräte': 'Appliances',
    'Garten': 'Garden',
    'Instrumente': 'Instruments',
    'Party & Events': 'Party & events',
    'Bücher & Medien': 'Books & media',
    'Büro/IT': 'Office/IT',
    'Gaming': 'Gaming',
    'Baby & Kinder': 'Baby & kids',
    'Mode & Accessoires': 'Fashion & accessories',

    // Filters
    'Filter': 'Filters',
    'Ort': 'Location',
    'Preis pro Tag': 'Price per day',
    'Entfernung (bis zu)': 'Distance (up to)',
    'aufsteigend': 'ascending',
    'absteigend': 'descending',
    'Verifizierung': 'Verification',
    'Nur verifiziert': 'Verified only',
    'Zustand': 'Condition',
    'Neu': 'New',
    'Gebraucht': 'Used',
    'Egal': 'Any',
    'Entfernung': 'Distance',
    'Kategorien': 'Categories',
    'Verfügbarkeit (optional)': 'Availability (optional)',
    'Zeitraum wählen': 'Choose date range',
    'Sortieren nach': 'Sort by',
    'Preis': 'Price',
    'Bewertung': 'Rating',
    'Neueste': 'Newest',

    // Profile
    'Benachrichtigungen': 'Notifications',
    'Hier siehst du künftig deine Benachrichtigungen.':
        'You will see your notifications here.',
    'Mein Profil anzeigen': 'View my profile',
    // New i18n namespaced keys
    'profile.action.verifyNow': 'Verify now',
    'profile.action.verificationUnavailable':
        'Identity verification not yet available',
    'profile.action.viewMyProfile': 'View my profile',
    'profile.menu.myListings': 'My listings',
    'profile.menu.rentalRequests': 'Rental requests',
    'profile.menu.myBookings': 'My bookings',
    'profile.menu.accountSettings': 'Account settings',
    'profile.menu.helpCenter': 'Help Center',
    'profile.menu.legal': 'Legal',
    'profile.menu.language': 'Language',
    'profile.menu.logout': 'Log out',
    'profile.action.feedback': 'Feedback about the app',
    // Account settings sections/items
    'account.section.personalData': 'Personal data',
    'account.item.profileInfo': 'Profile information',
    'account.item.contactData': 'Contact information',
    'account.section.verification': 'Verification',
    'account.item.verification': 'Verification',
    'account.section.security': 'Security',
    'account.item.changePassword': 'Change password',
    'account.section.payments': 'Payments',
    'account.item.paymentMethods': 'Payment methods',
    'account.item.payoutMethods': 'Payout methods',
    'account.item.invoices': 'Invoices & receipts',
    'account.section.notifications': 'Notifications',
    'account.item.notifications': 'Notifications',
    'account.section.privacyAccount': 'Privacy & account',
    'account.item.dataPrivacyInfo': 'Data privacy info',
    'account.item.deleteAccount': 'Delete account',
    'Bewertungen': 'Reviews',
    'Ø Bewertung': 'Avg rating',
    'Dabei seit': 'Member since',

    'Vergangene Buchungen': 'Past bookings',
    'Kontakte': 'Contacts',
    'Kontoeinstellungen': 'Account settings',
    'Hilfe-Center': 'Help Center',
    'Rechtliches': 'Legal',
    'Abmelden': 'Log out',
    'Abmelden?': 'Log out?',
    'Du kannst dich jederzeit wieder anmelden.':
        'You can sign in again any time.',
    'Abgemeldet (Demo)': 'Logged out (demo)',
    'Hier erscheinen deine abgeschlossenen Buchungen.':
        'Your completed bookings will appear here.',
    'Verwalte deine Kontakte und Vermieter.': 'Manage your contacts and hosts.',
    'Profil, Sicherheit und Benachrichtigungen.':
        'Profile, security and notifications.',
    'FAQ und Support.': 'FAQ and support.',
    'AGB, Datenschutz und Impressum.': 'Terms, privacy and imprint.',

    // Own Profile
    'Mein Profil': 'My profile',
    'Profil-Link kopiert': 'Profile link copied',
    'Anzeigen': 'Listings',
    'Interessen': 'Interests',
    'Über mich': 'About me',
    'Keine Anzeigen': 'No listings',
    'pro Tag': 'per day',
    'Aktiv': 'Active',
    'Keine Historie': 'No history',
    'Abgeschlossen': 'Completed',
    'Nutzer': 'User',
    'Sehr freundliche Kommunikation und schnelle Abwicklung.':
        'Very friendly communication and quick processing.',
    'Kurzbeschreibung': 'Short bio',
    'Erzähle etwas über dich…': 'Tell something about yourself…',
    'Speichern': 'Save',
    'Vertrauen & Leistung': 'Trust & Performance',
    'Reaktionszeit (90T)': 'Response time (90d)',
    'Storno-Rate (90T)': 'Cancellation rate (90d)',
    'Trust Meter': 'Trust Meter',

    // New
    'Meine Anzeigen': 'My listings',
    'Laufend': 'Ongoing',
    'für später gespeichert': 'Saved for later',
    'Akzeptieren': 'Accept',
    'Ablehnen': 'Decline',
    'Anfrage': 'Request',
    'Zeitraum': 'Dates',
    'Language': 'Language',
    'Noch keine gespeicherten Elemente': 'No saved items yet',
    'Noch keine Bewertungen': 'No reviews yet',
    'Noch keine Bewertungen vorhanden.': 'No reviews yet.',
    'Keine Bewertung': 'No rating yet',
    'Keine Bewertung vorhanden.': 'No rating available.',
    'Du antwortest durchschnittlich in': 'You reply on average in',
    'Zur Wunschliste hinzugefügt': 'Added to wishlist',

    // Actions on details sheet
    'Anzeige ansehen': 'View listing',
    'Zu Wunschlisten hinzufügen': 'Add to wishlist',

    // Monetize teaser
    'you want to make money with any item you posess?':
        'Do you want to make money with any item you possess?',
    'Neue Anzeige erstellen': 'Create a new listing',
    'Starte eine neue Anzeige in wenigen Schritten.':
        'Start a new listing in a few steps.',
    'Erstelle eine neue Anzeige': 'Create a new listing',

    // Language screen
    'language.title': 'Select language',
    'language.subtitle':
        'Choose German or English. Changes apply immediately and are saved on this device. More fully translated languages will follow.',
  };
}
