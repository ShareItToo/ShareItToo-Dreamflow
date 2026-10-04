# C1D - V5.2 Checkout, Contract and Declaration Binding

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungsstand: `67c5fda88a4637ba2e55a6b28595f2e8af1596c0`

## Ergebnis

**C1D ist GREEN. C1E darf innerhalb der bestehenden C1-Grenzen beginnen; der
Release, Echtgeld und jede Rechtsaktivierung bleiben HOLD.**

Der Checkout ist auf exakt zwei nicht vorausgewaehlte V5.2-Erklaerungen, den
frischen Server-Quote, Build, Locale und die exakten A-I-Dokumentverweise
gebunden. Der Server speichert die beiden Erklaerungen vor dem Plattformvertrag,
erzeugt danach die ausdrueckliche SIT-Annahme und einen hashgebundenen
Volltextbeleg und emittiert erst anschliessend die Vermieteranfrage. Die App
behaelt Vertrags- und Belegmetadaten dauerhaft im Buchungsmodell und stellt dem
Mieter einen authentifizierten, lokal erneut gehashten Download bereit.

Das V5.2-Rechtsbundle bleibt weiterhin `draft-blocked`, nicht provisioniert,
nicht aktiviert und nicht oeffentlich verlinkt. Damit bleibt auch der echte
Remote-Abschluss absichtlich gesperrt, solange keine vollstaendigen
unveraenderlichen V5.2-Serversnapshots und keine reale Zahlungsfaehigkeit
vorliegen.

## Umgesetzter Umfang

- Forward-only Migration `023_v52_contract_binding.up.sql` erweitert die
  erlaubten Dokumenttypen, bindet alle neun A-I-Snapshots an den Vertrag und
  speichert ausdrueckliche SIT-Annahme sowie Erklaerungsmetadaten. Historische
  V5.1-Spalten und -Datensaetze bleiben erhalten.
- Der neue versionierte V5.2-Workflow akzeptiert ausschliesslich die zwei
  kanonischen Erklaerungen, exakte Reihenfolge und Dokumentverweise, richtige
  Version/Locale/Build, denselben Quote und einen Zeitpunkt innerhalb des
  Quote-Fensters.
- Alle neun Dokumente muessen zum Vertragszeitpunkt vorhanden sein. Text und
  gespeicherter SHA-256 werden erneut verglichen; fehlende oder driftende
  Snapshots schliessen den Vorgang fail-closed.
- Pro Erklaerung werden Nutzer, Buchung, Wortlaut, Wortlaut-Hash,
  Dokumentversion, Locale, Client-Build, Quote-ID/-Hash, Zeitpunkt und die
  gebundenen Dokumentverweise append-only gespeichert.
- Der Plattformvertrag enthaelt eine ausdrueckliche automatisierte
  SIT-Annahme. Volltextbeleg und Verfuegbarkeits-/Zustellereignis entstehen vor
  `booking.requested`.
- Der Beleg umfasst beide Erklaerungen, deren Dokumentverweise, die
  ausdrueckliche SIT-Annahme und die Volltexte/Hashes aller neun A-I-Dokumente.
- Der Checkout zeigt genau zwei standardmaessig falsche Checkboxen. Teil A,
  Teile B-D und Datenschutz Teil H sind getrennte Informationslinks;
  Datenschutz ist kein Akzeptanzfeld. Der Button bleibt exakt
  `Bestätigen und bezahlen`.
- Die App verwirft eine Remote-Erfolgsmeldung ohne vollstaendige
  Vertragsannahme und Belegmetadaten. Der Mieter sieht die Annahme in den
  Buchungsdetails und kann den Beleg authentifiziert speichern/teilen.
- Beim Download werden sowohl Server-Header als auch der von der App selbst
  berechnete SHA-256 der Bytes gegen den gespeicherten Beleg-Hash geprueft.
- Vertragsmetadaten werden aus Vermieterantworten entfernt. Aenderungen einer
  bereits vertragsgebundenen Buchung verlangen eine neue Einwilligung, statt
  einen alten Quote oder Vertragsstand wiederzuverwenden.
