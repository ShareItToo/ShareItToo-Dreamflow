# B13 – Sicherer Privat-Pilot-Bestaetigungsfluss

Stand: 2026-08-16
Kandidat: `1.0.0+2026081509`
Commit: `3fa045b98897f9551f91da932136c2b100b2d700`
Backend-Staging: `0.1.0-cedc5ecfd65a` / `cedc5ecfd65a9f2bcf731b5ac10dfd66a8a8160b`
Umgebung: internes Android-Staging, kein Echtgeld, Google-Play-Internal-Test

## Ergebnis

Die Vorgaben der „ShareItToo Rechtsmappe Privat-Pilot V4“ sind als
konfigurierbarer Privat-Pilot-Vertrag in App und Backend gebunden. Die
technische Uebergabe- und Rueckgabebestaetigung verwendet in der
Backend-Umgebung keine aus Buchungsdaten ableitbaren Codes mehr, sondern eine
serverseitig erzeugte Einmal-Challenge.

## Sicherheitsvertrag

- sechsstelliger kryptografisch erzeugter Einmal-Code und QR-Payload Version 3;
- im Backend wird nur ein HMAC-Digest gespeichert, niemals der Klartext-Code;
- Bindung an Buchung, Segment, vorzeigende Rolle und vorzeigenden Nutzer;
- Uebergabe: Vermieter zeigt, Mieter bestaetigt;
- Rueckgabe: Mieter zeigt, Vermieter bestaetigt;
- zehn Minuten Gueltigkeit, hoechstens fuenf Fehlversuche;
- neue Challenge widerruft eine vorherige aktive Challenge desselben Schritts;
- erfolgreiche Challenge wird einmalig verbraucht und kann nicht erneut
  verwendet werden;
- Statuswechsel akzeptieren im Privat-Pilot nur serverseitig nachgewiesene
  Bestaetigungen;
- beide Buchungsparteien erhalten nach erfolgreicher Bestaetigung einen
  Echtzeit-Refresh.

Der lokale QA-Modus besitzt weiterhin einen getrennten Test-Fallback. Dieser
ist kein Sicherheitsnachweis und wird im Release durch die Backend-Pflicht
ersetzt.

## Gesetzte offene Punkte

Alle sechs noch offenen V4-Entscheidungen besitzen jetzt eine zentrale,
maschinenlesbare Zwischenregel. Sie sind ausdrücklich nicht als juristisch
final oder fuer Echtgeld freigegeben markiert:

1. Plattformvertrag und Widerrufserklaerungen: getrennte, versionierte
   Erklaerungen; SIT-Annahme vorlaeufig bei Buchungsbestaetigung.
2. Wirkung eines Widerrufs auf den privaten Mietvertrag: Eingang bestaetigen
   und protokollieren; keine automatische Buchungs- oder Geldflussaenderung.
3. Storno: fuer geschlossene Tests 50 Prozent unter 24 Stunden und 100 Prozent
   ab Mietbeginn/Mieter-No-Show.
4. PSP/Geldfluss: nur Test- und Mockzustaende; keine echte Autorisierung,
   Belastung, Auszahlung, Erstattung oder Schadensverrechnung.
5. Fehlende Rueckgabebestaetigung: neutraler Zustand bis T0 plus fuenf
   Kalendertage; keine automatische Eskalation.
6. Fotofluss: vier Basisfotos je Richtung, Gegenbestaetigung oder
   Abweichungsfoto, danach getrennte QR-/Code-Bestaetigung.

Die ersten vier Punkte blockieren weiterhin jede Live-Aktivierung. Aenderungen
werden im zentralen Register, im Backend-Spiegel, in den Rechtstexten und in
den gebundenen Tests gemeinsam versioniert.

Am 15.08.2026 wurde festgelegt, dass alle sechs Zwischenregeln im internen und
geschlossenen Test aktiv verwendet werden, bis der Nutzer eine aktualisierte
Entscheidung mitteilt. Die maschinenlesbare Fassung traegt die Version
`V4-INTERIM-2026-08-15`, gilt ausschliesslich fuer interne und geschlossene
Tests und aktiviert weder Echtgeld noch eine rechtliche Live-Freigabe. Jede
spaetere Mitteilung ersetzt den betroffenen Wert zentral in App, Backend,
Rechtstexten und Regressionstests.

## Verifikation

- Flutter-Gesamtsuite: 262 bestanden, 0 fehlgeschlagen.
- Backend-Gesamtsuite: 120 bestanden, 0 fehlgeschlagen, 1 PostgreSQL-Test lokal
  mangels `TEST_DATABASE_URL` uebersprungen.
- Flutter-Gesamtanalyse: 640 bereits vorhandene Warnungen/Hinweise; der Lauf
  bleibt deshalb als eigener Qualitaetsblock offen. Die in diesem Meilenstein
  geaenderten V4-Dateien wurden separat ohne Befund analysiert.
- Legal-Readiness: gueltiger Draft, Live-Freigabe weiterhin fail-closed.
- Datenschutz- und Aufbewahrungsmanifest: Quellhashes aktuell und Validatoren
  bestanden.
- Signierter Android-Kandidat gebaut; APK/AAB-Signatur und binaerer
  Datenschutzscan bestanden.

Artefakt-Hashes:

- AAB: `1ebc15439ce636390a03928a6565824bcb42fccb33e6ee4d95d04b8832925c62`
- APK: `d1147e4ceec978137c0172483ae188db926d2957dc190fe3cd502036b92d0654`
- Datenschutzbericht:
  `bcd7631589b0c116f445bfbbffb8e687843c01e2569a5fbd144d26acb98af9a9`

## Staging-Abnahme

Vor dem Rollout wurden Datenbank und Uploads getrennt gesichert. Das exakte
Backend-Image wurde zunaechst gegen eine temporaere PostgreSQL-Instanz
gestartet. Alle 13 Migrationen und die 14 Spalten der Challenge-Tabelle waren
dort vorhanden. Anschliessend wurde nur Staging mit automatischem Rollback
aktualisiert; FCM bestand seine separate Secret-Pruefung.

Der erste reale Zwei-Rollen-Test deckte eine falsche Tabellenquelle fuer den
Buchungs-Payload auf. Die Abfrage wurde auf den gesperrten Verbund aus
`bookings` und `rental_requests` korrigiert, erneut vollstaendig getestet und
als Backend-Kandidat `2026081412-v4` ausgerollt.

Die wiederholte Abnahme bewies danach:

- Eigener Code kann nicht selbst bestaetigt werden;
- falscher Code wird abgelehnt und reduziert die verbleibenden Versuche;
- korrekter Uebergabe-Code wird durch die Gegenpartei verbraucht;
- identische Wiederholung ist idempotent und erzeugt kein zweites Ereignis;
- Statuswechsel zu `active` ist erst nach verifizierter Uebergabe moeglich;
- Rueckgabe-Code folgt der umgekehrten Rollenrichtung;
- Abschluss ist erst nach verifizierter Rueckgabe moeglich;
- beide Bestaetigungen stehen als Version 3 im Buchungsnachweis;
- genau zwei unveraenderliche Bestaetigungsereignisse wurden protokolliert;
- Testkonten, Inserat und Buchung sind geschlossen beziehungsweise beendet;
  es blieb kein aktiver Testnutzer, kein aktives Inserat, keine offene
  Testbuchung und keine aktive Challenge zurueck;
- Staging ist oeffentlich bereit, nutzt Testzahlung ohne Echtgeld und meldet
  keine fatalen Laufzeitfehler;
- Produktion blieb unveraendert auf Commit
  `09c9211e41da75969b9ee59e9954ac7465250e80`.

Servernachweis:

- Staging-Release:
  `/docker/shareittoo/releases/staging-20260814T224254Z-0761f9382414.json`
- Staging-Sicherung:
  `/docker/shareittoo/backups/staging/shareittoo-staging-20260814T222552Z.sha256`

## Bewusste Grenzen / naechste Schritte

- Migration 013 und der sichere Zwei-Rollen-Serverfluss sind auf der isolierten
  Staging-Umgebung angewendet und integrativ bestanden.
- Kandidat 2026081411 ist ausschliesslich im Google-Play-Internal-Test als
  `1.0.0-internal-2026081411` verfuegbar. Closed Testing, Open Testing und
  Produktion blieben unveraendert.
- Das Pixel 7 Pro wurde verlustfrei ueber Google Play von 2026081409 auf
  2026081411 aktualisiert. Installer, Versionscode, erhaltener Staging-Login,
  Kaltstart und geladener Feed wurden verifiziert; es trat kein fataler
  Startfehler auf.
- Der reale PSP-Vertrag, finale Rechtsfreigabe, Store-Datenschutzantworten und
  der geschlossene Test bleiben offene Live-Gates.
- Der geschuetzte Store-Review-Nachweis wurde fuer Kandidat 2026081411
  ehrlich auf `review-fixture-refresh-pending` gesetzt: beide Rollen-Logins,
  Staging-Health, Positivlisten-Inserat und Preisangebot bestehen; das
  Erzeugen der neuen akzeptierten Testbuchung endet serverseitig noch mit
  `internal_error`. Die alte stornierte, zahlungsfreie Fixture wurde
  archiviert. Ein neues synthetisches Inserat ist vorbereitet; akzeptierte
  Buchung und gemeinsamer Chat bleiben bis zur Fehlerbehebung offen.
- Naechster technischer Schritt: Google-Play-Installation auf dem zweiten
  Testgeraet und visueller Zwei-Rollen-End-to-End-Test fuer Uebergabe,
  Rueckgabe, Fehlcode, Ablauf, Replay-Schutz und die SIT-Dialoge.

## Google-Play-Internal-Meilenstein 16.51

- Release: `1.0.0-internal-2026081411`
- Status: `Available to internal testers`
- Versionscode: `2026081411`
- Google-Pruefung: noch nicht erfolgt; temporaerer Paketname fuer interne
  Tester bleibt erwartungsgemaess sichtbar.
- Unterstuetzte Telefone: 12.427; kein Geraeteverlust zur Vorversion.
- Downloadgroesse fuer neue Installationen: 59,3 MB; Updategroesse: 5 MB.
- Release-Hinweis bindet den sicheren Privat-Pilot-Ablauf ausdruecklich an
  Staging und Testzahlungen.
- Play-signiertes Pixel-Update: bestanden, Installer `com.android.vending`.
- Repository-Nachweise und Fail-closed-Validatoren: bestanden.
- Grenzen: kein Closed-, Open- oder Production-Release, keine oeffentliche
  Ausrollung, kein Echtgeld und keine Produktionsaenderung.

## Meilenstein 16.52 – aktive V4-Zwischenregeln und ehrlicher Review-Stand

- Alle sechs offenen V4-Punkte sind zentral als Version
  `V4-INTERIM-2026-08-15` fuer interne und geschlossene Tests aktiv. Sie koennen
  nach einer neuen Nutzerentscheidung gemeinsam in App, Backend,
  Rechtstexten und Tests ersetzt werden.
- Echtgeld, Auszahlung, Schadensverrechnung und rechtliche Live-Freigabe
  bleiben technisch ausgeschaltet.
- Der Store-Review-Nachweis ist nicht mehr faelschlich gruen: beide
  Rollen-Logins, Staging-Health, Positivlisten-Inserat und Preisangebot sind
  verifiziert; akzeptierte Buchung und gemeinsamer Chat bleiben wegen eines
  serverseitigen `internal_error` offen.
- Das Werkzeug fuer synthetische Review-Buchungen sendet jetzt die
  Privatstatus-Bestaetigung, die erlaubte Kategorie und alle fuenf getrennten,
  versionierten V4-Erklaerungen.
- Ein begrenzter Wiederholungsversuch verwendete das bereits vorbereitete
  Inserat ohne neuen Upload und ohne weiteres Inserat. Der Fehler blieb
  `internal_error`; als sicherer Serverbezug wurde die Korrelationsnummer
  `cacd5a0f-f85f-4c92-9dc9-af2497186f6c` erfasst. Es wurde kein Zahlungsweg
  aufgerufen.
- Vollstaendige App-Suite: 262 bestanden, 0 fehlgeschlagen.
- Vollstaendige Backend-Suite: 120 bestanden, 0 fehlgeschlagen, 1 lokaler
  PostgreSQL-Test mangels `TEST_DATABASE_URL` uebersprungen.
- Analyse der geaenderten V4-Dateien: 0 Befunde. Die 640 bereits vorhandenen
  Hinweise der Gesamtanalyse bleiben transparent offen und werden nicht als
  Freigabe behauptet.
- Google Play bleibt ausschliesslich beim internen Kandidaten
  `1.0.0-internal-2026081411`; Closed, Open, Produktion und Echtgeld wurden
  nicht veraendert.

## Meilenstein 16.53 – Review-Buchung und gemeinsamer Chat repariert

- Die Korrelationsnummer `cacd5a0f-f85f-4c92-9dc9-af2497186f6c` fuehrte zum
  exakten PostgreSQL-Fehler: Der gemeinsame Erstellungszeitpunkt der Buchung
  wurde gleichzeitig als Text und `TIMESTAMPTZ` abgeleitet. Commit `904b1c2`
  bindet alle drei Verwendungen explizit als `TIMESTAMPTZ`.
- Der naechste Annahmeversuch zeigte getrennt, dass das synthetische Werkzeug
  die vorgeschriebene versionierte Vermietererklaerung noch nicht mitsendete.
  Commit `25af918` sendet sie jetzt vollstaendig und uebersetzt fehlende oder
  ungueltige Erklaerungen in einen fachlichen 400er statt eines generischen
  500ers.
- Vor beiden Staging-Rollouts wurden Datenbank und Uploads getrennt gesichert
  und per SHA-256 geprueft. Beide Images waren unveraenderlich an ihren Commit
  gebunden; FCM-Secret-Gate, Container-Health und automatischer Rollback-Pfad
  waren aktiv.
- Aktives Staging: `1.0.0-2026081502-v4-owner-acceptance`, Commit
  `25af918304abb13b9959d5f1e8cc35f186ecec56`.
- Reale Staging-Abnahme: vorhandenes synthetisches Inserat wiederverwendet,
  Buchung angefragt, Vermieterannahme gespeichert, Buchung fuer beide Rollen
  sichtbar, gemeinsamer Thread fuer beide Rollen sichtbar und lesbar sowie je
  eine Nachricht aus Vermieter- und Mieterrolle angenommen.
- Der Store-Review-Nachweis steht deshalb fuer Login, Inserat, akzeptierte
  Buchung und gemeinsamen Chat wieder auf bestanden. Frische Installation und
  zweites Netz bleiben weiterhin offen und werden nicht vorweggenommen.
- Grenzen: Zahlung blieb `memory`, Stripe blieb nicht live, kein
  Zahlungsendpunkt wurde aufgerufen, Produktion blieb auf Commit
  `09c9211e41da75969b9ee59e9954ac7465250e80`, und kein oeffentlicher
  Store-Track wurde veraendert.

## Meilenstein 16.64 – sechs offene V4-Punkte releasefest aktiv

- Alle sechs offenen Punkte bleiben mit Status `open` als aktive
  Zwischenregeln gesetzt. Sie werden erst nach einer neuen Mitteilung des
  Nutzers zentral aktualisiert; keine Regel wurde als juristisch final
  bezeichnet.
