# C1H - V5.2 Categories, Moderation, Financial Documents and Operator Gates

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungsstand:
`2a67a43ce79da87a127836edfc764079edccbd27`

GitHub Actions:
[`32374184599`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32374184599)
ist fuer genau diesen Stand GREEN.

## Ergebnis

**Die begrenzte C1H-Implementierung ist technisch GREEN. Rechts-, Betreiber-,
Provider-, Store-, signierte Release- und physische Geraetegates bleiben HOLD
und fail-closed.**

Der Server besitzt jetzt die einzige freigegebene Kategorie- und
Unterkategorie-Liste. Sie wird bei Katalog, Anlage, Aenderung, Reaktivierung,
Quote und Buchung durchgesetzt. Transportmittel und Drohnen bleiben
ausgeschlossen; historische Datensaetze werden nicht umgeschrieben.

Privatstatus, Pilotregion und eine moegliche gewerbliche Aktivitaet werden
serverseitig persistent beurteilt. Fehlende oder offene Angaben blockieren
neue Marketplace-Vorgaenge. Moderationsmassnahmen besitzen append-only,
nutzergebundene Entscheidungen mit Tatsachen, Grundlage, Begruendung,
Erkennungsmethode und einer einmaligen begrenzten internen Ueberpruefung.

Finanzdokumente bleiben an gespeicherte Quote-, Zahlungs- und
Erstattungssnapshots gebunden. Die zentrale Betreiber-/Providerbereitschaft
lehnt fehlende, Platzhalter- oder nicht freigegebene Fakten ab. Das Erreichen
von EUR 5.000 tatsaechlich vereinnahmten SIT-Plattformgebuehren erzeugt nur
einen internen professionellen Pruefbedarf und keine Aktivierung.

## Verbindliche Grenzen

- Drive-Arbeitspaket `02_CODEX_WORK_PACKAGES_SIT_V2.3.md`, C1H.
- C1A-Punkte 1, 2, 19, 24 und 28 sind technisch innerhalb des definierten
  C1H-Umfangs geschlossen. Die bereits geschlossenen Punkte 25 und 26 wurden
  bewahrt.
- Es wurde keine Pilotregion, Betreibergesellschaft, Anschrift, Geschaefts-
  fuehrung, Registerangabe, Aufsicht, Providerfirma, Vertragslage, Steuerregel
  oder Freigabe erfunden.
- Keine Produktions-, VPS/OpenClaw-, SSH-, Cloud-, DNS-, Payment-, Store-,
  signierte Release-, oeffentliche oder destruktive Git-Aktion.

## Kategorie- und Marketplace-Gates

- Die exakte immutable Allowlist lebt serverseitig und gibt nur die fuer den
  privaten Deutschland-Pilot definierten Kategorien und Unterkategorien aus.
- Dieselbe Pruefung liegt vor Listing-Anlage, Aenderung, Reaktivierung, Quote,
  Buchungsanlage und Buchungsannahme. Ein Clientwert kann sie nicht erweitern.
- Deutschland und eine explizit konfigurierte zugelassene Region sind
  erforderlich. Eine fehlende, unbekannte oder nicht zugelassene Region wird
  nicht stillschweigend akzeptiert.
- Konto, Listing und Buchung besitzen persistente Privatstatusbelege. Ein
  offener serverseitiger Hinweis auf gewerbliche Aktivitaet blockiert neue
  Listings, Quotes und Buchungen bis zu einer begruendeten Klaerung.
- Historische ausgeschlossene Datensaetze bleiben erhalten, sind aber fuer
  neue Marketplace-Aktionen nicht verfuegbar.

## Moderation und interne Ueberpruefung

- Meldungen bleiben fuer Listing, Profil/Nutzer, Bewertung und Nachricht
  moeglich.
- Massnahmen und Aufhebungen erzeugen append-only Entscheidungen mit
  betroffener Person, Tatsachen, Vertrags-/Rechtsgrundlage, Begruendung,
  menschlicher oder automatisierter Erkennung, Ueberpruefbarkeit und Frist.
- Die betroffene Person kann ihren bereinigten Bescheid abrufen, ohne
  Reporteridentitaet, private Beweise, interne Notizen oder fremde Kontodaten
  zu erhalten.
- Pro Entscheidung ist eine begrenzte interne Ueberpruefung moeglich. Die Frist
  betraegt sechs Kalendermonate mit korrekter Monatsendeklemmung.
- Ein Antrag aendert eine bestehende Massnahme nicht automatisch. Ausblendung,
  Wiederherstellung, Sperre und Aufhebung bleiben serverautoritativ und sind
  mit begruendeten Testbelegen gebunden.

## Finanzdokumente und professioneller Pruefbedarf

- SIT-Gebuehrenbeleg und private Mietzusammenfassung verwenden ausschliesslich
  die gespeicherten Quote-, Zahlungs-, Gebuehren- und Erstattungssnapshots.
- Es gibt keinen SIT-Beleg fuer private Miete, keine pauschale Umsatzsteuer auf
  Privatmiete und keinen Vermieterabzug fuer eine vom Mieter gezahlte
  SIT-Gebuehr.
- Abgelehnte, abgelaufene oder unbezahlte Vorgaenge erzeugen kein unberechtigtes
  Finanzdokument; Erstattungen bleiben an den autoritativen Snapshot gebunden.
- Der Schwellenwert verwendet kumulativ tatsaechlich vereinnahmte
  Plattformgebuehren, nicht Buchungs-, Miet- oder Quotevolumen. Faellige
  Betriebs-, Steuer- und Erstattungsreserven muessen separat gedeckt sein.
