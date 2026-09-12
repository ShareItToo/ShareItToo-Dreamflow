# B12 - Rechtsmappe Privat-Pilot V4: Gap-Audit und Umsetzungsgrenzen

Status: Technische V4-Zwischenentscheidung; interne Teile der Rechtsmappe nicht als Nutzer-AGB veroeffentlichen  
Quelle: `ShareItToo Rechtsmappe Privat-Pilot V4`, Stand 14.08.2026, sowie die nachgelagerte Preisentscheidung  
Ziel: App, Backend und Nachweise fuer einen rein privaten Deutschland-Pilot vorbereiten. Noch offene Rechts- und PSP-Punkte werden als klar gekennzeichnete, zentral versionierte V4-Zwischenregeln funktionsfaehig gesetzt. Echtgeld bleibt bis zur gesonderten Freigabe deaktiviert.

## Verbindliche Pilotkonfiguration

- nur volljaehrige natuerliche Personen und ausschliesslich private Nutzung;
- Privatstatus bei Konto, Inserat und Buchung getrennt protokollieren;
- Deutschland und eine ausdruecklich freigeschaltete Pilotregion;
- ausschliesslich technisch erlaubte Kategorien, keine Fahrzeuge oder Verkehrsmittel;
- persoenliche Abholung und Rueckgabe, keine Lieferung;
- Vermieterpreis plus exakt 10 Prozent Plattformbeitrag des Mieters;
- keine Wertobergrenze, Kaution, Sicherheitsautorisierung, SIT-Versicherung, Schutzfonds oder Schadengarantie;
- keine automatische Schadensbelastung oder Verrechnung eines behaupteten Sachschadens mit der Vermieterauszahlung.

## Gap-Matrix

| Bereich | Status vor B12 | Entscheidung / naechste Umsetzung |
|---|---|---|
| Mindestalter 18 | bereits konform | Registrierung und Backend verlangen die Altersbestaetigung; Wortlaut und Nachweis werden in die versionierte Privat-Erklaerung ueberfuehrt. |
| Keine Kaution / kein SIT-Schutz | bereits konform | Datenbank-Constraints, neutrale Betragsfelder und UI-Grundtexte bleiben erhalten. Zusaetzliche Risikohinweise werden in allen geforderten Prozessen vereinheitlicht. |
| Vier Fotos, QR und sechsstelliger Ersatzcode | weitgehend konform | Vorhandenen Ablauf beibehalten; Rollenfolge, Gegenbestaetigung oder Abweichungsfoto und getrennte Erklaerungen gezielt haerten. |
| Exakte Adresse | teilweise konform | Bestehende Schutzlogik beibehalten; Freigabe grundsaetzlich sechs Stunden vor bestaetigtem Termin zentral absichern. |
| Plattformbeitrag | jetzt anzupassen | Alte 1-Euro-Mindestgebuehr entfernen. Exakt 10 Prozent des rabattierten Vermieter-Mietpreises einmalig und centbasiert berechnen. |
| Oeffentlicher Preis | jetzt anzupassen | Karten, Suche, Explore, Wunschlisten und Detail zeigen den Mieter-Endpreis inklusive 10 Prozent; kein spaeterer Ueberraschungsaufschlag. |
| Beleg / Buchungsbestaetigung | jetzt anzupassen | Dieselbe zentrale Cent-Berechnung verwenden; keine vorweggenommene Umsatzsteuerbehandlung. |
| Erster Button `Reservieren` | jetzt anzupassen | Oeffnet nur die Preis- und Risikouebersicht. Erzeugt weder Anfrage noch Vertrag, Autorisierung oder Belastung. |
| Lieferung und Fahrtpreis | jetzt anzupassen | Im Privat-Pilot per Konfiguration und serverseitiger Validierung deaktivieren; Zukunftscode bleibt erhalten. |
| Kategorie-Positivliste | jetzt anzupassen | Abschliessende technische Allowlist in App und Backend; Fahrzeuge, Verkehrsmittel und `Sonstiges` fail-closed blockieren. |
| Privatstatus | jetzt anzupassen | Separate, wort- und versionsgenaue Erklaerung bei Konto, Inserat und Buchung; Ablehnung blockiert den Pilotvorgang. |
| KI-Preis und KI-Suche | jetzt anzupassen | Im Pilot standardmaessig deaktivieren, solange Anbieterkennzeichnung, Datenfelder und Datenfluss nicht vollstaendig freigegeben sind. |
| Rueckgabezustand | jetzt anzupassen | Eine zentrale T0-Zustandsmaschine mit 48-Stunden-Meldefenster, neutralem `awaitingReturnConfirmation`, konfigurierbaren fuenf Tagen und substantiiertem `needsReview` ab T1. |
| Chat-Laufzeit | jetzt anzupassen | Nicht starr 48 Stunden nach Abschluss schliessen, sondern bis zum Ende des konkreten Melde-/Klaerungsfensters oder Fallabschluss offen halten. |
| Kurzfristige Storno-Karenz | jetzt anzupassen | Exakte 60 Minuten ab Buchungsbestaetigung, hoechstens bis Mietbeginn; Ablaufzeit anzeigen. 50/100 bleiben konfigurierbare Pruefparameter. |
| Plattformvertrag / Widerruf | V4-Zwischenregel umgesetzt | Fuenf getrennte, nicht vorausgewaehlte Erklaerungen mit Wortlaut, Version, Zeit, Sprache und Buchungsbezug; zweistufiger elektronischer Plattformwiderruf. |
| Wirkung des Widerrufs auf C2C-Mietvertrag | neutral umgesetzt | Eingang wird dauerhaft protokolliert. Die App behauptet keine automatische Beendigung der privaten Miete und veraendert Buchung oder Geldfluss nicht automatisch. |
| Stornosatz | V4-Zwischenregel umgesetzt | 100 % ab 24 Stunden, unter 24 Stunden 50 %, ab Mietbeginn/No-Show 0 % Erstattung; 60-Minuten-Karenz bei kurzfristigem Vertrag. Werte bleiben zentral versioniert. |
| PSP-Autorisierung, Capture, Hold, Payout und Refund | Testlogik umgesetzt, live gesperrt | Exakte anteilige Refunds, getrennte strittige/unstrittige autorisierte Betraege und centscharfe Fallaufloesung sind serverseitig vorbereitet. `realPaymentsEnabled` bleibt `false`; vor Livegang sind PSP-Vertrag, Geldfluss und Texte erneut freizugeben. |
| Fallabschluss | V4-Zwischenregel umgesetzt | Menschliche Bearbeitung muss beim Schliessen einen autorisierten Erstattungsbetrag zwischen 0 und Buchungsgesamtbetrag festlegen. Erst danach werden Refund und restliche Vermieterauszahlung anweisbar; behauptete Sachschaeden erzeugen keine Zusatzbelastung. |
| Gewerbliche Anbieter, Fahrzeuge, Lieferung, Schutzprodukt, Kaution, bezahltes Ranking, Marketingtracking | nur zukuenftiges Modul | Hinter Pilotkonfiguration deaktiviert lassen; keine Loeschung zukunftsfaehiger Module. |

