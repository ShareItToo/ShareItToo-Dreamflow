# C1F - V5.2 Handover, Return, Evidence and needsReview

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungsstand: `a2ef9163ad3118a2dfba18e3335d877511daa8d1`.

## Ergebnis

**Die begrenzte C1F-Implementierung ist commitgebunden GREEN. Release, Echtgeld,
Rechtsaktivierung und jede Live-Umgebung bleiben HOLD.**

Die bestehende Übergabe- und Rückgabelogik ist für neue V5.2-Verträge an den
exakten Plattformvertrag, Quote-Hash, `handover_return_damage`-Snapshot und
verarbeiteten privaten Upload gebunden. Historische V5.1-Datensätze werden
weder umbenannt noch nachträglich als V5.2 behandelt.

Ein Rückgabe-Prüffall kann nicht mehr über die allgemeine Buchungsmetadaten-
Synchronisation eröffnet oder verändert werden. Der neue authentifizierte,
idempotente Serverpfad akzeptiert nur eigene private `report_evidence`-Uploads
mit erfolgreichem Scan und gespeichertem SHA-256. Er prüft T0, das inklusive
48-Stunden-Fenster und den ausdrücklich eingegebenen strittigen Anteil der
bereits autorisierten Buchungssumme. Zusätzliche Belastung bleibt technisch
und im Schema exakt null.

## Verbindliche Quellen und Grenzen

- Drive-Arbeitspaket `02_CODEX_WORK_PACKAGES_SIT_V2.3.md`, C1F.
- V5.2 Core und User Legal Map, insbesondere Übergabe, Rückgabe,
  Zustandsnachweise, T0/T1 und `needsReview`.
- Die bereits vorhandenen V5.1-Grundlagen in Migration 019 sowie den Booking-,
  Confirmation-, Return-Domain- und Return-Lifecycle-Modulen.
- Keine Produktions-, VPS/OpenClaw-, DNS-, Cloud-, Payment-, Store-, Provider-,
  signierte Release-, öffentliche Rollout- oder Live-Traffic-Aktion.
- Das V5.2-Rechtsbundle bleibt `draft-blocked`, nicht provisioniert und nicht
  aktiviert. Es wurde keine Rechts- oder Provider-Tatsache erfunden.

## Umgesetzter Umfang

- Forward-only Migration `025_v52_handover_return_evidence.up.sql` ergänzt
  sieben append-only Tabellen für Zustandsnachweis-Bindungen,
  Bestätigungsbindungen, Challenge-Bindungen, Verifikationsereignisse,
  Rückgabefälle, Fallnachweise und Fallereignisse.
- Jeder neue V5.2-Zustandsnachweis bindet Teilnehmerrolle, Segment,
  Upload-ID, Upload-Zweck, Upload-Hash, Quelle, Zeit, Plattformvertrag,
  Quote-ID/-Hash und den unveränderlichen Dokument-Snapshot.
- Abholung: Vermieter präsentiert, Mieter prüft. Rückgabe: Mieter präsentiert,
  Vermieter prüft. Selbstbestätigung und segment- oder buchungsfremde
  Challenges bleiben ausgeschlossen.
- Die vier Presenter-Fotos haben die unverwechselbaren Slots
  `overview`, `detail`, `accessories` und `critical`. Eine dokumentierte
  Abweichung verwendet mindestens ein eigenes Gegenpartei-Foto im Slot
  `deviation`.
- QR und sechsstelliger Fallback bleiben an Buchung, Segment, Presenter,
  Gegenpartei, Challenge-Lebensdauer und den Hash des exakten Vier-Foto-Sets
  gebunden. Verifikation und Replay werden append-only aufgezeichnet.
- T0 verwendet zuerst den beiderseits bestätigten tatsächlichen
  Rückgabezeitpunkt, sonst den beiderseits bestätigten geänderten Zeitpunkt,
  sonst den gespeicherten Planzeitpunkt. Vor T0 und nach T0 plus 48 Stunden
  wird der Fall abgewiesen; der exakte Grenzzeitpunkt ist eingeschlossen.
- Fehlende Bestätigung bleibt bis T0 plus fünf Tage neutral und erzeugt weder
  `needsReview` noch eine neue Zahlungsfrist.
- Ein substantiierter T1-Fall speichert exakten Grund, private Nachweise,
  strittigen autorisierten Betrag, unstrittig freigebbaren Betrag, T1+5-
  Antwortfrist und T1+7-/wöchentlichen Statusrhythmus.
- Der Client verlangt den strittigen Anteil ausdrücklich als EUR-Betrag und
  fällt nicht auf die volle Miete zurück. Der Server begrenzt ihn auf den
  unveränderlichen Quote.
- Behaupteter Sachschaden bleibt Dokumentation. Schema, Workflow, Ereignis und
  Projektion erzwingen `additional_charge_minor = 0`; C1F erzeugt keine
  Belastung, Verrechnung, Kaution oder Schadensentscheidung.
