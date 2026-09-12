# B3 — Buchungs-, Daten- und Berechtigungsfundament

Stand: 9. August 2026

Branch: `codex/master-workflow-20260808`

## Ergebnisziel

B3 macht Buchungen, Geldbeträge, Zeiträume und private Daten technisch
eindeutig. Kritische Werte liegen nicht mehr nur in flexiblem JSON. Eine
verbindliche Datenbankregel verhindert, dass derselbe Gegenstand für
überlappende Zeiträume zweimal angenommen wird.

## Datenmodell

```mermaid
erDiagram
  USERS ||--o{ LISTINGS : owns
  USERS ||--o{ BOOKINGS : rents_or_owns
  LISTINGS ||--o{ BOOKINGS : receives
  LISTINGS ||--o{ LISTING_AVAILABILITY_RULES : follows
  LISTINGS ||--o{ LISTING_AVAILABILITY_BLOCKS : blocks
  BOOKINGS ||--o{ BOOKING_EVENTS : records
  BOOKINGS ||--o{ PAYMENTS : has
  PAYMENTS ||--o{ REFUNDS : has
  BOOKINGS ||--o{ PAYOUTS : creates
  BOOKINGS ||--o{ DISPUTES : can_have
  BOOKINGS ||--o{ REVIEWS : can_have
  BOOKINGS ||--|| RENTAL_REQUESTS : mirrors_legacy_contract
  RENTAL_REQUESTS ||--o| MESSAGE_THREADS : opens
  MESSAGE_THREADS ||--o{ MESSAGES : contains
  MESSAGE_THREADS ||--o{ UPLOADS : protects
  USERS ||--o{ REPORTS : submits
  USERS ||--o{ USER_SUSPENSIONS : receives
  USERS ||--o{ AUDIT_LOG : acts
```

### Normalisierte Kernwerte

| Bereich | Verbindliche Felder |
|---|---|
| Nutzer | Rolle und Kontostatus |
| Inserat | Währung und Tagespreis in Cent; Kaution technisch neutral (`NULL`) |
| Buchung | Besitzer, Mieter, Status, Start, Ende, Währung, Beträge, Version |
| Geldfluss | Betrag in kleinster Währungseinheit, Währung, Status, Idempotenzschlüssel |
| Verfügbarkeit | Zeitzone, Wochentag, lokale Zeiten sowie konkrete Sperrzeiträume |
| Dateien | Zweck, Sichtbarkeit und optionale Zuordnung zu Inserat oder Chat |
| Nachweis | unveränderliche Buchungsereignisse und Audit-Einträge |

JSONB bleibt nur für flexible Metadaten, Provider-Antworten und die zeitweise
Rückwärtskompatibilität mit der aktuellen Flutter-App erhalten.

## Harte Datenbankregeln

- Start muss immer vor Ende liegen.
- Geldbeträge sind nicht negativ und werden als ganze Cent gespeichert.
- Währungen verwenden drei Großbuchstaben.
- Besitzer und Mieter einer Buchung müssen verschieden sein.
- Fremdschlüssel verhindern verwaiste Buchungen, Zahlungen und Nachrichten.
- Pro Provider-Operation erzwingen eindeutige Idempotenzschlüssel genau eine
  Zahlung, Erstattung oder Auszahlung.
- Für `accepted` und `running` verbietet eine PostgreSQL-Exclusion-Constraint
  jede zeitliche Überschneidung auf demselben Inserat.
- Buchungsereignisse und Audit-Einträge sind append-only; nachträgliches
  Ändern oder Löschen wird von der Datenbank abgewiesen.

## Berechtigungsmatrix

Die sichere Standardentscheidung für Support lautet: lesen und kommentieren
bei Reports/Disputes, aber keine Buchungs-, Geld-, Rollen- oder Audit-Änderung.

| Ressource/Aktion | Öffentlich | Nutzer | Beteiligter Besitzer/Mieter | Support | Admin |
|---|---:|---:|---:|---:|---:|
| Aktives Inserat lesen | ja | ja | ja | ja | ja |
| Eigenes Inserat ändern | nein | nur eigenes | nur eigenes | nein | ja |
| Buchung lesen/ändern | nein | nein | ja, nach Statusregel | nein | ja |
| Chat lesen/schreiben | nein | nein | ja | nein | ja |
| Öffentliches Inserat-/Profilbild lesen | ja | ja | ja | ja | ja |
| Privaten Upload lesen | nein | nein | Besitzer oder Chat-Teilnehmer | nein | ja |
| Report/Dispute bearbeiten | nein | eigener Fall | eigener Fall | lesen/kommentieren | ja |
| Zahlung/Auszahlung lesen | nein | nein | erst über künftigen eng begrenzten Endpoint | nein | ja |
| Audit-Log lesen | nein | nein | nein | nein | ja |

Alle heute geschützten HTTP-Endpunkte prüfen zusätzlich zum gültigen Token den
aktuellen Datenbankstatus des Kontos. Gesperrte, geschlossene oder deaktivierte
Konten werden abgewiesen. Das gilt auch beim Aufbau einer Echtzeitverbindung.

## Migration und Rückwärtsstrategie

1. `schema.sql` stellt weiterhin das alte, von der App erwartete Grundschema
   bereit.
2. Nummerierte `*.up.sql`-Migrationen laufen sortiert und einzeln in einer
   Transaktion.
3. Jede ausgeführte Migration wird mit SHA-256-Prüfsumme gespeichert. Eine
   später veränderte bereits ausgeführte Datei blockiert den Start.
4. Die B3-Migration ist additiv. Bestehende JSON-Daten werden geprüft und in
   normalisierte Tabellen übernommen. Ungültige Zeiträume oder bereits
   überlappende aktive Buchungen stoppen die Migration sichtbar.
