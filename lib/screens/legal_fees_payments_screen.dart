import 'package:flutter/material.dart';
import 'package:lendify/screens/legal_detail_scaffold.dart';
import 'package:lendify/config/private_pilot_config.dart';

class LegalFeesPaymentsScreen extends StatelessWidget {
  const LegalFeesPaymentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return LegalDetailScaffold(
      title: 'Gebühren & Zahlungsbedingungen',
      intro:
          'Hier erklären wir transparent das geplante Gebührenmodell und den aktuellen technischen Stand. Im aktuellen Store-Kandidaten werden keine Echtgeldzahlungen oder Auszahlungen ausgeführt.',
      sections: [
        LegalSectionCard(
          icon: Icons.percent_outlined,
          title: 'Plattformgebühr',
          badge: 'Startmodell',
          children: const [
            LegalParagraph(
              'Der Mieter trägt einen Plattformbeitrag von exakt 10 % des rabattierten Mietpreises. Die Berechnung erfolgt einmal centgenau; öffentliche Preise zeigen bereits den Endpreis.',
            ),
            SizedBox(height: 10),
            LegalParagraph(
              'Der aktuelle interne Store-Kandidat zeigt diese Berechnung transparent an, belastet aber kein echtes Zahlungsmittel. Vor Aktivierung wird das Gebührenmodell verbindlich freigegeben.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.credit_card_outlined,
          title: 'Zahlungsabwicklung',
          children: const [
            LegalBullets(items: [
              'Der aktuelle Store-Kandidat führt keine Echtgeldzahlung aus.',
              'Geplante Testintegration: ${PrivatePilotConfig.plannedMarketplacePaymentProvider}.',
              'ShareItToo führt kein Zahlungskonto und nimmt Mietgelder nicht auf ein eigenes Geschäftskonto.',
              'Preis, Gebühr und Zahlungsstatus werden vor einer verbindlichen Zahlung transparent angezeigt.',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.account_balance_wallet_outlined,
          title: 'Auszahlungen an Vermieter',
          children: const [
            LegalBullets(items: [
              'Im aktuellen Store-Kandidaten erfolgen keine Auszahlungen.',
              'Nach beidseitig bestätigter Rückgabe wird der Betrag ohne belegten Fall nach T0 + 48 Stunden anweisbar.',
              'Fehlt nur eine Rückgabebestätigung, bleibt der Zustand neutral bis höchstens T0 + 5 Kalendertage; die bloße Nichtbestätigung eröffnet keinen Streitfall.',
              'Nur der strittige Teil eines bereits autorisierten Buchungsbetrags darf geprüft werden. Ein behaupteter Sachschaden erzeugt keine neue Belastung; der unstrittige Teil bleibt freigabefähig.',
            ]),
          ],
        ),
        const LegalSectionCard(
          icon: Icons.shield_outlined,
          title: 'Keine Kaution und kein Schutzprodukt',
          badge: 'Zum Start',
          children: [
            LegalParagraph(
              'ShareItToo verlangt zum Start keine Kaution und bietet keine Versicherung, Garantie oder eigene Schutzleistung an. Übergabe- und Rückgabefotos unterstützen lediglich die Dokumentation zwischen den Nutzern.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.receipt_long_outlined,
          title: 'Steuerliche Hinweise',
          children: const [
            LegalParagraph(
                'Nutzer sind grundsätzlich selbst dafür verantwortlich, ihre Einnahmen aus Vermietungen steuerlich korrekt anzugeben. Diese Hinweise ersetzen keine Steuerberatung.'),
          ],
        ),
      ],
    );
  }
}