- Kontoexport, Privacy-Inventar und Retention-Inventar enthalten alle sieben
  neuen Datensätze einschließlich Upload-Zweck, Hash und Scanstatus. Privacy
  und Retention bleiben ehrlich `draft` beziehungsweise execution-blocked.

## Autorisierungs- und Mutationsschutz

- Der neue Endpoint ist Auth-, Active-Account-, Scope- und Privat-Pilot-
  gebunden und läuft atomar mit Deadlock-Retry.
- Nur Buchungsteilnehmer dürfen einen Fall eröffnen; Beweisuploads müssen dem
  Actor gehören, privat, verarbeitet, unverbraucht und für
  `report_evidence` bestimmt sein.
- Vertragstext und SHA-256, Dokumentversion/-locale, Quote-ID/-Hash und
  Quote-Gesamtbetrag werden bei jedem V5.2-Bindungspfad erneut geprüft.
- Ein Buchungsschloss serialisiert konkurrierende Fallöffnungen. Pro Buchung
  ist genau ein V5.2-Rückgabefall zulässig; abweichende Idempotenz-Replays
  werden abgewiesen.
- Der alte allgemeine Rental-Request-Pfad weist jede neue oder abweichende
  V5.2-Fallmetadaten-Nutzlast mit
  `v52_return_case_requires_authorized_endpoint` zurück.
- Alle neuen C1F-Tabellen verweigern Update und Delete über den bestehenden
  Append-only-Trigger. V5.1-Zeilen bleiben lesbar und unverändert.

## Verifikation und commitgebundene CI

- Fokussierte C1F-, Rollen-, Challenge-, T0/T1-, Hash-, Upload-, Betrags- und
  No-Charge-Tests: PASS.
- Privacy-/Retention-Validatoren einschließlich Mutationstests: 56 PASS.
- Vollständige lokale Backend-Suite: 244 PASS, ein erwarteter Skip ohne lokale
  `TEST_DATABASE_URL`, 0 Fehler.
- Vollständige Flutter-Suite: 295 PASS, ein dokumentierter Skip, 0 Fehler.
- Vollständiger technischer CI-Metadatenlauf: PASS mit OpenJDK 17,
  Flutter 3.41.7 und Dart 3.11.5.
- Vollständiger Analyzer: bestehende akzeptierte Baseline von 223 Hinweisen,
  keine verbotene Korrektheitsregression.
- Web-Debug-Build und Android-Debug-APK: PASS.
- `node --check`, Privacy-/Retention-CLI und `git diff --check`: PASS.
- GitHub Actions Lauf
  [`32356255645`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32356255645)
  für den exakten Implementierungs-Commit: GREEN.
- Backend-Regression einschließlich disposable PostgreSQL und Migration 025:
  245 PASS, 0 Skip, 0 Fehler; Container-, Compose-, History- und
  commitgelabelter Image-Build ebenfalls PASS.
- Flutter-Regression: 295 PASS, ein dokumentierter Skip, 0 Fehler;
  Web-Debug- und Android-Debug-Build PASS. Der signierte Kandidatenschritt
  blieb erwartungsgemäß übersprungen.
- Das Publish-Job blieb erwartungsgemäß übersprungen; es wurde kein Image
  veröffentlicht.

Der technische Lauf nutzte `CI=true` ausschließlich für den vorgesehenen
Metadatenpfad des owner-only Play-Archivs. Das fehlende lokale private AAB
wurde nicht erzeugt, ersetzt oder als vorhanden behauptet. Der Lauf belegt
keinen signierten Kandidaten, Store-Upload, Gerätezellen-Pass oder Live-Stand.

## Datenmigration und Rollback

Migration 025 ist additiv und forward-only. Sie wurde lokal nicht gegen eine
Staging- oder Produktionsdatenbank provisioniert. Bestehende V5.1-Tabellen,
Zeilen und Hashes bleiben unverändert; neue V5.2-Zeilen sind append-only.

Ein Rückgängigmachen darf nur über einen neuen Revert-Commit erfolgen. Reset,
Rebase, Force-Push, destruktives Entfernen der Migration und History-Rewrite
bleiben ausgeschlossen. Bei einem App-Rollback bleiben die neuen Tabellen
inert erhalten.

## Fortbestehende Gates

- Privacy, Retention, Legal, Store, Payment, Provider und signierte Releases
  behalten ihre vorhandenen offenen oder blockierten Zustände.
- Keine Fallentscheidung, Auszahlung, Erstattung, Abbuchung oder sonstige
  PSP-Aktion wurde ausgeführt oder vorbereitet.

## Nächster Schritt

C1F ist GREEN abgeschlossen. Der reine Dokumentationsübergang auf
**C1G - V5.2 Privacy, Network, FCM and Crashlytics** ist zulässig. Reale
Provider-, Vertrags-, Transfer-, Store- und Betreiberfakten bleiben offene
FI0-Gates und dürfen in C1G nicht angenommen werden.
