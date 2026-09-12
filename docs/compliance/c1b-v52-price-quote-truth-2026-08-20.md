# C1B - V5.2 Price and Quote Truth

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungsstand: `8976a5f82ae42337ad0ada27a1ca4645949ac85b`

## Ergebnis

**C1B ist GREEN. C1C darf innerhalb der bestehenden C1-Grenzen beginnen; der
Release bleibt HOLD.**

Der Server bindet Rabattidentitaet, Anzeigetext, Finanzierung, Schwelle und alle
Centwerte an den unveraenderlichen Quote-Snapshot. Checkout, Detailansichten,
Mietanfrage und Vermieterentscheidung verwenden diesen gespeicherten Stand. Die
exakte `Preisaufschluesselung` ist sichtbar, waehrend der Mieter-Gesamtbetrag
ohne zusaetzliche Interaktion erkennbar bleibt.

## Umgesetzter Umfang

- Quote-Version 3 mit stabiler `discountId`, serverseitigem `discountLabel`,
  `discountFundingSource=owner` und `discountThresholdDays`.
- Deterministische Integer-Cent-Berechnung mit Half-up-Rundung und definierter
  Tie-Break-Regel fuer Rabattstaffeln.
- Serverseitiges Ueberschreiben clientgelieferter Quote-Skalarfelder bei
  Erstellung und Aenderung einer Mietanfrage.
- Strikte V3-Validierung im Flutter-Client; der verschachtelte autoritative
  Quote-Snapshot hat Vorrang vor historischen Skalarfeldern.
- Einheitliche `Preisaufschluesselung` in Checkout, Buchungsdetail,
  Mietanfragedetail und Vermieterentscheidung.
- Kanonische Rundungsfaelle fuer 1, 999, 1000, 1001 und 3333 Cent sowie
  rabattierte und nicht rabattierte Angebote.

Eine Datenbankmigration war nicht erforderlich. Die bereits vorhandenen
JSONB-Quote-Snapshots speichern die zusaetzlichen unveraenderlichen Felder.

## Verifikation

- Vollstaendige lokale technische Regression: PASS.
- Flutter: 293 Tests PASS, ein dokumentierter Skip; Google-only 1/1 PASS.
- Web-Debug-Build und Android-Debug-Build: PASS.
- Analyzer-Baseline unveraendert bei 223; keine Unterdrueckung hinzugefuegt.
- Backend: 216 Tests PASS, ein erwarteter PostgreSQL-Skip, null Fehler;
  Syntax- und Typpruefung PASS.
- Privacy- und Retention-Validatoren: PASS bei unveraendertem Draft-/Open-Status.
- GitHub Actions Run
  [32342731231](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32342731231):
  `backend-regression` und `flutter-regression` erfolgreich fuer exakt
  `8976a5f82ae42337ad0ada27a1ca4645949ac85b`.

Der CI-Schritt `publish-api-image` blieb erwartungsgemaess uebersprungen. Es
gab keine Store-, Provider-, Produktions- oder sonstige Live-Aktion.

## Grenzen und Restrisiken

- C1B aktiviert weder Echtgeld noch einen Zahlungsdienstleister.
- V5.1-Rechtsassets und alle Draft-/Open-/Fail-closed-Gates bleiben bestehen.
- Der Android-Build ist technischer, commitgebundener CI-Nachweis, keine
  Store-Freigabe und kein realer Geraetenachweis.
- Exakte V5.2-Vertragstexte, Erklaerungen und dauerhafte Vertragsbelege gehoeren
  weiterhin in C1C/C1D.

## Rollback

Der vollstaendige C1B-Delta liegt in einem einzelnen, fast-forward gepushten
Commit. Ein Rueckgaengigmachen darf nur durch einen neuen Revert-Commit erfolgen;
History-Rewrite, Reset, Rebase und Force-Push bleiben ausgeschlossen.

## Naechster Schritt

**C1C - V5.2 Legal Registry and Immutable Assets:** neues, getrenntes,
hashgebundenes Nutzerbundle A-I erstellen. Bestehende V5.1-Artefakte bleiben
unveraendert. Teile J-L bleiben intern. Alle Pflichtdaten, URLs, Provider- und
Betreiberfakten bleiben offen und blockieren Aktivierung sowie Provisionierung.
