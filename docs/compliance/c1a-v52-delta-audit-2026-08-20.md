# C1A - V5.2 Delta Audit

Stand: 20.08.2026
Branch: `codex/master-workflow-20260808`
R0-Produktbaseline: `df62700a4ead526abc5d84edb0139f17fb0c21bc`
R1-Guidance-Stand: `04a9db9df19e88e2fd379cc47606d063134d978b`

## Ergebnis

**C1A ist GREEN fuer die begrenzte Fortsetzung in die nachgewiesen offenen
C1B-C1I-Arbeitspakete. Der Release bleibt HOLD.**

Die V5.2-Core-Spezifikation und die V5.2-Rechtsmappe widersprechen einander in
keinem fuer die Umsetzung materiellen Punkt. Die vorhandene V5.1-Implementierung
deckt einen grossen Teil der V5.2-Fachlogik bereits ab. Sie darf deshalb nicht
pauschal ersetzt werden. Offen sind vor allem die V5.2-Versionierung und
Rechtsassets, exakte Checkout-/Rabattdetails, einige End-to-End-Verkabelungen,
Datenschutz-/Moderationshaertung, reale Betreiber-/Providerfakten sowie ein neu
gebundener Kandidaten- und Geraetenachweis.

Klassifikation: **12 done, 16 open, 4 obsolete, 0 conflict.**

`done` bedeutet in diesem Audit: im Quellstand und durch passende Tests oder
fail-closed Gates belegt. Es bedeutet nicht Produktion, Echtgeld, Store- oder
Rechtsfreigabe. `open` bedeutet: V5.2 ist eindeutig, aber der aktuelle Stand
erfuellt die Anforderung noch nicht vollstaendig. `obsolete` bedeutet: nur noch
historischer Beleg, keine aktuelle Arbeitsautoritaet. `conflict` waere ein nicht
sicher aufloesbarer Widerspruch zwischen verbindlichen Quellen; ein solcher
Widerspruch wurde nicht gefunden.

## Verbindliche Eingaben

