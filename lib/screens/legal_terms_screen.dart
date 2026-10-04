import 'package:flutter/material.dart';
import 'package:lendify/config/draft_operator_config.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/screens/legal_detail_scaffold.dart';

class LegalTermsScreen extends StatelessWidget {
  const LegalTermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return LegalDetailScaffold(
      title: 'AGB',
      intro: 'Plattform-Nutzungsbedingungen für den privaten ShareItToo-Pilot. '
          'Stand 16.08.2026 · ${PrivatePilotConfig.documentVersion}. '
          'ShareItToo stellt die technische Vermittlungsplattform bereit und '
          'wird nicht Partei des privaten Mietvertrags zwischen den Nutzern.',
      sections: const [
        LegalSectionCard(
          icon: Icons.info_outline,
          title: 'Geltungsbereich und Dokumentenstand',
          badge: 'Privat-Pilot',
          children: [
            LegalParagraph(
              'Diese Bedingungen gelten für die Plattformnutzung im privaten Pilotbetrieb. Die Regeln für den privaten Mietvertrag, Stornierung, Übergabe, Rückgabe und Fälle werden im jeweiligen Buchungsablauf mit Dokumentversion dauerhaft bereitgestellt.',
            ),
            LegalParagraph(
              'Das Öffnen des Checkouts erzeugt noch keine Buchungsanfrage, keinen Vertrag und keine Zahlung. Erst die dort eindeutig bezeichnete Schaltfläche sendet die verbindliche Buchungsanfrage. Das V5.1-Modell wird mit Dokumentversion und Zeitstempel protokolliert; externe Rechts-, PSP- und Livefreigaben bleiben davon getrennte Voraussetzungen.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.business_outlined,
          title: 'Entwurfsbetreiber und Startgrenze',
          badge: 'Nicht öffentlich',
          children: [
            LegalParagraph(DraftOperatorConfig.readinessText),
            SizedBox(height: 10),
            LegalParagraph(DraftOperatorConfig.internalOnlyText),
            SizedBox(height: 10),
            LegalParagraph(
              'Diese bestätigten Entwurfsangaben ersetzen keine professionelle '
              'Rechtsprüfung und keine Freigabe von Verbraucher-, '
              'Marketplace-, Datenschutz- oder DSA-Pflichten.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.assignment_ind_outlined,
          title: 'Konto und privater Nutzerkreis',
          children: [
            LegalBullets(items: [
              'Teilnehmen dürfen ausschließlich volljährige natürliche Personen ab 18 Jahren.',
              'Konto, jedes Inserat und jede Buchung dürfen ausschließlich privat genutzt werden. Gewerbliche, selbständige oder berufliche Vermietung ist im Pilot ausgeschlossen.',
              'Der Pilot ist auf Deutschland und die in der App freigeschaltete Pilotregion begrenzt.',
              'Pro Person darf grundsätzlich nur ein persönliches, nicht übertragbares Konto geführt werden.',
              'Name, Kontakt-, Verifizierungs- und sonstige Kontodaten müssen wahrheitsgemäß und aktuell sein.',
              'Ändert sich der private Status, ist ShareItToo unverzüglich zu informieren. Funktionen können bis zur Klärung vorläufig eingeschränkt werden.',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.handshake_outlined,
          title: 'Rolle von ShareItToo',
          badge: 'Wichtig',
          children: [
            LegalParagraph(
              'ShareItToo ermöglicht Registrierung, Inserate, Suche, Preisübersicht, Kommunikation, Zeit- und Adressabstimmung, dokumentierte Übergabe und Rückgabe, Bewertungen, Meldungen und Support.',
            ),
            LegalParagraph(
              'ShareItToo ist nicht Vermieter, Mieter, Eigentümer, Besitzer, Hersteller, Beförderer, Gutachter oder Versicherer. Der Mietvertrag kommt ausschließlich zwischen Vermieter und Mieter zustande. Der Mieter gibt eine verbindliche Buchungsanfrage ab; der Vermieter nimmt sie innerhalb der angezeigten Frist an. Die Annahme wird dem Mieter über die Plattform mitgeteilt.',
            ),
            LegalParagraph(
              'ShareItToo prüft Gegenstand, Eigentum, Berechtigung, Funktionsfähigkeit, Sicherheit, Echtheit, Zeitwert und Versicherungsschutz nicht. Eine Veröffentlichung, Kennzeichnung oder Supportbearbeitung ist keine Empfehlung, Garantie oder Sicherheitsfreigabe.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.post_add_outlined,
          title: 'Inserate und Positivliste',
          children: [
            LegalBullets(items: [
              'Vermieter dürfen nur eigene Gegenstände oder Gegenstände mit wirksamer Vermietberechtigung anbieten.',
              'Beschreibung und aktuelle Fotos müssen Zustand, bekannte Mängel, Funktion, Zubehör und erforderliche Sicherheits- oder Bedienhinweise zutreffend zeigen.',
              'Zulässig sind nur technisch freigeschaltete Kategorien der abschließenden Positivliste. Freitext darf die Positivliste nicht umgehen.',
              'Fahrzeuge und sonstige Verkehrsmittel, Waffen, gefährliche oder erlaubnispflichtige Gegenstände, lebende Tiere, Arzneimittel und rechtswidrige Inhalte sind ausgeschlossen.',
              'Es gibt keine Wertobergrenze und keine Sperre allein wegen eines hohen Gegenstandswerts. Eine Wertangabe stammt vom Vermieter und wird von SIT nicht bestätigt.',
              'Persönliche Abholung und Rückgabe sind Pflicht. Lieferung, Versand und Transport durch SIT sind nicht Bestandteil des Piloten.',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.payments_outlined,
          title: 'Mietpreis und Plattformbeitrag',
          children: [
            LegalParagraph(
              'Der Vermieter legt seinen Mietpreis fest. Der Mieter trägt zusätzlich einen ShareItToo-Plattformbeitrag von exakt 10 % des Mietpreises. Rabatte werden zuerst auf den Mietpreis angewendet; anschließend werden die 10 % einmal centgenau auf die rabattierte Buchungssumme berechnet.',
            ),
            LegalParagraph(
              'Öffentliche Inseratspreise sind Endpreise für den Mieter und enthalten den Beitrag bereits. Vor jeder späteren verbindlichen Handlung zeigt der Checkout Mietpreis, Rabatt, Plattformbeitrag in Prozent und Euro, Gesamtpreis, Mietdauer sowie die konkrete Storno- und Karenzfrist.',
            ),
            LegalParagraph(
              'Außer dem Plattformbeitrag werden im Privat-Pilot keine Liefer-, Zahlungs-, Refund-, Support- oder sonstigen Zusatzgebühren erhoben. Umsatzsteuertexte werden erst nach Klärung der steuerlichen Behandlung verbindlich ergänzt.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.fact_check_outlined,
          title: 'Vertragsschluss, Plattformleistung und Widerruf',
          children: [
            LegalParagraph(
              'Das Inserat ist noch kein bindendes Angebot. Der Mieter sendet eine verbindliche zahlungspflichtige Buchungsanfrage. Der private Mietvertrag entsteht erst, wenn der Vermieter rechtzeitig und protokolliert annimmt, die Annahme dem Mieter mitgeteilt wird und eine später aktivierte Zahlungsautorisierung erfolgreich ist. Eine automatische Eingangsbestätigung ist keine Annahme.',
            ),
            LegalParagraph(
              'Die Buchungsanfrage enthält zugleich ein von privatem Mietvertrag und erfolgreicher Zahlungsautorisierung abhängiges Angebot für die entgeltliche SIT-Plattformleistung. ShareItToo nimmt dieses Angebot durch die Buchungsbestätigung an. Vermittlung und technische Buchungsbestätigung gelten im Zwischenmodell dann als vollständig erbracht; Dokumentation und Support laufen unentgeltlich weiter.',
            ),
            LegalParagraph(
              'Das Verlangen nach frühem Leistungsbeginn und die Kenntnisbestätigung zum möglichen Erlöschen des Widerrufsrechts werden getrennt, nicht vorausgewählt, mit genauem Wortlaut, Dokumentversion und Zeitpunkt gespeichert. Unter „Rechtliches > Vertrag widerrufen“ steht ein zweistufiger elektronischer Widerruf bereit. Innerhalb des vertraglich garantierten 14-Tage-Fensters gelten die dort vor Bestätigung eindeutig angezeigten V5.1-Folgen; später eingehende Erklärungen werden empfangen und wegen möglicher weitergehender gesetzlicher Rechte ohne automatische Buchungs- oder Geldänderung geprüft.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.shield_outlined,
          title: 'Keine Kaution oder SIT-Schutzleistung',
          children: [
            LegalParagraph(PrivatePilotConfig.riskNotice),
            LegalBullets(items: [
              'keine Kaution und keine Sicherheitsautorisierung',
              'keine SIT-Versicherung, kein Schutzfonds und keine Schadengarantie',
              'keine automatische Schadensbelastung und kein Einzug von Schadensersatz',
              'keine Verrechnung eines behaupteten Sachschadens mit der Vermieterauszahlung',
              'Zwingende Haftung von ShareItToo für eigene Pflichtverletzungen bleibt unberührt.',
            ]),
          ],
        ),
        LegalSectionCard(
          icon: Icons.qr_code_scanner_outlined,
          title: 'Übergabe und Rückgabe',
          children: [
            LegalBullets(items: [
              'Bei der Übergabe erstellt der Vermieter mindestens vier aktuelle Fotos: Gesamtansicht, Detailansicht, Zubehör und eine kritische oder zustandsrelevante Stelle.',
              'Der Mieter bestätigt das Fotoset oder widerspricht mit mindestens einem eigenen Foto der abweichenden Stelle.',
              'Danach bestätigen beide Parteien getrennt per QR-Code, ersatzweise mit dem sechsstelligen Fallback-Code.',
              'Bei der Rückgabe erstellt der Mieter das entsprechende Vierer-Fotoset; der Vermieter bestätigt oder dokumentiert eine Abweichung mit eigenem Foto.',
              'Zeitstempel, Buchungszuordnung, getrennte Bestätigungen und eine nur freiwillige Galerieübernahme bleiben erhalten.',
              'Die genaue Adresse wird grundsätzlich sechs Stunden vor dem bestätigten Termin sichtbar und darf nur für die konkrete Buchung verwendet werden.',
            ]),
            LegalParagraph(
              'Eine fehlende Gegenbestätigung erzeugt keinen automatischen Streitfall. Sie führt zunächst neutral in „Rückgabebestätigung ausstehend“.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.schedule_outlined,
          title: 'Rückgabe, Meldefenster und Fälle',
          children: [
            LegalParagraph(
              'T0 ist bei beidseitiger Bestätigung der tatsächliche Rückgabezeitpunkt, sonst die vereinbarte oder beidseitig geänderte Rückgabezeit. Ein substantiierter Fall kann bis T0 + 48 Stunden eröffnet werden.',
            ),
            LegalParagraph(
              'Fehlt nur eine Rückgabebestätigung, gilt „Rückgabebestätigung ausstehend“ mit Erinnerungen und neutralem Klärungsfenster bis T0 + 5 Kalendertage. Das erzeugt nicht automatisch „In Prüfung“. Ohne substantiierten Fall wird danach die Auszahlung anweisbar.',
            ),
            LegalParagraph(
              'Nur ein konkreter und ausreichend begründeter Fall führt zu „In Prüfung“. Eine Schadensbehauptung allein erzeugt keine neue Belastung, blockiert keine Vermieterauszahlung und wird nicht mit dem Mietpreis verrechnet. ShareItToo entscheidet nur über Plattformstatus und zulässige bereits autorisierte Buchungsbeträge, nicht endgültig über zivilrechtlichen Schadensersatz.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.event_busy_outlined,
          title: 'Stornierung und Karenz',
          children: [
            LegalParagraph(
              'Liegen zwischen einer später wirksam bestätigten Buchung und Mietbeginn weniger als 24 Stunden, kann der Mieter innerhalb von 60 Minuten nach Zugang der Buchungsbestätigung kostenlos stornieren, spätestens bis Mietbeginn. Die App zeigt den genauen Ablaufzeitpunkt.',
            ),
            LegalParagraph(
              'Nach V5.1 gilt: mindestens 24 Stunden vor Mietbeginn vollständige Erstattung; weniger als 24 Stunden vorher bleiben grundsätzlich 50 % des Mietpreises geschuldet und der Gebührenanteil beträgt 10 % dieses verbleibenden Mietpreises. Ab Mietbeginn oder bei Mieter-No-Show gibt es keine starre Pauschale, sondern eine Abrechnung nach tatsächlichem Verlust unter Anrechnung von Ersatzvermietung und ersparten Aufwendungen.',
            ),
            LegalParagraph(
              'Ersatzvermietung, ersparte Aufwendungen und der Nachweis eines geringeren oder ausgebliebenen Schadens bleiben abbildbar. Der Plattformbeitrag folgt anteilig dem nach einer vertraglichen Stornierung verbleibenden Mietpreis.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.chat_bubble_outline,
          title: 'Kommunikation und Nachweise',
          children: [
            LegalParagraph(
              'Der Buchungschat bleibt während der Buchung und bis zum Ende des konkreten Melde- oder Klärungsfensters geöffnet. Bei „In Prüfung“ bleibt er bis zum Abschluss des Falls erreichbar; danach gelten Archivierungs- und Supportregeln.',
            ),
            LegalParagraph(
              'Private Chats, genaue Adressen, Zahlungsdaten sowie Übergabe-, Rückgabe- und Schadensfotos werden nicht für KI-Modelltraining verwendet. Buchungsbezogene Chats und Nachweisfotos werden grundsätzlich sechs Monate nach Rückgabe vorgehalten; bei einem konkret eröffneten Anspruch nur fallbezogen so lange wie erforderlich.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.auto_awesome_outlined,
          title: 'KI-Funktionen',
          children: [
            LegalParagraph(
              'KI-Funktionen bleiben im Privat-Pilot deaktiviert, solange Anbieter, Datenfluss, Transparenz und Datenschutz nicht vollständig umgesetzt und freigegeben sind. Eine spätere direkte KI-Interaktion wird spätestens bei der ersten Interaktion eindeutig gekennzeichnet.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.star_outline,
          title: 'Bewertungen & Bewertungssystem',
          children: [
            LegalParagraph(
              'Bewertungen können grundsätzlich nur von Nutzern abgegeben werden, die an einer über SIT dokumentierten und abgeschlossenen Vermietung beteiligt waren.',
            ),
            LegalParagraph(
              'Eine Bewertung umfasst Kommunikation, Zuverlässigkeit, Artikel wie beschrieben sowie Übergabe und Rückgabe. Die Gesamtbewertung entspricht dem arithmetischen Mittelwert der vier Kriterien und wird auf eine Nachkommastelle gerundet.',
            ),
            LegalParagraph(
              'Preis-Leistung ist kein Bestandteil der öffentlichen Bewertung. Manipulierte, buchungsfremde, beleidigende oder nachweislich falsche Bewertungen können geprüft und entfernt; doppelt erfasste Bewertungen dürfen berichtigt werden.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.report_outlined,
          title: 'Meldungen und Moderation',
          children: [
            LegalParagraph(
              'Rechtswidrige oder unsichere Inhalte können über die Meldefunktion oder den Support gemeldet werden. Maßnahmen werden mit Grund, Dauer, Erkennungsart und verfügbarer Überprüfungsmöglichkeit dokumentiert, soweit dies gesetzlich erforderlich ist.',
            ),
            LegalParagraph(
              'ShareItToo kann Inhalte entfernen oder herabstufen sowie Funktionen oder Konten verhältnismäßig einschränken. Eine menschliche Überprüfung muss möglich bleiben.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.delete_outline,
          title: 'Laufzeit, Änderungen und Kontolöschung',
          children: [
            LegalParagraph(
              'Das Nutzungsverhältnis läuft auf unbestimmte Zeit. Kontolöschung, Vertragsbeendigung und datenschutzrechtliche Löschung sind getrennte Vorgänge. Offene Buchungen, Fälle und gesetzliche Nachweise können eine sofortige vollständige Löschung einzelner Daten verhindern.',
            ),
            LegalParagraph(
              'Wesentliche Änderungen werden vorab auf einem dauerhaften Datenträger mitgeteilt. Schweigen oder bloße Weiternutzung gilt nicht als Zustimmung. Änderungen gelten nicht rückwirkend für bestätigte Buchungen.',
            ),
          ],
        ),
        LegalSectionCard(
          icon: Icons.balance_outlined,
          title: 'Haftung und anwendbares Recht',
          children: [
            LegalParagraph(
              'ShareItToo haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie für schuldhaft verursachte Schäden aus der Verletzung von Leben, Körper oder Gesundheit. Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Zwingende gesetzliche Haftung bleibt unberührt.',
            ),
            LegalParagraph(
              'Für Gegenstand oder Nutzer haftet ShareItToo nur, soweit ein Schaden auf einer von ShareItToo zu vertretenden eigenen Pflichtverletzung beruht. Es gilt deutsches Recht; zwingende Schutzvorschriften und gesetzliche Gerichtsstände bleiben unberührt.',
            ),
          ],
        ),
      ],
    );
  }
}
