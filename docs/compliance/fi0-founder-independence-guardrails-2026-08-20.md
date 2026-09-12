# FI0 - Founder-Independence Guardrails

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungscommit:
`28566f22488adf2047e88e5258f4b8361d2db59c`

GitHub Actions:
[`32376912466`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32376912466)
ist fuer genau diesen Commit GREEN.

## Ergebnis

**FI0 ist als technisches Guardrail-Fundament GREEN. Reale Rollenbesetzung,
Stellvertretung, Unternehmens-Accountownership, RBAC-Aenderungen,
Abwesenheitstests und Finance-Festlegungen bleiben HOLD.**

Kritische CI-, Container- und Preflight-Pfade enthalten keine benannte
persoenliche Registry- oder Source-Kennung mehr. Die CI leitet die Source- und
Registry-Namespace aus dem aktuellen Repositorykontext ab; der isolierte
oeffentliche Backend-Preflight verlangt eine explizite, rollenfreigegebene
GHCR-Angabe und stoppt andernfalls.

FI0 definiert sechs funktionale Rollen, ohne Personen oder Accounts zu
erfinden. Ein maschinenlesbarer Vertrag bindet Owner, Stellvertretung,
Runbook, Monitoring, Eskalationsschwelle, Rueckfallweg, Approval Policy und
Readiness fuer jeden spaeter erfassten kritischen Prozess. Das bestehende
append-only Backend-Audit ist als technische Grundlage gebunden.

Founder Hours werden ausschliesslich als manuelle Monatsaggregate in fuenf
Kategorien spezifiziert. Exakte Aktivitaetszeiten, Tastenanschlaege,
Screenshots, URLs, App-Nutzung, Nachrichteninhalte, Standort, Biometrie und
kontinuierliches Monitoring bleiben ausdruecklich verboten.

U0 ergaenzt darauf aufbauend einen ebenso manuellen, aggregierten
Eskalationsvertrag. Er speichert monatlich nur Gesamtzahl,
fachrollengeroutete, founder-only und ungeroutete Faelle. Falldetails,
Identitaeten und Nachrichteninhalte bleiben ausgeschlossen; fehlende oder
widerspruechliche Monate gelten nicht als null.

## Verbindliche Quelle

- Drive-Dokument `03_SIT_FOUNDER_INDEPENDENCE_UND_DELEGATION.pdf`, Stand
  18.08.2026.
- FI-001: keine kritische Berechtigung, Jobdefinition oder Eskalation an eine
  persoenliche User-ID, E-Mail, ein Geraet oder einen lokalen Rechner binden.
- FI-002: autoritative Daten in Git/DB/Drive beziehungsweise freigegebenen
  Unternehmenssystemen, nicht ausschliesslich in Chat, Memory oder lokalem Mac.
- FI-003: Owner, Stellvertretung, Runbook, Monitoring, Eskalationsschwelle und
  Rueckfallweg fuer jeden kritischen Prozess.
- FI-004: RBAC, zusaetzliche Authentifizierung, Audit und wo erforderlich
  Vier-Augen-Freigabe fuer kritische Aktionen.
- FI-005: Normalfaelle deterministisch/kontrolliert; Ausnahmen an Fachrollen,
  nicht pauschal an eine benannte Person.
- FI-006: Cash-Ergebnis und normalisiertes Ergebnis mit angemessenem Ersatz fuer
  Gruenderarbeit getrennt ausweisen.

## Audit und Klassifikation

