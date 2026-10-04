# ShareItToo (SIT) – B0-Baseline und Launch-Backlog

Stand: 8. August 2026, 20:30 Uhr (Europe/Berlin)
Fortgeschrieben: 16. August 2026

## Zweck und Status

Dieses Dokument ist die kanonische technische Bestandsaufnahme für B0 des
SIT-Master-Workflows. Es verändert keine Produktfunktion. Es hält den gesunden
Quellstand, die laufende Produktion, bekannte Lücken und eindeutige
Abnahmekriterien fest.

B0 ist technisch aufgenommen. Tägliche PostgreSQL-Sicherung, isolierter
Restore und Health-Timer wurden inzwischen verifiziert; Staging liefert einen
maschinenlesbaren Versions- und Commitnachweis. Der erste kontrollierte
Store-Pilot läuft auf Android im internen Google-Play-Track. Für den formalen
Gesamtabschluss bleiben die Reihenfolge eines späteren öffentlichen iOS- und
Android-Starts, die final belegten Geschäftsangaben sowie der erste
commit-markierte Produktionsrollout offen.

## 1. Gesunder und geschützter Quellstand

| Feld | Nachweis |
|---|---|
| Repository | `walidwalidchraibi-dot/ShareItToo-Dreamflow` (öffentlich) |
| Standardbranch | `main` |
| Gesunder Commit | `6272264e985b1bc1d74a9891ddfd6074ce3caa61` |
| Geschützter Tag | `sit-baseline-2026-08-08` |
| Tag-Schutz | GitHub-Regelsatz `20590154`; Aktualisieren und Löschen gesperrt |
| Offene Pull Requests | keine |
| Offene GitHub-Issues | keine |
| Letzte CI auf `main` | erfolgreich |

Der bisherige lokale Hauptordner
`/Users/walidchraibi/Projects/ShareItToo-Dreamflow` liegt 185 Commits hinter
`origin/main` und enthält eigene, nicht eingecheckte Android-Änderungen. Er
wurde bewusst nicht bereinigt oder verändert.

Die kanonische Arbeitsumgebung für den Master-Workflow ist:

- Pfad: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`
- Branch: `codex/master-workflow-20260808`
- Ausgangspunkt: `origin/main` bei `6272264`

## 2. Reproduzierbarkeit und technische Gesundheit

Am geschützten Quellstand wurden lokal ausgeführt:

| Prüfung | Ergebnis |
|---|---|
| Backend-Abhängigkeiten mit Lockfile | erfolgreich |
| Backend-Tests | 9 bestanden, 0 fehlgeschlagen |
| Backend-Syntaxprüfung | erfolgreich |
| Flutter-Tests | 150 bestanden, 0 fehlgeschlagen |
| Flutter-Web-Debug-Build | erfolgreich |
| Android-Debug-APK | erfolgreich |
| GitHub-Regression | erfolgreich |
| Flutter-Analyse | 720 Hinweise; unter akzeptierter Alt-Baseline 729 |

Die 720 Analysehinweise sind kein neuer Rückschritt, aber auch kein sauberer
Releasezustand. Darunter befinden sich mindestens doppelte Map-Schlüssel,
unerreichbarer Code, veraltete APIs und zahlreiche asynchrone
`BuildContext`-Risiken. Sie werden als eigener Qualitätsblock abgebaut.

## 3. Produktionsinventar

### Domain, DNS und HTTPS

| Feld | Aktueller Stand |
|---|---|
| Primärdomain | `https://shareittoo.com` |
| `www` | HTTPS aktiv; 301-Weiterleitung auf Primärdomain |
| Nameserver | Namecheap (`dns1.registrar-servers.com`, `dns2.registrar-servers.com`) |
| Webserver | Caddy |
| Zertifikate | gültig bis 6. November 2026 für Root und `www` |
| Sicherheitsheader | HSTS, CSP, Frame- und MIME-Schutz aktiv |

