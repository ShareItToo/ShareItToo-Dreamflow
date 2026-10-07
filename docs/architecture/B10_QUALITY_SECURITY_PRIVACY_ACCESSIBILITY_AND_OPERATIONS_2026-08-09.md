# B10 – Qualität, Sicherheit, Datenschutz, Barrierefreiheit und Betrieb

Stand: 9. August 2026
Technischer Status: Staging bestanden, keine offenen P0-Fehler
Produktionsstatus: B10 nicht ausgerollt; bestehende Produktion läuft mit dem bisherigen Image

## Ergebnis

B10 schließt die kritischsten Lücken zwischen einem funktionsfähigen
Marktplatz und einem belastbaren Pilotkandidaten. Der Server bietet einen
echten, geprüften Kontodatenexport, durchgängige Anfragekennungen und
datensparsame strukturierte Protokolle. Release-Oberflächen versprechen keine
noch nicht vorhandene Zwei-Faktor- oder Identitätsprüfung mehr. Clientseitige
KI-Helfer enthalten keinen geheimen API-Schlüssel und bleiben bis zu einem
serverseitig abgesicherten Dienst deaktiviert.

Der vollständige CI-Lauf, die isolierte Staging-Abnahme, die älteren B8- und
B9-Kernflüsse, Sicherung, Wiederherstellung, Alarmzustellung sowie der Wechsel
B10 → B9 → B10 sind bestanden. Es besteht kein offener P0-Fehler. Die unten
aufgeführten P1-Punkte sind fachliche, rechtliche oder physische
Freigabeentscheidungen und dürfen vor Pilot beziehungsweise Store-Release
nicht stillschweigend als erledigt behandelt werden.

Während des ersten Rücksetzversuchs wurde irrtümlich das historische, vor der
Staging-Sicherung entstandene B9-Deployskript ausgeführt. Dadurch wurde der
alte Produktions-Datenbankcontainer kurz mit demselben persistenten Volume
neu erstellt. Das Produktions-API-Image blieb unverändert; Datenbank, Mail und
öffentlicher Healthcheck wurden unmittelbar wieder erfolgreich geprüft. Der
Vorfall, die Wiederherstellung und die zusätzliche Sperre der historischen
Skripte sind vollständig dokumentiert.

## Umgesetzte Schutzmaßnahmen

### Kontodatenexport

`GET /v1/account/export` erzeugt für ein eingeloggtes, aktives Konto eine
serverseitige JSON-Auskunft in einer wiederholbar lesenden
Datenbanktransaktion. Der Endpunkt ist auf drei Abrufe pro Stunde begrenzt,
liefert `private, no-store`, erzeugt einen Audit-Eintrag mit Anfragekennung und
wird in der App über „Meine Daten exportieren“ als Datei geteilt oder
gespeichert.

Enthalten sind die fachlich zuordenbaren Konto-, Sitzungs-, Inserats-,
Buchungs-, Nachrichten-, Upload-, Benachrichtigungs-, Bewertungs-, Melde-,
Blockierungs-, Streit- und Auditdaten. Ausgeschlossen sind insbesondere
Passwort- und Token-Hashes, Stripe-Kunden- und Zahlungsmittelkennungen,
interne Staff-Notizen sowie interne Auflösungen.

### Anfragekorrelation und datensparsame Logs

- Jede Antwort trägt `X-Request-ID`; sichere eingehende Kennungen werden
  übernommen, ungültige durch UUIDs ersetzt.
- 404- und Fehlerantworten nennen dieselbe Anfragekennung.
- CORS stellt Anfragekennung und Export-Dateiname nur erlaubten Ursprüngen
  bereit.
- Strukturierte Request-Logs enthalten Methode, normalisierte Routenvorlage,
  Status, Dauer und Release, aber keine Query, Payload, E-Mail, IP oder Tokens.
- Interne 500er-Logs enthalten Fehlerklasse und Anfragekennung, jedoch weder
  ungefilterte Exception-Nachrichten noch Nutzdaten.

### Ehrliche Release-Oberfläche

- Die erreichbaren lokalen Demo-Wege für Zwei-Faktor- und Identitätsprüfung
  wurden aus Release-Navigation und Hilfetext entfernt.
- Die App erklärt stattdessen eindeutig, dass diese Funktionen noch nicht
  verfügbar sind.
- Die lokale Zwei-Faktor-Demo kann nur noch ohne Backend und außerhalb eines
  Release-Builds erscheinen.
- Der frühere clientseitige `OPENAI_PROXY_API_KEY` wurde entfernt. Alle fünf
  KI-Helfer scheitern geschlossen, solange kein abgesicherter Serverdienst
  konfiguriert ist.

### Lieferkette und CI

- Der Backend-Checkout lädt für den Secret-Scan die vollständige Git-Historie.
- Ein eigener hochpräziser Scan prüft Historie und Arbeitsbaum, ohne einen
  gefundenen Geheimwert auszugeben.
- Produktionsabhängigkeiten werden bei jedem Lauf ab Schweregrad `high`
  auditiert.
