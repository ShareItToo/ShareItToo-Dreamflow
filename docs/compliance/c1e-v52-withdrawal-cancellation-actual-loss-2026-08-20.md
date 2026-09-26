# C1E - V5.2 Withdrawal, Cancellation, No-Show and Separate Refunds

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungsstand: `52f2ed7a301d84a9855a2a152b46b824f16264fb`

## Ergebnis

**C1E ist GREEN. C1F darf innerhalb der bestehenden C1-Grenzen beginnen;
Release, Echtgeld und jede Rechtsaktivierung bleiben HOLD.**

Der buchungsbezogene V5.2-Widerruf ist an den exakten im Plattformvertrag
gespeicherten Widerrufstext gebunden. Innerhalb der 14-Tage-Frist geht er einer
normalen Mieter-Stornierung vor. Die bestehenden Regeln fuer mindestens 24
Stunden, weniger als 24 Stunden und die auf den Mietbeginn begrenzte
60-Minuten-Kulanz bleiben unveraendert.

Nach Mietbeginn und bei einem vom Vermieter erst ab Mietbeginn gemeldeten
Mieter-No-Show wird kein fester Strafbetrag erzeugt. Stattdessen entsteht ein
append-only Actual-Loss-Fall. Teilnehmer koennen nur eigene private
Beweis-Uploads referenzieren; nur ein Admin hinter dem bestehenden
Staff-Step-up darf die serverseitige Berechnung abschliessen. Ersparte
Aufwendungen, tatsaechliche Ersatzvermietung und ein akzeptierter
nachgewiesener geringerer oder fehlender Schaden werden vor der finalen
Begrenzung auf den gespeicherten Quote abgezogen.

Die Mietpreis-Erstattung mit Schuldner `owner` und die
SIT-Gebuehren-Erstattung mit Schuldner `sit` bleiben getrennte, auditierbare
Objekte. Der neue Abschlussstatus ist absichtlich nicht der vom
Zahlungs-Reconciler ausfuehrbare Status `final`; kein PSP-Aufruf und keine echte
Zahlung werden durch C1E ausgeloest.

## Umgesetzter Umfang

- Forward-only Migration `024_v52_actual_loss_resolution.up.sql` fuegt
  Actual-Loss-Faelle, Teilnehmeraussagen, private Beweisbindungen,
  Admin-Entscheidungen, getrennte Refund-Ereignisse sowie hashgebundene Belege
  und Zustellereignisse hinzu. Alle sieben neuen Tabellen sind append-only.
- Jeder Fall ist an Buchung, V5.2-Plattformvertrag, Dokument-Snapshot,
  Quote-ID/-Hash, Mietpreis, Plattformgebuehr, Waehrung und die beiden
  bestehenden pending Refund-Obligationen gebunden.
- Dokument-Key, Dokumentversion, Locale, Vertrag und SHA-256 des gespeicherten
  Textes werden vor Falleroeffnung und Entscheidung erneut serverseitig
  geprueft. Historische V5.1-Stornierungen bleiben pending, ohne nachtraeglich
  einen V5.2-Fall zu erfinden.
- Eigentuemeraussagen erfassen behaupteten Mietausfall, ersparte Aufwendungen
  und tatsaechliche Ersatzvermietung. Mieteraussagen koennen einen geringeren
  oder fehlenden Schaden belegen. Zulassig sind nur eigene private Uploads der
  Zwecke `handover_evidence`, `return_evidence` oder `report_evidence`.
- UUIDs, Zeitwerte, Textlaengen und Centwerte werden fail-closed validiert.
  Wiederverwendete Idempotenzschluessel duerfen nur exakt dieselbe Fall-,
  Aussagen- oder Entscheidungsnutzlast wiederholen; abweichende Nutzdaten
  erzeugen einen Konflikt.
- Die serverseitige Centberechnung zieht ersparte Aufwendungen und
  Ersatzvermietung vom behaupteten Ausfall ab, begrenzt auf mindestens null und
  hoechstens den gespeicherten Mietpreis und beruecksichtigt optional den
  akzeptierten geringeren Schaden. Die einbehaltene SIT-Gebuehr ist zehn
  Prozent des einbehaltenen Mietpreises, maximal die urspruengliche Gebuehr.
- Admin-Entscheidung, Berechnungsgrundlage, getrennte Schuldnerereignisse,
  Buchungsereignis und Beleg werden atomar gespeichert. Jeder Beleg nennt
  Quote-, Vertrags- und Dokumentbindung sowie alle Rechengroessen und weist
  ausdruecklich darauf hin, dass keine Zahlung bestaetigt wird.
- Teilnehmer koennen den Fall authentifiziert wiederfinden. Der
  Abrechnungsbeleg wird nur an Buchungsteilnehmer oder Admin ausgeliefert; der
  Server prueft seinen gespeicherten Hash und die App vergleicht gespeicherten
  Hash, Response-Header und selbst berechneten Byte-Hash.
- Die App leitet eine Mieter-Stornierung im aktiven V5.2-Widerrufsfenster in den
  zweistufigen, vorausgewaehlten Buchungswiderruf um. Auch dessen bestehender
  Belegdownload verifiziert jetzt Header- und Byte-Hash.