Der produktive Web-Build wurde mit einem lokalen Release-Build des geschützten
Commits verglichen. `main.dart.js` ist bytegenau identisch; beide Dateien haben
SHA-256
`c0669ed0c451207670e851a7409161217dd1dcba9c9e501a78e5c8dc577968a8`.
Damit ist der laufende Web-Stand eindeutig der Baseline zugeordnet.

### Hostinger-VPS

| Feld | Aktueller Stand |
|---|---|
| VPS | `srv1580960.hstgr.cloud` |
| Öffentliche IPv4 | `2.24.194.2` |
| Plan / OS | KVM 2; Ubuntu 24.04 mit Docker und Traefik |
| Standort | Boston 2 |
| Status | läuft |
| Auslastung bei Prüfung | ca. 5 % CPU, 51 % RAM, 55/100 GB Speicher |
| Vertragsende | 12. April 2028; automatische Verlängerung aktiv |

Im Hostinger Docker Manager läuft die Anwendung `backend` mit zwei
Containern:

- `shareittoo-api` – läuft
- `shareittoo-postgres` – läuft

Die Website ist öffentlich erreichbar. Der Web-Container beziehungsweise die
Caddy-Bereitstellung ist im Hostinger-Anwendungsbild nicht als dritter
Container derselben Compose-Anwendung ausgewiesen und muss für vollständige
Deploy-Nachverfolgbarkeit noch dokumentiert werden.

### Live-Health

`https://shareittoo.com/api/health` lieferte HTTP 200 mit:

- API: `ok`
- Datenbank: `ok`
- Mail: `ok`

Die Live-API veröffentlicht derzeit noch keine Build- oder Commit-ID. Daher
kann nur der Web-Build, nicht aber der laufende Backend-Container,
zweifelsfrei dem Baseline-Commit zugeordnet werden.

Der Hostinger-Containerlog zeigt den Start von `shareittoo-api` am 8. August
2026 um 18:35:47 Uhr – rund eine Minute nach dem Merge des Baseline-Commits in
`main`. Das ist ein starker zeitlicher Nachweis für den aktuellen Stand, ersetzt
aber keine im Artefakt gespeicherte Commit-ID.

### Datenbank und Servermodell

PostgreSQL 16 ist privat im Docker-Netz und nicht öffentlich veröffentlicht.
Das aktuelle Schema enthält:

- Benutzer und Profile
- rotierende Refresh-Tokens
- Einmal-Tokens für E-Mail-Bestätigung und Passwort-Reset
- Inserate
- Buchungsanfragen
- Nachrichten-Threads und Nachrichten
- Upload-Metadaten

Noch nicht als autoritative Serverobjekte modelliert sind unter anderem:

- Zahlungen, Payment Intents und Webhooks
- Auszahlungen und Stripe-Connect-Konten
- Rückerstattungen
- Verfügbarkeitskalender und atomare Reservierungen
- Übergabe- und Rückgabeprotokolle
- Bewertungen
- Meldungen, Sperren und Moderationsfälle
- Rechnungs- und Buchhaltungsereignisse
- Push-Benachrichtigungen

### Backups und Monitoring

Hostinger erstellt aktuell wöchentliche VPS-Backups. Sichtbare Sicherungen:

- 2. August 2026, 08:51 Uhr, 53,70 GB
- 26. Juli 2026, 08:56 Uhr, 47,56 GB

Im Repository existieren zusätzlich:

- tägliches PostgreSQL-Dump-Skript mit Prüfsumme und 14 Tagen Aufbewahrung
- Healthcheck für Website, API, Datenbank, Mail, Container, Speicher und
  Backup-Alter
- systemd-Service- und Timerdateien für Backup und Healthcheck

Die tägliche Sicherung, der Health-Timer und der zusätzliche Restore-Check sind
auf dem VPS aktiviert. Ein isolierter Restore mit Prüfsummen- und Tabellencheck
sowie die externe Alarmzustellung wurden bestanden. Der genaue Nachweis und
die sichere Wiederholungsanleitung stehen im B2-Release-/Restore-Runbook.