- [V5.2 Core Specification](https://drive.google.com/file/d/1HQR2EWJg6FUcU41l5uwditfFzNoCe6Zx/view)
- [V5.2 Rechtsmappe Privat-Launch](https://drive.google.com/file/d/1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2/view)
- `AGENTS.md`, `docs/current_state.md`, Code, Migrationen, Tests und
  maschinenlesbare Manifeste des oben genannten Repository-Stands

Die Rechtsmappe ist eine ausdrueckliche Entscheidungs- und Umsetzungsfassung,
keine Behauptung einer anwaltlichen Pruefung. Fehlende reale Tatsachen bleiben
Release-Gates; sie werden weder geraten noch als abgeschlossen markiert.

## Done / open / obsolete / conflict matrix

| Nr. | V5.2-Anforderung | Status | Repository-Beleg und Delta | Naechstes Paket |
|---:|---|---|---|---|
| 1 | Nur volljaehrige natuerliche Personen, Konto/Inserat/Buchung privat; Deutschland und serverfreigegebene Regionen | open | Registrierung erzwingt Mindestalter- und Privatbestaetigung (`backend/src/app.js`), Inserat und Buchung speichern Privatstatus (`backend/sql/migrations/012_private_pilot_v4_foundation.up.sql`). Bei der Buchungsanlage werden die dauerhaft gespeicherten Kontoerklaerungen und eine echte Region-Allowlist jedoch nicht erneut serverseitig gebunden; aktuell wird im Wesentlichen das Request-Flag und Deutschland geprueft (`backend/src/private_pilot_domain.js`). Haendlerindizien sind nicht als eigener Blocker belegt. | C1H |
| 2 | Ausschliesslich serverseitige Kategorie-Allowlist; keine Fahrzeuge oder Verkehrsmittel | open | Eine serverseitige Positivliste existiert und blockiert unbekannte Kategorien. `cat3` ist aber als breite Kategorie `Kameras & Drohnen` zugelassen; V5.2 verlangt, moegliche Verkehrsmittel nicht freizuschalten. Drohnen muessen serverseitig getrennt oder explizit ausgeschlossen werden. Nicht freigeschaltete Kategorien duerfen ausserdem nicht nur in der UI verborgen sein. | C1H |
| 3 | Keine von SIT gesetzte Wertobergrenze | done | Die Nutzertexte benennen ausdruecklich keine Wertobergrenze (`lib/screens/legal_terms_screen.dart`); es existiert kein Launch-Wertlimit in Quote oder Kategorieguard. | - |
| 4 | Keine Lieferung, Versand- oder Expressfunktion | done | Server-, App- und Ingestion-Pfade neutralisieren oder verweigern diese Felder (`backend/src/v51_transport_domain.js`, `backend/src/private_pilot_domain.js`, `test/tool/v51_transport_disabled_wiring.test.mjs`, `test/v51_transport_ingestion_test.dart`). | - |
| 5 | Keine Kaution, Schutzleistung, Schadengarantie, Damage-Capture oder SIT-Inkasso | done | Migration 011 erzwingt Nullwerte und blockiert Deposit-Schreibpfade; Quote und Payment-Domain liefern `securityDepositMinor: 0`. Schadensbetraege bleiben reine Dokumentation und erzeugen keine Zusatzbelastung (`backend/src/private_pilot_return_domain.js`, PostgreSQL-Integrationstests). | - |
| 6 | Kein Echtgeld vor lizenziertem Marketplace-PSP und vollstaendiger Testabnahme | done | `realPaymentsEnabled=false`; aktueller Payment-Modus ist disabled/memory, Checkout bleibt ohne serverseitig freigegebene Zahlungsmethode gesperrt. `store/submission.json` bleibt draft und `submissionAllowed=false`. | - |
| 7 | Reales Marketplace-PSP-Modell, Vertrag, Region, Onboarding, Geldfluss und komplette Testmatrix | open | Stripe-/Ledger-/Refund-/Payout-Grundlagen und Memory-Tests existieren, aber Providervertrag, reale Produktkonfiguration, Region und Live-Abnahme fehlen ausdruecklich. Echtgeld und produktive Ausstellung bleiben fail-closed. | FI0 / spaeteres PSP-Gate |
| 8 | Eine serverseitige Preiswahrheit in Integer-Cent mit 10 Prozent, Half-up, unveraenderlichem Quote-Snapshot und Hash | done | `backend/src/booking_domain.js`, Migration 016, `backend/src/booking_workflow.js` und die Quote-Binding-Tests belegen Centrechnung, zehn Minuten Gueltigkeit, Nutzer-/Listing-/Zeitraum-/Revisionsbindung und manipulationsgeschuetzten Hash. | - |
| 9 | Rabatte mit stabiler ID, konkretem Label und Finanzierungsquelle im Quote-Snapshot | open | Rabattbetrag und Prozent sind im Quote vorhanden; das Checkout-Label wird aber clientseitig aus den aktuellen Listing-Tiers rekonstruiert. Eine unveraenderliche Rabatt-ID, das serverseitige Label und die Finanzierungsquelle fehlen im Snapshot. | C1B |
| 10 | Alle Preisflaechen zeigen den Mieter-Endpreis; exakte `Preisaufschluesselung`; Karte, Detail, Checkout, Bestaetigung, Storno und Beleg centgleich | open | Zahlreiche Wiring- und Fluttertests binden Checkout, Buchungsdetail und Vermieterannahme an den gespeicherten Snapshot. Der exakte Einstieg beziehungsweise Titel `Preisaufschluesselung` fehlt, und die vollstaendige Flaechenmatrix ist noch nicht mit V5.2-Screenshots/E2E-Nachweis abgeschlossen. | C1B, C1I |
| 11 | Finaler Checkout mit Risikohinweis, exakt zwei nicht vorausgewaehlten V5.2-Erklaerungen und Button `Bestätigen und bezahlen` | open | Button, Sperrlogik, zwei Checkboxen und C2C-/Kein-Schutz-Hinweis existieren und sind getestet. Der erste gespeicherte Wortlaut enthaelt jedoch nicht den von V5.2 verlangten Link-/Versionsbezug im exakten Erklaerungstext; Dokumentversion und Code sind weiterhin V5.1. | C1C, C1D |
| 12 | SIT-Plattformvertrag vor Mietanfrage, ausdrueckliche SIT-Annahme und dauerhafter Beleg mit Volltexten/Hashes und protokollierter Zustellung | open | Migrationen 015/017 und `backend/src/v51_contract_workflow.js` erzeugen Vertrag, genau zwei append-only Erklaerungen und einen hashgebundenen HTML-Beleg vor dem `booking.requested`-Event. Der App-Flow zeigt nach Abschluss aber nur `Buchungsanfrage gesendet`; der Vertragsbeleg ist im Flutter-Buchungsmodell nicht als dauerhaft wiederauffindbarer Download verkabelt. Eine echte E-Mail/PDF-Zustellung ist ebenfalls nicht belegt. | C1C, C1D |
| 13 | Vermieterannahme nur rechtzeitig und auf demselben Quote/Dokumentstand; Ablehnung/Timeout/Endfehler ohne Gebuehr | done | Vermieteransicht zeigt Miete, Rabatt, SIT-Gebuehr, Mieter-Gesamt und Auszahlung aus dem unveraenderlichen Snapshot. Frontend und Backend verweigern die Annahme nach der gespeicherten 30-Minuten-Grenze; Hold-Timeouts schliessen den Vorgang. Echtgeld bleibt unabhaengig gesperrt. | - |
| 14 | Zweistufiger Widerruf fuer Konto- oder Buchungsvertrag, keine Begruendung, dauerhafte Bestaetigung und getrennte Refund-Schuldner | done | `lib/screens/platform_withdrawal_screen.dart`, Migration 018 und `backend/src/v51_withdrawal_workflow.js` bilden Auswahl, Folgen, zweite Bestaetigung, unveraenderlichen Beleg, Vor-/Nach-Uebergabe-Folgen sowie getrennte `rent_refund`- und `sit_fee_refund`-Objekte ab. | - |
| 15 | Storno: 24h/50 Prozent/60 Minuten; ab Start und bei No-Show tatsaechlicher Verlust mit geringerem oder keinem Schaden | open | Die Centformeln, Karenzgrenze und `pending_actual_loss_assessment` sind implementiert. Fuer Ersatzvermietung, ersparte Aufwendungen und nachgewiesenen geringeren/fehlenden Schaden fehlt jedoch ein vollstaendiger autorisierter Erfassungs-, Entscheidungs- und Abschlussworkflow; offene Obligationen bleiben sonst dauerhaft pending. | C1E |
| 16 | Einheitliche T0/T1-Rueckgabezeitachse, neutrale fehlende Bestaetigung, Teilfreigabe und 5-/7-Tage-Fristen | done | `backend/src/private_pilot_return_domain.js`, `backend/src/return_lifecycle_workflow.js` und die zugehoerigen Tests belegen T0+48h, `awaitingReturnConfirmation` bis T0+5d, substantiierte T1-Faelle, T1+5d Stellungnahme, T1+7d und anschliessenden Sieben-Tage-Rhythmus sowie die Freigabe unbestrittener autorisierter Betraege. | - |
| 17 | Vier Fotos durch die uebergebende Partei, Gegenbestaetigung oder Abweichungsfoto, QR/6-stelliger Code, keine Selbstbestaetigung, private Ablage | done | Migration 019 und `backend/src/booking_condition_evidence_workflow.js` erzwingen Rollen, mindestens vier Presenter-Fotos, mindestens ein Abweichungsfoto bei Widerspruch, append-only Evidenz und Gegenpartei-Bestaetigung. Der Confirmation-Workflow ist rollen- und challengegebunden. | - |
| 18 | Teile A-I der V5.2-Rechtsmappe getrennt, barrierearm, versioniert, hashgebunden, verlinkt und herunterladbar; J-L intern | open | Der aktuelle Bundle enthaelt nur sieben V5.1-Assets und bleibt korrekt `draft-blocked` (`assets/legal/de/legal_manifest_v5.json`). V5.2 verlangt neun getrennte Nutzerteile A-I, insbesondere eigene Uebergabe-/Rueckgabe-/Schaden-, Zahlungs-/Auszahlungs- und Melde-/Ueberpruefungsdokumente. V5.2-Hashes, Links, Downloads und Snapshots fehlen. | C1C |
| 19 | Zentrale LegalConfig mit wahrer Betreiberin, Register, Kontakt, Aufsicht, Providern, Regionen, Firebase-Vertragsfakten und hartem Produktionsgate | open | Es gibt Teilgates fuer Public-Compliance und Finanzdokumente (`backend/src/config.js`, `tool/validate_legal_readiness.mjs`). Exakte eingetragene Gesellschaft, Gericht/HRB, Widerrufs-URL, Hoster/SMTP/Karten/PSP sowie Firebase-Vertragsgesellschaft, DPT-Stand und Transfermechanismus sind weiterhin offen. Nichts davon darf erfunden werden. | C1H, FI0 |
| 20 | FCM nur transaktional, neutraler Sperrbildschirmtext, keine sensitiven Payloads, kurze ereignisbezogene TTL, BigQuery/Analytics aus | open | Tokenverwaltung und transaktionale Outbox existieren; Analytics/Ads sind deaktiviert. `backend/src/notifications.js` und `backend/src/push_sender.js` senden derzeit aber spezifische Titel/Artikeltexte und Entity-IDs und setzen keine ereignisbezogene FCM-TTL. Das entspricht noch nicht dem neutralen V5.2-Lockscreen-Vertrag. | C1G |
| 21 | Crashlytics beim Erststart aus; separates freiwilliges Opt-in; Widerruf; keine User-ID; bereinigte Allowlist | done | Android/iOS-Autocollection ist aus, Push und Crash sind getrennte default-off Praeferenzen, `setCrashlyticsCollectionEnabled` und `deleteUnsentReports` sind verkabelt, `setUserIdentifier` ist per Test ausgeschlossen. | - |
| 22 | Provider-/Transfer-/Retention-/Loeschfakten, Store-Formulare und datensatzbezogene Loeschmatrix | open | `store/privacy-disclosures.json` und `store/retention-deletion-readiness.json` bleiben absichtlich draft. FCM, Crashlytics, Auth und Maps haben keine verifizierte Owner-Retention-/Loeschfreigabe; neun Retention-Entscheidungen, Google-Play-Datensicherheit und Apple-App-Privacy sind offen. | C1G, FI0 |
| 23 | Netzwerkhaertung: Fonts lokal, externe GenAI/Bildhosts/Places/Nominatim/OSM standardmaessig aus, manuelle Fallbacks und Release-Netzwerknachweis | open | AI- und Werbe-/Analytics-Flags sind aus, Release-Bilder sind auf kontrollierten SIT-Speicher begrenzt und Maps ist serverseitig proxied. Ein abschliessender V5.2-Netzwerkmitschnitt fuer alle ausgeschalteten Ziele, vollstaendige providergebundene Feature-Gates und der gesamte Fallback-Nachweis fehlen. | C1G, C1I |
| 24 | DSA-Meldeweg fuer Profil/Inserat/Bewertung/Nachricht mit Eingang, Entscheidung, Begruendung und sechsmonatiger interner Ueberpruefung | open | Server-Meldungen, Rollen, Massnahmen, append-only Events und Moderationsgruende existieren. Ein nutzergebundener Entscheidungsbeleg, ausdruecklicher interner Ueberpruefungs-/Beschwerdeworkflow mit Frist und vollstaendige Art.-18-/VSBG-/BFSG-Verkabelung sind nicht belegt. | C1H |
| 25 | Belege nur aus erfolgreichem Snapshot; SIT-Beleg nur fuer SIT-Gebuehr; keine pauschale Umsatzsteuer auf private Miete | done | Migration 020 und `backend/src/financial_documents.js` erzwingen Quellereignis, Rollen, Schuldner, Summen und append-only Artefakte. Tests verweigern Belege fuer nicht bezahlte/abgelehnte Vorgaenge und Live-Ausstellung ohne Steuer-/Betreiberfreigabe. | - |
| 26 | Produktion, Echtgeld, Store, oeffentliche Rechtstexte und Live-Ausstellung bleiben bei offenen Tatsachen fail-closed | done | Legal-, Privacy-, Retention-, Financial-Document- und Submission-Manifeste bleiben draft/open; `submissionAllowed=false`. C1A hat kein Gate geschlossen und keine externe Umgebung veraendert. | - |
| 27 | Vollstaendige V5.2-Abnahme, Screenshots, reale E2E-Buchung, Pixel-/iOS-Matrix und neuer eindeutig gebundener Kandidat | open | Die R0/R1-Regression ist technisch gruen und das Pixel 7 Pro ist ADB-autorisiert. Das ist kein V5.2-Kandidaten- oder Geraetebeleg. Die gesamte V5.2-Flaechen-, Netzwerk-, Checkout-/Widerruf- und reale Zweirollenmatrix muss erst nach C1B-C1H auf einem neuen Commit-/Buildstand laufen. | C1I |
| 28 | Interner professioneller Prueftrigger spaetestens bei 5.000 EUR kumulierter tatsaechlich vereinnahmter SIT-Gebuehr oder frueherem Vorfall | open | Im aktuellen Code/Compliance-Register existiert kein automatischer oder nachweisbarer Reminder aus real vereinnahmten SIT-Gebuehren. Er darf keine Funktion freischalten und benoetigt eine fail-closed interne Umsetzung. | C1H |
| 29 | Fruehere offene V4-Entscheidungsfragen | obsolete | Die sechs V4-Fragen wurden bereits durch die V5.1-Fachentscheidungen ersetzt; V5.2 bestaetigt diese Regeln. `openPilotDecisions` ist nur noch Migrations-/Historienbeleg und darf nicht als aktuelles offenes Produktmandat gelesen werden. | - |
| 30 | V5.1-Rechtsbundle als aktuelle Nutzerautoritaet | obsolete | Die sieben V5.1-Dateien bleiben wertvolle Herkunfts- und Testbelege, sind fuer V5.2 aber nicht die zu aktivierende Fassung. Sie bleiben `draft-blocked`, bis ein getrenntes V5.2-Bundle sie ersetzt; keine stille Umschreibung alter Hashes. | C1C |
| 31 | Play-Kandidat `2026081509` und lokaler Kandidat `2026081510` als V5.2-Nachweis | obsolete | Beide Kandidaten sind historische Belege fuer fruehere Quellstaende. Weder darf fuer V5.2 wiederverwendet, neu etikettiert noch als aktueller Binary-/Store-Nachweis ausgegeben werden. | C1I |
| 32 | V5.1-Quellaussage, Push und Crash im Startbetrieb allgemein zu deaktivieren | obsolete | Die spaetere V5.1-Produktentscheidung und nun V5.2 setzen FCM transaktional sowie Crashlytics nach separatem freiwilligem Opt-in fort. Der alte Quellenkonflikt ist durch V5.2 als neue Autoritaet erledigt; Provider- und Store-Gates bleiben trotzdem offen. | - |

## Abgeleitete sichere Reihenfolge

1. **C1B - Preis/Quote:** Rabatt-ID, serverseitiges Label und
   Finanzierungsquelle in den unveraenderlichen Snapshot aufnehmen; exakte
   Preisaufschluesselung und alle Preisflaechen binden.
2. **C1C - Rechtsregister:** V5.2-A-I als neues, getrenntes, hashgebundenes und
   weiterhin inaktives Bundle erstellen. V5.1-Artefakte nicht ueberschreiben.
3. **C1D - Checkout/Vertrag:** exakte V5.2-Erklaerungen, Links/Versionen,
   sichtbare SIT-Annahme, wiederauffindbaren dauerhaften Beleg und State-Machine
   auf C1B/C1C binden.
4. **C1E - Widerruf/Storno:** vorhandene Logik migrieren; den offenen
   Actual-Loss-/Ersatzvermietungs-/Geringerschaden-Workflow schliessen.
5. **C1F - Uebergabe/Rueckgabe:** vorhandene Evidenz- und T0/T1-Grundlage auf
   V5.2-Versionen migrieren und fehlende Rand-/Autorisierungstests ergaenzen.
6. **C1G - Datenschutz/Netzwerk:** neutrale FCM-Payload und TTL-Vertrag,
   Crash-/Netzwerk-Allowlist, Feature-Gates und maschinenlesbare Offenpunkte
   synchronisieren. Reale Providerfakten bleiben FI0-Gates.
7. **C1H - Kategorien/Moderation/Betreiber:** Server-Allowlist haerten,
   Konto-/Region-/Haendlerpruefung, DSA-Ueberpruefungsweg, LegalConfig und
   5.000-EUR-Reminder umsetzen; Betreiber-/Registerfakten nicht erfinden.
8. **C1I - Integration:** komplette Regression, PostgreSQL, Web/Android,
   Screenshots, Netzwerkpruefung, Pixel-/iOS-/Zweirollenmatrix und erst dann
   einen eindeutig neuen, commitgebundenen Kandidaten pruefen.

Danach bleibt die Drive-Reihenfolge `FI0 -> G2A -> G2L -> G2B -> U0` bestehen.
FI0 darf nur reale Tatsachen schliessen; es ist kein Platz fuer Annahmen.

## Harte Grenzen waehrend C1

- keine Produktion, VPS/OpenClaw, DNS, Cloud-Konsole oder Live-Traffic-Aktion;
- kein Echtgeld, Store-Upload, oeffentliche Rechtstext-Aktivierung oder
  Live-Finanzdokument;
- keine erfundene Gesellschaft, HRB, Steuerbehandlung, Providerregion,
  Vertragsgesellschaft oder PSP-Freigabe;
- kein Ueberschreiben unveraenderlicher V5.1-Evidenz;
- keine Freigabe nur aufgrund gruenen Quellcodes: FI0 und die objektiven
  Release-Gates bleiben zusaetzlich erforderlich.

## C1A-Akzeptanz

- beide V5.2-Quellen vollstaendig inhaltlich ausgewertet;
- alle materiellen Core-Abschnitte 1-15 und die nutzerrelevanten Teile A-I der
  Rechtsmappe in der Matrix abgedeckt;
- keine nicht aufloesbare Rechts-/Produktkollision gefunden;
- offene Arbeit in kleinste sichere C1B-C1I-Reihenfolge ueberfuehrt;
- keine Produkt-, Schema-, Manifestfreigabe-, Release- oder externe Mutation in
  C1A durchgefuehrt.
