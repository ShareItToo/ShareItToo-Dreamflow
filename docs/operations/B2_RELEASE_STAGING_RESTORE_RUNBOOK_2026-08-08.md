# B2 Umgebungen, Releaseweg und Betrieb

Stand: 8. August 2026

## Ziel und Gate

Jede ShareItToo-Version muss aus einem sauberen Commit reproduzierbar gebaut,
in einer isolierten Staging-Umgebung geprüft, eindeutig identifiziert,
kontrolliert ausgerollt, beobachtet und auf ein vorheriges Image
zurückgerollt werden können. Backups gelten erst als belastbar, wenn eine
isolierte Wiederherstellung nachweislich erfolgreich war.

B2 ist erst abgeschlossen, wenn alle Nachweise in der Abnahmetabelle auf
`bestanden` stehen. Repository-Artefakte allein beweisen noch kein erfolgreiches
Staging, Restore oder Rollback auf dem VPS.

## Trennung der Umgebungen

| Bereich | Lokal/CI | Staging | Produktion |
|---|---|---|---|
| Compose | Entwickler/CI | `backend/compose.staging.yml` | `backend/compose.prod.yml` |
| Datenbank | Testfixture/temporär | `shareittoo_staging` | `shareittoo` |
| Secrets | lokale Testwerte | `.env.staging`, nie in Git | `.env`, nie in Git |
| Uploads | lokal/temporär | `shareittoo_staging_uploads` | `shareittoo_uploads` |
| Mail | memory/disabled | standardmäßig memory; SMTP nur ausdrücklich für geschlossene Endgeräte-Abnahme | Google Workspace SMTP |
| API | Testprozess | zunächst nur `127.0.0.1:18080` | `https://shareittoo.com/api` |

Staging darf niemals Produktionsdaten, Produktions-JWT-Secrets,
Produktionspasswörter oder echte Zahlungsmodi verwenden. Ein späterer
öffentlicher Staging-Hostname wird nur mit HTTPS und Zugangsschutz aktiviert.

## Unveränderliche Release-Kennung

Der Release-Build erhält:

- per Digest festgeschriebene Node- und PostgreSQL-Basisimages;
- ein Image-Tag mit vollständigem 40-stelligem Git-Commit;
- OCI-Labels für Version, Commit, Commit-Zeitpunkt und Quellrepository;
- dieselben Werte im Container als Laufzeitumgebung;
- eine maschinenlesbare Ausgabe unter `/version` und allen Health-Endpunkten.

Dependabot prüft wöchentlich GitHub-Actions, Docker-Basisimages und
Backend-Abhängigkeiten. Aktualisierungen durchlaufen denselben CI- und
Reviewweg; Digests werden nicht unkontrolliert auf schwebende Tags gelockert.

Ein Rollout wird abgebrochen, wenn das Image-Label nicht mit dem angeforderten
Commit übereinstimmt oder der laufende `/version`-Endpunkt nach dem Rollout
nicht exakt denselben Commit meldet.

## CI-Pflichtgate

Der GitHub-Workflow `regression` enthält drei aufeinander abgestimmte Jobs:

1. Backend: gesperrte pnpm-Abhängigkeiten, alle Node-Tests, Syntaxprüfung aller
   Quell- und Betriebsskripte und Build eines commit-markierten API-Images.
2. Flutter: Analyse gegen den dokumentierten Altlasten-Baselinewert, alle
   Flutter-Tests, Web-Debug-Build und Android-Debug-Build.
3. Veröffentlichung: nur nach beiden erfolgreichen Regressionsjobs wird ein
   API-Image mit dem vollständigen Commit-Tag gebaut, dessen OCI-Revision
   geprüft und das Image in die GitHub Container Registry übertragen.

Ein fehlerhafter Job verhindert einen grünen Gesamtstatus. Der Branchschutz
für `main` und die verbindliche PR-Freigabe bleiben als P1-Gate offen, bis sie
auf GitHub aktiviert wurden.

## Standardablauf Staging

1. Sauberen, CI-grünen Commit auswählen.
2. Mit `backend/ops/build_release_image.sh` das exakt bezeichnete Image bauen.
3. Separate `.env.staging` aus `.env.staging.example` mit unabhängigen
   Geheimnissen anlegen.
4. `backend/ops/deploy_release.sh staging <FULL_COMMIT>` ausführen.
5. `/version`, `/health/live`, `/health/ready` und `/health` prüfen.
6. Registrierung, Anmeldung und Verifizierung ausführen. Im normalen
   Staging-Betrieb bleibt Mail auf `memory`; für eine geschlossene
   Endgeräte-Abnahme darf der bereits IP-freigegebene Google-Workspace-Relay
   ohne Produktionspasswort ausdrücklich zugeschaltet werden. Danach Upload,
   Inserat, Buchungsanfrage und Nachrichten-Smoke-Test ausführen.