## 4. E-Mail-Inventar

| Komponente | Aktueller Stand |
|---|---|
| Empfang | Google Workspace MX vollständig vorhanden |
| Versand | Google SMTP Relay; API-Health meldet Mail `ok` |
| Absender | `ShareItToo <contact@shareittoo.com>` |
| Reply-To | `contact@shareittoo.com` |
| SPF | `v=spf1 include:_spf.google.com ~all` sichtbar |
| DKIM | 2048-Bit-Google-DKIM, Selektor `google`, sichtbar |
| DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@shareittoo.com; pct=100` sichtbar |

Die frühere `.de`-Inkonsistenz ist bereinigt. App, Backend, Mailkonfiguration
und Rechtstexte verwenden als kanonische Kontaktadresse
`contact@shareittoo.com`; `dmarc@shareittoo.com` ist als kontrollierter
Google-Workspace-Alias fuer Berichte eingerichtet.

## 5. Architektur: tatsächlich vorhandener Stand

Die Release-App aktiviert das produktive Backend standardmäßig und verwendet
`https://shareittoo.com/api/v1`. Debug-Builds können weiterhin im lokalen
Vorschaumodus arbeiten.

Serverseitig vorhanden:

- E-Mail/Passwort-Anmeldung mit gesalzenem scrypt-Hash
- Access- und rotierende Refresh-Tokens
- E-Mail-Bestätigung und Passwort-Reset
- Profile
- Inserate und Bild-Uploads
- Buchungsanfragen mit Rollen- und Statusprüfungen
- Nachrichten mit Teilnehmerprüfung
- WebSocket-Änderungssignale
- Rate Limits, CORS, Security Header und privates PostgreSQL

Noch lokal beziehungsweise simuliert:

- Zahlungsarten inklusive automatisch angelegter Demo-Visa `4242`
- Auszahlungsarten und SIT-Guthaben
- Preis-, Rechnungs-, Rückerstattungs- und Auszahlungsereignisse
- große Teile von Übergabe, Rückgabe, Timeline, Benachrichtigungen und Reviews
- Zwei-Faktor-Ansicht und Geräteübersicht
- Meldungen und Sperrlisten
- Kartenfallbacks; unbekannte Distanzen können als 0 km behandelt werden
- einzelne Owner-/Vorschau-Flows mit Demoobjekten

Die Datei `architecture.md` beschreibt noch weitgehend den frühen
SharedPreferences-/Firebase-Vorschaustand und ist nicht mehr die verlässliche
Architekturquelle.

## 6. Release- und Konfigurationsrisiken

- Android Application ID und iOS Bundle ID sind einheitlich
  `com.shareittoo.app`.
- Android-Uploadsignatur, Google-Play-App-Signing und die interne
  Store-Installation sind für `1.0.0+2026081509` nachgewiesen.
- Auf diesem Mac fehlen weiterhin die vollständige Xcode-Anwendung,
  `xcodebuild`, CocoaPods und ein nachgewiesenes Apple Development Team;
  TestFlight bleibt deshalb offen.
- Die App verwendet abgestimmte zehnstellige Store-Buildnummern; der aktuelle
  Android-Kandidat ist `1.0.0+2026081509`.
- Keine echten Stripe-Schlüssel wurden im Repository gefunden; Stripe ist aber
  auch noch nicht integriert.
- Der vollständige Secret-Scan über alle Git-Referenzen, die gesamte
  Änderungshistorie und den aktuellen Arbeitsstand ist grün. Zwölf exakt an
  Commit, Pfad und Regel gebundene historische Treffer sind als entfernte oder
  ersetzte synthetische Testwerte geprüft; unerwartete Treffer: null. Der
  bereinigte Nachweis liegt unter
  `docs/evidence/b11/git-history-secret-scan-20260816.json` und derselbe Scan
  läuft mit vollständiger Historie in CI. Da kein echter Schlüssel gefunden
  wurde, war keine Zugangsdatenrotation erforderlich.