- Der Legal-Readiness-Validator prueft jetzt nicht nur die Rechtstext-Hashes,
  sondern auch Version, Testumfang, Echtgeldsperre und alle sechs
  Zwischenentscheidungen gemeinsam in Manifest, Flutter-App und Backend.
- Ein Pausieren der Zwischenregel, stilles Schliessen eines offenen Punkts,
  Aktivieren echter Zahlungen in der App oder Entfernen eines Punkts im
  Backend stoppt den Release fail-closed.
- Die sechs Funktionswege wurden gemeinsam erneut geprueft: getrennte
  Buchungserklaerungen, neutraler Plattformwiderruf, 50/100-Storno,
  Test-/Mock-Geldfluss, neutrales Rueckgabefenster T0 plus fuenf Tage sowie
  vier Fotos je Richtung mit Gegenbestaetigung und QR-/Code-Ablauf.
- Ergebnis: 11 Legal-Validator-Tests, 12 Backend-Tests und 60 Flutter-Tests
  bestanden; kein Fehler.
- Der bereits aus Google Play installierte Android-Kandidat 2026081505 bleibt
  unveraendert. Die neue Aenderung ist eine Repository- und Release-Sperre und
  erfordert allein keinen neuen Store-Kandidaten. Der physische V4-Rollenlauf
  auf 2026081505 war bereits bestanden.
- Produktion, oeffentliche Store-Tracks, Echtgeld, juristische Live-Freigabe,
  manuelle TalkBack-Abnahme und Zwei-Geraete-Matrix blieben unveraendert
  geschlossen beziehungsweise offen.
- Maschinenlesbarer Nachweis:
  `docs/evidence/b11/v4-interim-contract-enforcement-20260815T042919Z.json`.

## Meilenstein 16.65 – exakter Play-Review-, Screenshot- und Technikstand

- Der bereits aktive Google-Play-Internal-Kandidat `2026081505` wurde als
  exakte Play-Split-Installation mit Installer `com.android.vending`
  kontrolliert. Es wurde kein neuer Store-Kandidat hochgeladen und kein
  oeffentlicher Track veraendert.
- Die vier vorgesehenen Telefon-Screenshots wurden direkt aus diesem exakten
  Kandidaten neu aufgenommen und visuell freigegeben: Feed, Inseratdetail,
  Suche und Anzeige erstellen. Alle Bilder sind 1080 x 1920 Pixel, enthalten
  keine Kontodaten oder Zugangsdaten. Die vier alten Fassungen wurden am
  15. August durch diese vier exakten Bilder ersetzt und als Play-Listing-
  Entwurf gespeichert; es wurde nichts zur Pruefung eingereicht.
- Der geschuetzte Staging-Reviewbestand ist fuer Build `2026081505` erneut
  geprueft: technische Zugaenglichkeit sowie acht von zehn Szenarien bestehen.
  Frische Installation und zweites Netz bleiben ehrlich offen.
- Die Google-Play-Datensicherheitsmatrix ist an denselben Kandidaten gebunden:
  16 von 17 Antworten sind technisch vorbereitet, aber nicht in der Console
  gespeichert. Die Dienstleister-/Sharing-Einstufung umfasst fuenf aktive
  Auftragsverarbeiter; ihre rechtliche und nutzerseitige Freigabe bleibt offen
  und blockiert das Speichern fail-closed.
- Die Analyse-Regressionssperre wurde ohne Erhoehung der Toleranz repariert.
  Nach Korrektur der neuen asynchronen UI-Stellen sank der Gesamtstand von 640
  auf 611 Meldungen; die neue feste Obergrenze ist 611. Commit: `5e5677b`.
- Der vollstaendige technische Pruefpfad bestand: alle Repository- und
  Store-Validatoren, alle 266 Flutter-Tests, Web-Debug-Build und
  Android-Debug-Build. Der Datenschutz-Quellnachweis wurde ausschliesslich
  fuer die technisch geaenderte Standortdatei auf deren neuen SHA-256
  aktualisiert; die Datennutzung selbst wurde nicht erweitert.
- Alle sechs offenen V4-Punkte bleiben unveraendert als aktive
  `V4-INTERIM-2026-08-15`-Regeln gesetzt. Sie sind weder entfernt noch als
  final beschlossen markiert und werden erst nach einer neuen Mitteilung des
  Nutzers zentral aktualisiert.
- Weiterhin offen: manuelle TalkBack-/Grossschrift-Abnahme, zweites Netz,
  frische Installation, Closed Testing, Apple-Tooling/-Mitgliedschaft,
  finale Rechts- und Datenschutzentscheidungen sowie echte Zahlungsfreigabe.
  Produktion, Echtgeld und oeffentliche Store-Tracks blieben unveraendert.

## Meilenstein 16.66 – Fresh-Install-Nachweis und SIT-Popup-Zugaenglichkeit

- Der exakte Google-Play-Internal-Kandidat `2026081505` blieb als vierteiliges
  Play-Split-Paket mit Installer `com.android.vending` unveraendert installiert.
- Die isolierten SIT-App-Daten wurden kontrolliert geleert. Der erste Start
  erschien korrekt abgemeldet; die Android-16-Benachrichtigungsfreigabe wurde
  durchlaufen, das geschuetzte synthetische Staging-Konto automatisch
  wiederhergestellt und der Login ueberstand den anschliessenden Kaltstart.
- Der Store-Review-Zugang steht dadurch bei 9 von 10 bestandenen Szenarien.
  Nur der Nachweis ueber ein zweites wirklich getrenntes Netz bleibt offen und
  wird nicht vorweggenommen.
- Maschinenlesbarer Nachweis:
  `docs/evidence/b11/android-fresh-install-2026081505-20260815T054742Z.json`.
  Repository-Commit: `814a64e`.
- Beim Lauf wurde sichtbar, dass das rote Schliessen-Symbol der zentrierten
  SIT-Popups noch keinen Screenreader-Namen hatte. Die gemeinsame
  Popup-Komponente benennt diese Aktion jetzt eindeutig mit `Schliessen`.
  Repository-Commit: `8f60af5`. Diese UI-Verbesserung gehoert erst zum
  naechsten App-Kandidaten und wird dem unveraenderten Play-Build `2026081505`
  nicht rueckwirkend zugeschrieben.
- Der vollstaendige technische Pruefpfad bestand: saemtliche Repository-,
  Store-, Rechts-, Datenschutz-, Review- und Geraetepruefer, 266 Flutter-Tests,
  Web-Debug-Build und Android-Debug-Build. Apple blieb im ausdruecklich offenen
  Android-Rollover-Modus.
- Alle sechs offenen V4-Punkte bleiben unveraendert als aktive Zwischenregeln
  `V4-INTERIM-2026-08-15` gesetzt. Sie sind weder entfernt noch finalisiert und
  werden erst nach einer neuen Mitteilung des Nutzers zentral aktualisiert.
- Produktion, Echtgeld, oeffentliche Store-Tracks, Closed Testing,
  Apple-Tooling/-Mitgliedschaft, TalkBack-/Grossschrift-Geraetematrix sowie
  finale Rechts- und Datenschutzfreigaben blieben unveraendert geschlossen
  beziehungsweise offen.

## Meilenstein 16.67 – Android-SMS-Nachweis korrekt gebunden

- Der bereits vorhandene anonymisierte Realgeraete-Nachweis fuer Firebase-
  Telefonverifizierung wurde aus dem veralteten Zwischenstatus uebernommen:
  Der Google-Play-Internal-Build `2026081403` erhielt eine echte SMS, nahm den
  neuesten gueltigen Code an, behielt den verifizierten Zustand nach frischem
  Login und lehnte einen falschen Code ab, ohne das Konto zu verifizieren.
- Der aktuelle Play-Kandidat `2026081505` ist getrennt als derzeitige
  Quell- und Store-Bindung dokumentiert. Er enthaelt die anschliessend
  eingefuehrten zentrierten SIT-Dialoge mit spezifischen Erklaerungen fuer
  ungueltige Telefonnummer, falschen oder abgelaufenen Code und technische
  Verbindungsfehler. Dem aktuellen Kandidaten wird kein neuer SMS-Versand
  zugeschrieben.
- Der Validator liest nun die drei konkreten, bereinigten Nachweise selbst,
  prueft Build, Play-Auslieferung, Signing-Ergebnis, reale SMS-Ergebnisse und
  die Bindung an den aktuellen Store-Kandidaten. Geschwaechte oder fehlende
  Belege stoppen den Release fail-closed.
- Android-App-Verifizierung und Android-Realgeraete-SMS stehen damit auf
  `passed`. Weiterhin offen bleiben Apple/APNs, ein realer Apple-SMS-Test und
  die noch nicht final gespeicherte Store-/Dienstleister-Einstufung.
- Zehn gezielte Validator-Tests und zwei Flutter-Vertragstests bestanden. Der
  Release-Vorcheck bestand alle lokalen Stufen bis zum externen Firebase-
  Projektwert, der in dieser lokalen Sitzung nicht gesetzt war; es wurde keine
  Firebase-, Produktions-, Zahlungs- oder Store-Aenderung ausgefuehrt.
- Telefonnummern, SMS-Codes, Firebase-Token, Kontodaten und Geraete-IDs sind
  aus allen Nachweisen ausgeschlossen.
- Alle sechs offenen V4-Punkte bleiben unveraendert als aktive Zwischenregeln
  `V4-INTERIM-2026-08-15` gesetzt. Sie werden erst nach einer neuen Mitteilung
  des Nutzers aktualisiert und sind weder entfernt noch finalisiert.

## Meilenstein 16.69 – Offen-Status in App und Backend verriegelt

- Alle sechs V4-Entscheidungen tragen jetzt nicht nur im Store-Manifest,
  sondern auch in der Flutter-App und im Backend-Domainmodell ausdruecklich
  den maschinenlesbaren Status `open`.
- Die Zwischenregeln bleiben gleichzeitig fuer interne und geschlossene Tests
  aktiv. `open` bedeutet deshalb bewusst "noch nicht final entschieden" und
  nicht "funktionslos".
- Der Rechtsvalidator verlangt exakt sechs `status: 'open'`-Eintraege in App
  und Backend. Ein stilles Entfernen, Schliessen oder Umdeuten stoppt den
  Release-Vorcheck fail-closed.
- 19 gezielte Backend-/Rechtsvalidator-Tests und der Flutter-Vertragstest
  bestanden. Es wurden weder Echtgeld, Produktion noch Store-Ausrollung
  aktiviert.
- Eine spaetere Aenderung erfolgt erst nach einer ausdruecklichen Mitteilung
  des Nutzers und muss dann Manifest, App, Backend, Rechtstexte und Tests
  gemeinsam aktualisieren.

## Meilenstein 16.68 – Android-WLAN-Matrix 9/11 und Zugänglichkeits-Vorlauf

- Die zuvor pauschal offene Android-WLAN-/Owner-Zelle ist jetzt an die bereits
  vorhandenen exakten Nachweise des Google-Play-Builds `2026081505` gebunden.
  Neun von elf Teilpruefungen stehen belegt auf `passed`: frischer Start,
  Anmeldung/Sitzung, Inserat/Buchung, Chat/Deep-Link, Push im Vordergrund,
  Push im Hintergrund, Push bei beendetem Prozess, Uebergabe/Rueckgabe und
  Offline-Wiederherstellung.
- `moderationAndAccount` bleibt ehrlich auf `testing`: Melden, Blockieren,
  Datenexport und sichere Abmeldung sind belegt; die irreversible Loeschung
  eines gesonderten Wegwerf-Testkontos wurde nicht ungefragt ausgefuehrt.
- `largeTextAndScreenReader` bleibt ebenfalls auf `testing`. Auf dem realen
  Pixel 7 Pro wurden der exakte Play-Kandidat, Play-Installer, WLAN, TalkBack
  und mindestens 200 Prozent Schrift gleichzeitig ohne Vorbedingungsblocker
  erkannt. Die eigentliche SIT-Traversierung wurde jedoch vom erstmaligen
  Android-TalkBack-Einfuehrungsbildschirm abgefangen und deshalb nicht als
  App-Abnahme gewertet.
- Nach dem Vorlauf wurden Schriftgroesse exakt auf 85 Prozent,
  Zugänglichkeitsdienste auf aus und `accessibility_enabled` auf 0
  wiederhergestellt; ShareItToo wurde wieder in den Vordergrund gebracht.
- Der Gerätevalidator prueft nun auch nicht abgeschlossene
  `device-matrix-cell-progress`-Belege: Kandidat, Zelle, jeder Teilstatus,
  Zeitstempel, Zusammenfassung und alle referenzierten bereinigten Nachweise
  muessen uebereinstimmen. Ein vorgezogener Pass stoppt fail-closed.
- 62 Geräte-Nachweistests und 15 B11-Dokumenttests bestanden. Der gesamte
  lokale Release-Vorcheck bestand erneut bis zum externen Firebase-Projektwert
  dieser Sitzung. Keine externe Konfiguration, Produktion, Zahlung oder
  Store-Ausrollung wurde veraendert.
- Alle sechs offenen V4-Punkte bleiben unveraendert als aktive Zwischenregeln
  `V4-INTERIM-2026-08-15` gesetzt. Sie werden erst nach einer neuen Mitteilung
  des Nutzers aktualisiert und sind weder entfernt noch finalisiert.

## Meilenstein 16.70 – Google-Play-Kandidat 1506 intern aktiv und geschlossen vorbereitet

- Der exakte Android-Kandidat `1.0.0+2026081506` ist im Google-Play-Internal-
  Track aktiv. Die Auslieferung wurde auf dem Pixel 7 Pro als vierteiliges
  Play-Split-Paket mit Installer `com.android.vending` nachgewiesen; Version,
  Play-App-Signing-Zertifikat und verifizierte App-Links stimmen.
- Kaltstart, Wiederherstellung der bereits vorhandenen Anmeldung und der
  authentifizierte Staging-Feed bestanden auf genau diesem Play-Build. Der
  Nachweis enthaelt weder Identitaetsdaten noch Zugangsdaten oder rohe
  Geraete-IDs.
- Der Closed-Alpha-Entwurf enthaelt ausschliesslich Build `2026081506`, meldet
  keine technischen Releasefehler und ist als Entwurf gespeichert. Er wurde
  weder zur Pruefung gesendet noch gestartet.
- Die oeffentlichen Seiten Datenschutz, Support und Kontoloeschung antworten
  erfolgreich. `https://shareittoo.com/privacy` ist in Google Play gespeichert
  und erscheint in der Veroeffentlichungsuebersicht. Die Datensicherheits-
  erklaerung bleibt der einzige offene App-Content-Bereich und wird wegen der
  offenen Dienstleister-, Aufbewahrungs- und Rechtsentscheidungen nicht
  geraten, gespeichert oder eingereicht.
- Android nutzt fuer neue Fotos den systemeigenen Fotoauswaehler und fordert
  keine breite Medienbibliothek-Berechtigung mehr an. Die vier Store-Bilder
  wurden erneut direkt aus Build `2026081506` aufgenommen, visuell geprueft
  und sind bytegenau identisch zu den vier bereits gespeicherten Bildern.
  Deshalb war kein erneutes Hochladen oder Aendern des Play-Listings noetig.