7. Containerzustand, Logs, CPU/RAM, Datenbank und Speicher prüfen.
8. Den vorherigen Commit über den **aktuellen, als sicher freigegebenen
   Deploy-Harness** ausrollen und Version, Health und Kern-Smoke-Test
   wiederholen. Das Zielimage darf historisch sein; das Deployskript aus einem
   historischen Release darf niemals ausgeführt werden, weil es vor späteren
   Umgebungsschutzmaßnahmen entstanden sein kann.
9. Den freigegebenen Commit erneut ausrollen. Beide Wechsel werden mit den
   JSON-Releasebelegen dokumentiert.

## Standardablauf Produktion

1. Freigegebenen Staging-Commit und grünen CI-Lauf festhalten.
2. Aktuellen Produktions-Commit über `/api/version` und vorheriges Image
   dokumentieren.
3. Hostinger-Snapshotzustand sowie lokalen täglichen Backupzustand prüfen.
4. `CONFIRM_PRODUCTION_DEPLOY` auf den exakten neuen Commit setzen und den
   Produktionsrollout starten. Das Skript erstellt zuerst ein neues Backup.
5. Auf Container-Health warten; danach `/api/version`, `/api/health/ready`,
   `/api/health`, Website und einen nicht mutierenden API-Smoke-Test prüfen.
6. Logs und Ressourcen unmittelbar sowie nach 5, 15 und 30 Minuten prüfen.
7. Bei einem Gate-Fehler keine weiteren Migrationen oder Nutzeraktionen
   auslösen, sondern auf den vorherigen Commit zurückrollen.
8. Nach bestandenem Erstrollout und Restore-Nachweis die Health-Gates
   `REQUIRE_RELEASE_IDENTITY=true` und `REQUIRE_RECENT_RESTORE_CHECK=true`
   aktivieren.

## Backup- und Restore-Nachweis

`backend/ops/verify_restore.sh` arbeitet ausschließlich mit einer temporären
PostgreSQL-Instanz, einem temporären Docker-Volume und einem per `mktemp`
erzeugten Uploadverzeichnis. Es prüft Prüfsummen, Dump-Struktur, tatsächliche
Wiederherstellung, vorhandene Tabellen und die Entpackbarkeit der Uploads.
Alle temporären Ressourcen werden auch bei Fehlern entfernt. Der
Produktionscontainer und sein Datenvolume werden nicht angesprochen.

Der wöchentliche Timer läuft sonntags um 03:30 UTC mit zufälliger Verzögerung.
Vor seiner Aktivierung werden Service und Skript einmal manuell erfolgreich
ausgeführt und das erzeugte JSON-Protokoll gesichert.

## Verifizierter B2-Lauf vom 8. August 2026

- Sauberer Release-Commit: `dd9aade7301a06669df3cf9b61406223e977cae0`.
- GitHub-CI-Lauf `31274627559`: Backend, Flutter und Image-Veröffentlichung
  vollständig erfolgreich.
- Staging läuft als separates Hostinger-Projekt `sit-staging` mit eigener
  PostgreSQL-Datenbank, eigenen Volumes, eigenen Secrets und Memory-Mailmodus.
- Staging-Image-ID:
  `sha256:df6fdbd4e57a8d2f914e4db50221de24e341cdbcc4ea27d5c88e99e2c7f84fcd`;
  OCI-Revision und `/version` melden exakt den Release-Commit.
- Interne Staging-Adresse: `http://127.0.0.1:18080`. `/health/live` und
  `/health/ready` melden `ok`; Datenbank und Mailprüfung sind erfolgreich.
- Rollback-Probe: Wechsel auf
  `5cb8fe7cacde8af8da0747578370fd923ec028b8`, erfolgreicher Readiness-Test,
  danach erneuter Wechsel auf `dd9aade7301a06669df3cf9b61406223e977cae0`
  und erfolgreicher Readiness-Test.
- Isolierter Restore: Backup `20260808T155836Z`, Prüfsummen korrekt,
  acht öffentliche Datenbanktabellen und null vorhandene Uploaddateien
  wiederhergestellt. Nachweis:
  `/docker/shareittoo/backups/restore-checks/restore-check-20260808T194356Z-4145166.json`.
- `shareittoo-backup.timer`, `shareittoo-health.timer` und
  `shareittoo-restore-check.timer` sind aktiviert und aktiv. Der Restore-Check
  läuft wöchentlich; der Healthcheck läuft alle fünf Minuten.
- Produktion wurde für diesen Nachweis nicht ausgerollt oder verändert und
  blieb gesund.
- Kritische Fehler von Health-, Backup- und Restore-Prüfung lösen nun über
  `shareittoo-alert@.service` eine externe E-Mail an
  `contact@shareittoo.com` aus. Der Dienst begrenzt Wiederholungen je Ursache
  auf einmal pro Stunde und unterstützt sowohl authentifiziertes SMTP als
  auch den eingesetzten, per VPS-IP freigegebenen Google-Workspace-Relay.
  Installation, Unit-Prüfung und eine echte Testzustellung waren am
  8./9. August 2026 erfolgreich (`alert_test_rc=0`).