- Produktions- und Staging-Compose, Syntax, Tests, commitmarkiertes Image,
  Web-Build und Android-Build bleiben Pflichtgates.
- Das veröffentlichte Image entsteht erst nach grünem Backend- und
  Flutter-Job.

Die Prüfung orientiert sich technisch an OWASP ASVS 5.0.0, OWASP API Security
Top 10 (2023) und den relevanten OWASP-MASVS-Bereichen. Sie ist kein Ersatz für
eine unabhängige Penetrationsprüfung oder eine rechtliche Konformitätsprüfung.

## Qualität und Barrierefreiheit

Die Regression umfasst die bestehenden Buchungs-, Nachrichten-,
Benachrichtigungs-, Bewertungs-, Moderations- und Zahlungsregeln sowie die
neuen B10-Verträge. Der Datenexport wurde zusätzlich bei 200 Prozent
Textskalierung, mit Semantikbaum und Tastaturfokus gerendert. Lade-, Fehler-
und Erfolgsmeldungen sind unterscheidbar, und der Exportknopf besitzt eine
explizite Semantik- und Busy-Beschriftung.

Die technische Prüfung ersetzt noch nicht den abschließenden Test auf echten
iOS- und Android-Geräten mit VoiceOver beziehungsweise TalkBack, verschiedenen
Displaygrößen und den finalen Store-Builds. Dieser verbleibt als P1-Gate vor
Store-Freigabe.

## Automatische Nachweise

Implementierungs-Commit:
`399d867912afc217fde4ae815192667c50cd5175`.

Vollständiger GitHub-Lauf:
[GitHub Actions `31303768195`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/31303768195).

- Backend: 54 von 54 Tests bestanden, einschließlich echter
  PostgreSQL-16-Integration und Kontodatenexport.
- Abhängigkeitsaudit: keine bekannte Produktionsschwachstelle gefunden.
- Secret-Scan: kein hochwahrscheinliches Geheimnis in Git-Historie oder
  Arbeitsbaum gefunden.
- Flutter: 162 Tests bestanden.
- Analyse: keine neue Regression; bekannte Hinweisbasis unverändert 696.
- Web-Debug-Build und Android-Debug-APK bestanden.
- Wasm-Trockenlauf: nur bereits bekannte Hinweise aus dem externen
  `image`-Paket.

Unveränderlicher Registry-Digest und Staging-Image-ID:
`sha256:11dfa162a1e614fbf3e69d31ea943507ba09d77215c4926f346208f30292d69f`.

## Isolierte Staging-Abnahme

Staging läuft im eigenen Compose-Projekt `sit-staging` mit eigener
PostgreSQL-16-Datenbank sowie eigenen Datenbank- und Uploadvolumes. Der
Release-Commit wird von `/version` exakt ausgegeben.

Die B10-Abnahme erzeugte zwei ausschließlich dafür bestimmte Konten, ein
Inserat, eine Buchung und einen Nachrichtenverlauf. Bestätigt wurden:

- Sicherheitsheader und Ablehnung eines nicht freigegebenen CORS-Ursprungs;
- durchgängige, sichere Anfragekennungen;
- nicht cachebarer Datenexport ohne verbotene interne Felder;
- genau ein Audit-Eintrag für den Export;
- erfolgreiche Bereinigung aller aktiven Testkonten;
- keine Rate-Limit-Fehler unter der kontrollierten Parallelprobe.

| Bereich | parallele Abrufe | p95 | Grenzwert | Ergebnis |
|---|---:|---:|---:|---|
| Liveness | 25 | 22,5 ms | 500 ms | bestanden |
| Suche/Feed | 25 | 122,0 ms | 750 ms | bestanden |
| verarbeitetes Bild | 25 | 40,9 ms | 750 ms | bestanden |
| Chat | 25 | 85,6 ms | 750 ms | bestanden |
| Buchungen | 25 | 123,1 ms | 750 ms | bestanden |
| ungültiger Zahlungs-Webhook | 25 | 33,1 ms | 1.000 ms | bestanden |

Live-Nachweis:
`/docker/sit-staging/backups/b10-live-acceptance-20260809T084137Z.json`.

Die vollständigen B8-Zahlungs- und B9-Moderationsflüsse wurden anschließend
auf demselben B10-Image erneut bestanden:

- `/docker/sit-staging/backups/b10-regression-b8-20260809T084218Z.json`
- `/docker/sit-staging/backups/b10-regression-b9-20260809T084220Z.json`

## Sicherung, Restore, Alarm und Rückfall

Vor dem Rollout wurden Staging-Datenbank, Uploads, Prüfsummen,
Umgebungsprüfsumme, Releasezustand und Produktionsinvariante unter
`/docker/sit-staging/backups/pre-b10-20260809T083553Z` gesichert.

Die Sicherung wurde in einer getrennten PostgreSQL-16-Instanz und einem
temporären Uploadverzeichnis wiederhergestellt. 44 öffentliche Tabellen und
28 Uploaddateien wurden verifiziert; temporäre Ressourcen wurden entfernt.

