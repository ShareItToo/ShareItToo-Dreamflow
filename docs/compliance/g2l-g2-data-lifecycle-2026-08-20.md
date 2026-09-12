# G2L - Legal/Privacy-Delta und Datenlebenszyklus

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungscommit:
`b84787e630a96de632eee90e8c7e016a078fcaef`

GitHub Actions:
[`32383235202`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32383235202)
ist fuer genau diesen Commit GREEN.

## Status und Ergebnis

**G2L ist technisch GREEN.** Der bestehende lokale Zustand unter `Gemerkt`
ist jetzt im Nutzerexport enthalten und wird nach bestaetigter Kontoloeschung
auf dem ausfuehrenden Geraet gezielt entfernt. Die aktuelle Privacy-Oberflaeche
erklaert `Gemerkt` als unverbindlich und grenzt sie von einer Reservierung sowie
einem persistenten Miet- oder Projektkorb ab.

Die spaeteren Datenklassen `Mietkorb` und `Projektkorb` sind in einem
maschinenlesbaren Lebenszyklusvertrag erfasst, bleiben aber bis G2B explizit
`inactive-not-collected`. Eine Aktivierung ohne Export-, Loeschungs- und
Retention-Abdeckung scheitert fail-closed.

## Verbindliche Quellen und Grenzen

- Drive `01_CONTROL_V2.3_AUTONOMOUS.md` und
  `02_CODEX_WORK_PACKAGES_SIT_V2.3.md`.
- Drive `02_SIT_GROWTH_PRODUCT_PROJEKTKORB_UND_PLANER.pdf`, Version 2.0 vom
  18.08.2026.
- V5.2 Core Specification und Rechtsmappe sowie die vorhandenen Privacy-,
  Retention-, Legal- und Store-Manifeste.
- Historische V5.1-Rechts-, Consent-, Quote- und Evidence-Snapshots blieben
  bytegleich.
- Keine Produktions-, VPS/OpenClaw-/Maximus-, SSH-, DNS-, Cloud-, Payment-,
  Store-, Provider-, Account- oder oeffentliche Aktion.

## Geaenderte Laufzeit und Artefakte

- `DataService` exportiert den aktuellen principal-scoped Stand aus
  `wishlist_state_v3` und `rental_cart_v2`. `wishlist_state_v2`,
  `saved_item_ids`, `wishlists_meta_v1`, `wishlist_assign_v1`,
  `rental_cart_v1`, `project_cart_v1` und `rental_cart_sync_owner_v1` bleiben
  Gast-Kompatibilitaetsbereiche; angemeldete Konten werden nicht in diese
  geraeteweiten Werte gespiegelt.
- Fehlerhaftes lokales JSON wird nicht still ausgelassen; der Export bricht
  sichtbar ab, statt einen unvollstaendigen Datensatz als vollstaendig
  auszugeben.
- Beide bestaetigten Kontoloeschungspfade entfernen den aktuellen Konto-Bucket
  und einen nur diesem opaken Konto zugeordneten ausstehenden Gast-Sync. Andere
  Konto-/Gast-Buckets und unabhaengige Geraeteeinstellungen bleiben erhalten.
- Die Privacy-Info nennt lokale Merklisten in Zweck, Export und Loeschung.
- Die aktuelle Privacy-Oberflaeche nennt die lokale Aufbewahrungsgrenze und
  fordert fuer einen spaeteren persistenten Korb eine eigene Lifecycle-
  Abdeckung vor Aktivierung.
- `store/g2-data-lifecycle.json` bindet aktuellen und geplanten Zustand. Der
  neue Validator prueft Manifest, Laufzeitquellen, Privacy-Texte und beide
  Loeschungspfade und blockiert vorzeitige Cart-Persistenz.
- Privacy-, Retention- und Legal-Source-Hashes wurden fuer jede tatsaechlich
  geaenderte aktuelle Quelle aktualisiert. Freigabestatus bleiben unveraendert
  draft/open.

## Tests und Verifikation

- Fuenf positive und negative G2-Lifecycle-Validator-Tests PASS.
- G2-Lifecycle-, Privacy-, Retention- und Legal-Validatoren PASS; strikte
  Freigaben bleiben erwartungsgemaess blockiert.
- Fokussierte Flutter-Tests fuer Export, selektive Loeschung und bestehende
  G2A-Persistenz: drei PASS.
- Vollstaendige lokale technische Regression: 303 Flutter-Tests PASS, ein
  dokumentierter Skip, Google-only-Profiltest PASS, Analyzer auf der
  akzeptierten 223er-Baseline, Web-Debug-Build und Android-Debug-APK PASS.
- Der lokale Lauf nutzte `CI=true` nur fuer den erlaubten metadata-only
  Handoff. Daraus wird kein Store-, Signier- oder Device-Pass abgeleitet.
