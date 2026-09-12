# U0 - Pilot-Cockpit und Unit Economics

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungscommit:
`d36dc091868a9840e597a7fdc40702a496f81593`

GitHub Actions:
[`32392289397`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32392289397)
ist fuer genau diesen Commit GREEN.

## Ergebnis

**U0 ist als internes, read-only und fail-closed Pilot-Cockpit GREEN. Die
aktuelle autonome Runway endet hier. G3A oder ein spaeteres Paket wurde nicht
begonnen.**

Der neue Endpoint `GET /v1/admin/pilot-cockpit` liefert ausschliesslich
aggregierte Kennzahlen fuer einen expliziten, maximal 366 Tage langen Zeitraum.
Er verlangt ein aktives Admin-Konto und den bestehenden kurzlebigen
Staff-Step-up. Es gibt keinen schreibenden Cockpit-Endpoint und keine
Produktions- oder oeffentliche UI.

Jeder Geldwert nutzt Integer-Minor-Units und eine ISO-Waehrung. Verschiedene
Waehrungen bleiben in getrennten Buckets; U0 fuehrt keine implizite
FX-Umrechnung durch. Jede Kennzahl benennt Quelle, Evidence-Klasse
`actual`/`configured`/`estimated`/`unavailable` und Vollstaendigkeit.

## Cash- und normalisierte Sicht

U0 trennt vorhandene Geldflussfakten von Annahmen:

- Cash-GMV brutto ist die Summe der privaten Mietanteile vollstaendig
  gecaptureter Zahlungen im Zeitraum.
- Cash-GMV netto ist Brutto-GMV minus im Zeitraum erfolgreich erstatteter
  Owner-Anteile.
- Plattformumsatz netto ist der gecapturete Plattformgebuehranteil minus im
  Zeitraum erfolgreich erstatteter Plattformanteile.
- Capture und Refund werden zusaetzlich als vollstaendige Zahlungsstroeme
  ausgewiesen. Unbezahlte, fehlgeschlagene oder nur autorisierte Zahlungen
  erscheinen nicht als Cash.
- Providerkosten gelten nur dann als `actual`, wenn jeder relevante
  append-only Ledger-Vorgang einen nichtnegativen Minor-Unit-Wert und eine
  explizite Evidenzreferenz enthaelt. Fehlende Providerkosten bleiben
  `unavailable`.
- Der USt-Anteil gilt nur dann als `actual`, wenn der bestehende unveraenderliche
  Finanzdokument-Snapshot einen expliziten Minor-Unit-USt-Anteil und eine
  Evidenzreferenz enthaelt. U0 erfindet weder Steuersatz noch Steuerbetrag.
- Das Cash-Ergebnis zieht vom Netto-Plattform-Cash nur belegte Provider- und
  tatsaechliche externe Cash-Kosten ab. Konfigurierte Schaetzungen duerfen die
  Historie nicht umschreiben und halten diese Sicht deshalb unvollstaendig.
- Das normalisierte Ergebnis ist je Waehrung:
  `Plattformumsatz netto - USt-Anteil netto - Providerkosten netto - KYC -
  Fraud - Cloud - AI - Marketing - Founder-Ersatzkosten`.
- Founder-Ersatzkosten sind die gerundete Summe aus manuellen Founder-Minuten
  mal explizit freigegebenem Stundenwert geteilt durch 60. Der Stundenwert ist
  nie eine reale Cash-Ausgabe, solange kein echter Ledgerbeleg vorliegt.
- Contribution pro Capture-Buchung beziehungsweise abgeschlossenem Handover
  ist das normalisierte Periodenergebnis geteilt durch die jeweilige
  Periodenanzahl. Es handelt sich um eine Perioden-, nicht um eine erfundene
  Kohortenattribution.

Sobald ein materieller Bestandteil fehlt, ist das normalisierte Ergebnis
`unavailable` und Profitabilitaet `undetermined`. Bei null oder negativem
vollstaendigen Ergebnis lautet der Status `non_positive`; nur ein vollstaendig
belegtes positives Ergebnis kann `positive` ergeben.