5. Während der Übergangsphase schreibt die API Buchungen sowohl in den alten
   App-Vertrag (`rental_requests.payload`) als auch in `bookings`.
6. Bei einem App-Rollback wird nur auf das vorherige Image zurückgeschaltet.
   Das additive B3-Schema bleibt bestehen und wird vom alten Code ignoriert.
   Dadurch ist kein riskantes Schema-Downgrade nötig.
7. Korrekturen erfolgen immer als neue vorwärtsgerichtete Migration; eine
   bereits ausgeführte Migration wird nie nachträglich geändert.

## Aufbewahrung und Löschung

Bis die rechtliche Produktentscheidung bestätigt ist, werden Zahlungs-,
Buchungs-, Streitfall- und Audit-Daten nicht automatisch gelöscht. Private
Uploads besitzen bereits einen eindeutigen Zweck und eine Ressourcenzuordnung,
damit B10 daraus sichere Aufbewahrungs- und Löschjobs ableiten kann. Vor dem
öffentlichen Start werden je Datenklasse eine bestätigte Frist, ein Legal-Hold-
Verhalten und ein nachweisbarer Löschlauf ergänzt. Dies ist bewusst als Gate
markiert und keine stillschweigende Rechtsannahme.

## Automatische Nachweise

- Einheiten-Tests für Zeitraum, Währung, Cent-Beträge und Statusübergänge.
- Berechtigungstests für Beteiligte, Außenstehende, Support, Admin sowie
  gesperrte Konten.
- Echter PostgreSQL-Test in CI für Migration und wiederholten Start.
- Konkurrenztest: Zwei gleichzeitig angenommene, überlappende Buchungen;
  genau eine darf erfolgreich sein, die andere erhält PostgreSQL `23P01` und
  die API übersetzt dies in `booking_period_unavailable` (HTTP 409).
- API-Grenztest: Außenstehende erhalten keine fremden Buchungen oder Chats und
  keinen privaten Upload; ein berechtigter Teilnehmer kann denselben Upload
  lesen.

## Verifizierter B3-Lauf vom 8./9. August 2026

- Implementierung: Commit `c4dc2b7fed27666f608e2a83445b9cb381af36e3`;
  geprüfter Staging-Release:
  `f059d3b5739c36dac3f829dac27d9c78e9f3cbb4`.
- GitHub-CI-Lauf `31276879546`: Backend, echter PostgreSQL-Test, Flutter und
  Image-Veröffentlichung vollständig erfolgreich.
- Staging meldet über `/version` exakt Commit `f059d3b…`; Container,
  Datenbank und Memory-Mail sind gesund.
- Migration `001_b3_foundation.up.sql` wurde genau einmal mit gespeicherter
  SHA-256-Prüfsumme
  `203e757d98b6d00dd40f7749dac69d57773f0872fd2c227d53afa4e62d2885ee`
  angewendet. Die Datenqualitätsprüfung meldete null fehlende
  Buchungsprojektionen und genau eine aktive Overlap-Constraint.
- Vor der Migration wurde das Staging-Dump
  `/docker/sit-staging/backups/pre-b3-20260808T214536Z.dump` mit SHA-256
  `d31136b0fb842f6c71c84e7cab8e703b367da072c50c22ea59f9c737b6a011d2`
  erstellt.
- Konkurrenzprobe auf Staging: erste Annahme erfolgreich (`rc=0`), zweite
  gleichzeitig überlappende Annahme abgewiesen (`rc=1`), genau eine Buchung
  angenommen und Exclusion-Constraint als Ursache bestätigt. Alle Probe-Daten
  wurden anschließend entfernt (`probe_rows=0`).
- Isolierter Restore des Vor-Migrations-Dumps in einen Wegwerfcontainer war
  erfolgreich; acht öffentliche Tabellen wurden wiederhergestellt. Container
  und temporäres Volume wurden danach entfernt.
- Rückwärtsstrategie real geprüft: `f059d3b…` → `dd9aade…`; alter App-Stand
  blieb mit dem additiven B3-Schema gesund, Migration und Overlap-Constraint
  blieben erhalten. Anschließend Rückkehr auf `f059d3b…`, Readiness grün.
- Produktion wurde nicht auf B3 ausgerollt und blieb mit Website, API,
  Datenbank, Mail sowie allen drei Betriebs-Timern gesund.

## B3-Abnahme

| Gate | Nachweis | Ergebnis |
|---|---|---|
| Normalisiertes Schema und Migration | Migration in CI und Staging, Prüfsumme fixiert | bestanden |
| Kein doppeltes Reservieren | CI-API-Test und echte Staging-Konkurrenzprobe | bestanden |
| Keine fremden privaten Ressourcen | Auth-Matrix plus PostgreSQL/API-Grenztest | bestanden |
| Vorwärts- und Rückwärtsstrategie | additiv, alter App-Stand auf neuem Schema gesund | bestanden |
| Backup und isolierter Restore | Pre-B3-Dump, acht Tabellen, temporäre Ressourcen entfernt | bestanden |
| Datenqualität | null Projektionslücken; Constraints und Indizes vorhanden | bestanden |
| Aufbewahrung | sicherer Default ohne automatische Löschung; finale Fristen als B10-Launch-Gate | bestanden mit Folgepunkt |

B3 ist damit technisch bestanden. Der nächste Hauptbaustein ist B4. Die
rechtliche Bestätigung konkreter Aufbewahrungsfristen bleibt bewusst als
Launch-Gate in B10 und ändert den sicheren B3-Default nicht rückwirkend.
