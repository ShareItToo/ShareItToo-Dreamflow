import 'package:flutter/material.dart';
import 'package:lendify/screens/legal_detail_scaffold.dart';

class LegalCommunityRulesScreen extends StatelessWidget {
  const LegalCommunityRulesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return LegalDetailScaffold(
      title: 'Community‑Regeln',
      intro:
          'Diese Regeln erklären in klarer Sprache, welche Inhalte und Verhaltensweisen auf ShareItToo erlaubt sind. Sie gelten für Profile, Anzeigen, Fotos, Bewertungen, Meldungen und Nachrichten.',
      sections: [
        LegalSectionCard(
          icon: Icons.check_circle_outline,
          title: 'Erlaubte Inhalte',
          children: const [
            LegalBullets(items: [
              'Rechtmäßige Artikel mit ehrlicher Beschreibung',
              'Realistische Fotos des tatsächlichen Zustands',
              'Respektvolle Kommunikation',
              'Klare Angaben zu Übergabe/Rückgabe und Lieferumfang',
              'Sachliche Bewertungen mit Bezug zu einer abgeschlossenen SIT‑Buchung',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.block_outlined,
          title: 'Verbotene Inhalte',
          badge: 'Nicht erlaubt',
          children: const [
            LegalParagraph('Insbesondere verboten sind:'),
            SizedBox(height: 10),
            LegalBullets(items: [
              'gestohlene, gefälschte oder sonst rechtswidrig erlangte Gegenstände',
              'gesetzlich verbotene Waren sowie erlaubnis- oder registrierungspflichtige Angebote ohne nachgewiesene Berechtigung',
              'Waffen, Munition, Sprengstoffe, Drogen, gefährliche Stoffe und Gegenstände, deren Vermietung eine erhebliche unvertretbare Gefahr schafft',
              'betrügerische Anzeigen, Identitätstäuschung, fingierte Buchungen und manipulierte Bewertungen',
              'bewusst falsche oder irreführende Angaben zu Zustand, Eigentum, Verfügbarkeit, Preis oder Lieferumfang',
              'Inhalte, die Urheber-, Marken-, Persönlichkeits- oder Datenschutzrechte Dritter verletzen',
              'personenbezogene Daten, Ausweisdokumente, Zugangsdaten oder Zahlungsinformationen anderer Personen',
              'Drohungen, Beleidigungen, Belästigung, Hassrede, Diskriminierung oder sexualisierte Ausbeutung',
              'Schadsoftware, Phishing, externe Zahlungsaufforderungen zur Umgehung von SIT oder sonstige missbräuchliche Links',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.photo_camera_outlined,
          title: 'Fotos, Chat und Übergabedokumentation',
          children: const [
            LegalBullets(items: [
              'Fotos müssen für Anzeige, Übergabe, Rückgabe oder eine konkrete Supportklärung erforderlich sein.',
              'Gesichter, Kennzeichen, Adressen, Dokumente und andere persönliche Informationen sind möglichst nicht aufzunehmen oder vor dem Versand unkenntlich zu machen.',
              'Der Chat darf nicht für Spam, unerwünschte Werbung, Betrug oder die Verbreitung schädlicher Dateien verwendet werden.',
              'Zustandsfotos dürfen nicht nachträglich so bearbeitet werden, dass Mängel oder Schäden falsch dargestellt werden.',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.flag_outlined,
          title: 'Rechtswidrige Inhalte melden',
          children: const [
            LegalParagraph(
              'Jede Person kann einen möglicherweise rechtswidrigen oder regelwidrigen Inhalt melden. Die Meldung soll die betroffene Anzeige, Nachricht, Bewertung oder das Profil eindeutig bezeichnen und den Grund möglichst konkret beschreiben. Kontaktdaten werden nur verlangt, soweit sie für Rückfragen oder eine Ergebnisinformation erforderlich sind.',
            ),
            LegalParagraph(
              'Meldungen werden sorgfältig, objektiv und möglichst zeitnah geprüft. Wer erkennbar missbräuchlich oder wiederholt unbegründet meldet, kann nach vorheriger Prüfung in der Nutzung der Meldefunktion eingeschränkt werden.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.security_outlined,
          title: 'Moderationsmaßnahmen und Beschwerde',
          children: const [
            LegalBullets(items: [
              'Hinweis oder Aufforderung zur Korrektur',
              'Entfernung von Anzeigen oder Inhalten',
              'Einschränkung einzelner Funktionen',
              'temporäre oder dauerhafte Sperrung des Kontos',
            ]),
            SizedBox(height: 10),
            LegalParagraph(
              'Bei der Entscheidung werden Art, Schwere, Häufigkeit, Reichweite, Absicht und mögliche Folgen des Verstoßes berücksichtigt. Soweit rechtlich und tatsächlich möglich, erklärt SIT dem betroffenen Nutzer die wesentlichen Gründe der Maßnahme.',
            ),
            LegalParagraph(
              'Betroffene Nutzer können eine Moderationsentscheidung über den Support beanstanden und relevante Tatsachen oder Nachweise nachreichen. Die Beschwerde wird erneut geprüft. Rechte auf behördliche, gerichtliche oder außergerichtliche Rechtsbehelfe bleiben unberührt.',
            ),
          ],
        ),
      ],
    );
  }
}