- Die bestandene Geraetematrix von Build `2026081505` wurde nicht auf den neuen
  Kandidaten uebertragen. Fuer `2026081506` stehen die vier Matrixzellen wieder
  ehrlich auf offen; bestaetigt sind bisher nur die exakt neu beobachteten
  Installations-, Signatur-, Link-, Feed- und Sitzungsmerkmale. Frische
  Installation, zweites Konto, Chat-/Bildfluss, Push, Crashlytics, Offline-
  Wiederherstellung und zweites Netz werden separat neu geprueft.
- Der vollstaendige Android-Regressionslauf bestand alle Validatoren, alle 266
  Flutter-Tests, Web-Debug-Build und Android-Debug-Build. Auch der lokale
  Release-Vorcheck bestand fuer `com.shareittoo.app` in Version
  `1.0.0+2026081506`; der Status bleibt bewusst `hold` mit 0/4 Geraetezellen
  und 5/7 Releasepruefungen.
- Produktion, Echtgeld, oeffentliche Store-Tracks, Review-Versand und Closed-
  Test-Rollout blieben unveraendert. Alle sechs V4-Punkte bleiben mit
  `status: open` unter `V4-INTERIM-2026-08-15` aktiv und werden erst nach einer
  neuen Mitteilung des Nutzers zentral aktualisiert.

## Meilenstein 16.71 – Play-Build 1506: Buchung, Links, Push, Logout und Offline bestanden

- Der exakte Google-Play-Internal-Build `1.0.0+2026081506` bestand auf dem
  Pixel 7 Pro den isolierten Zwei-Rollen-Ablauf `requested -> accepted ->
  active -> completed`, einschliesslich gegenseitiger QR-Bestaetigungen bei
  Uebergabe und Rueckgabe. Die temporaere Anzeige wurde danach pausiert; der
  geschuetzte Reviewbestand blieb unveraendert.
- Drei authentifizierte Einstiegswege wurden auf demselben vierteiligen
  Play-Split-Paket nachgewiesen: HTTPS-Anzeige, HTTPS-Buchung und App-Chatlink.
  Das Diagnosewerkzeug ignoriert jetzt archivierte, ausgemusterte oder bereits
  pausierte Altdaten, erzeugt bei Bedarf eine frische isolierte Buchung und
  pausiert deren Anzeige nach jedem erfolgreichen oder fehlgeschlagenen Lauf.
- Kontrollierte Staging-Push-Mitteilungen bestanden im Vordergrund, im
  Hintergrund und bei beendetem App-Prozess. Der private Bildnachweis zeigt
  das SIT-Symbol mittig, vollstaendig innerhalb des Android-Kreises und mit
  sichtbarem Sicherheitsabstand; der Bildnachweis bleibt ausserhalb des
  Repositorys.
- Der Abmeldeablauf bestand: Sitzung geloescht, Gastmodus nach Kaltstart,
  privater Chat nach Abmeldung verborgen und keine neue Systembenachrichtigung
  an die abgemeldete App. Anschliessend wurde die geschuetzte synthetische
  Sitzung automatisch wiederhergestellt.
- Der 15-sekuendige Offline-/Realtime-Test bestand ohne Prozesswechsel oder
  Absturz. Die kontrollierte Nachricht blieb waehrend der Netztrennung
  unsichtbar, erschien nach Wiederherstellung im bestehenden Chat, und der
  urspruengliche WLAN-/Mobilfunkzustand wurde wiederhergestellt.
- Alle Laeufe nutzten nur synthetische Staging-Konten, `paymentMode: memory`
  und `stripeLivemode: false`. Es wurden weder Echtgeld noch Produktion,
  oeffentliche Store-Tracks, Closed Testing oder Review-Versand aktiviert.
- Die vier vollstaendigen Geraetematrix-Zellen bleiben dennoch ehrlich bei
  0/4: Hotspot, manuelle TalkBack-/Grossschrift-Abnahme, der vollstaendige
  Fotoablauf, zweites physisches Geraet und iOS/TestFlight sind separate offene
  Gates. Apple/APNs bleibt innerhalb der kombinierten Push-Pruefung offen.
- Google Plays Datensicherheit und die sechs V4-Entscheidungen bleiben
  unveraendert offen. Alle sechs V4-Zwischenregeln tragen weiterhin
  `status: open` unter `V4-INTERIM-2026-08-15` und werden erst nach einer neuen
  Mitteilung des Nutzers zentral aktualisiert.

## Meilenstein 16.72 – Crashlytics-Zuordnung fuer Play-Build 1506 gesichert

- Die im archivierten AAB enthaltene R8-/ProGuard-Zuordnung wurde bytegenau an
  den exakten Google-Play-Kandidaten `1.0.0+2026081506` gebunden. AAB, APK,
  Zuordnungsdatei und die im APK eingebettete Crashlytics-ID sind jeweils per
  SHA-256 nachgewiesen.
- Die Zuordnung wurde mit genau der build-spezifischen Crashlytics-ID von
  `2026081506` erfolgreich hochgeladen. Es wurde keine neue Ersatz-ID erzeugt
  und keine Zuordnung eines aelteren Kandidaten als gleich ausgegeben.
- Die nativen Symboldateien fuer `armeabi-v7a`, `arm64-v8a` und `x86_64` sind
  bytegenau identisch mit dem bereits erfolgreich uebertragenen Symbolsatz;
  ZIP und alle drei Einzeldateien wurden erneut gegen das AAB geprueft.
- Eine Nachpruefung fand dabei einen historischen Dokumentationsfehler bei
  Build `2026081505`: Dessen APK besitzt eine eigene Crashlytics-ID. Der alte
  Wiederverwendungsnachweis wurde deshalb korrigiert und der unbelegte exakte
  Mapping-Upload-Anspruch ausdruecklich zurueckgezogen.
- Der bereinigte kontrollierte Crash-Event und die sichtbare Zuordnung des
  Builds in der Firebase-Konsole bleiben fuer `2026081506` bewusst offen. Die
  Crashlytics-Releasepruefung steht deshalb weiterhin auf `testing`, nicht auf
  `passed`.
- 79 gezielte Nachweis-, Dokument- und Upload-Verdrahtungstests sowie der
  vollstaendige technische Regressionslauf bestanden. Dieser umfasste alle
  Validatoren, den unveraenderten Analyse-Bestand von 611 Hinweisen, alle 266
  Flutter-Tests, den Web-Debug-Build und den Android-Debug-Build. Die B11-
  Snapshots wurden neu erzeugt; Gesamtstatus bleibt `hold`, Matrix 0/4 und
  Releasepruefungen 5/7.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.73 – Gemeinsame Uebergabezeit serverseitig synchronisiert

- Beim realen Zwei-Konten-Test wurde ein echter Ablaufblocker gefunden: Die
  vorgeschlagene Uebergabe- und Rueckgabezeit lag bisher nur lokal auf dem
  jeweiligen Geraet. Zwei getrennte Personen konnten denselben Vorschlag
  deshalb nach Neuinstallation oder Kontowechsel nicht verlaesslich gemeinsam
  sehen und bestaetigen.
- Das Staging-Backend besitzt nun einen autorisierten, idempotenten
  Buchungszustand fuer Vorschlag und Bestaetigung von Uebergabe- und
  Rueckgabezeit. Nur Buchungsteilnehmer duerfen lesen oder schreiben; die
  Bestaetigung ist ausschliesslich durch die jeweilige Gegenpartei moeglich.
- Der exakte Backend-Commit `36f9145e67be30fd01ffb61ad38e99361d391479`
  wurde als unveraenderliches Staging-Image ausgerollt. Datenbank, Mail und API
  sind gesund; Zahlungen bleiben im Speichermodus und Produktion blieb
  unveraendert.
- Der signierte Android-Kandidat `1.0.0+2026081508` wurde aus Commit
  `21645ba02bcfb8056bdeae2d4d97d7835723b30f` erstellt. AAB, APK, Signatur und
  binaerer Datenschutzscan wurden geprueft. Er wurde noch nicht zu Google Play
  hochgeladen.
- Auf dem Pixel 7 Pro schlug das synthetische Vermieter-Konto 22:00 Uhr vor.
  Nach vollstaendigem Leeren der App-Daten und Wiederherstellung des getrennten
  Mieter-Kontos erschien derselbe Vorschlag mit `Annehmen`; die Gegenpartei
  bestaetigte erfolgreich. Nach erneutem Leeren der App-Daten erschien beim
  Vermieter weiterhin die korrekte Hauptaktion `Uebergabe starten`.
- Der Backendzustand bestaetigte den gemeinsamen Vorschlag und die
  Gegenpartei-Bestaetigung mit Revision 2. Der zentrale Nachweis liegt unter
  `docs/evidence/b11/android-two-account-flow-time-2026081508-20260815T111637Z.json`.
- 126 Backend-Tests (ein externer Integrationstest uebersprungen), 53 gezielte
  Flutter-Tests, zwei Android-Fotoauswaehler-Tests und der binaere
  Datenschutzscan bestanden.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.74 – Play-Internal-Build 1508 kandidatengenau installiert

- Der in Meilenstein 16.73 noch nicht hochgeladene Android-Kandidat
  `1.0.0+2026081508` wurde unveraendert in Google Play Internal Testing
  hochgeladen und als Release `1.0.0-internal-2026081508` aktiviert.
- Google Play akzeptierte den AAB ohne Fehler: Mindest-API 24, Ziel-SDK 35,
  12.427 unterstuetzte Telefone und kein verlorenes Geraet gegenueber dem
  vorherigen Release. Die Release-Notiz beschreibt ausschliesslich Staging,
  Systemfotoauswahl und Testzahlungen.
- Der erste Download unmittelbar nach Aktivierung lieferte waehrend der
  Store-Propagation noch Build `2026081507`. Dieser Zustand wurde nicht als
  bestanden ausgegeben. Nach kurzer Propagation bot Play das Update an und
  installierte exakt Build `2026081508`.
- Auf dem Pixel 7 Pro wurden Version, Installer `com.android.vending`, vier
  Store-Splits und der Play-App-Signing-Fingerabdruck
  `36488abf86c51da07ab2258f31b00e2f1ba8a36d076107b9f006376ade80b956`
  zurueckgelesen. Der Kaltstart blieb absturzfrei; die geschuetzte
  synthetische Vermieter-Sitzung, der Staging-Feed und der vorhandene
  `flow1508`-Buchungs-Chat waren sichtbar.
- Beim Kaltstart wurde ein separater offener Punkt sichtbar: Das Android-
  Facebook-Login-Plugin meldet, dass das Facebook-SDK noch nicht initialisiert
  ist. Die App selbst startet weiter, aber Facebook-Anmeldung gilt fuer diesen
  Kandidaten ausdruecklich nicht als bestanden und wird vor dem naechsten
  Kandidaten korrigiert.
- Der Store-Nachweis, Kandidatenbeleg, Berechtigungsinventar,
  Datenschutz-Binaernachweis und die maschinengeprueften Handoffs wurden auf
  Build `2026081508` umgestellt. Die Validatoren bleiben fail-closed, und der
  Store-Gesamtstatus bleibt `testing/hold`.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.75 – Social-Login-Ausfall sicher abgefangen und Build 1509 geprueft

- Der in Build `2026081508` beobachtete Android-Startfehler des Facebook-
  Plugins wurde an der Quelle behoben. Facebook-App-ID und Client-Token werden
  im Android-Manifest nun immer als String-Ressourcen eingebunden; die
  Fallbackwerte `0` und `not-configured` koennen nicht mehr als ungueltiger
  numerischer Manifestwert interpretiert werden.
- Google-, Apple- und Facebook-Anmeldung sind im Release standardmaessig
  fail-closed. Ein Anbieter wird erst durch eine ausdrueckliche Build-
  Konfiguration freigeschaltet; Facebook zusaetzlich nur mit realer App-ID und
  realem Client-Token. Ohne diese Voraussetzungen startet kein fremdes SDK.
- Der neue signierte interne Kandidat `1.0.0+2026081509` wurde aus Commit
  `3fa045b98897f9551f91da932136c2b100b2d700` gebaut und privat archiviert.
  AAB, APK, Upload-Signatur, Paketidentitaet, Berechtigungsinventar und
  binaerer Datenschutzscan sind geprueft; der Scan meldet keine Findings.
- Auf dem physischen Pixel 7 Pro startete der direkt installierte Kandidat
  ohne Absturz und ohne den frueheren Facebook-SDK- oder Plugin-
  Registrierungsfehler. Der Staging-Feed war sichtbar. Ein Klick auf die noch
  nicht freigeschaltete Facebook-Anmeldung zeigte den mittigen SIT-Hinweis
  `Facebook ist noch nicht freigeschaltet. Bitte nutze voruebergehend E-Mail.`
  statt eines defekten Anbieterfensters.
- Nach dem Test wurde der direkte Kandidat entfernt. Auf dem Pixel laeuft
  wieder exakt der von `com.android.vending` gelieferte Play-Build
  `1.0.0+2026081508`; die geschuetzte synthetische Vermieter-Sitzung wurde
  wiederhergestellt und der Start blieb absturzfrei.
- Build `2026081509` wurde noch nicht zu Google Play hochgeladen oder
  aktiviert. Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und
  Review-Versand blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.76 – Play-Internal-Build 1509 exakt ausgeliefert

- Der in Meilenstein 16.75 lokal gepruefte Android-Kandidat
  `1.0.0+2026081509` wurde unveraendert in Google Play Internal Testing
  hochgeladen und als Release `1.0.0-internal-2026081509` aktiviert. Google
  Play zeigt ihn als `Available to internal testers`; er wurde nicht fuer
  Closed Testing, Open Testing, Produktion oder Review freigegeben.
- Google Play akzeptierte den AAB mit Mindest-API 24 und Ziel-SDK 35. Mapping-
  Datei und native Symbole wurden erkannt. 12.427 Telefone werden unterstuetzt;
  gegenueber dem vorherigen Release ging kein Geraet verloren.
- Der Play Store bot dem Pixel 7 Pro das Update unmittelbar an und installierte
  exakt Version `1.0.0+2026081509`. Paket-Installer `com.android.vending`, vier
  Store-Splits und der Play-App-Signing-Fingerabdruck
  `36488abf86c51da07ab2258f31b00e2f1ba8a36d076107b9f006376ade80b956`
  wurden direkt aus dem installierten Paket zurueckgelesen.
- Nach erzwungenem Kaltstart blieben die geschuetzte synthetische Sitzung und
  der Staging-Feed erhalten. Es gab weder einen Android-Absturz noch den
  frueheren Facebook-SDK- oder Plugin-Registrierungsfehler.
- Kandidatenbeleg, Berechtigungsinventar, Datenschutz-Binaernachweis, Play-
  Handoff, Geraetevalidierung und Review-Zugriff wurden auf den exakten Build
  `2026081509` umgestellt. Der zentrale Store-Nachweis liegt unter
  `docs/evidence/b11/google-play-internal-release-active-2026081509-20260815.json`.
