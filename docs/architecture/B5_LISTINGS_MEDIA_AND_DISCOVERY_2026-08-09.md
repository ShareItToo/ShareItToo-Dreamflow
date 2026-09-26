# B5 — Inserate, Medien und Auffindbarkeit

Stand: 9. August 2026

Branch: `codex/master-workflow-20260808`

Status: technisch freigegeben. CI, PostgreSQL-Migration, unveränderliches
Image, isoliertes Staging, B4-Rückfallprobe, Vorwärtswiederherstellung und
isolierter Restore sind bestanden. Produktion wurde nicht verändert.

## Ergebnisziel

B5 ersetzt den früheren Demo-Katalog durch echte, serverseitig geprüfte
Inserate. Anbieter können ein vollständiges Angebot anlegen, bearbeiten,
pausieren und beenden. Mieter sehen ausschließlich aktive Angebote mit einem
serverseitig verarbeiteten Bild und können nach Text, Kategorie, Zustand,
Preis und Entfernung suchen.

## Verbindliches Inserat

Ein aktives Inserat benötigt:

- Titel und aussagekräftige Beschreibung;
- Kategorie, optional Unterkategorie und Suchbegriffe;
- Zustand aus einer kontrollierten Werteliste;
- positiven Tagespreis und Währung; eine Kaution wird nicht angeboten;
- genauen internen Standort mit Stadt, Land und Koordinaten;
- Mindest- und Höchstdauer;
- Übergaberadius; ein Schutz- oder Versicherungsmodell wird nicht angeboten;
- mindestens ein geprüftes, dem Anbieter gehörendes Inseratbild;
- Status `active`.

Entwürfe und pausierte Inserate dürfen ohne Bild gespeichert werden, sind aber
weder öffentlich sichtbar noch buchbar. `ended` ist der endgültige
Soft-Delete-Status und bewahrt nur die für bestehende Vorgänge benötigte
Referenz.

## Datenmodell und Rollback-Kompatibilität

Migration `004_b5_listing_catalog.up.sql` ergänzt normalisierte Katalogfelder,
Suchindizes, Bildmetadaten und `catalog_version`.

- `catalog_version = 1` kennzeichnet ein nach B5 vollständig geprüftes
  Inserat. Nur diese Version darf veröffentlicht oder gebucht werden.
- `catalog_version = 0` ist eine bewusst isolierte Kompatibilitätsspur. Sie
  erlaubt bei einer kurzfristigen Rückrollung weiterhin Schreibvorgänge der
  vorherigen B4-App, ohne die neuen Regeln zu umgehen.
- Eine B5-Schreibrevision kennzeichnet bewusst validierte Änderungen. Ändert
  die B4-App während einer Rückrollung einen bestehenden B5-Datensatz ohne
  diese Revision, setzt ein Datenbank-Trigger ihn automatisch auf Version 0.
- Nach dem erneuten Vorwärtsrollout bleiben während eines Rollbacks angelegte
  Version-0-Datensätze unsichtbar und unbuchbar. Eine vollständige Bearbeitung
  über B5 validiert und hebt sie auf Version 1.
- Frühere aktive Datensätze ohne serverseitig verarbeitetes Bild werden bei
  der Migration automatisch pausiert.
- Die ehemaligen fünf Server-Demoangebote werden beendet und nie in den
  öffentlichen Katalog übernommen.

Die Migration ist additiv. Eine einmal ausgeführte Datei darf nicht verändert
werden; spätere Korrekturen müssen als neue Vorwärtsmigration erfolgen.

## Bildverarbeitung und Zugriffsschutz

Der Upload-Endpunkt akzeptiert nur dekodierbare JPEG-, PNG- und WebP-Dateien
bis 8 MiB. Für Inseratbilder gelten zusätzlich Mindestmaße und eine Obergrenze
von 40 Megapixeln beziehungsweise 12.000 Pixeln je Seite.

Jedes akzeptierte Bild wird vollständig neu dekodiert und erzeugt:

- ein automatisch gedrehtes, metadatenfreies WebP bis 2.048 Pixel;
- ein quadratisches 480-Pixel-Vorschaubild;
- gespeicherte Abmessungen, Dateigrößen und SHA-256-Prüfsumme;
- den Prüfstatus `passed` erst nach erfolgreicher Verarbeitung.

Die Neucodierung entfernt eingebettete Metadaten und nicht benötigte
Dateiinhalte. Teilweise geschriebene Dateien werden bei jedem Datenbank- oder
Dateifehler wieder entfernt.