- Kontoexport, Datenschutz- und Retention-Inventare enthalten die neue
  Vertrags- und Erklaerungsevidenz. Das synthetische Staging-Werkzeug erzeugt
  V5.2-Daten nur auf Basis eines frischen Quotes; es wurde in C1D nicht gegen
  eine Live-Umgebung ausgefuehrt.

## Verifikation

- Fokussierte Backend-, Receipt-, Migrations-, Wiring- und Synthetic-Tests:
  51/51 PASS.
- Fokussierte Flutter-Tests fuer Checkout, V5.2-Rechtstextansicht und
  Vertragsmodell: 3/3 PASS.
- Vollstaendige lokale Backend-Suite: 225 PASS, ein erwarteter Skip ohne lokale
  `TEST_DATABASE_URL`, 0 Fehler.
- Vollstaendige lokale technische Regression: PASS.
- Lokales Flutter: 295 PASS, ein dokumentierter Skip; Google-only 1/1 PASS.
- Web-Debug-Build und Android-Debug-Build: PASS.
- V5.2-Rechtsasset-, Datenschutz- und Retention-Validatoren einschliesslich
  Mutationstests: PASS.
- Gezielte Flutter-Analyse: keine neuen Fehler; die bestehende Baseline von 52
  Warnungen/Infos blieb sichtbar und wurde nicht unterdrueckt.
- Historisches V5.1-Manifest blieb hashidentisch:
  `6cffec53a27f84b24a44aebad50afd6e7ce17a4c196c7946155fba743fdc161f`.
- GitHub Actions Run
  [32347860649](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32347860649):
  `backend-regression` mit 226/226 Tests und PostgreSQL-Migrationslauf sowie
  `flutter-regression` erfolgreich fuer exakt
  `67c5fda88a4637ba2e55a6b28595f2e8af1596c0`.

Der CI-Schritt fuer den signierten Release-Kandidaten und `publish-api-image`
blieben erwartungsgemaess uebersprungen. Es gab keine Produktions-, Store-,
Provider-, Cloud-, Zahlungs- oder sonstige Live-Aktion.

## Datenmigration und Rollback

Migration 023 ist additiv und forward-only. Sie wurde durch die disposable
PostgreSQL-CI angewendet, aber in keiner Staging-/Produktionsdatenbank
provisioniert. Bestehende V5.1-Vertraege bleiben gueltig und unveraendert; neue
V5.2-Zeilen muessen die vollstaendige Neun-Dokument-Bindung erfuellen.

Der Implementierungsdelta liegt in einem einzelnen fast-forward gepushten
Commit. Ein Rueckgaengigmachen darf nur ueber einen neuen Revert-Commit erfolgen;
History-Rewrite, Reset, Rebase und Force-Push bleiben ausgeschlossen. Die
additive Migration wird bei einem App-Rollback nicht destruktiv entfernt.

## Grenzen und Restrisiken

- Es wurde keine E-Mail- oder PDF-Zustellung behauptet. Der belegte dauerhafte
  Kanal ist der authentifizierte In-App-Download mit protokollierter
  Verfuegbarkeit und erster Zustellung.
- `activationAllowed=false`, `productionProvisioningAllowed=false`,
  `effectiveDate=null` und alle offenen Betreiber-/Providerfakten bleiben
  unveraendert.
- Ohne echte V5.2-Snapshots und reale PSP-Faehigkeit bleibt der Remote-Button
  gesperrt. C1D hat keine Freigabe oder Provisionierung vorweggenommen.
- Der lokale PostgreSQL-Integrationstest war mangels lokaler Test-URL
  uebersprungen; der commitgebundene GitHub-Job hat den PostgreSQL-Test ohne
  Skip erfolgreich ausgefuehrt.

## Naechster Schritt

**C1E - V5.2 Withdrawal, Cancellation, No-Show and Separate Refunds:** die
vorhandene Widerrufs- und Stornogrundlage auf die V5.2-Bindung migrieren und den
offenen Actual-Loss-Workflow fuer Ersatzvermietung, ersparte Aufwendungen sowie
nachgewiesenen geringeren oder fehlenden Schaden rollenbasiert, idempotent und
ohne Echtgeld schliessen. `rent_refund` und `sit_fee_refund` bleiben getrennte
Objekte mit unterschiedlichen Schuldnern.