- Die noch offenen Chat-, Push-, Offline-, Crashlytics- und Zwei-Geraete-
  Abnahmen bleiben offen und werden nicht aus diesem Update abgeleitet.
  Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.77 – Play-Build 1509: Kernablaeufe auf echtem Geraet bestanden

- Auf dem exakten, von Google Play installierten Build `2026081509` bestanden
  Vordergrund-, Hintergrund- und Beendet-Prozess-Push. Das SIT-Symbol blieb in
  der Android-Benachrichtigung mittig, vollstaendig im Systemkreis und mit
  sichtbarem Sicherheitsabstand.
- Abmeldung, Gastzustand nach Kaltstart, erneute Schutzsperre privater Chats und
  Push-Unterdrueckung nach der Abmeldung bestanden. Die Diagnosesitzung wird
  nun vor jedem Lauf ausdruecklich an die angeforderte synthetische Rolle
  gebunden.
- Der Offline-/Realtime-Test hielt eine neue Chatnachricht waehrend eines
  15-sekuendigen Offlinefensters zurueck und zeigte sie nach
  Netzwerkwiederherstellung im selben Prozess. Der urspruengliche Netzwerkstand
  wurde wiederhergestellt; es gab keinen Absturz.
- Authentifizierte Links zu Anzeige, Buchung und Buchungs-Chat bestanden. Die
  synthetische Zwei-Rollen-Buchung durchlief angefragt, akzeptiert, aktiv und
  abgeschlossen sowie QR-Uebergabe und QR-Rueckgabe ohne Zahlung.
- Die Android-WLAN-/Vermieter-Matrix steht damit ehrlich bei 9/11
  Teilpruefungen. Moderation/Konto bleibt `testing`, grosse Schrift und
  Screenreader bleiben `open`; die vollstaendige Geraetematrix bleibt 0/4.
- Die Belege sind kandidatengenau, frei von Kontodaten, Nachrichteninhalten,
  Adressen, Geheimnissen und rohen Geraetebezeichnern. 77 relevante
  Nachweis- und Dokumenttests bestanden.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.78 – Crashlytics-Zuordnung fuer Play-Build 1509 gesichert

- Die R8-Zuordnung im unveraenderten AAB von Build `2026081509` stimmt
  bytegenau mit der archivierten Originaldatei ueberein. Auch die im APK
  eingebettete build-spezifische Crashlytics-ID wurde separat ausgelesen,
  gehasht und gegen die automatisch erzeugte Build-ID geprueft.
- Die exakte R8-Zuordnung wurde mit genau dieser Build-ID erfolgreich zu
  Firebase Crashlytics geladen. Es wurde weder ein Ersatz-Build erzeugt noch
  eine fremde Zuordnungs-ID wiederverwendet.
- Alle drei im AAB enthaltenen nativen Symbolgruppen fuer `armeabi-v7a`,
  `arm64-v8a` und `x86_64` stimmen bytegenau mit dem bereits erfolgreich
  hochgeladenen und vollstaendig geleerten Symbolpaket ueberein. Der
  kandidatenspezifische Nachweis liegt unter
  `docs/evidence/b11/android-crash-release-mapping-2026081509.json`.
- Ein bereinigtes kontrolliertes Absturzereignis war in diesem exakten
  Store-Build absichtlich nicht einkompiliert. Deshalb bleiben das Ereignis
  und seine sichtbare Zuordnung in der Firebase-Konsole ehrlich offen; die
  Releasepruefung steht auf `testing`, nicht auf `passed`.
- 79 gezielte Validator-, Dokument- und Upload-Verdrahtungstests bestanden.
  Der Gesamtstatus bleibt `testing/hold`, die Geraetematrix 0/4 und die
  Releasepruefungen 4/7.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.79 – Play-Signatur, App Links und Pflichtseiten bestaetigt

- Der exakte interne Play-Build `1.0.0+2026081509` ist mit null
  Releasefehlern fuer interne Tester verfuegbar. Die physische
  Store-Installation ist als vierteiliges Paket von `com.android.vending` an
  den Kandidaten und den erwarteten Play-App-Signing-Fingerabdruck gebunden.
- `shareittoo.com`, `www.shareittoo.com` und `staging.shareittoo.com` liefern
  weiterhin bytegenau dasselbe gueltige `assetlinks.json` fuer
  `com.shareittoo.app` und beide erforderlichen Signaturzertifikate.
- Die oeffentlichen Seiten fuer Support, Datenschutz und Kontoloeschung
  liefern HTTP 200 und stimmen weiterhin bytegenau mit den bereits
  freigegebenen SIT-Seiten ueberein.
- Der kandidatenspezifische Nachweis liegt unter
  `docs/evidence/b11/android-play-store-links-signing-2026081509-20260815.json`.
  Die Releasepruefung `storeWarningsLinksAndSigning` ist damit bestanden.
- 77 relevante Nachweis- und Dokumenttests bestanden. Der ehrliche
  Gesamtstatus bleibt `testing/hold`, die Geraetematrix 0/4; die
  Releasepruefungen steigen auf 5/7.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.80 – Geschuetzter Store-Review-Datensatz erneuert

- Der zuvor lokal als aktiv markierte Review-Datensatz war serverseitig
  inzwischen storniert. Dieser Widerspruch wurde nicht uebergangen: Der alte
  synthetische Staging-Datensatz wurde abgeglichen und archiviert.
- Fuer dieselben beiden geschuetzten synthetischen Rollen wurde ein neues,
  klar gekennzeichnetes Staging-Inserat mit angefragter und anschliessend
  angenommener Buchung sowie gemeinsamem Buchungs-Chat erzeugt. Zahlungsmodus
  blieb `memory`; kein Zahlungsendpunkt wurde aufgerufen.
- Vermieter und Mieter koennen sich ohne interaktive OTP-Abfrage anmelden. Das
  aktive Inserat, die angenommene Buchung und der Chat sind fuer die jeweils
  berechtigte Rolle sichtbar und lesbar.
- Melden, voruebergehendes Blockieren mit vollstaendiger Ruecknahme,
  Wiederherstellung des Chats und privater `no-store`-Datenexport bestanden.
  Die Reviewer-Konten blieben erhalten; die frueher isoliert bewiesene
  Loeschung eines anderen, entbehrlichen synthetischen Kontos bleibt als
  separater Nachweis gebunden.
- Der technische Review-Zugang steht damit bei 8/10 Szenarien. Offen bleiben
  nur der frische Start nach Zuruecksetzen der exakten Play-Installation und
  das zweite Netzwerk. 21 gezielte Review-Zugangs- und Sicherheitspruefungen
  bestanden.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.81 – Automatische Barrierefreiheitsbasis fuer Build 1509 bestaetigt

- Seit dem Build-Commit `3fa045b98897f9551f91da932136c2b100b2d700`
  wurden unter `lib`, `pubspec.yaml`, `android` und `ios` keine
  Anwendungsquellen veraendert. Die automatischen Pruefungen bleiben deshalb
  an denselben App-Quellstand wie der exakte Play-Build `2026081509` gebunden.
- 23 gezielte Flutter-Widgettests fuer 200-Prozent-Text, Fokusreihenfolge,
  semantische Feld- und Aktionsnamen, getrennte Passwortsichtbarkeit und den
  schliessbaren Vordergrund-Push-Hinweis bestanden.
- Der Kategorie-Header blieb bei 200 Prozent Text ohne Clipping; der
  Datenschutzexport blieb per Tastatur erreichbar, und die Hauptaktionen der
  Suche besitzen sinnvolle Screenreader-Namen.
- Die Android-WLAN-/Vermieter-Zelle bleibt ehrlich `testing`: Die automatische
  Basis ist bestanden, aber die physische Sichtpruefung mit grosser Schrift und
  die manuelle TalkBack-Traversierung sind noch offen. Der Nachweis liegt unter
  `docs/evidence/b11/android-accessibility-source-2026081509-20260815T142808Z.json`.
- Die Moderations-/Kontopruefung bindet nun zusaetzlich die bestandenen
  serverseitigen Melden-, Blockieren-/Entblockieren-, Export- und isolierten
  Loeschtests ein; die vollstaendige physische Oberflaechenabnahme bleibt offen.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.82 – iOS-Werkzeugstatus und B0-Baseline auf Kandidat 1509 nachgefuehrt

- Die rein lesende iOS-Diagnose wurde fuer den gebundenen Staging-Kandidaten
  `1.0.0+2026081509` auf dem aktuellen Mac wiederholt. Bundle-ID und API-Ziel
  bleiben `com.shareittoo.app` und `https://staging.shareittoo.com/api/v1`.
- Der Mac stellt derzeit nur die Apple Command Line Tools bereit. Die
  vollstaendige Xcode-App, ein ausgewaehltes Xcode-Developer-Verzeichnis,
  `xcodebuild` und CocoaPods fehlen. Der Status lautet deshalb ehrlich
  `pending-local-tooling`; Archiv, Signierung, Installation und Upload wurden
  nicht versucht.
- Der bereinigte Nachweis unter
  `docs/evidence/b11/ios-local-tooling-readiness-2026081509-20260815.json`
  enthaelt weder Kontokennungen noch Zugangsdaten, Schluessel oder lokale
  Dateipfade. Apple-Mitgliedschaft, Vereinbarungen und Teamstatus wurden nicht
  abgeleitet.
- Das Apple-/TestFlight-Arbeitsblatt ist auf Kandidat `2026081509` und den
  aktuellen Tooling-Befund aktualisiert. Die B11-Uebersichten weisen denselben
  offenen iOS-Zustand jetzt explizit aus.
- Die B0-Baseline widerspricht dem bereits belegten Betriebsstand nicht mehr:
  taegliches Backup, Health-Timer, Restore-Check, isolierter Restore und
  externe Alarmzustellung sind als bestanden vermerkt; SPF, DKIM und DMARC
  sowie die kanonische `.com`-Kontaktadresse sind nachgefuehrt.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.83 – Play-Nachkontrollen fuer Chat und Nachrichten an Build 1509 gebunden

- Die bestehende Google-Play-Uebergabe enthielt noch vier pauschal offene
  Chat-/Nachrichtenfelder. Sie wurden nicht gemeinsam geschlossen, sondern
  einzeln gegen die kandidatengenauen Nachweise fuer Build `2026081509`
  geprueft.
- Der geschuetzte Review-Datensatz belegt, dass der gemeinsame Buchungs-Chat
  fuer Vermieter und Mieter sichtbar und lesbar ist. Der physische
  authentifizierte Deep-Link-Lauf oeffnete denselben geschuetzten Chat aus dem
  exakten Google-Play-Split.
- Der physische Offline-/Realtime-Lauf belegt eine neue Nachricht, die waehrend
  des 15-sekuendigen Offlinefensters verborgen blieb und nach
  Netzwiederherstellung im selben Prozess erschien. App-Prozess und
  urspruenglicher Netzwerkzustand wurden erhalten beziehungsweise
  wiederhergestellt.
- Damit stehen `sharedChatStability`, `messageSendPersistence` und
  `messageRefreshPattern` jetzt auf `passed-exact-build`. Die manuelle
  `messageComposerKeyboard`-Pruefung bleibt mangels physischem Sichtnachweis
  ehrlich `pending-exact-build`.
- Der Validator verlangt fuer jeden bestandenen Punkt Buildnummer, Commit,
  Play-Installation, sichere Grenzen und die passenden Einzelergebnisse. Ein
  aelterer oder unvollstaendiger Nachweis schliesst die Uebergabe fail-closed.
- Data Safety wurde nicht pauschal von Build 1505 uebernommen: Zwischen den
  Kandidaten haben sich Authentifizierungs- und Kommunikationsquellen
  geaendert. Die Console-Erklaerung bleibt deshalb offen und ungespeichert,
  bis die aktuelle Datenmatrix gesondert aktualisiert und fachlich freigegeben
  ist.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.84 – Data-Safety-Entwurf technisch an Build 1509 gebunden

- Die bestehende Data-Safety-Matrix des Console-Kandidaten `2026081505` wurde
  nicht ungeprueft auf den aktuellen internen Build uebertragen. Die seitdem
  veraenderten Authentifizierungs- und Kommunikationsquellen wurden gegen die
  aktuelle Datenschutzdeklaration und den bestandenen Binary-Privacy-Check
  von `2026081509` geprueft.
- Die kanonische Projektion aus Datentyp, Auswahl, Erforderlichkeit und Zweck
  ist fuer beide Kandidaten identisch. Der aktuelle Stand umfasst 16
  ausgewaehlte von 17 deklarierten Datentypen; Zahlungsinformationen bleiben
  ungesammelt.
- Google-/Apple-/Facebook-Code ist zwar gebaut, bleibt aber release-seitig
  gesperrt und extern deaktiviert. Google Maps, Stripe, OpenAI-Helfer, Werbung
  und Tracking sind im gebundenen Kandidaten ebenfalls nicht aktiviert.
- Der neue Nachweis unter
  `docs/evidence/b11/google-play-data-safety-current-candidate-binding-2026081509-20260815.json`
  wird vom App-Content-Validator gegen Buildnummer, Commit, Privacy-Quelle,
  Binary-Nachweis und die unveraenderte Antwortprojektion geprueft. Ein
  veralteter oder unvollstaendiger Nachweis schliesst fail-closed.
- Offen bleiben Provider-Vertragsannahme, Rollenbestaetigung durch den Owner,
  rechtliche Freigabe, Aufbewahrungs-/Loeschfristen, eine moegliche
  Google-Maps-Neueinstufung und das Speichern des Console-Entwurfs. In Google
  Play wurde nichts geaendert, gespeichert oder abgesendet.
- Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  blieben unveraendert. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` mit `status: open` aktiv.

## Meilenstein 16.85 – Google-Anmeldung vorbereitet, Kandidat unveraendert gesperrt

- Der Google-Anmeldeanbieter ist im Firebase-Stagingprojekt aktiviert. Der
  oeffentliche Projektname lautet `ShareItToo`; als Supportkontakt ist die
  geschaeftliche SIT-Adresse hinterlegt. Der bereinigte Nachweis
  `docs/evidence/b11/firebase-google-signin-provider-20260815.json` enthaelt
  weder die Adresse selbst noch Client-IDs, API-Schluessel oder
  Kontokennungen.
- Die Android- und Apple-Firebase-Dateien wurden lokal neu geladen, mit Modus
  `600` geschuetzt und bleiben durch `.gitignore` ausserhalb des Repositorys.
  Die vorherigen lokalen Dateien wurden wiederherstellbar ausserhalb des
  Projekts gesichert. Bundle-/Paketkennung, Stagingprojekt, Google-
  Anmeldekonfiguration sowie ausgeschaltete Analytics- und Werbeschalter sind
  plattformuebergreifend validiert.
- Der Parser und die Release-Automation akzeptieren die von Firebase aktuell
  ausgegebenen kompakten und ausgeschriebenen Boolean-Formate. Bei einer
  gemeinsamen Android-/Apple-Pruefung werden die oeffentlichen lokalen
  Buildwerte nun fuer beide Plattformen nur im laufenden Prozess abgeleitet
  und weder ausgegeben noch gespeichert.
- Kandidat `1.0.0+2026081509` blieb unveraendert. Seine Google-, Apple- und
  Facebook-Release-Schalter bleiben geschlossen; Apple und Facebook sind in
  Firebase weiterhin deaktiviert. Es wurde kein neuer Build erzeugt, kein
  Sozialkonto angemeldet und kein Benutzerkonto erstellt.
- Der Staging-Backendpfad fuer soziale Anmeldung ist aktiv und weist ein
  synthetisch ungueltiges Token korrekt mit `401 invalid_social_token` ab.
  Ein echtes Token oder eine echte Anmeldung wurde nicht verwendet.
- Die Apple-/TestFlight-Uebergabe ist jetzt konsistent an denselben Kandidaten
  `2026081509` und den offenen lokalen Xcode-/CocoaPods-Status gebunden. Ein
  TestFlight-Archiv oder Upload wurde nicht versucht.
- Die vier bereits im Google-Play-Entwurf gespeicherten Screenshots bleiben
  gueltig: Zwischen dem letzten bildgenau geprueften Build und `2026081509`
  wurde keine der abgebildeten Feed-, Detail-, Such- oder Anzeige-erstellen-
  Flaechen veraendert. Es wurden keine Bilder oder Store-Daten neu gespeichert.
- Der vollstaendige technische Gesamtcheck bestand einschliesslich
  Konfigurations-, Store-, Rechts-, Datenschutz-, Telefon-, Signierungs- und
  App-Tests sowie Web- und Android-Debug-Build. Produktion, Echtgeld,
  oeffentliche Tracks, Closed Testing und Review-Versand blieben unveraendert;
  alle sechs V4-Punkte bleiben unter `V4-INTERIM-2026-08-15` offen.

## Meilenstein 16.86 – naechsten Google-only-Kandidaten ohne Wiederholungsbau abgesichert

- Die erneuerte Android-Firebase-Konfiguration enthaelt genau zwei
  verschiedene zertifikatsgebundene OAuth-Clients fuer Upload- und Play-App-
  Signing sowie genau einen gueltigen Web-OAuth-Client. Der Release-Validator
  prueft diesen Zustand jetzt fail-closed gegen den bereits bereinigten
  Play-Signing-Nachweis, ohne Fingerabdruecke oder Client-IDs neu offenzulegen.
- Facebook kann nicht mehr allein durch vorhandene Meta-Werte eingeschaltet
  werden. Google, Apple und Facebook benoetigen jeweils einen ausdruecklichen
  Release-Schalter; fehlende Schalter bedeuten immer `false`.
- Das geplante App-Profil wurde ohne APK, AAB oder Versionsaenderung kompiliert
  und ausgefuehrt: Google ist an, Apple und Facebook sind aus. Derselbe
  Profiltest ist jetzt Bestandteil des vollstaendigen technischen
  Regressionslaufs.
- `store/google-only-next-candidate.json` bindet den naechsten gebuendelten
  Schritt an den aktuellen Play-Baselinekandidaten `2026081509`, Internal,
  Staging und die vorhandene Google-Provider-Evidenz. Es reserviert keine neue
  Buildnummer und behauptet keinen erzeugten Kandidaten.
- Der vorbereitete Einmal-Baupfad verweigert eine gleiche oder kleinere
  Buildnummer, Apple/Facebook, Production-API oder Store-Einreichung. Er darf
  erst nach gemeinsamem Commit aller beabsichtigten Aenderungen und einer
  ausdruecklichen lokalen Bestaetigung den normalen signierten Releasepfad
  aufrufen.
- Damit bleibt der aktuelle Play-Kandidat `1.0.0+2026081509` unveraendert. Es
  wurde weder gebaut noch hochgeladen, installiert oder angemeldet;
  Produktion, Echtgeld, oeffentliche Tracks, Closed Testing und Review-Versand
  bleiben unveraendert gesperrt. Alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` offen.

## Meilenstein 16.87 – abgelaufenes Zugangsmaterial automatisch bereinigt

- Das Backend loescht abgelaufene oder bereits verbrauchte Aktions-Tokens,
  abgelaufene Refresh-Tokens sowie abgelaufene oder widerrufene temporaere
  Mitarbeiterfreigaben. Abgelaufene, verbrauchte oder widerrufene
  Buchungs-Bestaetigungscodes werden irreversibel ueberschrieben, waehrend die
  Buchungs- und Auditzeilen fuer Nachvollziehbarkeit erhalten bleiben.
- Die Bereinigung startet sofort mit dem Backend und danach alle sechs Stunden.
  Der konfigurierbare Abstand ist technisch auf hoechstens 24 Stunden begrenzt;
  Fehler beenden den Dienst nicht unkontrolliert, sondern werden protokolliert.
- 128 Backendtests bestanden; ein separater PostgreSQL-Integrationstest blieb
  lokal mangels `TEST_DATABASE_URL` korrekt uebersprungen. Der vollstaendige
  technische Regressionslauf bestand im ausdruecklichen Kandidaten-
  Fortschreibungsmodus, ohne einen neuen App-Build zu erzeugen.
- Der exakte Commit `88c08f0a4d71b6755f22134e2d6304e14860253e`
  wurde als unveraenderliches Backend-Abbild gebaut und ausschliesslich auf
  Staging ausgerollt. Interner und oeffentlicher Versionsendpunkt zeigen
  denselben Commit; Readiness meldet Datenbank und Mail gesund, Zahlungen
  bleiben im Memory-Testmodus und FCM bleibt nur fuer Staging aktiviert.
- Die Laufzeitpruefung fand null verbliebene abgelaufene Aktions- oder Refresh-
  Tokens, null abgelaufene beziehungsweise widerrufene Mitarbeiterfreigaben
  und null unbereinigte alte Buchungs-Code-Digests. Der bereinigte Nachweis
  liegt unter `docs/evidence/b11/expired-credential-cleanup-20260815.json`;
  der serverseitige Rolloutnachweis unter
  `/docker/shareittoo/releases/staging-20260815T163204Z-88c08f0a4d71.json`.
- Die neun fachlichen Aufbewahrungsentscheidungen, rechtliche Freigaben,
  Kategorie-Loeschung und Legal Hold bleiben bewusst offen. Produktion,
  Echtgeld, App-Kandidat `1.0.0+2026081509`, Store-Tracks und Review-Versand
  blieben unveraendert; alle sechs V4-Punkte bleiben unter
  `V4-INTERIM-2026-08-15` offen.

## Meilenstein 16.88 – technische Legal-Hold-Sperre auf Staging bestaetigt

- Eine aktive rechtliche Aufbewahrungssperre verhindert jetzt sowohl die
  Loeschung in der App als auch den Web-Loeschpfad. Pro Konto kann hoechstens
  eine aktive Sperre bestehen; Anlegen und Aufheben sind wiederholbar sicher
  und werden nachvollziehbar protokolliert.
- Nur Administratoren mit aktueller Step-up-Freigabe duerfen Sperren anzeigen,
  anlegen oder aufheben. Die Supportrolle wird ausdruecklich abgewiesen.
  Freitextnotizen bleiben privat und erscheinen weder in Antworten noch im
  Auditprotokoll.
- 132 Backendtests bestanden; nur der separate PostgreSQL-Integrationstest
  blieb lokal mangels `TEST_DATABASE_URL` korrekt uebersprungen. Der
  vollstaendige technische Regressionslauf bestand einschliesslich 267 App-
  Tests sowie Web- und Android-Debug-Bau. Es wurde kein Release-Kandidat
  erzeugt.
- Der exakte Commit `d7c472f20e1b0a4d86c72e053ceb5d8bb3c74275`
  wurde als unveraenderliches Backend-Abbild ausschliesslich auf Staging
  ausgerollt. Oeffentlicher Versionsendpunkt und Readiness bestaetigen Version
  `0.1.0-d7c472f20e1b`; der serverseitige Nachweis liegt unter
  `/docker/shareittoo/releases/staging-20260815T165642Z-d7c472f20e1b.json`.
- Die Laufzeitpruefung bestaetigte die neue Tabelle, den eindeutigen Index fuer
  genau eine aktive Sperre je Konto und null aktive Sperren. Es wurde kein
  bestehendes Konto gesperrt und weder eine Aufbewahrungsfrist noch eine
  automatische Sperrregel erfunden. Der bereinigte Nachweis liegt unter
  `docs/evidence/b11/account-legal-hold-20260815.json`.
- Die neun fachlichen Aufbewahrungsentscheidungen und alle sechs V4-Punkte
  bleiben offen. Produktion, Echtgeld, App-Kandidat `1.0.0+2026081509`,
  Store-Tracks und Review-Versand blieben unveraendert.

## Meilenstein 16.89 – Google-Play-App-Content auf eine Wahrheit konsolidiert

- Der aktuelle Google-Play-App-Content-Stand ist jetzt eindeutig mit elf von
  zwoelf gespeicherten Aufgaben dokumentiert. Die Datenschutzerklaerung ist
  gespeichert; ausschliesslich `Data Safety` bleibt offen und weder gespeichert
  noch eingereicht.
- Der Nachweis bindet den in Google Play beobachteten Ausgangsstand
  `2026081505` an den aktuellen internen Kandidaten `1.0.0+2026081509` sowie an
  dessen bestehenden Internal-Release-, Datenschutz- und Data-Safety-
  Nachweise. Der fruehere Stand zehn von zwoelf bleibt nur historische Evidenz
  und ist nicht mehr die aktuelle Wahrheit.
- Der Fortschrittsvalidator verwendet fuer die fachliche Tiefenpruefung jetzt
  den zentralen App-Content-Handoff-Validator. Dadurch werden doppelte
  Kandidatenfestlegungen und widerspruechliche Zaehler vermieden; acht gezielte
  Fortschrittstests sowie 42 angrenzende App-Content-, Kandidaten- und Data-
  Safety-Tests bestanden.
- Es wurde kein neuer App-Kandidat gebaut, hochgeladen oder installiert und
  keine Google-Play-Einstellung veraendert. Closed Testing, Open Testing,
  Produktion und Review-Versand bleiben unberuehrt.
- `Data Safety` bleibt bis zu den ausstehenden Anbieter-, Aufbewahrungs- und
  rechtlichen Entscheidungen bewusst fail-closed. Die sechs V4-Punkte bleiben
  unter `V4-INTERIM-2026-08-15` offen.

## Meilenstein 16.90 – aggregiertes Retention-Inventar auf Staging bestaetigt

- Der exakte Backend-Commit
  `cedc5ecfd65a9f2bcf731b5ac10dfd66a8a8160b` wurde aus einer sauberen,
  abgetrennten Quelle als unveraenderlich beschriftetes Docker-Abbild gebaut
  und ausschliesslich auf Staging ausgerollt. Version und Commit stimmen im
  oeffentlichen Versionsendpunkt ueberein.
- Readiness bestaetigt Datenbank und Mail als gesund. Zahlungen bleiben im
  Memory-Testmodus und `livemode=false`; FCM bleibt nur fuer Staging aktiv. Der
  serverseitige Rolloutnachweis liegt unter
  `/docker/shareittoo/releases/staging-20260815T220613Z-cedc5ecfd65a.json`.
- Der neue Adminpfad weist einen nicht angemeldeten Zugriff mit `401` ab. Die
  eigentliche Inventarabfrage wurde innerhalb einer vollstaendig
  zurueckgerollten Datenbanktransaktion ausgefuehrt und bestaetigte sieben
  Kategorien, 21 Datenbestaende und 16.755 aggregierte Zeilen. Es wurden keine
  Kennungen ausgegeben und kein Audit- oder Fachdatenbestand dauerhaft
  veraendert.
- Die Laufzeitantwort bleibt bewusst rein informativ:
  `containsIdentifiers=false`, `executionEnabled=false`,
  `retentionPeriodsApplied=false` und `eligibleRowsCalculated=false`. Es wurde
  weder eine Aufbewahrungsfrist erfunden noch eine Loeschberechtigung
  berechnet oder eine Kategorie-Loeschung aktiviert.
- Produktion, Echtgeld, App-Kandidat `1.0.0+2026081509`, Google-Play-Tracks und
  Review-Versand blieben unveraendert. Alle neun Aufbewahrungsentscheidungen
  und alle sechs V4-Punkte bleiben offen.

## Meilenstein 16.91 – oeffentliche Git-Historie vollstaendig auf Secrets geprueft

- Der bereits in CI verankerte kanonische Secret-Scanner wurde erweitert,
  statt einen zweiten parallelen Scanner einzufuehren. Er prueft alle Git-
  Referenzen mit vollstaendiger Historie, die hinzugefuegten Zeilen jedes
  Commits und den aktuellen Arbeitsstand.
- Neben Private Keys, statischen Passwoertern und den bisherigen Provider-
  Tokens erkennt er jetzt auch Testschluessel von Stripe, SendGrid-, Twilio-
  und OpenAI-Service-Account-Schluessel. Zusaetzlich werden getrackte
  Umgebungsdateien, Service-Account-Dateien und private Schluesseldateien
  anhand ihres Pfads fail-closed abgewiesen; klar benannte Vorlagen bleiben
  erlaubt.
- Der vollstaendige Lauf ueber 698 Commits und 16 lokale beziehungsweise
  entfernte Referenzen endete mit null unerwarteten hochvertraulichen
  Treffern. Zwoelf historische synthetische Testtreffer wurden ausschliesslich
  als exakte Kombination aus unveraenderlichem Commit, Regel und Pfad gegen
  die gepruefte Baseline akzeptiert. Der aktuelle Arbeitsstand kann nie ueber
  diese Baseline freigestellt werden. Weil kein echter Schluessel gefunden
  wurde, war keine Zugangsdatenrotation erforderlich.
- Der bereinigte Nachweis liegt unter
  `docs/evidence/b11/git-history-secret-scan-20260816.json`. Er enthaelt weder
  Trefferwerte noch Secrets, Kontodaten oder Zugangsdaten. P1-08 im
  kanonischen Launch-Backlog ist damit technisch erfuellt; derselbe Scan bleibt
  mit `fetch-depth: 0` Bestandteil der Backend-CI.
- Es wurde keine Git-Historie umgeschrieben, kein Zugangsschluessel rotiert und
  kein App-Kandidat gebaut. Produktion, Echtgeld, Store-Tracks und Review-
  Versand blieben unveraendert; alle neun Aufbewahrungsentscheidungen und alle
  sechs V4-Punkte bleiben offen.

## Meilenstein 16.92 – GitHub-Pruefungen entdoppelt und Kandidatenbau explizit abgesichert

- Feature-Branches werden jetzt genau einmal ueber den Pull Request geprueft;
  der bisher parallel ausgeloeste Branch-Push-Lauf entfaellt. Neuere Commits
  brechen ueberholte Laeufe desselben Pull Requests automatisch ab. Reine
  Dokumentationsaenderungen starten keinen weiteren technischen Volltest.
- Der signierte Android-Kandidatenbau ist kein Bestandteil normaler Push- oder
  Pull-Request-Pruefungen mehr. Er kann nur noch bewusst manuell mit dem
  ausdruecklichen Schalter `build_release_candidate=true` gestartet werden.
  Damit bleiben normale Pruefungen vollstaendig, ohne bei jeder kleinen
  Aenderung eine neue App-Datei zu erzeugen.