- Ein OpenAI-Proxy-Key ist als Compile-Time-Variable vorgesehen. Ein echter
  geheimer Schlüssel darf niemals in die Client-App kompiliert werden; die
  Funktion muss vor Aktivierung über das Backend laufen.
- `main` ist durch eine Branch-Regel geschützt: Pull Request, aktuelle grüne
  Backend- und Flutter-Prüfung, lineare Historie und gelöste Review-Gespräche
  sind Pflicht. Die Regel gilt auch für Administratoren; Force-Push und
  Branch-Löschung sind blockiert. Der Baseline-Tag bleibt ebenfalls geschützt.

## 7. Priorisierter kanonischer Launch-Backlog

### P0 – zwingend vor erster echter Buchung

| ID | Aufgabe | Owner | Abhängigkeit | Abnahmekriterium |
|---|---|---|---|---|
| P0-01 | Backend-Live-Version nachweisbar machen | Codex | keine | API-Health zeigt Commit/Build; Deploy-Runbook ordnet Container einem Tag zu; Web-Artefakt ist bereits belegt |
| P0-02 | Tägliche DB-Sicherung und Restore verifizieren | Codex | VPS-Shellzugang | Timer aktiv; aktueller Dump plus Prüfsumme; Restore in isolierte DB erfolgreich dokumentiert |
| P0-03 | Autoritatives Buchungsmodell auf Server vervollständigen | Codex | P0-01 | Buchungsdaten und Statuswechsel liegen serverseitig; Client ist nicht Source of Truth |
| P0-04 | Doppelbuchung atomar verhindern | Codex | P0-03 | konkurrierende überlappende Annahmen ergeben genau eine Reservierung; DB-/Integrationstest grün |
| P0-05 | Zahlungsanbieter und Geldfluss festlegen | Walid + Codex | Unternehmens-/Stripe-Zugang | Provider, Gebühren, Kaution, Capture, Refund und Payout schriftlich entschieden |
| P0-06 | Echte Zahlung, Webhooks, Refund und Payout implementieren | Codex | P0-05 | idempotente Webhooks; serverseitige Beträge; Testmodus-E2E; keine Client-Simulation |
| P0-07 | Übergabe, Rückgabe, Review-Hold und Reviews serverseitig machen | Codex | P0-03, P0-06 | beide Parteien sehen denselben Zustand; Beweise und Streitfall-Hold persistent |
| P0-08 | Moderation, Meldungen und Kontosperren serverseitig machen | Codex | P0-03 | Admin-/Supportentscheidung wirkt zentral; Audit-Trail vorhanden |
| P0-09 | Account-Lifecycle vollständig machen | Codex | Mail B1 | E-Mail-Wechsel, Passwortwechsel, Sessions, Löschung/Anonymisierung und Aufbewahrung serverseitig getestet |
| P0-10 | Release-Demo- und lokale Geld-/Sicherheitsdaten entfernen | Codex | P0-03 bis P0-09 | Release startet leer; keine Demo-Karte, Demo-Geräte, Demo-Owner-Daten oder 0-km-Freigabe |
| P0-11 | SPF/DKIM/DMARC und Transaktionsmails abschließen | Codex + Walid | Report-Adresse | SPF/DKIM PASS; DMARC `p=none`; Gmail plus zweiter Provider ohne Warnung; Kernvorlagen getestet |
| P0-12 | Rechtliche Identität und Texte finalisieren | Walid, fachlich prüfen lassen | Geschäftsangaben | Impressum, Datenschutz, AGB, Widerruf/Storno/Refund konsistent; `.com`-Kontaktdaten überall |
| P0-13 | App-IDs, Signierung und Store-Zugänge festlegen | Walid + Codex | Apple/Google-Konten | eindeutige Bundle/Application IDs, Signing sicher, TestFlight/Internal Track installierbar |
| P0-14 | Produktionsmonitoring mit Alarmziel aktivieren | Codex + Walid | Supportadresse | Health-Timer aktiv; Alarm kommt an; Backup-, Disk-, API-, DB- und Mail-Fehler werden gemeldet |
| P0-15 | Kontrollierte echte Pilotbuchung durchführen | Walid + Codex | alle P0 zuvor | zwei echte Konten, echtes Inserat und Geldfluss; Übergabe bis Review/Payout dokumentiert |

