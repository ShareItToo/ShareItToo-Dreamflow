# B6 — Verfügbarkeit und autoritativer Buchungsablauf

Stand: 9. August 2026

Branch: `codex/master-workflow-20260808`

Status: technisch freigegeben. Serverlogik, PostgreSQL-Migration,
App-Anbindung, CI, unveränderliches Image, isoliertes Staging, echte
Parallelitätsprobe, B5-Rückfall, B6-Vorwärtsrevalidierung, Restore und
Bereinigung sind bestanden. Produktion wurde nicht verändert.

## Ergebnisziel

B6 macht das Backend zur einzigen Autorität für Verfügbarkeit, Mietzeitraum,
Preis und Buchungsstatus. Ein Client kann weder einen Preis festlegen noch
einen ungültigen Statusübergang erzwingen. Mehrere Anfragen dürfen denselben
Zeitraum zunächst anfragen, aber nur eine überlappende Buchung kann verbindlich
angenommen werden.

Der Rollout bleibt bis zu den Zahlungs- und Übergabebausteinen B7/B8 im
expliziten Pilotmodus. Produktion hat den Buchungspilot nicht aktiviert.

## Verfügbarkeit und Kalender

Jedes B5-Inserat besitzt ab B6:

- eine IANA-Zeitzone, standardmäßig `Europe/Berlin`;
- eine fortlaufende Verfügbarkeitsrevision;
- Mindest- und Höchstmietdauer;
- Vorlaufzeit und Annahmefenster;
- wiederkehrende Wochenregeln;
- konkrete Sperren für Eigentümer, Wartung oder Sicherheitsprüfungen.

Die Mietgrenzen werden als lokale Kalendertage gespeichert. UTC-Zeitpunkte
werden erst serverseitig aus Datum und Inseratzeitzone abgeleitet. Dadurch
bleiben zwei Miettagesdaten auch über Sommerzeitwechsel zwei Miettagesdaten;
ein 23- oder 25-Stunden-Tag verändert weder Mietdauer noch Preis.

Kalenderabfragen, Preisangebote, neue Buchungen, Änderungen und Annahmen
verwenden dieselbe Verfügbarkeitsprüfung. Fehlende oder vertauschte
Zeitpunkte führen vor einer Datenbankabfrage zu einem internen Fehler statt zu
einem unbegrenzten PostgreSQL-Zeitraum. Ein in CI gefundener Feldnamenfehler,
der eine konkrete Wartungssperre zu breit interpretierte, wurde mit Commit
`910802988c80c5582526aa07c75412f7da483d36` behoben und durch den echten
PostgreSQL-Lauf abgesichert.

## Serverpreis

Das Backend berechnet und speichert alle Geldbeträge ausschließlich in
ganzzahligen Minor Units. Das Preis-Snapshot enthält:

- Tage und Tagespreis;
- Grundmiete und Langzeitrabatt;
- Miet-Zwischensumme;
- Plattformgebühr;
- optionale Liefer- und Abholgebühr anhand serverseitig berechneter Distanz;
- Gesamtbetrag des Mieters;
- Auszahlung des Anbieters;
- Kaution stets `0` und Preisversionsnummer; eine Kaution wird im Launch nicht angeboten.

Der Client sendet nur Auswahl, Zeitraum und gegebenenfalls Übergabeorte. Er
kann weder Endpreis noch Eigentümerauszahlung überschreiben. Eine Änderung des
Zeitraums erzeugt immer ein neues serverseitiges Preis-Snapshot. Die reale
Staging-Probe bestätigte für drei Miettage zu 20 Euro einen Gesamtbetrag von
`6600` Cent einschließlich zehn Prozent Plattformgebühr.

## Buchungszustände

Der kanonische Ablauf umfasst:

`draft` → `requested` → `accepted` → `payment_pending` → `confirmed` →
`active` → `returned` → `completed`

