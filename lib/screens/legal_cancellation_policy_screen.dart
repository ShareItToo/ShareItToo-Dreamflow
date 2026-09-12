import 'package:flutter/material.dart';
import 'package:lendify/screens/legal_detail_scaffold.dart';

class LegalCancellationPolicyScreen extends StatelessWidget {
  const LegalCancellationPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return LegalDetailScaffold(
      title: 'Stornierungsbedingungen',
      intro:
          'Vertragliche Privat-Launch-Regel nach V5.1. Echtgeld und automatische Erstattungen bleiben bis zur geprüften PSP-Aktivierung ausgeschaltet.',
      sections: [
        LegalSectionCard(
          icon: Icons.event_busy_outlined,
          title: 'Wann kann storniert werden?',
          children: const [
            LegalBullets(items: [
              'Mindestens 24 Stunden vor Mietbeginn: Mietpreis und SIT-Plattformgebühr werden vollständig erstattet.',
              'Weniger als 24 Stunden vor Mietbeginn: 50 % des Mietpreises bleiben grundsätzlich geschuldet; der verbleibende Gebührenanteil beträgt 10 % dieses Mietpreises, höchstens die gebuchte SIT-Plattformgebühr.',
              'Ab Mietbeginn oder bei Mieter-No-Show: keine vertragliche Stornopauschale. Die Abrechnung berücksichtigt ersparte Aufwendungen, tatsächliche Ersatzvermietung und einen nachgewiesenen geringeren oder fehlenden Schaden.',
              'Storniert der Vermieter oder scheitert die Übergabe aus seiner Sphäre: grundsätzlich 100 % Erstattung.',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.payments_outlined,
          title: '60-Minuten-Karenz',
          children: const [
            LegalParagraph(
              'Entsteht der Mietvertrag weniger als 24 Stunden vor Mietbeginn, kann der Mieter innerhalb von 60 Minuten nach der Buchungsbestätigung kostenlos stornieren, höchstens bis Mietbeginn. Die App zeigt den genauen Zeitpunkt.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.currency_exchange_outlined,
          title: 'Rückerstattungen',
          children: const [
            LegalBullets(items: [
              'Ohne aktivierte Echtgeldzahlung gibt es im aktuellen Store-Kandidaten keine reale Rückerstattung.',
              'Mietpreis-Erstattung und SIT-Gebühren-Erstattung werden getrennt mit ihrem jeweiligen Schuldner gespeichert.',
              'Ersparte Aufwendungen, Ersatzvermietung und der Nachweis eines geringeren Schadens werden berücksichtigt.',
              'Rückerstattungen erfolgen über die ursprüngliche Zahlungsart und den freigegebenen Marketplace-Zahlungsdienstleister.',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.support_agent_outlined,
          title: 'Probleme zwischen Nutzern',
          children: const [
            LegalParagraph(
                'Ein No-Show liegt grundsätzlich erst 30 Minuten nach der beidseitig bestätigten Zeit, ohne andere Vereinbarung und nach zwei dokumentierten Kontaktversuchen vor. Sicherheits-, Notfall- und nachweisbare technische Fälle werden einzeln geprüft.'),
          ],
        ),
      ],
    );
  }
}
