import 'package:flutter/material.dart';
import 'package:lendify/screens/legal_detail_scaffold.dart';

class LegalDisclaimerScreen extends StatelessWidget {
  const LegalDisclaimerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return LegalDetailScaffold(
      title: 'Haftungsausschluss',
      intro:
          'ShareItToo stellt eine Plattform bereit, auf der Nutzer Gegenstände vermieten und mieten können. Die Verantwortung für Zustand und Nutzung liegt bei den jeweiligen Nutzern.',
      sections: [
        LegalSectionCard(
          icon: Icons.handshake_outlined,
          title: 'Rolle der Plattform',
          badge: 'Wichtig',
          children: const [
            LegalParagraph(
              'ShareItToo ist eine Vermittlungsplattform und nicht Vermieter, Mieter, Eigentümer, Besitzer, Hersteller, Beförderer, Gutachter oder Versicherer. ShareItToo prüft Gegenstand, Eigentum, Sicherheit, Echtheit, Zeitwert und Versicherungsschutz nicht.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.person_outline,
          title: 'Verantwortung der Nutzer',
          children: const [
            LegalBullets(items: [
              'Vermieter müssen Artikel korrekt beschreiben und in einem sicheren Zustand übergeben.',
              'Mieter müssen Artikel sorgfältig und entsprechend der Vereinbarung nutzen.',
              'Übergabe/Rückgabe sollten dokumentiert werden (z.B. Fotos), um Missverständnisse zu vermeiden.',
              'ShareItToo bietet keine Kaution, Versicherung, Schutzfonds oder Schadengarantie und zieht keinen behaupteten Schadensbetrag automatisch ein.',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.balance_outlined,
          title: 'Zwingende Haftung bleibt bestehen',
          children: const [
            LegalParagraph(
              'Der Hinweis auf die Nutzerverantwortung schließt eine zwingende Haftung von ShareItToo für eigene Pflichtverletzungen nicht aus. Insbesondere bleiben Haftung für Vorsatz, grobe Fahrlässigkeit sowie schuldhaft verursachte Schäden an Leben, Körper oder Gesundheit unberührt.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.report_outlined,
          title: 'Meldung von Problemen',
          children: const [
            LegalParagraph(
                'Bei Verdacht auf Betrug, gefährliche Artikel oder Verstöße gegen Community‑Regeln kontaktiere bitte den Support und nutze die Meldefunktionen.'),
          ],
        ),
      ],
    );
  }
}