## Offene Punkte mit gesetzter Zwischenregel

Diese Punkte bleiben ausdruecklich offen. Sie sind nicht vergessen und werden
nicht stillschweigend als rechtlich oder zahlungsseitig final behandelt. Fuer
den geschlossenen Test gilt jeweils die folgende, zentral austauschbare
Zwischenregel:

| Offener Punkt | Gesetzte Zwischenregel | Spaetere Aktualisierung durch | Live-Blocker |
|---|---|---|---|
| Plattformvertrag und Zeitpunkt der Widerrufserklaerungen | Fuenf getrennte, nicht vorausgewaehlte Erklaerungen bei der Buchungsanfrage; SIT-Annahme im V4-Zwischenmodell mit Buchungsbestaetigung | Anwalt, Teil K Frage 1 | ja |
| Wirkung des Plattformwiderrufs auf die private Miete | Eingang bestaetigen und versioniert protokollieren; Buchung, C2C-Mietvertrag und Geldfluss nicht automatisch veraendern | Anwalt, Teil K Frage 2 | ja |
| Storno 50/100 oder 30/50 | Geschlossener Test nutzt konfigurierbar 50 Prozent verbleibend unter 24 Stunden und 100 Prozent ab Mietbeginn/No-Show | Anwalt und Produkt, Teil K Frage 3 | ja |
| PSP-Autorisierung, Capture, Hold, Payout, Refund und Chargeback | Nur Test- und Mockzustaende; kein Echtgeld und keine Schadensverrechnung | PSP-Vertrag und ZAG-erfahrene Pruefung, Teil K Frage 4 | ja |
| T0 plus 5 Tage oder kuerzeres Klaerungsfenster | `awaitingReturnConfirmation` bis T0 plus 5 Kalendertage, keine automatische `needsReview`-Eskalation | Produkt und PSP | nein, aber vor Pilot bestaetigen |
| Vierer-Fotoablauf | Vier Basisfotos je Richtung, Gegenbestaetigung oder Abweichungsfoto, danach getrennte QR-/Fallback-Bestaetigung | Usability-Test vor Pilot | nein, aber vor Pilot bestaetigen |

Die identische maschinenlesbare Liste liegt in
`store/legal-readiness.json`, `lib/config/private_pilot_config.dart` und
`backend/src/private_pilot_domain.js`. Wenn eine Entscheidung aktualisiert
wird, muessen Dokumentversion, App-, Backend- und Regressionstest gemeinsam
angepasst werden.

## Umsetzungscluster

1. Zentrale Pilotkonfiguration, Cent-Preislogik, oeffentliche Endpreise, Checkout-Vorschau und Liefer-/Kategorie-Sperren.
2. Versionierte Privat-Erklaerungen fuer Konto, Inserat und Buchung sowie dauerhafte Nachweisstruktur.
3. Einheitliche Rueckgabezustandsmaschine, Chat-Laufzeit, substantiierter Fall und teilfreigabefaehige Buchungsbetraege.
4. Storno-Karenz und zentral konfigurierbare V4-Zwischenparameter mit versionsgenauem Nachweis.
5. Vierer-Foto-/Gegenbestaetigungsfluss, Risiko-Hinweise und Datenschutz-Aufbewahrung.
6. End-to-End-Tests, Sichtpruefung und Store-/Master-Workflow-Handoff. Kein Push, Deployment oder Live-Payment in B12 ohne gesonderte Freigabe.
