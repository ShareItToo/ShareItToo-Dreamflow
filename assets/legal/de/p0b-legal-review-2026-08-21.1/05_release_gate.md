# P0B-L1 Release Gate

Paketversion: `P0B-L1-LEGAL-REVIEW-2026-08-21.1`

Ergebnis am 21.08.2026: **HARD STOP. Professionelle Prüfung fehlt.**

## Gate 1: Intake-Paket

- [x] V5.2- und G3-Quellen technisch gebunden.
- [x] Prüfauftrag und Liefergegenstände definiert.
- [x] Alle Entscheidungsfragen ausdrücklich offen erfasst.
- [x] amtliche Primärquellen mit Abrufstand registriert.
- [x] maschinenlesbare Evidenz- und Ablehnungsregeln definiert.

Diese Häkchen bestätigen nur die technische Vorbereitung.

## Gate 2: Externe professionelle Prüfung

- [ ] befugte unabhängige prüfende Person/Organisation identifiziert;
- [ ] Identität, Befugnis und Authentifizierung verifiziert;
- [ ] alle gebundenen Quellen vollständig geprüft;
- [ ] alle Entscheidungsschlüssel beantwortet;
- [ ] echte Betreiber- und Providerdaten berücksichtigt;
- [ ] konkrete finale Texte und Systemfolgen geliefert;
- [ ] alle Änderungen umgesetzt und erneut geprüft;
- [ ] finale Artefakt-Hashes schriftlich bestätigt.

## Gate 3: Unabhängige Folgegates

- [ ] Betreiber-/Register-/Steuerangaben vollständig;
- [ ] Privacy-, AVV-/DPA-, Transfer- und Retention-Freigabe vollständig;
- [ ] lizenzierter Marketplace-PSP-Vertrag und Sandbox-E2E vollständig;
- [ ] Operationsrollen, Delegates und Abwesenheitstests vollständig;
- [ ] aktueller signierter Kandidat und physische Geräte-Evidenz vollständig;
- [ ] explizite enge Pilot-/Regions-/Kategorie-/Kohortenentscheidung vorliegend;
- [ ] Rollback-, Monitoring- und Incident-Gates bestanden.

## Unveränderliche Sperren

Bis Gate 2 und alle einschlägigen Punkte von Gate 3 erfüllt sind:

- `professionalLegalApproval=false`
- `publicActivationAllowed=false`
- `productionProvisioningAllowed=false`
- `storeSubmissionAllowed=false`
- `realMoneyAllowed=false`
- `g3MultiItemPubliclyAvailable=false`

Ein CI-Erfolg beweist Integrität und fail-closed Verhalten, aber keine
Rechtsfreigabe. Der nächste zulässige Rechts-Schritt ist die sichere Übergabe
dieses Pakets an eine befugte unabhängige Prüfstelle und später die verifizierte
Aufnahme ihrer quellengebundenen Antwort.