Hostingers Docker Manager zieht bei einer Compose-Bereitstellung zunächst
Images und baut den `build`-Abschnitt nicht zuverlässig selbst. Der
Staging-Nachweis nutzte deshalb einen direkt auf dem VPS aus dem exakten
Git-Commit gebauten Image-Tag mit `pull_policy: never`. Dadurch blieb der Build
trotzdem reproduzierbar und eindeutig überprüfbar, ohne ein Registry-Secret in
Hostinger zu hinterlegen oder das Paket öffentlich zu machen.

## Verifizierter B11-Staging-Folgerollout vom 9. August 2026

- Der vollständig grüne GitHub-Actions-Lauf `31313881656` veröffentlichte den
  Commit `281d34e147b96667d6a8c12c45dbedd3e60cca56` als
  `sha256:e19621042205e096698a9ec945d29793a5c963707f9589b3989c4e4ecc77070e`.
- Der Registry-Digest wurde auf dem VPS gezogen, commitgebunden getaggt und
  vor dem Rollout gegen die OCI-Revision geprüft.
- Der aktuelle gehärtete Deploy-Harness wechselte ausschließlich das
  Compose-Projekt `sit-staging` von `a37e681ce18c62981992e168965e68b80fc86ff2`
  auf `281d34e147b96667d6a8c12c45dbedd3e60cca56`.
- `/version`, alle Health-Endpunkte und die neuen öffentlichen
  Pflichtseiten-API-Routen bestanden intern und über den bestehenden
  Staging-API-Pfad. Der Releasebeleg liegt unter
  `/docker/shareittoo/releases/staging-20260809T131142Z-281d34e147b9.json`.
- Staging blieb bei Memory-Mail, -Push und -Payment sowie
  `STRIPE_LIVEMODE=false`. API und PostgreSQL sind gesund; die neuen Logs sind
  ohne relevante Fehler.
- Produktion und Caddy blieben nachweislich unverändert. Insbesondere blieb
  die Caddyfile-Prüfsumme
  `4aea918ebb07f3bd52c17342172b24bb3a7df3c17dc4be0afe749de940f5d44d`
  identisch. Root-Routen wurden nicht veröffentlicht.

## Rollback-Regel

- Es wird ausschließlich auf ein bereits gebautes, commit-markiertes Image
  zurückgerollt.
- Rollback verwendet immer den aktuellen freigegebenen Deploy-Harness und nie
  das Skript aus dem Zielrelease. Historische unsichere Skripte bleiben als
  Nachweis lesbar, sind auf dem VPS aber nicht ausführbar.
- Datenbankmigrationen benötigen vorab eine eigene Vorwärts- und
  Rückwärtsstrategie. Ohne sichere Rückwärtsmigration wird die Anwendung
  kompatibel vorwärts repariert und das Backup nur nach Incident-Entscheidung
  wiederhergestellt.
- Ein Restore überschreibt niemals spontan die Produktionsdatenbank. Zuerst
  erfolgt ein isolierter Restore und Datenabgleich.
- Nach Rollback müssen Version, Readiness, Website und Kern-Smoke-Test erneut
  bestehen.

## Abnahmenachweise

| Nachweis | Aktueller Stand | Ergebnis |
|---|---|---|
| Release-Metadaten im Code und Image | Commit, Image-ID, OCI-Revision und `/version` stimmen überein | bestanden |
| Backend- und Flutter-CI | Lauf `31274627559`, einschließlich Image-Veröffentlichung | bestanden |
| Staging aus sauberem Commit | separates Hostinger-Projekt aus Commit `dd9aade` | bestanden |
| Staging Health und Basissmoke-Test | Container gesund; Liveness, Readiness, DB und Mail `ok` | bestanden |
| Rollback-Probe Staging | `dd9aade` → `5cb8fe7` → `dd9aade`, jeweils gesund | bestanden |
| Täglicher Backup-Timer aktiv | aktiviert, aktiv und nächster Lauf terminiert | bestanden |
| Isolierter Restore erfolgreich | Backup `20260808T155836Z`, acht Tabellen wiederhergestellt | bestanden |
| Produktions-Version meldet Commit | Code vorbereitet, noch nicht ausgerollt | offen |
| Kritische Alarmzustellung | On-Failure-Units installiert; echte Zustellung an `contact@shareittoo.com` erfolgreich | bestanden |
| Fehlerquoten-/Webhook-Signale | wird mit den entsprechenden Zahlungs-/Webhook-Endpunkten ergänzt; heute existiert noch kein produktiver Payment-Webhook | offen |

## Maximus-Checkpoint

Nach vollständigem B2-Gate erhält Maximus Ergebnis, Commits/PR/Build,
CI-Nachweise, Staging-/Restore-/Rollback-Protokolle, Produktionsstatus,
Risiken, Rückfallweg und den Eintritt in B3. Keine Secrets oder internen
Zugangsdaten werden übertragen.