- Kontoexport, Datenschutz-Inventar und Retention-Inventar enthalten die neuen
  Fall-, Aussagen-, Entscheidungs-, Erstattungs- und Belegdaten. Die
  Datenschutz- und Retention-Staende bleiben unveraendert `draft` und
  fail-closed.

## Versionierung und Grenzen

Der buchungsbezogene V5.2-Widerruf verwendet den exakten
`imprint_withdrawal_shorttexts`-Snapshot aus dem jeweiligen Plattformvertrag.
Der bestehende kontobezogene Widerruf bleibt auf dem vorhandenen
V5.1-Kontosnapshot, weil im Repository noch kein separater persistierter
V5.2-Kontovertrag existiert. C1E erfindet dafuer weder einen Vertrag noch eine
Rechtsaktivierung.

Das 14-Tage-Loesungsrecht wird vor normaler Mieter-Stornierung geprueft. Ein
No-Show kann nur der Vermieter und erst ab Mietbeginn als solchen melden. Eine
Eigentuemer-Stornierung bleibt der vorhandene Vollerstattungsfall und wird
nicht als Mieter-No-Show umgedeutet.

## Verifikation

- Fokussierte C1E-Domain-, Workflow-, Persistenz- und Wiring-Tests: PASS.
- Bestehende Widerrufs-Workflow- und private Stornierungs-Grenztests: PASS.
- Vollstaendige lokale Backend-Suite: 234 PASS, ein erwarteter Skip ohne lokale
  `TEST_DATABASE_URL`, 0 Fehler.
- Vollstaendige lokale technische Regression nach Implementierung und erneut
  nach der Eingabe-/Idempotenzhaertung: PASS.
- Lokales Flutter: 295 PASS, ein dokumentierter Skip; Google-only 1/1 PASS.
- Web-Debug-Build und Android-Debug-Build: PASS.
- V5.2-, Datenschutz- und Retention-Validatoren einschliesslich
  Mutationstests: PASS. Datenschutz bleibt `state=draft` und
  `approvalAllowed=false`; Retention bleibt `state=draft` und
  `executionPreflight=blocked`.
- Gezielte Flutter-Analyse: keine Fehler; die bestehende Baseline von 46
  Warnungen/Infos blieb sichtbar und wurde nicht unterdrueckt.
- `git diff --check`: PASS.
- GitHub Actions Run
  [32351561805](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32351561805):
  `backend-regression` mit 235/235 Tests einschliesslich disposable
  PostgreSQL-Migrationslauf und `flutter-regression` erfolgreich fuer exakt
  `52f2ed7a301d84a9855a2a152b46b824f16264fb`.

Der lokale technische Lauf wurde mit `CI=true` nur als erlaubter
Mac-mini-Metadatenlauf ausgefuehrt. Er belegt keinen signierten Kandidaten,
keinen Store-Upload, keinen Geraetepass und keine Live-Umgebung. Der CI-Schritt
fuer einen signierten Kandidaten und `publish-api-image` blieben
erwartungsgemaess uebersprungen.

## Datenmigration und Rollback

Migration 024 ist additiv und forward-only. Sie wurde lokal nicht gegen eine
Staging- oder Produktionsdatenbank provisioniert. Bestehende V5.1-Tabellen und
-Zeilen bleiben unveraendert; die neuen V5.2-Zeilen koennen weder aktualisiert
noch geloescht werden.

Der Implementierungsdelta liegt in einem einzelnen fast-forward gepushten
Commit. Ein Rueckgaengigmachen darf nur ueber einen neuen Revert-Commit
erfolgen; Reset, Rebase, Force-Push und destruktives Entfernen der Migration
bleiben ausgeschlossen. Bei einem App-Rollback bleiben die neuen Tabellen
inert erhalten.

## Restrisiken und offene Gates

- Das V5.2-Rechtsbundle bleibt `draft-blocked`, nicht provisioniert, nicht
  aktiviert und nicht oeffentlich verlinkt.
- Teilnehmer- und Admin-Wege sind als authentifizierte API- und Client-Bindung
  vorhanden. C1E fuehrt keine reale Streitentscheidung und keine echte
  Erstattung aus.
- Die lokale PostgreSQL-Suite hat ohne `TEST_DATABASE_URL` erwartungsgemaess
  uebersprungen; der commitgebundene GitHub-Job hat Migration 024 und die
  PostgreSQL-Grenzen ohne Skip erfolgreich geprueft.
- Es gab keine Produktions-, VPS/OpenClaw-, DNS-, Cloud-, Payment-, Store-,
  Provider-, signierte Release- oder sonstige Live-Aktion.

## Naechster Schritt

**C1F - V5.2 Handover, Return, Evidence and needsReview:** die bestehende
Vier-Foto-Grenze, Gegenparteibestaetigung, Rueckgabe-Zeitlinie und
`needsReview`-Ausloeser an die exakten V5.2-Vertrags-, Upload-, Rollen- und
Zeitgrenzen binden, ohne Schadensabbuchung, Kaution oder Echtgeld zu aktivieren.