Zusätzliche End- und Ausnahmezustände sind `declined`, `cancelled`,
`refunded` und `disputed`.

Für den B6-Pilot ohne echte Zahlung darf die App nach Annahme kontrolliert über
`confirmed` zu `active` wechseln. Ebenso wird der bisherige direkte Abschluss
intern als `active` → `returned` → `completed` protokolliert. Dadurch bleibt
die bestehende Oberfläche verwendbar, ohne die künftigen Zahlungs- und
Übergabeschritte aus dem Datenmodell zu entfernen.

Jeder Übergang prüft:

- angemeldeten Teilnehmer und dessen Rolle;
- aktuellen kanonischen Zustand;
- optional die erwartete Workflow-Revision;
- die erlaubte Übergangskante;
- bei Annahme erneut die aktuelle Verfügbarkeit;
- eine eindeutige Idempotenzkennung.

Ungültige Rollen, veraltete Revisionen und unzulässige Sprünge liefern einen
deterministischen Konflikt. Jeder erfolgreiche Schritt schreibt ein
Buchungsereignis und einen Audit-Eintrag.

## Parallelität, Idempotenz und Holds

Die Erstellung sperrt das Inserat während der entscheidenden
Datenbanktransaktion. Derselbe Mieter kann nicht mit einem zweiten Schlüssel
dieselbe Inserat-/Datumsanfrage duplizieren. Derselbe Schlüssel mit identischem
Inhalt liefert das gespeicherte Ergebnis; derselbe Schlüssel mit verändertem
Inhalt wird abgelehnt.

Annahmen werden zusätzlich durch die bestehende PostgreSQL-
Exclusion-Constraint abgesichert. Auch bei zwei fast gleichzeitig gestarteten
Annahmen kann deshalb nur eine überlappende Buchung aktiv werden. Die reale
Staging-Parallelitätsprobe lieferte exakt `200,409` und genau eine Zeile im
Zustand `accepted`.

Eine Annahme erhält ein begrenztes Hold-Fenster. Ein abgelaufener Hold wird
beim nächsten Buchungs-/Kalenderzugriff systemseitig auf `cancelled` gesetzt,
der Sperrzeitraum freigegeben und mit Ereignis sowie Auditspur dokumentiert.

## Datenmodell und Rückfallkompatibilität

Migration `005_b6_booking_workflow.up.sql` ergänzt:

- Kalender- und Annahmeregeln am Inserat;
- kanonischen Workflow, Version und Revision an Buchungen;
- lokale Mietdaten und Zeitzone;
- vollständige Preis-Snapshots;
- Hold- und Statuszeitpunkte;
- die transaktionale Tabelle `booking_commands` für Idempotenz;
- erweiterte Statusprüfungen für Buchungsereignisse;
- Indizes für Kalender, Status und ablaufende Holds.

Staging-Prüfsumme der Migration:
`55996e71b9a9144852dd872dd5ccbdf6578518c6ce1e370458ee12976cff0053`.

`workflow_version = 1` kennzeichnet vollständig nach B6 geprüfte Buchungen.
Eine ältere B5-App kann auf dem additiv migrierten Schema weiterarbeiten, doch
ihre neuen oder sicherheitsrelevanten Schreibvorgänge erhalten automatisch
`workflow_version = 0`. Nach dem Vorwärtslauf sind diese Datensätze verborgen
und nicht buchbar. Nur eine B6-Änderung mit neuer Verfügbarkeits- und
Preisprüfung hebt sie wieder auf Version 1.

Der alte Bulk-Sync-Endpunkt darf im Pilotmodus keine neue Buchung mehr
erzeugen, keinen Zeitraum neu kalkulieren und keinen Zustand wechseln. Er
bleibt ausschließlich für ungefährliche Metadaten vorhandener B6-Datensätze
erhalten.

## App-Anbindung

- Kalender und Verfügbarkeitsprüfung laden regulär vom Backend; lokale
  Fixtures bleiben ausschließlich QA.