- Exakte GitHub-CI: Backend- und Flutter-Regression PASS. Der signierte
  Android-Releasekandidat und `publish-api-image` wurden uebersprungen.
- `git diff --check`, exakte Source-Hashes und gestagter Umfang waren sauber.

## Datenmigration, Risiken und Rollback

- Keine Datenbankmigration, kein neuer Serverdatensatz und keine Umschreibung
  vorhandener lokaler Wishlist-Daten.
- Ein lokaler Export beschreibt bewusst nur das aktuelle Geraet. Lokal auf
  anderen Geraeten verbliebene App-Daten koennen ohne dort ausgefuehrte
  Loeschung oder spaetere kontogebundene Migration nicht ferngeloescht werden.
- Privacy, Retention, Legal, Store und finaler Binary-Scan bleiben
  draft/open/fail-closed. Es wurde keine Rechtsgrundlage, Frist oder Freigabe
  erfunden.
- Ein normaler Revert des Implementierungscommits stellt den vorherigen Code
  wieder her. Weil G2L weder bestehende Daten umschreibt noch ein Schema
  migriert, ist kein Daten-Rollback erforderlich.

## Naechster Schritt

Das aktive Folgepaket ist **G2B - Persistenter Mietkorb**. Es darf
kontogebundene Cart-/Projektcontainer, lokale Gastvorbereitung mit
Login-Rueckkehr sowie serverseitige Verfuegbarkeits- und Quote-Neupruefung
implementieren. Der Korb bleibt unverbindlich und ist nie eine Reservierung;
direkte Einzelmiete und alle bestehenden V5.2-Buchungs-, Preis-, Vertrags- und
Payment-Gates bleiben erhalten.

## Aktueller Nachfolger RW4

RW4 setzt den G2L-Lifecycle principal-scoped um. Der lokale Export kennzeichnet
nur `authenticated-account` oder `guest-device`, gibt keine lokale
Prinzipal-ID aus und umfasst ausschliesslich den aktiven Bucket. Valider
unscoped Altbestand kann nur zum Gast migrieren; unlesbarer Altbestand oder ein
unlesbarer Einzel-Bucket bleibt quarantainiert und wird nicht als leer
ausgegeben. Die Registry ist auf zwoelf gueltige plus quarantainierte Buckets
begrenzt; Ueberlauf verwirft keinen vorhandenen Nutzerbestand. Retention-,
Legal- und externe Freigabestatus bleiben unveraendert offen.

## Aktueller Nachfolger RW6

RW6 ergaenzt die Lifecycle-Wahrheit fuer bereits vorhandene lokale operative
Fallback-Daten. Nachrichten, Benachrichtigungen, Mietanfragen, Timeline- und
Lesemarker sowie Uebergabe-/Rueckgabe-Metadaten sind nur mit passender aktueller
Auth-Session und, wo erforderlich, Teilnehmerrolle sichtbar oder veraenderbar.
Ein zurueckgebliebenes lokales Profil ist keine Authentifizierung.

Thread-Loeschung wirkt nur fuer das aktuelle Konto; die Gegenpartei behaelt den
gemeinsamen Verlauf. Nicht zuordenbare Alt-Benachrichtigungen bleiben erhalten,
werden aber keinem spaeteren Konto zugewiesen oder exportiert. Fehlerhafte
operative Dokumente bleiben bytegetreu erhalten und schlagen geschlossen fehl.
Volle begrenzte Speicher lehnen neue Writes ab, statt akzeptierte Historie zu
kuerzen.

Der lokale Privacy-Export umfasst Kontodaten und gemeinsame Vorgangsdaten nur
fuer den aktuellen Teilnehmer. Bei bestaetigter Kontoloeschung werden lokale
Komfortdaten und der kontospezifische Thread-Tombstone bereinigt; gemeinsame
Mietanfrage-, Timeline- und Handover-Daten bleiben fuer Gegenpartei und
Legal-/Audit-Kontinuitaet bestehen. RW6 erfindet keine Aufbewahrungsfrist und
aendert weder Backend-Autoritaet noch Rechts-, Produktions- oder Live-Gates.

## Aktueller Nachfolger RW7

RW7 ergaenzt die Lifecycle-Wahrheit fuer den geraetelokalen Anzeigenkatalog.
Oeffentliche Katalog-Reads bleiben kontofrei; lokale Create-, Edit-, Status-,
Delete- und Loeschkonto-Deaktivierungswrites verlangen eine passende aktuelle
Auth-Session und den exakten Anzeigeninhaber. Writes sind serialisiert,
read-back-verifiziert und durch `catalogRevision` gegen veraltete Edits
geschuetzt.