| Bereich | Befund | FI0-Ergebnis |
| --- | --- | --- |
| GitHub Actions / GHCR | Persoenlicher Namespace war in Publish-Job fest eingetragen. | Durch `github.repository_owner` ersetzt; reale Accountownership bleibt extern offen. |
| Container-Source-Metadaten | Dockerfile enthielt eine feste persoenliche Repository-URL. | `APP_SOURCE_URL` ist buildgebunden; CI nutzt aktuellen Server/Repositorykontext. |
| Isolierter Backend-Preflight | Persoenliches GHCR-Repository war Default. | Kein Default mehr; explizite rollenfreigegebene GHCR-Angabe ist Pflicht. |
| Backend-Autorisierung | Ausfuehrbare Rollen sind `user`, `support`, `admin`; System-Audit nutzt zusaetzlich `system`. | Neutral und personenunabhaengig; keine neue DB-Rolle erfunden. |
| Audit-Log | `actor`, Rolle, Aktion, Ressource, Request, Hashes, Metadaten und Serverzeit; Update/Delete durch Trigger blockiert. | Bestehende append-only Grundlage gebunden. |
| Alarmierung | Ziel und SMTP sind konfigurierbar; Standard ist eine SIT-Rollenmailbox, keine Person. | Kein persoenlicher Eskalationshardcode. |
| Rechtstexte / historische Evidenz | Enthalten wahre oder historisch gebundene Namen, Accounts und Repositorypfade. | Nicht als Berechtigungslogik behandelt und nicht umgeschrieben. |
| Demo-/QA-Personas | Synthetische lokale Testnamen und `.local`-Konten, keine produktive Rolle oder Berechtigung. | Als nichtkritische Testfixtures klassifiziert; keine Secret-/Accountfreigabe. |
| Lokale Mac-Pfade | In Recovery-/Historienunterlagen vorhanden. | Kein Laufzeit-Gate; aktueller Stand ist aus Git, GitHub und Drive rekonstruierbar. |

Die feste historische Imagekennung im unveraenderlichen B11-Nachweis bleibt
Teil der exakten Beweisidentitaet. Sie erteilt keine aktuelle Berechtigung und
wird nicht als neuer Registry-Default verwendet.

## Rollenmodell

Der FI0-Vertrag definiert ausschliesslich die in der Quelle benannten
Funktionsbereiche:

1. `software_automation`;
2. `operations_general_manager`;
3. `trust_safety_support`;
4. `technical_owner_on_call`;
5. `finance_compliance`;
6. `country_lead_launch_partner`.

Alle `currentAssignee`- und `delegateAssignee`-Felder sind `null`, der Zustand
ist `open`, unbekannte Zuweisung fail-closed und der Ziel-Bus-Factor ist 2.
Diese Begriffe vergeben keine reale Berechtigung. Eine spaetere Besetzung oder
Accountaenderung erfordert eine separate Owner-/Unternehmenssystemfreigabe.

Die bestehenden Backendrollen werden nicht unkontrolliert zu sechs neuen
Produktrollen aufgeweitet. Eine spaetere Capability-/RBAC-Erweiterung bleibt
als eigener implementierungs- und accountgebundener Schritt offen.

## Kritischer Prozess- und Runbook-Vertrag

Jeder spaetere kritische Prozess benoetigt:

- stabile Prozess-ID, Owner-Rolle und Delegate-Rolle;
- Runbook- und Monitoringreferenz;
- konkrete Warn-/Eskalationsschwelle und sicheren Rueckfallweg;
- Least-Privilege- und Separation-of-Duties-Angaben;
- begruendete Vier-Augen-Policy;
- Auditvertrag, Restore/Rollback und sanitisierten Evidenzpfad;
- Abwesenheits-/Delegationstest ohne muendliche Gruendererklaerung.

`docs/operations/FOUNDER_INDEPENDENCE_RUNBOOK_TEMPLATE.md` stellt diese Felder
bereit. Fehlender Owner oder Delegate haelt den Prozess auf `hold`.

## Audit und Founder Hours

- Das maschinenlesbare FI0-Schema bindet das vorhandene `audit_log` und dessen
  append-only Trigger aus Migration `001`; FI0 fuegt keine Migration hinzu.
- Kritische Auditmetadaten duerfen keine Passwoerter, Tokens, Signiermaterialien,
  Recovery Codes, rohen Geraetekennungen oder sachfremden Nachrichteninhalte
  enthalten.
