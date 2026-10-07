# Astra-Ultra-Abgleichauftrag

Paket: `P0B-L2-AI-PREASSESSMENT-2026-09-14.1`

## Auftrag

Prüfe die ShareItToo-AI-Rechtsvorprüfung unabhängig gegen den aktuellen
Repository-Stand, die unveränderten V5.2-Quellen, den inaktiven V5.3-Entwurf,
G3A Variante A/G3B–G3L und die am Prüftag geltenden amtlichen DE/EU-
Primärquellen.

Beantworte jeden der 18 P0B-L1-Schlüssel einzeln. Übernimm die vorhandene
Bewertung nicht ungeprüft. Nenne je Schlüssel:

- `verdict`: `confirm`, `correct` oder `insufficient_evidence`;
- die präzise Abweichung oder Bestätigung;
- maßgebliche amtliche Normen mit aktuellem Link und Abrufstand;
- notwendige Text- und Systemänderungen;
- externe Tatsachen, die KI und Code nicht belegen können;
- verbleibendes Risiko und Konfidenz.

Prüfe besonders:

1. die Trennung von Plattformvertrag und privatem Gruppen-Mietvertrag;
2. Antrag, Annahme, Gegenangebot und zahlungspflichtige Checkout-Erklärung;
3. § 356a BGB, Widerruf, früher Leistungsbeginn und Wertersatz;
4. positionsbezogene Teilleistung, Refund, Evidence und `needsReview`;
5. Stripe Connect/ZAG ohne unbelegte Produktaussage;
6. Rechnung/Beleg/Steuergrenzen;
7. DSGVO-Zweck-, Empfänger-, Export-, Retention- und Legal-Hold-Matrix;
8. DSA/DDG, Art. 246d EGBGB, VSBG und entfernte EU-ODR-Verweise;
9. Grenzen des Privatpiloten gegenüber Business/B2C/global.

## Grenzen

- Keine Code-, Git-, Drive-, Provider-, Store-, Cloud-, VPS-, Firebase- oder
  Payment-Änderung.
- Keine Credentials, Cookies, Tokens, private Identifikatoren oder KYC-Daten
  lesen, kopieren oder ausgeben.
- Keine Aussage `professionalLegalApproval=true` und keine Darstellung als
  anwaltliche oder professionelle Rechtsfreigabe.
- Keine ungeprüften Betreiber-, Register-, Steuer-, Beschäftigten- oder
  Providervertragsfakten erfinden.
- Nur amtliche Primärquellen für tragende Rechtsaussagen; Sekundärquellen
  höchstens zur Erläuterung.

## Rückgabeformat

Liefere eine kompakte, maschinenübertragbare Markdown-Tabelle mit allen 18
Schlüsseln, danach eine priorisierte Korrekturliste `P0`, `P1`, `P2` und eine
abschließende Zeile:

`ASTRA_CROSSCHECK_RESULT=CONFIRM|CORRECTIONS_REQUIRED|INSUFFICIENT_EVIDENCE`

Trenne verifizierte Norm, rechtliche Auslegung, Codebefund und externe offene
Tatsache sichtbar voneinander.