- Die Buchungsübersicht verwendet weiterhin das bestehende
  `RentalRequest`-Modell, erhält aber Workflow-Version, Revision, lokale
  Mietdaten, Hold und Serverpreis.
- Erstellen, Ändern und Statuswechsel verwenden die neuen idempotenten
  Endpunkte.
- Ein Datumswechsel einer angefragten Buchung löst eine neue Preisberechnung
  aus.
- Terminänderungen für Übergabe oder Rückgabe verändern bei angenommenen oder
  laufenden Buchungen nicht mehr versehentlich den autoritativen Mietzeitraum.
- `startDate` und `endDate` werden ausdrücklich gespeichert und nicht erneut
  aus UTC-Zeitpunkten abgeleitet.
- Produktive Laufzeitpfade fallen nicht auf lokale Fake-Buchungen zurück.

## Automatische Nachweise

Endgültiger CI-Lauf:
[GitHub Actions `31288871090`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/31288871090)
für Commit `ef73fd413945d57ca6ba06c17ea91368db6315ae`.

- Backend: 39 von 39 Tests bestanden, einschließlich PostgreSQL 16,
  Migrationen, Parallelitätsconstraint, vollständigem B6-Lebenszyklus,
  Idempotenz, Rollback-Quarantäne und Ressourcenrechten.
- Syntax- und Compose-Prüfung bestanden; commit-markiertes API-Image gebaut.
- Flutter: 156 Tests bestanden.
- Analyse: keine Fehler, akzeptierte Altlasten-Baseline unverändert bei 710
  Hinweisen.
- Web-Debug-Build und Android-Debug-APK bestanden.
- Das verifizierte API-Image wurde erst nach beiden grünen Jobs veröffentlicht.

Das unveränderliche Staging-Image hat die ID
`sha256:e1fc468fa0c90930077c14d0fb5e7e5cac6d965f6b2bf05fa833a13da6585465`.
OCI-Revision, Compose-Image, `/version` und CI-Commit stimmen überein.

## Isolierte Staging-Abnahme

Vor dem Rollout wurde Staging vollständig unter
`/docker/sit-staging/backups/pre-b6-20260809T032521Z` gesichert. Datenbank,
Uploads, vorherige Staging-Identität und Produktions-Containeridentität sind
durch ein gemeinsames SHA-256-Manifest geschützt. Dump-Struktur, Uploadarchiv
und alle Prüfsummen wurden vor dem Rollout geprüft.

Release-Nachweis:
`/docker/sit-staging/backups/releases/staging-20260809T032705Z-ef73fd413945.json`.

Die reale Abnahme mit drei verifizierten Testkonten, echtem JPEG-Upload und
echtem Inserat bestätigte:

- sieben Wochenregeln, Zeitzone, Min/Max-Dauer und Wartungssperre;
- stabile Datumsgrenzen über einen Sommerzeitwechsel;
- serverseitigen Preis und Neuberechnung nach Änderung;
- Erstellungs-, Revisions-, Rollen- und Idempotenzschutz;
- Ablehnung des alten Bulk-Erstellungswegs;
- Annahme, Pilot-Aktivierung, Rückgabe und Abschluss;
- automatische Stornierung eines abgelaufenen Holds;
- exakt einen Gewinner bei zwei parallelen, überlappenden Annahmen;
- sieben zentrale Ereigniskanten und mindestens 16 Audit-Einträge bereits vor
  Bereinigung.

Nachweis:
`/docker/sit-staging/backups/b6-live-acceptance-20260809t033342z-317460.json`.

## Rückfall, Vorwärtslauf und Restore

Für die Rückfallprobe wurde die letzte geprüfte B5-App
`291092fd6c575dbffbd2febd5e5400d93c40fed4` auf dem bereits migrierten
B6-Schema gestartet. Sie blieb gesund und konnte eine alte
`pending`-Buchung schreiben. Der Datenbank-Guard markierte diese automatisch
als Version 0; B5 konnte sie weiterhin sehen.