## Aktuell verfuegbare und offene Quellen

| Bereich | Aktueller U0-Zustand | Quelle |
| --- | --- | --- |
| Capture, Refund, GMV, Plattformanteil | `actual`, soweit vollstaendige Zahlungs-/Refundzeilen vorhanden sind | `payments`, `refunds` |
| Abgeschlossene Handover | `actual` als Count | `bookings.completed_at` |
| Providerkosten | `unavailable`, solange die Ledger-Metadaten keinen Wert plus Evidenzreferenz enthalten | `ledger_transactions.metadata` |
| USt-Anteil | `unavailable`, solange Finanzdokumente keinen expliziten Wert plus Evidenzreferenz enthalten | `financial_documents.snapshot` |
| KYC | `configured`, deaktiviert und null | aktuelle Privat-Pilot-/U0-Grenze |
| Fraud-Provider | `configured`, deaktiviert und null | aktuelle Privat-Pilot-/U0-Grenze |
| Cloudkosten | `unavailable` | keine begrenzte Billing-Quelle im Repository |
| Externe AI | `configured`, deaktiviert und null | aktuelle Privat-Pilot-/U0-Grenze |
| Marketing | `configured`, deaktiviert und null | aktuelle Privat-Pilot-/U0-Grenze |
| Founder Hours | `unavailable`, bis fuer jeden Kalendermonat alle fuenf Aggregate vorliegen | `audit_log`, manuell/monatlich |
| Founder-Ersatzlohn | `unavailable` | offene Finance-/Owner-Entscheidung |
| Eskalationsqualitaet | `unavailable`, bis ein konsistentes Monatsaggregat vorliegt | `audit_log`, manuell/monatlich |
| Cart-zu-Buchung-Attribution | `unavailable` | kein Cart-Item-zu-Booking-Schluessel vorhanden |

Die deaktivierten Kostenklassen sind sichtbar konfigurierte Nullen, keine
behaupteten Rechnungswerte. Cloud-, USt-, Provider- und Founder-Luecken werden
nicht still als null behandelt. Mit den aktuell repository-gebundenen Inputs
ist der Profitabilitaetsstatus deshalb **undetermined**, nicht profitabel.

## Projekt-Funnel

Das Cockpit zaehlt nur vorhandene, zeitlich begrenzte Fakten:

- erstellte Carts, Projekte und Positionen;
- im Zeitraum revalidierte Positionen mit aktuellem, geaendertem oder nicht
  verfuegbarem Quote-Zustand;
- fuer Cart-Positionen ausgestellte Quotes;
- angefragte, bestaetigte und abgeschlossene Buchungen.

Der Cart bleibt nicht reservierend. Ohne einen bestehenden
Cart-Item-zu-Booking-Schluessel wird keine kausale Conversion Rate erfunden.

## Founder-Independence und Datenschutz

Founder Hours werden nur als manuelle Monatsaggregate fuer `strategy`,
`operations`, `support`, `technical` und `emergency` gelesen. Fuer jeden
vollstaendig eingeschlossenen Kalendermonat ist genau ein Eintrag je Kategorie
erforderlich. Fehlende, doppelte, falsch geroutete oder ungueltige Eintraege
machen die Kennzahl unverfuegbar.

Der FI0-Vertrag ergaenzt den manuellen Eventtyp
`founder_escalation_aggregate_recorded`. Er enthaelt nur Gesamtzahl,
fachrollengeroutete, founder-only und ungeroutete Faelle; die drei Klassen
muessen zur Gesamtzahl summieren. Falldetails, Nutzeridentitaeten und
Nachrichteninhalte sind verboten. Beide Aggregate akzeptieren nur die
bestehenden neutralen Rollen `admin` und `system`; U0 fuegt keinen
Erfassungsendpoint hinzu.