- Founder-Hours-Eventtyp: `founder_hours_aggregate_recorded`.
- Erlaubte Monatskategorien: `strategy`, `operations`, `support`, `technical`,
  `emergency`.
- Pflichtfelder sind Monat, Kategorie, Minuten, erfassende Rolle und
  Erfassungszeit. Es gibt keine automatische Erfassung und noch keine realen
  Stundenwerte.
- Founder-Hours- und Eskalationsaggregate duerfen nur durch die bestehenden
  neutralen Backendrollen `admin` oder `system` erfasst werden. Das U0-Cockpit
  fuegt dafuer keinen schreibenden Endpoint hinzu.
- Eskalationen nutzen den Eventtyp `founder_escalation_aggregate_recorded` und
  enthalten ausschliesslich Monat, Gesamtzahl, die drei Routingklassen,
  erfassende Rolle und Erfassungszeit. Die Routingklassen muessen exakt zur
  Gesamtzahl summieren.
- Cash-Liquiditaet und normalisiertes Ergebnis sind getrennt. Die Hoehe einer
  kalkulatorischen Ersatzverguetung bleibt eine offene Finance-/Owner-
  Entscheidung und wurde nicht erfunden.

## Verifikation

- Fokussierte FI0-, Preflight- und CI-Wiring-Tests: 20 PASS vor dem ersten
  Commit; nach der finalen Text-/Gate-Schaerfung 12 relevante PASS, 0 Fehler.
- Neuer FI0-Validator: 6 Anforderungen, 6 Funktionsrollen, 5
  Founder-Hours-Kategorien; `assignmentsReady=false`, invasive Erfassung aus.
- Kritischer Named-Person-Scan: PASS.
- Shell-Syntax und `git diff --check`: PASS.
- Vollstaendige lokale technische Regression: 298 Flutter PASS, ein
  dokumentierter Skip, Google-only Profiltest PASS, Analyzerbaseline 223,
  Web-Debug und Android-Debug-APK PASS.
- Exakte GitHub-CI: Backend 273 PASS mit PostgreSQL; Flutter 298 PASS plus ein
  dokumentierter Skip; FI0-Testprofil 6 PASS; Google-only Profiltest PASS;
  Analyzer, Web-Debug und Android-Debug PASS.
- Dependency-Audit bleibt bei 0 hohen/kritischen und einem bekannten moderaten
  transitiven Advisory. Secret-Scan meldet keine neuen hochkonfidenten Secrets.
- Signierter Kandidat und `publish-api-image` wurden uebersprungen.

## Fortbestehende Gates

- Tatsachliche Unternehmens- statt persoenliche GitHub/Registry-Ownership ist
  nicht behauptet und bleibt `companySystemOwnership=open`.
- Funktionsrollen und Stellvertretungen sind unbesetzt; keine Person und kein
  Account wurde eingeladen oder berechtigt.
- Account-RBAC, zusaetzliche Authentifizierung und echte Vier-Augen-Freigaben
  wurden nicht extern eingerichtet.
- 72-/14-/30-/60-/90-Tage-Abwesenheitstests sind nicht gestartet.
- Keine invasive Zeiterfassung und keine reale Founder-Hours-Datenerhebung.
- Keine Produktions-, VPS/OpenClaw-, SSH-, DNS-, Cloud-, Payment-, Store-,
  signierte Release-, Provider-, Account- oder oeffentliche Aktion.

## Abschluss und naechster Schritt

FI0 ist technisch geschlossen. Das aktive Folgepaket ist **G2A - Navigation
and Gemerkt migration** mit exakt den Hauptzielen `Entdecken`, `Mietkorb`,
`Buchungen`, `Nachrichten`, `Mein SIT`. Bestehende Wishlist-Daten, Bookings-
Icon, Profilbild-Icon und Deep Links muessen erhalten bleiben. Persistenter
Server-Warenkorb, Legal-/Privacy-Delta und Projektlogik bleiben spaetere G2-
Pakete.