- Die veraltete PostgreSQL-Migrationserwartung wurde um Migration 014 fuer
  rechtliche Kontosperren ergaenzt. GitHub-Lauf 31929053929 bestaetigte danach
  Backend, echte PostgreSQL-Integration, Git-Historien-Secret-Scan, Compose-
  Plaene, commit-markiertes API-Abbild und die vollstaendige Flutter-Regression
  als gruen.
- Lokal bestanden acht gezielte Workflow-Tests, YAML-Pruefung, 138 Backendtests
  bei einem mangels lokaler Testdatenbank uebersprungenen Integrationstest, 267
  App-Tests bei einem Skip sowie Web- und Android-Debug-Bau. GitHub fuehrte den
  dort vorhandenen PostgreSQL-Test zusaetzlich erfolgreich aus.
- Der bereinigte Nachweis liegt unter
  `docs/evidence/b11/github-regression-dedup-and-manual-candidate-20260816.json`.
  Es wurde kein neuer App-Kandidat gebaut oder hochgeladen. Produktion,
  Echtgeld, Store-Tracks und Review-Versand blieben unveraendert; alle neun
  Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben offen.

## Meilenstein 16.93 – Hauptbranch mit Pull-Request- und CI-Pflicht geschuetzt

- `main` ist jetzt durch eine aktive GitHub-Branch-Regel geschuetzt. Jede
  Aenderung muss ueber einen Pull Request laufen und auf dem aktuellen
  Hauptbranch sowohl `backend-regression` als auch `flutter-regression` von
  GitHub Actions erfolgreich bestehen.
- Die Regel gilt auch fuer Administratoren. Force-Pushes und Loeschen des
  Hauptbranches sind deaktiviert; lineare Historie und das Aufloesen offener
  Review-Gespraeche sind verpflichtend. Veraltete Freigaben werden bei neuen
  Aenderungen verworfen.
- Da das Repository derzeit einen einzelnen Maintainer hat, ist kein fremder
  Approval-Klick vorgeschrieben. Die Pull-Request- und Pruefpflicht bleibt
  voll wirksam, ohne einen unaufloesbaren Selbstfreigabe-Deadlock zu erzeugen.
- Der offene Pull Request 7 blieb bewusst als Entwurf offen und wurde nicht
  zusammengefuehrt. GitHub-Lauf 31929471745 bestand auf Commit
  `55e65f6617f9a12d0ae71bb10a61a640014e5d59` mit gruenem Backend inklusive
  PostgreSQL-Integration und gruener Flutter-Regression.
- Der bereinigte Nachweis liegt unter
  `docs/evidence/b11/github-main-branch-protection-20260816.json`; P1-02 im
  kanonischen Launch-Backlog ist damit erfuellt. Produktion, Echtgeld,
  App-Kandidat `1.0.0+2026081509`, Store-Tracks und Review-Versand blieben
  unveraendert; alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte
  bleiben offen.

## Meilenstein 16.94 – erster sicherer Flutter-Analyseabbau abgeschlossen

- Der Flutter-Analysebestand wurde in einem gebuendelten, automatisch
  vorgeschlagenen Niedrigrisiko-Schritt von 611 auf 435 Hinweise reduziert.
  Die Zahl der Warnungen sank von 283 auf 266, die der Informationen von 328
  auf 169; Analysefehler bleiben bei null.
- 165 mechanische Korrekturen wurden in 28 Dateien uebernommen. Sie betreffen
  unter anderem String-Interpolation, ueberfluessige Nullpruefungen,
  unnoetige Non-Null-Zusicherungen, Blockklammern und einen ungenutzten Import.
  Eine vom Werkzeug zu aggressive lokale Typableitung wurde sofort
  null-sicher korrigiert.
- Eine breite automatische Neuformatierung alter Dateien wurde bewusst aus
  dem Arbeitsstand entfernt. Dadurch bleibt die Aenderung mit 210 Einfuegungen
  und 208 Loeschungen pruefbar, statt mehr als tausend rein optische
  Zeilenaenderungen zu erzeugen.
- Die vier durch rein mechanische Aenderungen betroffenen Privacy-Quellbindungen
  wurden auf ihre neuen SHA-256-Werte aktualisiert. Der fail-closed Privacy-
  Validator und alle 16 zugehoerigen Tests sind gruen.
- 267 App-Tests bestanden bei einem Skip. Der vollstaendige technische
  Regressionslauf bestand einschliesslich aller Schutzvalidatoren sowie Web-
  und Android-Debug-Bau. Es wurde kein signierter Release-Kandidat erzeugt.
- P1-01 bleibt fuer die 435 Resthinweise offen. Ungenutzte Elemente und
  Parameter werden erst nach Produktflusspruefung entfernt; asynchrone
  Context-Nutzung und veraltete Framework-APIs werden in gezielten,
  testbaren Batches migriert. Der bereinigte Nachweis liegt unter
  `docs/evidence/b11/flutter-analysis-safe-batch-20260816.json`.
- Produktion, Echtgeld, App-Kandidat `1.0.0+2026081509`, Store-Tracks und
  Review-Versand blieben unveraendert; alle neun Aufbewahrungsentscheidungen
  und alle sechs V4-Punkte bleiben offen.

## Meilenstein 16.95 – Korrektheitswarnungen und Startdatenpfade abgesichert

- Der Flutter-Analysebestand wurde von 435 auf 428 Hinweise reduziert. Alle
  sieben gezielt bearbeiteten Korrektheitsklassen sind jetzt aus dem
  Analyseergebnis verschwunden: ein doppelter Map-Schluessel, eine leere
  Fehlerbehandlung, zwei unerreichbare Switch-Standardzweige und drei tote
  Codepfade. Analysefehler bleiben bei null.
- Der normale App-Start enthaelt weder einen Aufruf zum Einspielen von
  Showcase-Anzeigen noch einen Aufruf zum Loeschen von Miet- oder
  Buchungsdaten. Ein eigener Truthfulness-Test verriegelt diese beiden
  Bedingungen gegen spaetere Regressionen.
- Die CI-Analyseschranke wurde vom historischen Wert 611 auf den jetzt
  verifizierten Stand 428 abgesenkt. Der zugehoerige Wiring-Test ist erstmals
  Bestandteil jedes technischen Regressionslaufs; bereits ein zusaetzlicher
  Analysehinweis laesst die Pruefung damit fehlschlagen.
- 268 App-Tests bestanden bei einem bewusst uebersprungenen Test. Der
  vollstaendige technische Regressionslauf bestand mit der begrenzten,
  verifizierten internen Kandidatenfortschreibung sowie Web- und Android-
  Debug-Bau. Der App-Content-Ausgangsstand `2026081505` bleibt dabei separat
  an den unveraenderten internen Kandidaten `2026081509` gebunden.
- P1-01 bleibt fuer 428 Resthinweise offen. Der naechste sichere Block trennt
  ungenutzte Symbole nach nachgewiesen toten und weiterhin erreichbaren
  Produktpfaden; asynchrone Context-Nutzung und veraltete Framework-APIs
  werden weiterhin nur in gezielten UI-Batches migriert. Der bereinigte
  Nachweis liegt unter
  `docs/evidence/b11/flutter-analysis-correctness-and-startup-safety-20260816.json`.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.96 – ungenutzte lokale Variablen vollstaendig entfernt

- Der Flutter-Analysebestand wurde von 428 auf 376 Hinweise reduziert. Alle
  52 `unused_local_variable`-Hinweise sind jetzt entfernt; Analysefehler
  bleiben bei null. Seit dem urspruenglichen Stand von 611 wurden damit 235
  Hinweise abgebaut.
- Entfernt wurden nur lokale Werte ohne anschliessende Verwendung und drei
  dadurch eindeutig sichtbar gewordene tote Mitglieder. Ein zuvor
  ausgefuehrter Verfuegbarkeitsabruf und die reaktive Sprachabhaengigkeit
  bleiben trotz nicht benoetigtem Rueckgabewert erhalten; erreichbare Widget-
  Zweige wurden nicht entfernt.
- Die CI-Analyseschranke steht jetzt bei 376. `dead_code`, `empty_catches`,
  `equal_keys_in_map`, `unreachable_switch_default`, `unused_import` und
  `unused_local_variable` werden zusaetzlich einzeln als verbotene
  Regressionsklassen geprueft. Dadurch kann ihre Wiedereinfuehrung nicht durch
  den gleichzeitigen Abbau einer anderen Warnung verdeckt werden.
- Die drei betroffenen Datenschutz-Quellbindungen wurden exakt auf ihre neuen
  SHA-256-Werte aktualisiert. Inhalt, Kandidatenbindung und offener
  Data-Safety-/Rechtsstatus blieben unveraendert; der Privacy-Validator und
  alle 16 zugehoerigen Tests sind gruen.
- 268 App-Tests bestanden bei einem bewusst uebersprungenen Test. Der
  vollstaendige technische Regressionslauf bestand einschliesslich aller
  Backend-, Store-, Datenschutz-, Aufbewahrungs- und Schutzpruefungen sowie
  Web- und Android-Debug-Bau. Der Nachweis liegt unter
  `docs/evidence/b11/flutter-analysis-unused-locals-20260816.json`.
- P1-01 bleibt fuer 376 Resthinweise offen. Als naechste sichere Arbeit werden
  private ungenutzte Elemente und Felder nach Produktpfad und zusammenhaengender
  Quellregion geprueft; Context- und API-Migrationen bleiben getrennte,
  gezielt testbare UI-Batches.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.97 – private Zustandsreste und kleine Helfer sicher entfernt

- Der Flutter-Analysebestand wurde von 376 auf 352 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 259 Hinweise abgebaut.
- In 14 Laufzeitdateien wurden 13 ungenutzte Felder, zehn ungenutzte private
  Elemente und ein nur zu einem toten Helfer gehoerender optionaler Parameter
  entfernt. Die Aenderung entfernt 164 Quellzeilen und fuegt keinen neuen
  Analysehinweis hinzu.
- Der Block beschraenkt sich auf wirkungslosen Adress-, Social-, Profil-,
  Such-, Katalog- und Thumbnail-Zustand, tote Datums-/Sortierhelfer, eine nicht
  verwendete Datums-Hinweiskomponente sowie nicht erreichbaren
  Developer-Preview-Zustand. Zwei reine Leseabfragen ohne Verbraucher wurden
  ebenfalls entfernt.
- Sichtbare UI-Zweige, persistierte Daten, Buchungsstatus, Uebergabe- und
  Rueckgabeentscheidungen wurden nicht veraendert. Keine der 14 Dateien ist
  als Datenschutz-Quellbindung hinterlegt; eine Hash-Aktualisierung war daher
  weder erforderlich noch zulaessig.
- Die CI-Analyseschranke steht jetzt bei 352. Die sechs zuvor bereinigten
  Korrektheits- und Hygiene-Codes bleiben einzeln fail-closed verriegelt. Zwei
  Wiring-Tests und 268 App-Tests bei einem bewussten Skip sind gruen. Der
  vollstaendige technische Regressionslauf bestand einschliesslich Web- und
  Android-Debug-Bau.
- P1-01 bleibt fuer 352 Resthinweise offen. Groessere private UI-Regionen
  werden nur nach Produktflusspruefung entfernt; asynchrone Context-Nutzung
  und veraltete Framework-APIs bleiben getrennte Batches. Nachweis:
  `docs/evidence/b11/flutter-analysis-private-state-and-helpers-20260816.json`.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.98 – unreferenzierte alte UI-Komponenten entfernt

- Der Flutter-Analysebestand wurde von 352 auf 333 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 278 Hinweise abgebaut.
- In sieben Laufzeitdateien wurden elf vollstaendig unreferenzierte private
  UI-Elemente und acht nur zu diesen Elementen oder dauerhaft ungesetzten
  Optionen gehoerende Parameter entfernt. 375 alte Quellzeilen entfallen;
  vier Zeilen wurden fuer die vereinfachten aktiven Konstruktoren eingesetzt.
- Entfernt wurden ein altes Popup-Aktionswidget, eine unreferenzierte
  Suchergebnis-Unterseite, alte Filter-Icon-/Sortierhelfer und fuenf tote
  Filterwidgets sowie zwei tote Profilhelfer. Nie gesetzte individuelle
  Farb- und Startwertoptionen wurden auf ihr tatsaechliches Standardverhalten
  vereinfacht.
- Aktive Such-, Filter-, Popup-, Einstellungs-, Bewertungs- und Profilpfade
  bleiben unveraendert. Keine der sieben Dateien ist als Datenschutz-
  Quellbindung hinterlegt; eine Hash-Aktualisierung war nicht erforderlich.
- Die CI-Analyseschranke steht jetzt bei 333. Die sechs einzeln gesperrten
  Korrektheits- und Hygiene-Codes bleiben fail-closed. Grosse Buchungs- und
  Chatregionen bleiben bis zur Produktflusspruefung bewusst unangetastet.
- Zwei Wiring-Tests und 268 App-Tests bei einem bewussten Skip sind gruen.
  Der vollstaendige technische Regressionslauf bestand einschliesslich aller
  Backend-, Store-, Rechts-, Datenschutz-, Aufbewahrungs- und
  Schutzpruefungen sowie Web- und Android-Debug-Bau.
- P1-01 bleibt fuer 333 Resthinweise offen. Nachweis:
  `docs/evidence/b11/flutter-analysis-dead-ui-components-20260816.json`.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.99 – kleine UI-Reste und reine Framework-Bezeichner bereinigt

- Der Flutter-Analysebestand wurde von 333 auf 324 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 287 Hinweise abgebaut.
- Vier vollstaendig unreferenzierte kleine UI-Bausteine wurden entfernt: ein
  eigenstaendiger alter Explore-Header, ein alter Trust-Meter sowie zwei nur
  noch in auskommentiertem oder abgeloestem Profilaufbau vorhandene Helfer.
- Fuenf veraltete Framework-Bezeichner wurden ohne Funktionsaenderung auf ihre
  direkten aktuellen Entsprechungen umgestellt: zwei aktive Switch-Daumen und
  drei Material- zu Widget-State-Typen.
- Der gezielte Laufzeitumfang umfasst sechs Dateien, entfernt 124 alte Zeilen
  und fuegt zehn Zeilen fuer die aktuellen API-Namen ein. Keine dieser Dateien
  ist als Datenschutz-Quellbindung hinterlegt; eine Hash-Aktualisierung war
  nicht erforderlich.
- Sichtbare Explore-, Profil-, Sprach-, Bearbeitungs- und Detailpfade sowie
  persistierte Daten bleiben unveraendert. Die CI-Analyseschranke steht jetzt
  fail-closed bei 324; grosse Buchungs- und Chatregionen bleiben geschuetzt.
- Der gezielte Public-Profile-Test mit 13 Faellen, zwei Wiring-Tests und 268
  App-Tests bei einem bewussten Skip sind gruen. Der vollstaendige technische
  Regressionslauf bestand einschliesslich aller Schutzvalidatoren sowie Web-
  und Android-Debug-Bau. Nachweis:
  `docs/evidence/b11/flutter-analysis-small-ui-and-api-cleanup-20260816.json`.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.100 – Teilen und Textskalierung auf aktuelle APIs migriert