### P1 – vor breiter öffentlicher Freigabe

| ID | Aufgabe | Owner | Abnahmekriterium |
|---|---|---|---|
| P1-01 | Flutter-Analysebestand abbauen | Codex | **in Arbeit**: 611 auf 229 Hinweise gesenkt, 0 Fehler; alle 52 ungenutzten lokalen Variablen, 30 private Zustands-/Helferhinweise und 54 unreferenzierte alte UI-/Parameterhinweise sowie weitere 23 tote Buchungsdetail-Praesentationshinweise, vier tote Nachrichtenlisten-Helfer, eine tote Anfrage-Textkarte, ein toter Explore-Wrapper-Verifizierungsgetter, zwei tote einklappbare Buchungsdetail-Hinweisfelder, ein totes manuelles Uebergabe-Sichtbarkeitsfeld und ein toter Buchungsdetail-Nachrichtenfreigabegetter sind entfernt; 25 veraltete Framework-/Plugin-Verwendungen wurden auf aktuelle direkte Entsprechungen migriert oder als wirkungslose Altoption entfernt; zehn bereinigte Analyseklassen werden einzeln gegen Wiedereinfuehrung verriegelt; CI-Baseline jetzt 229; Nachweise unter `docs/evidence/b11/flutter-analysis-safe-batch-20260816.json`, `docs/evidence/b11/flutter-analysis-correctness-and-startup-safety-20260816.json`, `docs/evidence/b11/flutter-analysis-unused-locals-20260816.json`, `docs/evidence/b11/flutter-analysis-private-state-and-helpers-20260816.json`, `docs/evidence/b11/flutter-analysis-dead-ui-components-20260816.json`, `docs/evidence/b11/flutter-analysis-small-ui-and-api-cleanup-20260816.json`, `docs/evidence/b11/flutter-analysis-sharing-and-text-scaling-20260816.json`, `docs/evidence/b11/flutter-analysis-direct-api-cleanup-20260816.json`, `docs/evidence/b11/flutter-analysis-location-settings-20260816.json`, `docs/evidence/b11/flutter-analysis-radio-group-controls-20260816.json`, `docs/evidence/b11/flutter-analysis-navigation-and-web-download-20260816.json`, `docs/evidence/b11/flutter-analysis-fixed-default-parameters-20260816.json`, `docs/evidence/b11/flutter-analysis-search-overlay-dead-branch-20260816.json`, `docs/evidence/b11/flutter-analysis-create-listing-dead-state-20260816.json`, `docs/evidence/b11/flutter-analysis-booking-lists-dead-ui-20260816.json`, `docs/evidence/b11/flutter-analysis-booking-detail-legacy-presentation-20260816.json`, `docs/evidence/b11/flutter-analysis-messages-dead-helpers-20260816.json`, `docs/evidence/b11/flutter-analysis-request-detail-dead-message-card-20260816.json`, `docs/evidence/b11/flutter-analysis-explore-wrapper-dead-verification-getter-20260816.json`, `docs/evidence/b11/flutter-analysis-booking-detail-dead-collapsible-hint-state-20260816.json`, `docs/evidence/b11/flutter-analysis-ongoing-owner-dead-manual-handover-state-20260816.json` und `docs/evidence/b11/flutter-analysis-booking-detail-dead-can-message-getter-20260816.json` |
| P1-02 | `main` schützen und Releaseprozess erzwingen | Codex | **erfüllt**: Pull Request + aktuelle grüne Backend-/Flutter-CI erforderlich; Admin-Bypass, Force-Push und Branch-Löschung blockiert; `docs/evidence/b11/github-main-branch-protection-20260816.json` |
| P1-03 | Schema-Migrationen versionieren | Codex | vorwärts-/rückwärtsfähiger Migrationspfad und Backup vor Migration |
| P1-04 | Crash-, Fehler- und Audit-Beobachtung einführen | Codex + Walid | Fehler mit Release-ID sichtbar; keine unnötigen personenbezogenen Daten |
| P1-05 | Push-Benachrichtigungen | Codex | Buchungs-, Chat- und Übergabeereignisse zuverlässig; Opt-in und Deep Links getestet |
| P1-06 | Karten/Geocoding produktiv | Codex + Walid | korrekte Distanz; Datenschutz; keine 0-km-Freigabe bei unbekannter Adresse |
| P1-07 | Architektur- und Betriebsdokumentation aktualisieren | Codex | `architecture.md` und Runbooks entsprechen Produktion |
| P1-08 | Öffentliche Repo-Historie auf Geheimnisse prüfen | Codex | **erfüllt**: vollständiger Secret-Scan grün; 12 historische synthetische Treffer exakt geprüft, 0 unerwartete Treffer; `docs/evidence/b11/git-history-secret-scan-20260816.json` |
| P1-09 | Barrierefreiheit, Performance und Geräte-Matrix | Codex | definierte iOS-/Android-Matrix und Kernflows ohne P1-Blocker |

