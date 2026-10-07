# B9 – Vertrauen, Moderation, Administration und Bewertungen

Stand: 9. August 2026  
Technischer Status: Staging bestanden  
Produktionsstatus: B9 nicht ausgerollt; kurzer unbeabsichtigter Neustart mit demselben alten Image vollständig behoben

## Ergebnis

B9 macht Meldungen, Beweise, Sperren, Moderationsmaßnahmen und Bewertungen
serverautoritativ. Support und Administration arbeiten nicht mehr auf lokalen
App-Zuständen. Jede sensible Fallbearbeitung benötigt eine kurzlebige, an die
aktive Sitzung gebundene erneute Passwortbestätigung und erzeugt eine
unveränderliche Auditspur.

Die technische Staging-Abnahme ist vollständig bestanden. Produktion erhielt
weder B9-Code noch Migration 008. Während des ersten Staging-Aufrufs kam es
jedoch durch einen Compose-Projektnamenskonflikt zu einem kurzen Neustart der
beiden alten Produktionscontainer. Produktion wurde sofort mit demselben
API-Image und denselben persistenten Volumes wiederhergestellt. Datenbank,
API und öffentlicher Healthcheck sind gesund. Der Vorfall und die dauerhafte
technische Gegenmaßnahme sind unten dokumentiert.

## Architekturentscheidung

- Meldungen sind versionierte Serverobjekte für Nutzer, Inserat, Buchung,
  Nachricht oder Bewertung. Pro meldender Person und Ziel kann nur ein aktiver
  Fall bestehen; Wiederholungen sind idempotent.
- Beweise werden als private `report_evidence`-Uploads an genau einen Fall
  gebunden. Zugriff ist nur für eingeloggte Support-/Admin-Sitzungen mit
  Step-up möglich, wird auditiert und mit `private, no-store` ausgeliefert.
- Fallereignisse und Moderationsaktionen sind append-only. Datenbanktrigger
  lehnen nachträgliches Ändern oder Löschen ab.
- Support darf Fälle sichten, zuweisen und untersuchen, aber keine endgültige
  Maßnahme verhängen. Admins dürfen dokumentierte, reversible Maßnahmen
  ergreifen und Fälle abschließen.
- Nutzerbeschränkungen gelten getrennt für Konto, Inserate, Buchungen,
  Nachrichten und Auszahlungen. Aufhebung und zeitlicher Ablauf sind
  serverseitig und auditiert.
- Moderierte Inserate bleiben auch für ältere Rollback-Images unsichtbar. Die
  Rücknahme stellt den vorherigen betrieblichen Zustand und die
  Katalogrevision kontrolliert wieder her.
- Bewertungen sind erst nach einer vollständig abgeschlossenen Buchung
  möglich. Vermieter und Mieter dürfen jeweils genau einmal bewerten.
  Grundlage sind ausschließlich Kommunikation, Zuverlässigkeit,
  Artikel-wie-beschrieben und Übergabe/Rückgabe.
- Öffentliche Bewertungswerte werden aus veröffentlichten Serverbewertungen
  neu berechnet. Private Kontakt- und interne Moderationsdaten erscheinen
  nicht in öffentlichen Profilen.

## Serververtrag

Die wichtigsten neuen Endpunkte sind:

- `POST /v1/reports`
- `GET /v1/reports/mine`
- `POST /v1/messages/:id/reports`
- `POST /v1/bookings/:id/reviews`
- `GET /v1/users/:id/reviews`
- `GET /v1/listings/:id/reviews`
- `GET /v1/bookings/:id/reviews`
- `GET|PUT|DELETE /v1/user-blocks`
- `POST /v1/admin/step-up`
- `GET /v1/admin/overview`
- `GET|PATCH /v1/admin/reports`
- `GET /v1/admin/users`
- `GET /v1/admin/listings`
- `GET /v1/admin/bookings`
- `GET /v1/admin/payments`
- `GET /v1/admin/audit`
- `POST /v1/admin/users/:id/suspensions`
- `POST /v1/admin/suspensions/:id/lift`
- `PATCH /v1/admin/listings/:id/moderation`
- `GET /v1/admin/evidence/:id`

Sensible Admin-Zahlungsaktionen aus B8 verlangen nun ebenfalls das
kurzlebige Step-up-Token.

## Zustände und Schutzregeln

### Meldungen

Der kanonische Ablauf lautet `open → triaged → investigating → actioned →
closed`. Admins können einen unbegründeten Fall auch `dismissed` markieren.
Abschluss, Verwerfung und Maßnahme verlangen eine strukturierte Auflösung.
Zuweisung, Statuswechsel, Notiz, Maßnahme und Rücknahme werden getrennt
protokolliert.

### Sperren und Moderation