Restore-Nachweis:
`/docker/sit-staging/backups/restore-checks/restore-check-20260809T083727Z-516489.json`.

Der kontrollierte Alarm `b10-controlled-staging-alert` wurde ohne Abschaltung
eines Dienstes über den real konfigurierten SMTP-Weg zugestellt. Keine
Zugangsdaten erschienen in Argumenten oder Nachweis.

Alarmnachweis:
`/docker/sit-staging/backups/b10-controlled-alert-20260809T083758Z.json`.

Der abgesicherte Rückfall wechselte B10 auf das B9-Image
`37b256e331fd70b11333eb1b144f7803715b068e`, bestand die vollständige
B9-Abnahme und stellte danach exakt B10 wieder her. Die erneute B10-Abnahme
bestand einschließlich Lastwerten und Bereinigung. Das Produktions-Image
blieb bei diesem abgesicherten Wechsel bitgenau unverändert.

- Rückfall: `/docker/sit-staging/backups/b10-safe-rollback-acceptance-20260809T084537Z.json`
- Wiederhergestelltes B10: `/docker/sit-staging/backups/b10-restored-acceptance-20260809T084606Z.json`
- Gesamtnachweis: `/docker/sit-staging/backups/b10-evidence-20260809T084642Z.json`

## Produktionsvorfall beim ersten Rücksetzversuch

Am 9. August 2026 um 08:42:43 UTC wurde für den ersten Rücksetzversuch das
historische B9-Deployskript aus dessen Releaseverzeichnis gestartet. Dieses
Artefakt entstand vor der dauerhaften Projektnamenkorrektur und verwendete
erneut das Produktionsprojekt `backend`. Compose entfernte dadurch den alten
Produktions-Datenbankcontainer und brach am bereits belegten
Staging-Containernamen ab.

Der Produktions-Datenbankcontainer wurde sofort mit demselben PostgreSQL-16-
Image und demselben Volume `shareittoo_postgres_data` wieder erstellt. Das
Produktions-API-Image blieb unverändert bei
`sha256:db30af4c03512ca774d6ca275620bdef2becb0b6269d67d1514d27170c1af0d7`;
auch das Uploadvolume blieb `shareittoo_uploads`. Öffentlicher Healthcheck,
Datenbank und Mail meldeten anschließend `ok`. Die vorhandenen aggregierten
Bestände waren wieder erreichbar. Es wurde kein B10-Code und keine neue
Migration in Produktion ausgeführt und kein Datenvolume gelöscht. Es gab
jedoch eine kurze Produktionsunterbrechung der Datenbank, weshalb der Vorfall
nicht als „Produktion unberührt“ bezeichnet wird.

Wiederherstellungsnachweis:
`/docker/sit-staging/backups/b10-production-recovery-20260809T084509Z.json`.

Zusätzlich zur bereits im aktuellen Code erzwungenen Projekttrennung wurden
die vier historischen unsicheren Deployskripte auf dem VPS nicht ausführbar
gesetzt. Sie bleiben lesbar und als Releasebeleg erhalten. Alle künftigen
Rollouts und Rückfälle müssen über den aktuellen abgesicherten Harness
erfolgen; das Zielimage darf historisch sein, das ausführende Deployskript
nicht.

Härtungsnachweis:
`/docker/sit-staging/backups/b10-historical-deploy-hardening-20260809T084815Z.json`.

## Offene P1-Gates

Vor einem echten Produktionspilot oder Store-Release müssen verbindlich
entschieden beziehungsweise physisch geprüft werden:

- konkrete Aufbewahrungs- und Löschfristen für Finanzdaten, Streitbeweise,
  Audits, Benachrichtigungen und Nachrichten;
- finale Datenschutzerklärung, AGB sowie Verantwortlichen-/Kontaktangaben;
- KYC-Anbieter, Datenverarbeitungsvereinbarung und Löschprozess;
- echte serverseitige MFA einschließlich Wiederherstellungsweg;
- Support-/Moderations-SLA und verbindlicher Grundkatalog;
- Stripe-Pilotgruppe und ausdrückliche Freigabe für echtes Geld;
- abschließende VoiceOver-/TalkBack- und Geräteprüfung der Store-Builds;
- unabhängiger Penetrationstest vor breiter öffentlicher Nutzung.

Diese Punkte sind keine stillen technischen Freigaben. Insbesondere bleiben
Stripe-Livebetrieb, echte Zahlungen und B10-Produktion bis zu einer
ausdrücklichen geschützten Freigabe gesperrt.

## Nächster Hauptblock

B11 führt die Produkt- und Releasevorbereitung zusammen: verbindliche
Pilotentscheidungen, finaler Rechts- und Supportinhalt, echte Geräteprüfung,
Store-Metadaten und -Builds, kontrollierte Pilotkonten, produktionsnaher
Abnahmelauf ohne Echtgeld sowie die explizite Go-/No-Go-Vorlage für den ersten
Produktionspilot.