- Das Signal setzt `professionalReviewRequired`, aber niemals
  `professionalReviewCompleted`, Providerfreigabe oder Produktionsbereitschaft.

## Operator- und Provider-Gates

- Eine zentrale Auswertung verlangt die exakte registrierte Betreiberidentitaet,
  Anschrift, Geschaeftsfuehrung, Registerdaten, Kontakte, zustaendige Stelle,
  Widerrufs-URL und die freigegebenen Providerfakten.
- Fehlende, inkonsistente, beispielhafte oder Platzhalterwerte wie `i.G.`
  schliessen die Bereitschaft. Compose reicht die vorgesehenen Werte nur als
  Konfiguration weiter und erfindet keinen Rueckfallwert.
- Die vorhandenen lokalen Signierungs- und Firebase-Dateien wurden nicht
  ausgegeben oder als rechtliche beziehungsweise Providerfreigabe behandelt.

## Migration und Datenschutz

- Migration `026_v52_categories_moderation_operator.up.sql` ist additiv und
  forward-only. Sie ist in der PostgreSQL-CI enthalten; sie wurde weder auf
  Staging noch in Produktion provisioniert.
- Private Moderationsdaten und interne Notizen bleiben aus Nutzerexporten
  ausgeschlossen. Die neuen Quellen sind in den Datenschutz- und
  Retention-Inventaren erfasst.
- Privacy bleibt `draft`, `approvalAllowed=false`, mit 17 Datentypen, neun
  Diensten und offenem finalem Binary-Scan.
- Retention bleibt `draft`, mit neun offenen Entscheidungen, blockiertem
  Ausfuehrungspreflight und 20 stabilen Blockern.

## Lokale Verifikation

- Fokussierte Privacy-/Retention- und C1H-Validatoren: 56 PASS, 0 Fehler.
- Vollstaendige lokale Backend-Suite: 272 PASS, ein erwarteter Skip ohne
  lokale `TEST_DATABASE_URL`, 0 Fehler.
- Vollstaendige Flutter-Suite: 298 PASS, ein dokumentierter Skip, 0 Fehler.
- Google-only Profiltest: 1 PASS. Analyzer: bestehende akzeptierte Baseline
  von 223 Hinweisen. Web-Debug-Build und Android-Debug-APK: PASS.
- Der vollstaendige technische Metadatenlauf verwendete
  `SIT_ALLOW_CANDIDATE_ROLLOVER=1`, weil der aktuelle Source-Build
  `2026081510` ueber dem historischen Store-Kandidaten `2026081509` liegt.
  `CI=true` ersetzte nur die commitgebundene Metadatenpruefung des lokal nicht
  vorhandenen owner-only AAB.
- Ohne Rollover stoppt der Validator korrekt am alten Kandidaten; ohne
  CI-Metadatenpfad stoppt er korrekt am fehlenden lokalen AAB.
- `git diff --check`: PASS. Es wurde kein signierter Kandidat erzeugt.

## Commitgebundene GitHub-CI

- Zentrale Implementierung: `1066eafef64c37f5196e12ac8f32e08a4d073a7c`.
- PostgreSQL-Migrationsgate: `9385a44b1570cf06c67f6cff30a5e4d704ea89df`.
- Begruendete Moderationsfixtures: `7034bcf` und `2a67a43`.
- Zwischenzeitliche Locking-Experimente wurden vollstaendig zurueckgenommen;
  sie veraendern den finalen Produktstand nicht.
- Fruehe CI-Laeufe deckten eine veraltete Migrationserwartung und alte
  Moderationsfixtures ohne Entscheidungsbeleg auf. Beide wurden als Tests des
  fachlichen Vertrags korrigiert; es wurde kein Fail-closed Gate abgeschwaecht.
- Finaler Backend-Job: 273 PASS, 0 Skip, 0 Fehler mit PostgreSQL. Secret-,
  Compose-, Audit- und Image-Build-Gates sind gruen.
- Dependency-Audit: 0 hohe oder kritische Advisories. Ein moderates,
  transitives `uuid`-Advisory ueber `firebase-admin` ist dokumentiert; es gibt
  keinen sicheren In-Range-Fix und keinen erzwungenen Override.
- Finaler Flutter-Job: 298 PASS, ein dokumentierter Skip, zusaetzlicher
  Google-only Test PASS, Analyzerbaseline PASS, Web-Debug und Android-Debug
  PASS.
- Der signierte, commitgebundene Release-Schritt und `publish-api-image` wurden
  uebersprungen. Kein AAB, Store-Upload oder Image wurde veroeffentlicht.

## Fortbestehende Gates und Uebergang

- Betreiber-, Rechts-, Provider-, Privacy-, Retention-, Payment-, Store- und
  Produktionsbereitschaft bleiben fail-closed.
- Die vorhandene Play-/Geraeteevidenz fuer `2026081509` ist historisch. Sie
  darf den aktuellen Source-Build `2026081510` oder Head `2a67a43` nicht
  vertreten.
- Ein lokaler owner-only AAB fuer den aktuellen Stand fehlt; C1H hat keinen
  neuen Kandidaten gebaut oder signiert.
- C1H ist technisch geschlossen. Das aktive Folgepaket ist **C1I - Full
  Regression, Device Evidence and New-Candidate Readiness**, ausschliesslich
  als Readinesspruefung ohne signierten Release, Store-, Produktions- oder
  oeffentliche Aktion.