Das `items`-Dokument ist auf 1.000 eindeutige Eintraege und 32 MiB begrenzt.
Fehlerhafte oder doppelte Eintraege schliessen den gesamten Read, ohne den
bytegetreuen Altstand teilweise zu bereinigen. Kapazitaets- oder Schreibfehler
entfernen keine Fotos und keine anderen Anzeigen. Die fruehere automatische
Loeschung beendeter Anzeigen nach 60 Tagen ist entfernt, weil keine genehmigte
Aufbewahrungsentscheidung dafuer vorliegt.

Der lokale Privacy-Export enthaelt nur Anzeigen des aktuell authentifizierten
Kontos. Bestaetigte lokale Kontoloeschung beendet dessen Anzeigen und behaelt
die Datensaetze ohne erfundene Frist. Andere oeffentliche Cache-Eintraege werden
weder dem Konto zugerechnet noch exportiert. Rechts-, Backend-Autoritaets-,
Produktions-, Provider-, Payment-, Store- und Live-Gates bleiben unveraendert
offen.

## Aktueller Nachfolger RW8

RW8 ergaenzt die Lifecycle-Wahrheit fuer die geraetelokale Review- und
Reputation-Fallback-Ablage. Oeffentliche Bewertungs-Reads bleiben kontofrei;
lokale Einreichungen verlangen die passende aktuelle Auth-Session sowie den
exakten Teilnehmer, die Richtung, Gegenpartei und Anzeige einer abgeschlossenen
Buchung ohne aktiven `needsReview`-Hold. Caller-IDs allein autorisieren keinen
Write.

Die Dokumente `reviews` und `multi_reviews_v1` sind jeweils auf 1.000
eindeutige Eintraege und 8 MiB begrenzt. Fehlerhafte, doppelte oder
unvollstaendige Eintraege schliessen den gesamten Read und bewahren den
bytegetreuen Altstand. Writes sind serialisiert, read-back-verifiziert und an
einen unveraenderten Buchungssnapshot gebunden. Kapazitaets- oder Schreibfehler
kuerzen keine bestehende Bewertungshistorie. Ein fehlendes Classic-Dokument
bleibt leer; Demo-Reputation entsteht nur durch expliziten QA-Bootstrap.

Der lokale Privacy-Export enthaelt nur vom aktuellen Konto verfasste oder
empfangene Bewertungen. Gemeinsame oeffentliche Bewertungen bleiben zusammen
mit der bestehenden Kontoanonymisierung erhalten; RW8 erfindet keine
Aufbewahrungsfrist. Submission und Profil-Reads zeigen bei Fehlern einen
erneuten Versuch, statt Eingaben zu verwerfen, falschen Erfolg oder eine leere
Historie zu behaupten. Rechts-, Moderations-, Backend-Autoritaets-,
Produktions-, Provider-, Payment-, Store- und Live-Gates bleiben unveraendert
offen.

## Aktueller Nachfolger RW9

RW9 ergaenzt die Lifecycle-Wahrheit fuer das geraetelokale Konto- und
Profil-Fallback. Die beiden Spiegel `currentUser` und `users` werden als
strikte, begrenzte Dokumente gelesen; unvollstaendige, doppelte oder
fehlerhafte Identitaeten bleiben bytegetreu erhalten und schlagen geschlossen
fehl. Nutzernahe Profil-Aenderungen sind feldbegrenzt, an die exakte aktuelle
Auth-Session gebunden und koennen optionale Felder explizit loeschen.
Identitaet, Verifikation, Moderation, Rolle, Auszahlung, Reputation und
Deaktivierung sind nicht caller-mutable.

Profilwrites laufen serialisiert, pruefen beide Spiegel nach dem Schreiben und
stellen bei einem erkannten Fehler deren exakten vorherigen Stand wieder her.
Der Cache ist auf 1.000 Profile und 16 MiB begrenzt; Ueberlauf loescht keine
vorhandenen Profile. Profil-, Kontakt-, Adress- und Social-Oberflaechen melden
Fehler ehrlich und verwenden keine veralteten Vollprofil-Snapshots mehr. Der
lokale Modus kann weder eine E-Mail-Adresse aendern noch einen
Verifikationsstatus simulieren.

Der lokale Privacy-Export enthaelt nur das Profil des aktuell
authentifizierten Kontos und schliesst andere oeffentliche Cache-Profile sowie
Auth-Session-Material aus. Lokale Kontoanonymisierung ist ebenfalls
exakt-kontogebunden, folgt erst nach den anderen kontospezifischen
Loeschschritten und wird vor der Session-/Current-Cache-Loeschung paarweise
gespeichert. Andere oeffentliche Cache-Profile bleiben unberuehrt; es wird
keine Aufbewahrungsfrist erfunden. Backend-Autoritaets-, Rechts-, Produktions-,
Provider-, Payment-, Store- und Live-Gates bleiben unveraendert offen.