- Der Flutter-Analysebestand wurde von 324 auf 316 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 295 Hinweise abgebaut.
- Zwei native Teilen-Aufrufe verwenden jetzt die aktuelle `SharePlus`-Instanz
  mit `ShareParams`. Inhalt, Fehlerbehandlung und Link-Fallback bleiben
  unveraendert.
- Vier Kartenhoehenberechnungen verwenden jetzt `MediaQuery.textScalerOf` und
  skalieren die tatsaechlichen Schriftgroessen. Damit bleibt das bisherige
  lineare Verhalten erhalten und nichtlineare Barrierefreiheits-Skalierung
  wird korrekt beruecksichtigt.
- Der gezielte Laufzeitumfang umfasst fuenf Dateien mit 17 Einfuegungen und 15
  Loeschungen. Keine dieser Dateien ist als Datenschutz-Quellbindung
  hinterlegt; eine Hash-Aktualisierung war nicht erforderlich.
- Persistierte Daten, Teilen-Inhalte, Explore-/Wunschlisten-Navigation und
  Buchungs- oder Chatlogik bleiben unveraendert. Die CI-Analyseschranke steht
  jetzt fail-closed bei 316.
- Zwei Wiring-Tests und 268 App-Tests bei einem bewussten Skip sind gruen. Der
  vollstaendige technische Regressionslauf bestand einschliesslich aller
  Schutzvalidatoren sowie Web- und Android-Debug-Bau.
- P1-01 bleibt fuer 316 Resthinweise offen. Nachweis:
  `docs/evidence/b11/flutter-analysis-sharing-and-text-scaling-20260816.json`.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.101 – direkte Alt-APIs und wirkungslose Bildoption bereinigt

- Der Flutter-Analysebestand wurde von 316 auf 313 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 298 Hinweise abgebaut.
- Eine aktive Switch-Daumenfarbe und eine Farbtransparenz verwenden jetzt ihre
  direkten aktuellen Framework-Entsprechungen. Eine von der Bibliothek als
  wirkungslos und veraltet ausgewiesene Bild-Kompressionsoption wurde entfernt.
- Sichtbare Farbe, Transparenz, Bildauswahl, Bilddaten und Mehrfachauswahl
  bleiben unveraendert. Der gezielte Laufzeitumfang umfasst zwei Dateien mit
  zwei Ersetzungen und einer entfernten Optionszeile.
- Beide Laufzeitdateien sind an die Datenschutz-Inventur gebunden. Ihre zwei
  SHA-256-Werte wurden exakt aktualisiert; alle 16 Datenschutzpruefungen sind
  anschliessend gruen und der fachliche Datenumfang blieb unveraendert.
- Die CI-Analyseschranke steht jetzt fail-closed bei 313. P1-01 bleibt fuer
  313 Resthinweise offen. Nachweis:
  `docs/evidence/b11/flutter-analysis-direct-api-cleanup-20260816.json`.
- Zwei Wiring-Tests und 268 App-Tests bei einem bewussten Skip sind gruen. Der
  vollstaendige technische Regressionslauf bestand einschliesslich aller
  Schutzvalidatoren sowie Web- und Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.102 – Standortaufrufe auf aktuelle Einstellungen migriert

- Der Flutter-Analysebestand wurde von 313 auf 311 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 300 Hinweise abgebaut.
- Die automatische Ortssuche und das bewusste Standortteilen verwenden jetzt
  `LocationSettings` statt des veralteten Genauigkeitsparameters. Die bisherige
  hohe beziehungsweise mittlere Genauigkeit bleibt exakt erhalten.
- Berechtigungsabfrage, Standortdienst-Pruefung, Stadtableitung, Koordinaten-
  Rundung, Kartenlink und Nachrichteninhalt bleiben unveraendert. Zwei
  Laufzeitdateien erhielten zusammen fuenf neue und verloren zwei alte Zeilen.
- Der Nachrichtenpfad ist an die Datenschutz-Inventur gebunden. Sein SHA-256-
  Wert wurde exakt aktualisiert; alle 16 Datenschutzpruefungen sind gruen und
  der offengelegte praezise Standortfluss blieb fachlich unveraendert.
- Die CI-Analyseschranke steht jetzt fail-closed bei 311. P1-01 bleibt fuer
  311 Resthinweise offen. Nachweis:
  `docs/evidence/b11/flutter-analysis-location-settings-20260816.json`.
- 35 gezielte Standort- und Wahrheitspruefungen, zwei Wiring-Tests sowie 268
  App-Tests bei einem bewussten Skip sind gruen. Der vollstaendige technische
  Regressionslauf bestand einschliesslich aller Schutzvalidatoren sowie Web-
  und Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.103 – Einzelwahl-Steuerung auf aktuelle Gruppenlogik migriert

- Der Flutter-Analysebestand wurde von 311 auf 307 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 304 Hinweise abgebaut.
- Die Auswahl des Developer-Vorschauzustands und der zu widerrufenden Buchung
  werden jetzt jeweils von einer typisierten `RadioGroup` gesteuert. Die
  einzelnen Auswahlzeilen tragen nur noch ihren eigenen Wert und Inhalt.
- Aktueller Auswahlwert, asynchrones Speichern des Vorschauzustands,
  Buchungsfilter, Weiter-Schaltflaeche und Widerrufsuebermittlung bleiben
  unveraendert. Der aktuelle Gruppenmechanismus verbessert zusaetzlich Tastatur-
  und Semantikunterstuetzung.
- Zwei gezielte Wiring-Tests verriegeln Gruppenwert und Aenderungspfad in beiden
  Oberflaechen. Die CI-Analyseschranke steht jetzt fail-closed bei 307. P1-01
  bleibt fuer 307 Resthinweise offen. Nachweis:
  `docs/evidence/b11/flutter-analysis-radio-group-controls-20260816.json`.
- 23 gezielte Rechts-, Checkout-, Wahrheits- und Barrierefreiheitspruefungen,
  vier Wiring-Tests sowie 268 App-Tests bei einem bewussten Skip sind gruen.
  Der vollstaendige technische Regressionslauf bestand einschliesslich aller
  Schutzvalidatoren sowie Web- und Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.104 – Zurueck-Navigation und Web-Download modernisiert

- Der Flutter-Analysebestand wurde von 307 auf 304 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 307 Hinweise abgebaut.
- Die Hauptnavigation verwendet jetzt `PopScope`. Auf einem anderen Tab wird
  ein System-Zurueck weiterhin abgefangen und auf Erkunden gewechselt; erst auf
  Erkunden darf die Route geschlossen werden. Android Predictive Back wird
  damit von der aktuellen Flutter-API unterstuetzt.
- Der Web-Download verwendet jetzt `package:web` und JavaScript-Interop statt
  `dart:html`. Bytes, MIME-Typ, Dateiname, temporaerer Link, Klick, Entfernen
  und Freigabe der Objekt-URL bleiben in derselben Reihenfolge erhalten.
- `package:web` ist als direkte Laufzeitabhaengigkeit mit unveraenderter
  aufgeloester Version 1.1.1 festgeschrieben. Der an die Datenschutz-Inventur
  gebundene `pubspec.yaml`-Hash wurde exakt aktualisiert; Datenfluesse und
  Offenlegungen bleiben unveraendert.
- Drei gezielte Wiring-Tests verriegeln Zurueck-Regel, Download-Lebenszyklus und
  direkte Abhaengigkeit. Die CI-Analyseschranke steht jetzt fail-closed bei 304.
  P1-01 bleibt fuer 304 Resthinweise offen. Nachweis:
  `docs/evidence/b11/flutter-analysis-navigation-and-web-download-20260816.json`.
- 16 Datenschutzpruefungen, 24 gezielte Navigations-, Export-, Wahrheits- und
  Barrierefreiheitspruefungen, fuenf Wiring-Tests sowie 268 App-Tests bei einem
  bewussten Skip sind gruen. Der vollstaendige technische Regressionslauf
  bestand einschliesslich aller Schutzvalidatoren sowie Web- und
  Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.105 – feststehende UI-Standardparameter entfernt

- Der Flutter-Analysebestand wurde von 304 auf 297 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 314 Hinweise abgebaut.
- Sieben optionale private UI-Parameter, die projektweit nie gesetzt wurden,
  sind entfernt. Ihre bisher wirksamen Standardwerte sind direkt im jeweiligen
  Helfer verankert: Primaerfarbe, 6,5-Sekunden-Puls, kein Info-Anhang, keine
  Datums-Loeschaktion, deaktivierte Naehe-Karte und Suchsymbol.
- Buchungskarten, Hervorhebungsdauer, Vermieter-Informationen, Datumsauswahl,
  Suchdarstellung und Interaktion bleiben unveraendert. Vier Laufzeitdateien
  verloren netto elf reine Signatur- und Standardwertzeilen.
- Keine geaenderte Laufzeitdatei ist als Datenschutz-Quellbindung hinterlegt;
  Datenfluesse und Offenlegungen bleiben unveraendert. Vier gezielte
  Wiring-Tests verriegeln die sechs feststehenden UI-Standards.
- Die CI-Analyseschranke steht jetzt fail-closed bei 297. P1-01 bleibt fuer 297
  Resthinweise offen. Nachweis:
  `docs/evidence/b11/flutter-analysis-fixed-default-parameters-20260816.json`.
- 38 gezielte UI- und Verhaltenspruefungen, sechs Wiring-Tests sowie 268
  App-Tests bei einem bewussten Skip sind gruen. Der vollstaendige technische
  Regressionslauf bestand einschliesslich aller Schutzvalidatoren sowie Web-
  und Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.106 – toten Such- und Kartenaltzweig entfernt

- Der Flutter-Analysebestand wurde von 297 auf 290 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 321 Hinweise abgebaut.
- Sieben projektweit unreferenzierte Such-Deklarationen sowie ihre nur intern
  verbundenen Kartenmarkierungshelfer und zwei obsolete Zustands-Caches sind
  entfernt. Die Laufzeitdatei verlor 328 tote Zeilen ohne Ersatzpfad.
- Der erreichbare Sucheinstieg, KI-Auswertung, oeffentliche Artikelsuche,
  Kategorieauswahl, schwebende Vorschlaege und Ergebnisnavigation bleiben
  erhalten und werden durch drei neue Wiring-Tests verriegelt.
- Die Laufzeitdatei ist nicht als Datenschutz-Quellbindung hinterlegt;
  Datenfluesse, Datentypen und Offenlegungen bleiben unveraendert.
- Die CI-Analyseschranke steht jetzt fail-closed bei 290. P1-01 bleibt fuer 290
  Resthinweise offen. Nachweis:
  `docs/evidence/b11/flutter-analysis-search-overlay-dead-branch-20260816.json`.
- 30 gezielte Such-, Wahrheits- und Barrierefreiheitspruefungen, neun
  Wiring-Tests sowie 268 App-Tests bei einem bewussten Skip sind gruen. Der
  vollstaendige technische Regressionslauf bestand einschliesslich aller
  Schutzvalidatoren sowie Web- und Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.107 – wirkungslose Inserat-Zwischenstaende entfernt

- Der Flutter-Analysebestand wurde von 290 auf 276 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 335 Hinweise abgebaut.
- Sechs nie gelesene Inserat-Zustandsfelder, drei projektweit unreferenzierte
  Helfer, fuenf nie gesetzte Darstellungsoptionen und ein daran gebundener
  leerer Prozentzustands-Callback sind entfernt.
- Die gespeicherten Privat-Pilot-Regeln bleiben unveraendert: Express ist aus,
  die Stornoregel ist `unified`, aktive Lieferflags bleiben an die Pilotgrenze
  gebunden und die drei Rabattstufen bleiben Bestandteil des Inserats.
- Fotoauswahl, Adressvorschlaege, KI-Preisberechnung, Kategorieauswahl,
  Rabattbearbeitung und Inseratsspeicherung bleiben erhalten und werden durch
  vier neue Wiring-Tests verriegelt.
- Die Laufzeitdatei ist im Datenschutz-Inventar gebunden; ihr SHA-256 wurde
  exakt aktualisiert. Datenfluesse, Datentypen und Offenlegungen bleiben
  unveraendert. Die CI-Analyseschranke steht jetzt fail-closed bei 276. Nachweis:
  `docs/evidence/b11/flutter-analysis-create-listing-dead-state-20260816.json`.
- 16 Datenschutzpruefungen, 42 gezielte Inserat-, Preis-, Storno-, Foto- und
  Privat-Pilot-Pruefungen, acht Wiring-/Richtlinientests sowie 268 App-Tests bei
  einem bewussten Skip sind gruen. Web- und Android-Debug-Bau bestanden.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.108 – tote Buchungslisten-Parallelpfade entfernt

- Der Flutter-Analysebestand wurde von 276 auf 262 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 349 Hinweise abgebaut.
- Neun analysewirksame tote Elemente sowie der nur daran gebundene
  Mieter-Stornopruefer, Vermieter-Liefercache und der ungenutzte Abruf der
  gespeicherten Lieferauswahl wurden entfernt. Zwei Laufzeitdateien verloren
  netto 245 tote Zeilen.
- Der doppelte, unerreichbare Mieter-Stornoweg in der Buchungsliste ist weg.
  Der kanonische Stornoweg im Buchungsdetail bleibt unveraendert erhalten;
  Listenstatus, Detailnavigation und Bewertungsaufrufe bleiben aktiv.
- Vermieter-Annahme und -Ablehnung, Detailnavigation sowie Bewertungen bleiben
  erhalten. Die beiden bereinigten Laufzeitdateien sind nicht als
  Datenschutz-Quellbindung hinterlegt; Datenfluesse und Offenlegungen bleiben
  unveraendert.
- Fuenf neue Wiring-Tests verriegeln entfernte Parallelpfade und erhaltene
  kanonische Ablaufe. Insgesamt bestanden 76 gezielte Flutter-Tests und elf
  gezielte Strukturtests. Die CI-Analyseschranke steht jetzt fail-closed bei
  262. Nachweis:
  `docs/evidence/b11/flutter-analysis-booking-lists-dead-ui-20260816.json`.
- 268 App-Tests bei einem bewussten Skip und der separate Google-Profiltest
  sind gruen. Der vollstaendige technische Regressionslauf bestand
  einschliesslich aller Schutzvalidatoren sowie Web- und Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Produktion,
  Echtgeld, Store-Tracks, Testkonten und Review-Versand blieben unveraendert;
  alle neun Aufbewahrungsentscheidungen und alle sechs V4-Punkte bleiben
  offen.

## Meilenstein 16.109 – tote Buchungsdetail-Praesentationsreste entfernt

- Der Flutter-Analysebestand wurde von 262 auf 239 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 372 Hinweise abgebaut.
- Ausschliesslich projektweit unreferenzierte Darstellungsreste wurden aus den
  Mieter- und Vermieter-Buchungsdetails entfernt. Die beiden Laufzeitdateien
  verloren zusammen 804 tote Zeilen ohne Ersatzpfad oder neue Laufzeitzeile.
