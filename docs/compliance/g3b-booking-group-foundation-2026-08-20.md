# G3B - BookingGroup Foundation

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungscommit:
`7b1be00420b41941758678e77f2a8caa1dc3a659`

GitHub Actions:
[`32409736722`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32409736722)
ist fuer genau diesen Commit GREEN.

## Status und Ergebnis

**G3B ist technisch GREEN und fuer jede Live-Nutzung deaktiviert.** Die von
Walid mit `G3A_ENTSCHEIDUNG_A` gewaehlte Struktur besitzt jetzt eine additive,
normalisierte und unveraenderliche Datenbasis fuer mehrere Artikel desselben
Vermieters. Es gibt noch keine Route, Anfrage, Reservierung, Vertragsannahme,
Zahlung oder oeffentliche UI fuer Gruppen.

## Verhalten und Grenzen

- `booking_groups` bindet genau einen Vermieter, Mieter, privaten C2C-Kontext,
  Deutschland, eine Waehrung, einen Zeitraum, Standortschluessel sowie
  Handover-, Legal-, Storno- und Payment-Konfiguration.
- `booking_group_positions` fuehrt jeden Artikel normalisiert und kann dessen
  unveraenderlichen Einzel-Quote sowie spaeter eine bestehende Einzelbuchung
  referenzieren. Preis-, Evidence- und Ledger-Wahrheit bleibt dadurch
  positionsbezogen.
- Datenbank-Guards verweigern abweichende Vermieter, Laender, Waehrungen,
  Zeitraeume, Quotes, Preisallokationen oder Buchungsbindungen. Parallel
  konkurrierende Duplikate scheitern an eindeutigen Constraints.
- Gruppen und Positionen sind append-only und schema-versioniert. Historische
  V5.2-Tabellen und -Zeilen werden weder migriert noch umgeschrieben.
- `BOOKING_GROUPS_ENABLED` ist in allen versionierten Umgebungsoberflaechen
  standardmaessig `false`; Produktion verweigert eine Aktivierung zusaetzlich
  zur Laufzeit. Ein Legal-/Release-Gate bleibt zwingend.
- Es erfolgten keine Produktions-, VPS/OpenClaw-/Maximus-, SSH-, DNS-, Cloud-,
  Payment-, Store-, Provider-, Account- oder oeffentlichen Aenderungen.

## Tests

- Vier fokussierte Domain-, Schema-, Flag- und Negativtests PASS.
- Lokale Backend-Suite: 286 PASS und ein erwarteter PostgreSQL-Skip, weil auf
  dem Mac mini kein lokaler PostgreSQL-/Docker-Dienst vorhanden ist.
- Lokaler Vollgate-Teil: Privacy, Retention, Store, Legal und weitere
  Repo-Validatoren PASS; 307 Flutter-Tests plus Google-only-Test und Web-Build
  PASS. Der lokale Android-Build konnte ohne installierte Java-Laufzeit nicht
  ausgefuehrt werden.
- Exakte GitHub-CI schliesst diese lokalen Infrastruktur-Gaps: Backend inklusive
  PostgreSQL-Forward-/Rollback- und Concurrency-Test sowie Flutter-Regression
  inklusive Android-Debug-Build PASS.
- Compose-Validierung, Dependency-/History-Audit, API-Image-Build,
  `git diff --check` und die aktualisierten Privacy-/Retention-Quellhashes PASS.

## Migration und Rollback

- Migration `028_g3b_booking_group_foundation.up.sql` fuegt nur die beiden
  G3B-Tabellen, Indizes und Guards hinzu.
- Der Down-Pfad entfernt ausschliesslich G3B-Objekte, solange noch keine
  Gruppendaten existieren. Bei vorhandener Gruppen- oder Positionswahrheit
  bricht er fail-closed ab, statt Evidenz zu loeschen.
- Vor einer nicht-leeren Entfernung ist damit eine eigene, ausdruecklich
  gepruefte Datenentscheidung erforderlich. Ein normaler Code-Revert laesst
  vorhandene additive Tabellen unangetastet.

## Entscheidung und Risiko

[`ADR-028`](../decisions/ADR-028-g3b-booking-group-foundation.md) haelt die
Grenze zwischen Gruppenkontext und positionsbezogener V5.2-Wahrheit fest.
G3B erzeugt bewusst noch keine Mindestpositionszahl auf einem verwaisten
manuellen SQL-Pfad und keine Workflow-Zustaende; diese atomare Orchestrierung
ist Aufgabe von G3C. Eine Aktivierung ohne neue Legal-/Dokumentversion und
professionelle Freigabe bleibt verboten.

## Naechstes Paket

V2.4 markiert G3B als GREEN und autorisiert die automatische Fortsetzung zu
**G3C - Quote, Counter-offer und State Orchestration**. G3C bleibt hinter dem
deaktivierten Flag, verwendet nur serverautoritatives Pricing und erzeugt bei
jeder geaenderten Artikelmenge eine neue unveraenderliche Quote mit
ausdruecklicher Mieterzustimmung.