### Später

- optionale KI-Preis- und Verfügbarkeitsfunktionen über sicheren Backend-Proxy
- automatische Übersetzung
- weitergehendes SIT-Wallet-/Credit-Modell
- zusätzliche Märkte, Sprachen und erweiterte Such-/Empfehlungslogik

## 8. Entscheidungen von Walid

Für den formalen B0/B1-Abschluss werden folgende Entscheidungen benötigt:

1. Starten iOS und Android gleichzeitig öffentlich, oder zunächst ein
   kontrollierter Store-/Plattform-Pilot?
2. Vollständiger Unternehmens-/Anbietername, ladungsfähige Anschrift,
   Vertretungsberechtigte, Register-/Steuerangaben soweit erforderlich.
3. Kanonische Supportadresse: `contact@shareittoo.com` oder separate
   `support@shareittoo.com`.
4. Ist `dmarc@shareittoo.com` als kontrollierte Alias-/Mailbox-Adresse für
   DMARC-Berichte freigegeben?
5. Existieren Apple Developer, Google Play Console und Stripe Business bereits,
   und wer hält Wiederherstellungszugänge/2FA?

## 9. B0-Abnahmestatus

| Kriterium | Status |
|---|---|
| Öffentliche Healthchecks grün | erfüllt |
| Gesunder Quellstand identifiziert | erfüllt |
| Unveränderbarer Baseline-Tag | erfüllt |
| Repository/Branches/PRs inventarisiert | erfüllt |
| Datenbank/Container/Domain/Mail inventarisiert | erfüllt |
| Backups/Monitoring vollständig aktiv verifiziert | erfüllt: drei Timer aktiv, isolierter Restore sowie externe Alarmzustellung bestanden |
| Jede bekannte Launch-Lücke priorisiert, mit Owner und Exit | erfüllt |
| Bestehende lokale Dirty-Änderungen unangetastet | erfüllt |
| Geschäfts-/Launchprioritäten von Walid bestätigt | offen |

Mit B2/B3 sind außerdem `P0-02`, `P0-03`, `P0-04`, `P0-14` und `P1-03`
technisch erfüllt. `P0-01` bleibt bis zum ersten commit-markierten
Produktionsrollout offen; Staging meldet die Release-ID bereits exakt.