Ein ungebundenes Inseratbild ist privat und nur für seinen Eigentümer lesbar.
Nach Veröffentlichung sind Original und Vorschau öffentlich cachebar. Sobald
das Inserat pausiert oder beendet wird, verlangt derselbe undurchsichtige
Medienpfad wieder eine aktive Sitzung des Eigentümers. Fremde Nutzer erhalten
keinen Zugriff. Die zentrale App-Bildkomponente sendet für verwaltete
Backend-Bilder bei einer aktiven Sitzung automatisch den kurzlebigen
Access-Token, sodass Eigentümer ihre privaten Entwürfe weiterhin sehen.

## Eigentum und Lebenszyklus

- Inserat-ID und Eigentümer werden serverseitig gesetzt; Payload-Felder können
  weder Eigentum noch Identität überschreiben.
- Nur der Eigentümer darf ein Inserat aktualisieren, pausieren, reaktivieren
  oder beenden.
- Ein Bild muss demselben Eigentümer gehören, erfolgreich verarbeitet sein
  und darf nicht an ein anderes Inserat gebunden sein.
- Reaktivierung prüft erneut, ob mindestens ein freigegebenes Bild vorhanden
  ist.
- Öffentliche Suche und neue Buchungsanfragen verlangen gleichzeitig
  `catalog_version = 1`, `status = active` und `is_active = true`.
- Ein pausiertes oder beendetes Inserat kann keine neue Buchung erhalten.

## Suche und Datenschutz

Die öffentliche Katalogabfrage unterstützt:

- Textsuche über Titel, Beschreibung, Kategorie, Unterkategorie, Stadt und
  Land;
- mehrere Kategorien und Zustände;
- minimalen und maximalen Preis;
- Umkreisfilter mit serverseitig berechneter Distanz;
- Sortierung nach Neuheit, Preis auf- oder absteigend und Entfernung;
- begrenzte, paginierte Antworten.

Exakte Adresse und genauer Geohash verlassen das Backend nicht. Öffentlich
erscheinen nur Stadt/Land, auf ungefähr einen Kilometer gerundete
Koordinaten und eine entsprechend gerundete Entfernung. Bild-URLs werden
gegen tatsächlich gebundene, freigegebene Upload-Datensätze gefiltert.

## App-Verhalten

- Explore, Such-Overlay und Ergebnislisten laden den echten öffentlichen
  Katalog und reichen Filter an den Server weiter.
- Lade-, Leer- und Fehlerzustände sind getrennt sichtbar; ein Backendfehler
  fällt im produktiven Modus nicht auf Demoangebote zurück.
- Veröffentlichen ist ohne echtes Bild nicht mehr möglich.
- Inseratdetails kennzeichnen den Standort ausdrücklich als ungefähr und
  zeigen den geführten Übergabe- und Rückgabeablauf.
- Externe Zufallsbilder und automatisch erzeugte Demo-Buchungen wurden aus
  normalen Laufzeitpfaden entfernt.
- Lokale QA-Fixtures existieren nur hinter dem expliziten Debug-Parameter
  `qa=1`; Release-Builds können ihn nicht aktivieren.

## Automatische Nachweise

Lokaler Endstand vor CI:

- Backend: 35 bestandene Tests, ein ausschließlich mangels lokaler
  PostgreSQL-Installation übersprungener Integrationstest, anschließend
  vollständige Syntaxprüfung;
- App: 154 bestandene Flutter-Tests;
- Analyse: 710 bestehende Hinweise, keine Fehler und damit Verbesserung der
  akzeptierten Altlasten-Baseline von 729;
- erfolgreicher Web-Debug-Build;
- erfolgreiche Android-Debug-APK;
- Quelltextprüfung ohne verbliebene Zufallsbilder oder Demoangebote in den
  Katalog- und Buchungs-Laufzeitpfaden.

Der PostgreSQL-16-Integrationstest in CI prüft zusätzlich:

- vier Migrationen einschließlich idempotenter Wiederholung und Prüfsummen;
- die isolierte B4-Rollbackspur `catalog_version = 0`;
- echtes JPEG-Upload, WebP-Neucodierung, Thumbnail, Hash und Metadaten;
- privaten Zugriff vor Bindung sowie öffentlichen Zugriff nur während des
  aktiven Inseratstatus;
- Erstellen, Suchen, Filtern, Bearbeiten, Pausieren, Reaktivieren und Beenden;
- Ablehnung fremder Änderungen und fremder Bildbindung;
- Nichtbuchbarkeit pausierter Angebote und Standort-Redaktion.