- Moderne Detailkarten, Kartenaktionen, Gegenpartei-, Betrags- und Faktzeilen
  bleiben erhalten. Ebenso unveraendert bleiben die konkreten Buttons und
  Zeitpruefungen fuer Uebergabe und Rueckgabe, QR-/Code-/Foto-Schutz,
  Mieter- und Vermieter-Storno sowie beide Bewertungsrichtungen.
- Vier neue Wiring-Tests verriegeln die entfernten Altkomponenten und die
  konkreten erreichbaren UI-Aufrufstellen. Nach einer unabhaengigen Review
  wurde die Verriegelung gehaertet; die Abschlussreview meldet keine Findings.
- Die bereinigten Laufzeitdateien sind nicht als Datenschutz-Quellbindung
  hinterlegt. Datenerhebung, Speicherung, Uebertragung, Berechtigungen und
  Offenlegungen bleiben unveraendert. Die CI-Analyseschranke steht jetzt
  fail-closed bei 239. Nachweis:
  `docs/evidence/b11/flutter-analysis-booking-detail-legacy-presentation-20260816.json`.
- 102 gezielte Flutter-Tests und 15 gezielte Strukturtests sind gruen. Die
  vollstaendige Regression bestand mit 268 App-Tests bei einem bewussten Skip,
  dem separaten Google-Profiltest, allen Schutzvalidatoren sowie Web- und
  Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Der bestehende
  Kandidat `1.0.0+2026081509`, Produktion, Echtgeld, Store-Tracks, Testkonten
  und Review-Versand blieben unveraendert. Alle neun Aufbewahrungsentscheidungen,
  alle sechs V4-Punkte und die vier offenen Geraetematrix-Zellen bleiben offen.

## Meilenstein 16.110 – tote Nachrichtenlisten-Helfer entfernt

- Der Flutter-Analysebestand wurde von 239 auf 235 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 376 Hinweise abgebaut.
- Ausschliesslich vier projektweit unreferenzierte Elemente wurden aus der
  Nachrichtenliste entfernt: eine alte vollstaendige Demo-Zustandsfabrik, eine
  nie verwendete Tab-Zaehlung sowie zwei nie gerenderte Praesenz- und
  Uebergabe-/Rueckgabe-Textformatierer. Die Laufzeitdatei verlor 419 tote Zeilen
  ohne neue Laufzeitzeile.
- Das Laden aktiver und archivierter Threads, die eng begrenzte QA-
  Uebersetzungsdemo, Filter und Suche, Oeffnen und Ungelesen-Status,
  Nachrichten-Einstellungen sowie Archivieren, Entarchivieren, Loeschen,
  Blockieren, Entblockieren und Stummschalten bleiben erhalten.
- Sechs neue Wiring-Tests verriegeln sowohl die entfernten Symbole als auch die
  konkreten erreichbaren UI-Callbacks. Nach unabhaengiger Review wurden die
  Swipe-Archivierungs- und Loeschpfade callback-begrenzt gehaertet; die
  Abschlussreview meldet keine Findings.
- `messages_screen.dart` ist nicht als Datenschutz-Quellbindung hinterlegt.
  Datenerhebung, Speicherung, Uebertragung, Berechtigungen, Store-Metadaten und
  Offenlegungen bleiben unveraendert. Die CI-Analyseschranke steht jetzt
  fail-closed bei 235. Nachweis:
  `docs/evidence/b11/flutter-analysis-messages-dead-helpers-20260816.json`.
- 110 gezielte Flutter-Tests und 29 gezielte Struktur-/Datenschutztests sind
  gruen. Die vollstaendige Regression bestand mit 268 App-Tests bei einem
  bewussten Skip, dem separaten Google-Profiltest, allen Schutzvalidatoren sowie
  Web- und Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Der bestehende
  Kandidat `1.0.0+2026081509`, Produktion, Echtgeld, Store-Tracks, Testkonten
  und Review-Versand blieben unveraendert. Alle neun Aufbewahrungsentscheidungen,
  alle sechs V4-Punkte und die vier offenen Geraetematrix-Zellen bleiben offen.

## Meilenstein 16.111 – tote Anfrage-Textkarte entfernt

- Der Flutter-Analysebestand wurde von 235 auf 234 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 377 Hinweise abgebaut.
- Ausschliesslich die projektweit unreferenzierte private `_MessageCard` wurde
  aus der Anfrageansicht entfernt. Die Laufzeitdatei verlor 20 tote Zeilen ohne
  neue Laufzeitzeile.
- Das Laden von Anfrage, Artikel und Mieter, Express-Annahme und -Ablehnung,
  Privat-Pilot-Annahme und Ablehnung, Artikel-, Mieter-, Datums- und Preiskarten
  sowie die Navigation zum Mieterprofil bleiben erhalten und sind im neuen
  Wiring-Test konkret verriegelt.
- Fuenf neue Wiring-Tests bestehen. Die unabhaengige Review bestaetigt die enge
  Patch-Grenze zwischen `_ExpressAcceptedInfo` und `_PublicProfileQuickView`
  sowie alle aktiven Anker ohne Findings.
- `request_detail_screen.dart` ist nicht als Datenschutz-Quellbindung
  hinterlegt. Datenerhebung, Speicherung, Uebertragung, Berechtigungen,
  Store-Metadaten und Offenlegungen bleiben unveraendert. Die CI-
  Analyseschranke steht jetzt fail-closed bei 234. Nachweis:
  `docs/evidence/b11/flutter-analysis-request-detail-dead-message-card-20260816.json`.
- 59 gezielte Flutter-Tests und 13 gezielte Strukturtests sind gruen. Die
  vollstaendige Regression bestand mit 268 App-Tests bei einem bewussten Skip,
  dem separaten Google-Profiltest, allen Schutzvalidatoren sowie Web- und
  Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Der bestehende
  Kandidat `1.0.0+2026081509`, Produktion, Echtgeld, Store-Tracks, Testkonten
  und Review-Versand blieben unveraendert. Alle neun Aufbewahrungsentscheidungen,
  alle sechs V4-Punkte und die vier offenen Geraetematrix-Zellen bleiben offen.

## Meilenstein 16.112 – toter Explore-Wrapper-Verifizierungsgetter entfernt

- Der Flutter-Analysebestand wurde von 234 auf 233 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 378 Hinweise abgebaut.
- Ausschliesslich der unreferenzierte private `_isVerified`-Getter im
  `_ExploreListingCard`-Wrapper wurde entfernt. Die Laufzeitdatei verlor vier
  tote Zeilen ohne neue Laufzeitzeile.
- Der gleichnamige aktive Getter in `_ExploreListingCardContent` bleibt
  erhalten und steuert weiterhin die gruen/graue Verifizierungsanzeige. Grid-
  Weitergabe, Textskalierungsbegrenzung, Favoritenaktion, echtes Rating,
  Detailoeffnung und Long-Press-Optionen bleiben unveraendert.
- Vier neue bereichsgebundene Wiring-Tests verriegeln die enge Patch-Grenze und
  verhindern insbesondere eine globale Entfernung des aktiven Getters. Zwei
  unabhaengige Reviews bestaetigen die Reichweite und melden keine Findings.
- `explore_screen.dart` ist nicht als Datenschutz-Quellbindung hinterlegt.
  Datenerhebung, Speicherung, Uebertragung, Berechtigungen, Store-Metadaten und
  Offenlegungen bleiben unveraendert. Die CI-Analyseschranke steht jetzt
  fail-closed bei 233. Nachweis:
  `docs/evidence/b11/flutter-analysis-explore-wrapper-dead-verification-getter-20260816.json`.
- 33 gezielte Flutter-Tests und die neuen Strukturtests sind gruen. Die
  vollstaendige Regression bestand mit 268 App-Tests bei einem bewussten Skip,
  dem separaten Google-Profiltest, allen Schutzvalidatoren sowie Web- und
  Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Der bestehende
  Kandidat `1.0.0+2026081509`, Produktion, Echtgeld, Store-Tracks, Testkonten
  und Review-Versand blieben unveraendert. Alle neun Aufbewahrungsentscheidungen,
  alle sechs V4-Punkte und die vier offenen Geraetematrix-Zellen bleiben offen.

## Meilenstein 16.113 – tote einklappbare Buchungsdetail-Hinweisfelder entfernt

- Der Flutter-Analysebestand wurde von 233 auf 231 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 380 Hinweise abgebaut.
- Ausschliesslich die beiden projektweit ungenutzten, nebenwirkungsfreien
  `false`-Felder `_pickupHintOpen` und `_upcomingPrivacyOpen` wurden entfernt.
  Die Laufzeitdatei verlor zwei Zeilen ohne neue Laufzeitzeile.
- Die festen `_AddressInfoCard`-Darstellungen, gesperrte ungefaehre Adresse vor
  Freigabe, zeit-/statusgebundene exakte Adressfreigabe, Abhol- und Rueckgabeort,
  `ApproxLocationMap`, Uebergabe- und Rueckgabestarts sowie Zeitbestaetigungen
  bleiben erhalten.
- Vier neue fail-closed Wiring-Tests verriegeln die enge Zwei-Zeilen-Grenze und
  die aktiven Datenschutz-, Adress-, Karten-, Uebergabe- und Rueckgabeanker.
  Zwei unabhaengige Vorpruefungen bestaetigen die Reichweite.
- `booking_detail_screen.dart` ist als Datenschutz-Quellbindung hinterlegt;
  ihr Quellhash wurde fuer den unveraenderten Datenschutzumfang aktualisiert,
  waehrend die Rueckgabe-Schrittdatei unveraendert blieb. Datenerhebung,
  Speicherung, Uebertragung, Berechtigungen, Store-Metadaten und Offenlegungen
  bleiben unveraendert. Die CI-Analyseschranke steht jetzt
  fail-closed bei 231. Nachweis:
  `docs/evidence/b11/flutter-analysis-booking-detail-dead-collapsible-hint-state-20260816.json`.
- 80 gezielte Flutter-Tests und die neuen Strukturtests sind gruen. Die
  vollstaendige Regression bestand mit 268 App-Tests bei einem bewussten Skip,
  dem separaten Google-Profiltest, allen Schutzvalidatoren sowie Web- und
  Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Der bestehende
  Kandidat `1.0.0+2026081509`, Produktion, Echtgeld, Store-Tracks, Testkonten
  und Review-Versand blieben unveraendert. Alle neun Aufbewahrungsentscheidungen,
  alle sechs V4-Punkte und die vier offenen Geraetematrix-Zellen bleiben offen.

## Meilenstein 16.114 – totes manuelles Uebergabe-Sichtbarkeitsfeld entfernt

- Der Flutter-Analysebestand wurde von 231 auf 230 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 381 Hinweise abgebaut.
- Ausschliesslich das projektweit ungenutzte, nebenwirkungsfreie `false`-Feld
  `_showManualHandover` wurde entfernt. Die Laufzeitdatei verlor genau eine
  Zeile ohne neue Laufzeitzeile.
- Die bestaetigten Zeitpruefungen, sichere Pickup- und Return-Challenges,
  QR-/Code-Stepper, mindestens vier Fotos, verifizierte Rueckgabetransition,
  eigentuemergebundene Stornierung und Bewertung `owner_to_renter` bleiben
  erhalten.
- Acht neue abschnittsgebundene fail-closed Wiring-Tests verriegeln die enge
  Ein-Zeilen-Grenze und alle genannten aktiven Sicherheits- und Nutzerpfade.
  Zwei unabhaengige Vorpruefungen bestaetigen Reichweite und Analyzer-Delta.
- `ongoing_owner_detail_screen.dart` ist als Datenschutz-Quellbindung
  hinterlegt; ihr Quellhash wurde fuer den unveraenderten Datenschutzumfang
  aktualisiert, waehrend die Rueckgabe-Schrittdatei unveraendert blieb.
  Datenerhebung, Speicherung, Uebertragung, Berechtigungen, Store-Metadaten und
  Offenlegungen bleiben unveraendert. Die CI-Analyseschranke steht jetzt
  fail-closed bei 230. Nachweis:
  `docs/evidence/b11/flutter-analysis-ongoing-owner-dead-manual-handover-state-20260816.json`.
- 102 gezielte Flutter-Tests und die neuen Strukturtests sind gruen. Die
  vollstaendige Regression bestand mit 268 App-Tests bei einem bewussten Skip,
  dem separaten Google-Profiltest, allen Schutzvalidatoren sowie Web- und
  Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Der bestehende
  Kandidat `1.0.0+2026081509`, Produktion, Echtgeld, Store-Tracks, Testkonten
  und Review-Versand blieben unveraendert. Alle neun Aufbewahrungsentscheidungen,
  alle sechs V4-Punkte und die vier offenen Geraetematrix-Zellen bleiben offen.

## Meilenstein 16.115 – toter Buchungsdetail-Nachrichtenfreigabegetter entfernt

- Der Flutter-Analysebestand wurde von 230 auf 229 Hinweise reduziert;
  Analysefehler bleiben bei null. Seit dem urspruenglichen Stand von 611 sind
  damit 382 Hinweise abgebaut.
- Ausschliesslich der projektweit unreferenzierte Getter `_canMessage` wurde aus
  dem Buchungsdetail entfernt. Die Laufzeitdatei verlor vier tote physische
  Zeilen ohne neue Laufzeitzeile.
- Beide aktiven Nachrichtenaktionen behalten ihre eigenen Statussperren fuer
  ausstehende, zu pruefende und abgeschlossene Buchungen und oeffnen weiterhin
  `MessageThreadScreen`. Auch Gegenpartei-Chatbutton und Support-Thread bleiben
  unveraendert erreichbar.
- Acht neue abschnittsgebundene fail-closed Wiring-Tests verriegeln Symbol-
  Abwesenheit, beide Chatpfade, Support, Zeitpruefungen, Stornierung und die
  Bewertung `renter_to_owner`. Zwei unabhaengige Vorpruefungen bestaetigen
  Reichweite und Analyzer-Delta.
- `booking_detail_screen.dart` ist als Datenschutz-Quellbindung hinterlegt;
  ihr Quellhash wurde fuer den unveraenderten Datenschutzumfang aktualisiert,
  waehrend Nachrichten- und Rueckgabe-Schrittdateien unveraendert blieben.
  Datenerhebung, Speicherung, Uebertragung, Berechtigungen, Store-Metadaten und
  Offenlegungen bleiben unveraendert. Die CI-
  Analyseschranke steht jetzt fail-closed bei 229. Nachweis:
  `docs/evidence/b11/flutter-analysis-booking-detail-dead-can-message-getter-20260816.json`.
- 114 gezielte Flutter-Tests und die neuen Strukturtests sind gruen. Die
  vollstaendige Regression bestand mit 268 App-Tests bei einem bewussten Skip,
  dem separaten Google-Profiltest, allen Schutzvalidatoren sowie Web- und
  Android-Debug-Bau.
- Es wurde kein neuer oder signierter App-Kandidat erzeugt. Der bestehende
  Kandidat `1.0.0+2026081509`, Produktion, Echtgeld, Store-Tracks, Testkonten
  und Review-Versand blieben unveraendert. Alle neun Aufbewahrungsentscheidungen,
  alle sechs V4-Punkte und die vier offenen Geraetematrix-Zellen bleiben offen.