Nach dem erneuten Start von B6 war der Datensatz verborgen. Eine idempotente
B6-Änderung prüfte Zeitraum, Kalender und Preis erneut und stellte ihn als
`requested`, Version 1 und `4400` Cent wieder her.

Nachweis:
`/docker/sit-staging/backups/b6-rollback-acceptance-20260809t033342z-317460.json`.

Die Vor-B6-Sicherung wurde danach in einer temporären PostgreSQL-Instanz mit
eigenem Docker-Volume und einem temporären Uploadverzeichnis tatsächlich
wiederhergestellt. Die getrennte Instanz enthielt alle erwarteten Tabellen;
temporäre Container, Volumes und Dateien wurden anschließend entfernt.

Restore-Nachweis:
`/docker/sit-staging/backups/restore-checks/restore-check-20260809T033607Z-320534.json`.

## Bereinigung und Produktionsschutz

Nach der Abnahme wurden alle noch offenen Testbuchungen über den regulären
Workflow abgelehnt, storniert oder abgeschlossen. Elf Testkonten wurden über
den regulären Kontolöschpfad geschlossen und anonymisiert; Sitzungen,
personenbezogene Profile und Uploads wurden entfernt. Der öffentliche
Staging-Katalog ist leer.

20 unveränderliche Buchungsereignisse und 22 Audit-Einträge bleiben als
technischer Nachweis erhalten. Staging läuft final gesund auf Commit
`ef73fd413945d57ca6ba06c17ea91368db6315ae` im Pilotmodus.

Bereinigungsnachweis:
`/docker/sit-staging/backups/b6-cleanup-20260809t033342z-317460.json`.

Zusammengefasster B6-Nachweis:
`/docker/sit-staging/backups/b6-evidence-20260809T034010Z.json`.

Die Produktions-Containeridentität blieb vor, während und nach Rollout,
Rückfall, Restore und Bereinigung bytegenau gleich. Produktion wurde weder
migriert noch neu gestartet; der B6-Buchungspilot bleibt dort aus.

## Freigaben

| Gate | Erforderlicher Nachweis | Status |
|---|---|---|
| Serverautorität | Kalender, Preis und Status nur serverseitig | bestanden |
| Zeit- und Preisvertrag | lokale Mietdaten, DST und Minor Units | bestanden |
| Parallelität | keine zwei überlappenden Annahmen | bestanden: `200,409` |
| Idempotenz | Wiederholung stabil, Schlüsselmissbrauch abgelehnt | bestanden |
| Rollen und Revision | ungültige Rolle/Sprung/veraltete Revision abgelehnt | bestanden |
| Hold-Ablauf | abgelaufene Annahme automatisch storniert | bestanden |
| App-Regression | 156 Tests, Analyse, Web und Android | bestanden |
| Backend/PostgreSQL | 39/39 einschließlich Migration und Konkurrenz | bestanden: CI `31288871090` |
| Unveränderliches Image | Commit, OCI-Revision und `/version` identisch | bestanden |
| Isoliertes Staging | reale Konten, Bild, Inserat und Buchungsabläufe | bestanden |
| B5-Rückfall | Alt-App auf B6-Schema plus Quarantäne | bestanden |
| Vorwärtsrevalidierung | Version 0 verborgen und kontrolliert auf Version 1 | bestanden |
| Restore | Datenbank und Uploads getrennt wiederhergestellt | bestanden |
| Bereinigung | Testkonten geschlossen, Katalog leer, Audit erhalten | bestanden |
| Produktion | unverändert, Pilot aus | bestätigt |

B6 ist damit technisch bestanden. Der nächste Hauptbaustein ist B7:
Zahlungsanbieter, Payment-Intents, Webhooks, Refunds und Auszahlungen im
Testmodus. Offene B1-Gates und der commit-markierte Produktionsrollout aus B2
bleiben parallel sichtbar.