Der endgültige Workflow-Lauf `31286574938` für Commit
`291092fd6c575dbffbd2febd5e5400d93c40fed4` war vollständig erfolgreich:

- Backend einschließlich echtem PostgreSQL-16-Lebenszyklus;
- 154 Flutter-Tests und Analyse ohne Fehler bei Baseline 710;
- Web-Debug- und Android-Debug-Build;
- Build und Veröffentlichung des commit-markierten API-Images.

## Isolierte Staging-Abnahme

Vor dem Rollout wurde Staging unter Zeitstempel `20260809T004259Z` vollständig
gesichert. Datenbank-Dump, Uploadarchiv und Prüfsummen liegen getrennt unter
`/docker/sit-staging/backups/pre-b5-20260809T004259Z`. Die Prüfsummen, die
Dump-Struktur und das Uploadarchiv wurden vor der Migration geprüft.

Das exakt aus Commit `291092fd6c575dbffbd2febd5e5400d93c40fed4` gebaute
Staging-Image hat die Image-ID
`sha256:06878b685273f9335ad88aebe41a4c4b879cc9f5f458e4cb792ef32d0adc102c`.
OCI-Revision, Compose-Image und `/version` stimmen überein. Readiness,
Datenbank und Memory-Mailmodus melden `ok`; Migration
`004_b5_listing_catalog.up.sql` ist mit ihrer 64-stelligen Prüfsumme erfasst.

Die reale Staging-Probe hat nachgewiesen:

- JPEG-Upload, WebP-Neucodierung, Vorschaubild, Abmessungen und SHA-256;
- privaten Medienzugriff vor Bindung und nach Pausierung sowie öffentlichen
  Zugriff ausschließlich während des aktiven Zustands;
- Erstellen, serverseitiges Suchen und Filtern, Bearbeiten, Pausieren,
  Reaktivieren und Beenden eines Inserats;
- gerundeten öffentlichen Standort ohne genaue Adresse oder Geohash;
- unveränderliches Eigentum und Ablehnung fremder Änderungen;
- Ablehnung einer neuen Buchung für ein pausiertes Inserat.

Für die Rückfallprobe wurde die geprüfte B4-App
`2114b45d2509be2da1c391419d04c270e271d78c` auf dem bereits migrierten
B5-Schema gestartet. B4 konnte lesen, bestehende Datensätze ändern und einen
neuen Datensatz anlegen. Der Datenbank-Guard markierte beide Schreibspuren als
`catalog_version = 0`. Nach dem erneuten Vorwärtsrollout auf B5 waren diese
Datensätze unsichtbar, unbuchbar und ihre Medien privat. Eine vollständige
B5-Bearbeitung validierte das echte Inserat wieder als Version 1.

Die Vor-B5-Sicherung wurde anschließend in einer temporären, getrennten
PostgreSQL-Instanz und einem temporären Uploadverzeichnis wiederhergestellt.
Nachweis:
`/docker/sit-staging/backups/restore-checks/restore-check-20260809T005255Z-190741.json`.
Der zusammengefasste B5-Nachweis liegt unter
`/docker/sit-staging/backups/b5-evidence-20260809T005405Z.json`.

Nach der Abnahme wurden Testinserate, Sitzungen, Uploaddatensätze und
Testdateien entfernt. Die drei Testkonten wurden geschlossen und anonymisiert;
die append-only Auditnachweise blieben regelkonform bestehen. Der öffentliche
Staging-Katalog war danach leer, Staging gesund und Produktion unverändert.

## Freigaben

| Gate | Erforderlicher Nachweis | Status |
|---|---|---|
| Lokale Backend-Prüfung | Tests und Syntax | bestanden |
| App-Regression | 154 Tests, Analyse, Web und Android | bestanden |
| PostgreSQL-Migration | PostgreSQL 16 und kompletter Katalog-Lebenszyklus | bestanden: CI `31286574938` |
| Unveränderliches Image | Commit-markiertes Container-Image | bestanden: Commit und OCI-Revision stimmen überein |
| Isoliertes Staging | Backup, Migration, reale Upload-/CRUD-/Suchproben | bestanden |
| Rückrollung | B4-App auf additivem B5-Schema plus Vorwärtswiederherstellung | bestanden |
| Restore | Pre-B5-Datenbank und Uploads getrennt wiederherstellen | bestanden |
| Pilotdaten | realer Artikel, Kategorie, Ort, Preis und Übergaberegel | folgt im nächsten geeigneten Pilot-/Launch-Baustein |

B5 ist damit technisch bestanden. Produktion wurde für diese Abnahme nicht
ausgerollt oder verändert.