Die API-Antwort enthaelt keine Nutzeridentitaet, E-Mail, Chattexte, genauen
Standorte, Payment Credentials, Secrets oder Evidenzmedien. Automatische
Bildschirm-, Tastatur-, App-, URL-, Nachrichten-, Standort- oder
Aktivitaetserfassung bleibt aus.

## Zugriff und Fehlerschutz

- Nur `GET`; `POST`, `PUT`, `PATCH` und `DELETE` sind nicht vorhanden.
- Aktives Konto, Rolle `admin` und bestehender Staff-Step-up sind Pflicht.
- `support`, normale Nutzer, fehlender Step-up und ungueltige Perioden werden
  abgelehnt, bevor Aggregatdaten ausgegeben werden.
- Antworten sind `private, no-store`.
- Zeitraumgrenzen sind UTC, `from` inklusive und `to` exklusiv; maximal 366
  Tage.
- Founder-/Eskalationsaggregate werden nur bei ganzen Kalendermonaten
  ausgewertet und sind auf 5.000 gelesene Auditaggregate begrenzt.
- Alle Datenbankabfragen sind `SELECT`/`WITH`; es gibt keine Booking-, Payment-,
  Refund-, Payout-, Reconciliation-, Retention- oder Audit-Mutation.

## Verifikation

- Fokussierte U0-Tests: 6 PASS, 0 Fehler. Sie pruefen Cent-Arithmetik, Refunds,
  USt- und Provider-Provenienz, Waehrungstrennung, Founder-Ersatzkosten,
  Contribution pro Buchung/Handover, unvollstaendige Inputs, Datenschutz,
  Rollen und read-only Wiring.
- Fokussierte FI0-Guardrails: 6 PASS, 0 Fehler.
- Lokale Backend-Suite: 282 PASS, 0 Fehler, ein erwarteter PostgreSQL-Skip ohne
  lokalen `TEST_DATABASE_URL`; Syntaxcheck PASS.
- Vollstaendige lokale technische Regression: 307 Flutter PASS plus ein
  dokumentierter Skip; Google-only Profiltest PASS; Analyzerbaseline 223;
  Web-Debug und Android-Debug-APK PASS.
- Exakte GitHub-CI fuer `d36dc09`: Backend 283 PASS mit PostgreSQL und den
  echten Cockpit-HTTP-Checks; Flutter 307 PASS plus ein dokumentierter Skip;
  Google-only Profil, Analyzer, Web-Debug und Android-Debug PASS.
- Dependency-Audit: 0 hohe/kritische Findings; ein bekannter moderater
  transitiver Hinweis. Secret-Scan: keine neuen hochkonfidenten Secrets.
- Signed Android Candidate und `publish-api-image` wurden uebersprungen.

## Migration, Betrieb und Rollback

U0 fuegt keine Datenbankmigration hinzu. Es liest nur vorhandene Tabellen und
die bereits append-only geschuetzte Audit-Grundlage. Es wurden keine
Produktions-, VPS/OpenClaw-, Maximus-, SSH-, DNS-, Cloud-, Payment-, Store-,
Provider-, Account-, signierte Release- oder oeffentliche Aenderung ausgefuehrt.

Technischer Rollback ist das normale Revert des Implementierungscommits
`d36dc09`; dabei muessen die beiden exakten Privacy-/Retention-Quellhashbindungen
gemeinsam auf den vorherigen `app.js`-Stand zurueckgehen. Da keine Migration
existiert, ist kein Datenbank-Downgrade erforderlich.

## Finales Gate

U0 beendet die freigegebene autonome Runway. Der Branch bleibt sauber, PR #7
bleibt Draft und wurde nicht gemergt. Vor G3A ist eine neue Entscheidung von
Walid zu Zeitpunkt und Umfang erforderlich. Offene reale Finance-Eingaben,
Rollenbesetzungen, Account-RBAC, Abwesenheitstests und Release-/Store-Gates
bleiben HOLD und wurden nicht erfunden.
