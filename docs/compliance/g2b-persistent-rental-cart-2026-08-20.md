# G2B - Persistenter Mietkorb

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungscommit:
`c14dacb8a99669724839d07c41c2dbf6b0b497b5`

GitHub Actions:
[`32388755772`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32388755772)
ist fuer genau diesen Commit GREEN.

## Status und Ergebnis

**G2B ist technisch GREEN.** Der `Mietkorb` speichert vorbereitete
Einzelmieten und Projektcontainer lokal fuer Gaeste und kontogebunden im
Backend. Jeder Zustand bleibt ausdruecklich unverbindlich: Der Korb erzeugt
weder Buchung, Buchungsanfrage, Reservierung, Verfuegbarkeitssperre noch
Zahlung.

Vor dem Wechsel in den bestehenden Einzel-Checkout prueft der Server Listing,
Zeitraum, Konflikte und den deterministischen Quote erneut. Geaenderte oder
nicht verfuegbare Positionen werden sichtbar; eine verbindliche Annahme bleibt
vollstaendig im vorhandenen V5.2-Checkout mit seinen unveraenderten Gates.

## Verbindliche Quellen und Grenzen

- Drive `01_CONTROL_V2.3_AUTONOMOUS.md` und
  `02_CODEX_WORK_PACKAGES_SIT_V2.3.md`.
- Drive `02_SIT_GROWTH_PRODUCT_PROJEKTKORB_UND_PLANER.pdf`, Version 2.0 vom
  18.08.2026.
- V5.2 Core/Legal Map, Server-Quote, Booking-State-Machine sowie die
  bestehenden Privacy-, Retention-, Legal- und Store-Manifeste.
- Historische Rechts-, Consent-, Quote-, Contract- und Device-Snapshots
  blieben unveraendert.
- Keine Produktions-, VPS/OpenClaw-/Maximus-, SSH-, DNS-, Cloud-, Payment-,
  Store-, Provider-, Account- oder oeffentliche Aktion.

## Laufzeit und Datenmodell

- Migration `027_g2_persistent_rental_cart.up.sql` fuehrt genau einen
  kontogebundenen Cart pro Nutzer, versionierte Projektcontainer und
  idempotente Cart-Positionen mit stabilen Client-IDs ein.
- Projekt- und Positionsgrenzen, Reihenfolge, Datumsbereiche und freiwillige
  Projektantworten sind serverseitig begrenzt und validiert.
- Cart-Quotes verwenden den bestehenden deterministischen Quote-Code im
  nicht persistierenden Preview-Modus. Dadurch entstehen keine
  `booking_quotes`, Bookings oder Holds.
- Die API bietet kontogebundene GET/PUT/DELETE-Operationen und eine explizite
  Recheck-Operation mit `current`, `changed`, `unavailable` oder
  `needs_recheck`.
- Gaeste koennen bis zu 20 Projekte und 100 Positionen lokal vorbereiten.
  Login/Registrierung uebertragen Projekte vor Positionen idempotent und
  loeschen die lokale Kopie erst nach allen bestaetigten Upserts.
- Ein angefangener Sync wird lokal an die Account-ID gebunden. Andere Konten
  und ausgeloggte Nutzer koennen diese lokale Restkopie weder sehen noch
  ueberschreiben; das zugeordnete Konto kann den Sync fortsetzen.
- `Mietkorb` zeigt den Status `Im Mietkorb - noch nicht reserviert`,
  informative Preise, Projektzuordnung und den unveraenderten Weg in den
  Einzel-Checkout. `Gemerkt` und seine bestehenden Speicherwerte bleiben
  separat und unveraendert.

## Datenschutz, Loeschung und Aufbewahrung

- Account-Export enthaelt Cart, Projekte und Positionen; der lokale Export
  enthaelt nur fuer den aktuellen lokalen Kontext sichtbare Gast-/Pending-
  Daten und gibt keine fremde Account-ID aus.
- Bestaetigte Kontoloeschung entfernt den Server-Cart explizit und die lokalen
  Cart-/Projekt-/Sync-Schluessel auf dem ausfuehrenden Geraet.
- Das Retention-Inventar fuehrt `rental_carts`, `rental_cart_projects` und
  `rental_cart_items` als nutzergesteuerte Absichtsdaten. Es wurde keine neue
  feste Frist erfunden.
- Privacy- und Legal-Oberflaechen erklaeren lokale Gastdaten,
  kontogebundene Speicherung, Recheck und den fehlenden Reservierungsstatus.
  Alle Freigabe-Gates bleiben draft/open/fail-closed.

## Tests und Verifikation

- Fokussierte G2B-Backend-, Flutter-, Navigation-, Lifecycle- und negative
  Account-Isolationstests PASS.
- Lokale Backend-Suite: 276 PASS, ein erwarteter PostgreSQL-Skip ohne lokales
  `TEST_DATABASE_URL`.
- Vollstaendige lokale technische Regression auf Flutter 3.41.7 stable:
  307 Flutter-Tests PASS, ein dokumentierter Skip, Google-only-Profiltest
  PASS, Analyzer exakt auf der akzeptierten 223er-Baseline, Web-Debug-Build
  und Android-Debug-APK PASS.
- G2-, Privacy-, Retention- und Legal-Validatoren sowie ihre negativen
  Source-Drift-Tests PASS.
- Exakte GitHub-CI: Backend- und Flutter-Regression PASS. Der signierte
  Android-Releasekandidat und `publish-api-image` wurden uebersprungen.
- `git diff --check`, Source-Inventare und gestagter Umfang waren sauber.

## Migration, Risiken und Rollback

- Migration 027 ist forward-only und loescht oder reinterpretiert keine
  bestehende Wishlist-, Booking-, Quote- oder Vertragszeile.
- Ein normaler Code-Revert deaktiviert den neuen Pfad. Die neuen Tabellen
  bleiben dabei absichtlich erhalten, damit vorbereitete Nutzerabsichten nicht
  verloren gehen. Eine spaetere Entfernung erfordert eine eigene gepruefte,
  nicht still destruktive Folgemigration.
- Cart-Previews sind keine Verfuegbarkeitsgarantie. Die bestehende
  Booking-Konfliktpruefung bleibt die letzte Autoritaet.
- Produktion, echte Konten, reales Payment und ein physisches Cross-Device-
  Pilotexperiment waren nicht Teil dieses Pakets und werden nicht als belegt
  behauptet.

## Naechster Schritt

Das aktive Folgepaket ist **U0 - Pilot-Cockpit und Unit Economics**. Es trennt
Cash- und normalisierte Ergebnisrechnung, kennzeichnet Ist-/Schaetz-/
Konfigurationswerte und fuehrt GMV, Plattformumsatz, Umsatzsteueranteil,
Provider- und Betriebskosten, Deckungsbeitrag, Projektfunnel sowie aggregierte
Founder-Hours und Eskalationen zusammen. U0 ist das Ende der aktuellen
autonomen Runway; G3A und alle spaeteren Pakete bleiben gegatet.