Eine aktive Bereichssperre wird vor dem eigentlichen Fachablauf geprüft. Neue
Buchungen, Nachrichten, Inseratsaktionen oder Auszahlungen sind damit nicht
nur in der Oberfläche, sondern im Backend blockiert. Gegenseitige
Nutzerblockierungen verhindern neue Buchungen und Kommunikation. Bestehende
rechtlich oder finanziell relevante Datensätze bleiben erhalten.

Inserate besitzen zusätzlich zu ihrem Betriebsstatus den unabhängigen
Moderationsstatus `active`, `hidden` oder `removed`. Der vor der Maßnahme
gültige Status wird gespeichert. Wiederherstellung erhöht die
Katalogrevision, damit der alte Rollback-Schutz die Änderung nicht als
veralteten Clientzugriff quarantänisiert.

### Bewertungen

Die vier Kriterien müssen vollständig und mit ganzzahligen Sternen von 1 bis
5 übermittelt werden. Der Server berechnet daraus eine Bewertung mit einer
Nachkommastelle. Offene Buchungsfälle oder Streitfälle blockieren die
Bewertung. Doppelte Einsendungen derselben Rolle werden als idempotente
Wiederholung behandelt.

## Persistenz

Migration `008_b9_moderation_and_reviews.up.sql` ergänzt unter anderem:

- Priorität, Referenz, Version und letzten Ereigniszeitpunkt für Meldungen;
- private Fallbeweise mit restriktiven Fremdschlüsseln;
- unveränderliche Fallereignisse und Moderationsaktionen;
- kurzlebige, gehashte und sitzungsgebundene Staff-Elevations;
- fallgebundene und idempotente Nutzersperren;
- Moderationsstatus sowie vorherigen Betriebszustand für Inserate;
- serverautoritatives Bewertungsziel, Richtung, Kriterien, Version und
  Veröffentlichungsstatus;
- Unique-Indizes gegen aktive Doppelmeldungen und doppelte Rollenbewertungen;
- Append-only-Trigger für Fall- und Maßnahmenhistorie.

Repository- und Staging-Prüfsumme der Migration:
`c824377cb2f4b507ebbead3367ea885190f6114b1dc62c2eecc2e55991fca549`.

## App

Die Flutter-App besitzt nun:

- echte Beweisbildauswahl und privaten Upload beim Melden;
- backendgebundene Meldungen und Bewertungen im Realmodus;
- lokale Speicherung nur noch in der ausdrücklich aktivierten QA-Spur;
- öffentliche Bewertungen aus dem Serverbestand;
- ein Support-/Admin-Dashboard für Übersicht, Fälle, Nutzer, Inserate,
  Buchungen, Zahlungen und Audit;
- erneute Passwortbestätigung vor sensibler Staff-Arbeit;
- reversible Admin-Aktionen für Inserate und Nutzersperren;
- einen nur für Staff sichtbaren Einstieg in den Kontoeinstellungen.

Step-up-Tokens werden ausschließlich im Arbeitsspeicher gehalten und nicht
dauerhaft auf dem Gerät gespeichert.

## Automatische Nachweise

Endgültiger technischer Implementierungslauf:
[GitHub Actions `31300665636`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/31300665636)
für Commit `37b256e331fd70b11333eb1b144f7803715b068e`.

- Backend: 51 Tests in CI vollständig bestanden, einschließlich echter
  PostgreSQL-16-Integration und Migration 008.
- Flutter: 159 Tests bestanden.
- Analyse: keine neuen Fehler; die bekannte Hinweisbasis sank auf 696.
- Web-Debug-Build und Android-Debug-APK bestanden.
- Produktions- und Staging-Compose sowie commitgebundener Image-Build
  bestanden.
- Das API-Image wurde erst nach grünem Backend- und Flutter-Job
  veröffentlicht.

Unveränderlicher Registry-Digest und Staging-Image-ID:
`sha256:9cf78f66b1e1e9c15a888f1e5ed9c2898fa588aaf1b7cd740efa5f4628610a6f`.

## Isolierte Staging-Abnahme

Vor dem Rollout wurden Datenbank, Uploads, Staging-Version sowie Staging- und
Produktionscontainerzustand unter
`/docker/sit-staging/backups/pre-b9-20260809T071601Z` gesichert. Alle
Prüfsummen wurden verifiziert.

Erster B9-Release-Nachweis:
`/docker/sit-staging/backups/releases/staging-20260809T072522Z-37b256e331fd.json`.

Die vollständige Abnahme bestätigte mit fünf ausschließlich dafür erzeugten
und anschließend geschlossenen Konten:

- getrennte Support- und Adminsicht ohne E-Mail-Offenlegung an Support;
- kurzlebige, sitzungsgebundene Passwort-Step-ups;
- Beweisupload, Fallanlage und idempotente Wiederholung;
- Support-Triage sowie technische Ablehnung einer Support-Maßnahme;
- Admin-Untersuchung, Maßnahme, Abschluss und unveränderlichen Fallverlauf;
- privaten, nicht cachebaren und auditierten Evidenzzugriff;
- Verbergen und vollständige Wiederherstellung eines öffentlichen Inserats;
- Buchungsbereichssperre und kontrollierte Aufhebung;
- Nutzerblockierung und Entblockierung;
- zwei veröffentlichte Bewertungen nach abgeschlossener Buchung und
  Unterdrückung der Doppeleinsendung;
- alle sieben Staff-Ansichten;
- Ablehnung nachträglicher Änderungen an Fallereignissen und Maßnahmen;
- null aktive B9-Abnahmekonten, Inserate, Fälle, Sperren und Blockierungen
  nach Bereinigung.

Nachweis:
`/docker/sit-staging/backups/b9-live-acceptance-20260809T073307Z.json`.

## Rückfall und Restore

Das vorherige B8-Image `0f058ee256ff8d7f7174e355bc3b22449965be35`
startete gesund auf dem additiven B9-Schema. Migration 008 blieb genau einmal
vorhanden. Danach wurde B9 aus demselben unveränderlichen Image wieder
hergestellt und die vollständige B9-Abnahme erneut bestanden.

Rückfall- und Wiederherstellungsnachweise:

- `/docker/sit-staging/backups/releases/staging-20260809T073351Z-0f058ee256ff.json`
- `/docker/sit-staging/backups/releases/staging-20260809T073436Z-37b256e331fd.json`
- `/docker/sit-staging/backups/b9-rollback-acceptance-20260809T073436Z.json`

Die Vor-B9-Sicherung wurde zusätzlich in PostgreSQL 16 mit separatem
temporärem Container, Volume und Uploadverzeichnis wiederhergestellt. Sie
enthielt 40 öffentliche Tabellen, sieben Migrationen, acht Uploaddateien und
erwartungsgemäß noch keine Migration 008. Alle temporären Ressourcen wurden
entfernt.

Restore-Nachweis:
`/docker/sit-staging/backups/restore-checks/restore-check-b9-20260809T071651Z-452647.json`.

Gesamtnachweis:
`/docker/sit-staging/backups/b9-evidence-20260809T073854Z.json`.

## Produktionsvorfall und dauerhafte Gegenmaßnahme

Beim ersten Staging-Deploy am 9. August 2026 um 07:22:40 UTC wurde das
Compose-Projekt ohne festen Staging-Projektnamen gestartet. Compose verwendete
dadurch den bereits von Produktion belegten Projektnamen `backend`, entfernte
die beiden alten Produktionscontainer und brach anschließend am bereits
belegten Staging-Containernamen ab.

Produktion wurde sofort aus dem vorhandenen `backend-api:latest` mit exakt
demselben API-Image
`sha256:db30af4c03512ca774d6ca275620bdef2becb0b6269d67d1514d27170c1af0d7`
und denselben Datenbank-/Uploadvolumes neu erstellt. Es wurde kein B9-Image
gestartet, keine B9-Migration ausgeführt und kein Produktionsdatensatz
absichtlich verändert. PostgreSQL, API und öffentlicher Healthcheck waren nach
der Wiederherstellung grün. Durch die Neuerstellung änderte sich jedoch die
Containeridentität und es gab einen kurzen Produktionsneustart; Produktion
war daher nicht technisch „unberührt“.

Vorfallnachweis:
`/docker/sit-staging/backups/b9-production-recovery-20260809T072500Z.json`.

Die dauerhafte Korrektur ist Commit
`2cc346de00abd6a1abf42baa63d5efd64a7274ce`: Das Release-Skript erzwingt nun
für Staging `sit-staging` und für Produktion `backend` per
`docker compose --project-name`. Ein Umgebungswert kann diese Trennung nicht
mehr versehentlich überschreiben.

## Offene fachliche Gates

Vor einem B9-Produktionspilot müssen außerhalb des Codes verbindlich
festgelegt werden:

- konkrete Meldegründe, Beweisregeln und Prioritätsstufen;
- Supportkanal, Reaktionszeiten und Eskalationsweg;
- Einspruchs- und Wiederaufnahmeprozess;
- welche Admin-Maßnahmen bei welchem Verstoß zulässig sind;
- Dauer und Kommunikation von Bereichs- und Kontosperren;
- Aufbewahrungsdauer für Fallbeweise und Auditdaten;
- Verantwortliche für Datenschutzanfragen und Moderationsfreigaben.

Bis diese Regeln beschlossen und ein kontrollierter Produktionspilot
freigegeben sind, ist B9 als **technisch im Staging bestanden**, aber nicht als
**in Produktion ausgerollt** zu bezeichnen. Der nächste technische Hauptblock
ist B10: Qualität, Sicherheit und Beobachtbarkeit.
