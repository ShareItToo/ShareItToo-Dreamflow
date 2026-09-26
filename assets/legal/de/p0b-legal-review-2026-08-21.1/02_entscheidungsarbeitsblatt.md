# P0B-L1 Entscheidungsarbeitsblatt

Paketversion: `P0B-L1-LEGAL-REVIEW-2026-08-21.1`

Alle Entscheidungen stehen auf `open`. Leere oder indirekte Antworten sind
nicht als Zustimmung auszulegen. Die technische Präferenz ist eine
Prüfhypothese, keine juristische Vorentscheidung.

| Schlüssel | Konkrete Frage | Technische Präferenz zur Prüfung | Erforderliche Auswirkung der Antwort | Status |
| --- | --- | --- | --- | --- |
| `operatorIdentityAndImprint` | Welche natürliche oder juristische Person ist bis und nach Gründung Betreiber und Vertragspartner, und welche Angaben müssen jeweils in Impressum, Checkout, Datenschutz und Beleg erscheinen? | Fehlende Identität/Registerdaten blockieren Veröffentlichung; keine Platzhalter. | Teile A, H, I; öffentliche Metadaten; Belege; Support. | `open` |
| `groupPrivateRentalContractModel` | Entsteht ein einheitlicher privater Mietvertrag mit Positionsanhang oder entstehen mehrere korrelierte Einzelmietverträge? | Ein Gruppen-Mietvertrag mit positionsgenauer Anlage, soweit rechtlich tragfähig. | Teil B; Bestätigung; Storno-/Leistungsstörungslogik; Audit. | `open` |
| `groupPlatformContractScope` | Ist der SIT-Plattformvertrag gruppenbezogen, positionsbezogen oder kombiniert, und welche Leistung schuldet SIT? | Ein transparenter gruppenbezogener Plattformvorgang mit getrennter Gebührenallokation je Position. | Teile A/E/I; Quote; Beleg; Haftungsabgrenzung. | `open` |
| `completeOfferAndCounterOfferSemantics` | Was ist rechtlich Anfrage, Angebot, Annahme und Gegenangebot; wann enden Bindungsfristen und wann ist eine neue Zustimmung nötig? | Jede Änderung von Mitgliedschaft, Preis, Zeitraum, Dokument oder Gegenpartei erzeugt neue Quote und ausdrückliche Annahme. | Checkout; Annahme; Quote-Hash; Vertragssnapshot; Audit. | `open` |
| `checkoutAndDurableConfirmation` | Welche Angaben, Erklärungen und Schaltflächentexte müssen unmittelbar vor Abgabe sichtbar sein, und welche Bestätigung ist wann auf dauerhaftem Datenträger zu liefern? | Positionen, Einzel-/Gesamtpreis, Parteien, Zeitraum, Gebühr und Dokumentversion hervorgehoben; eindeutiger Zahlungshinweis; unveränderliche Bestätigung. | Teile A/B/E/I; UI; E-Mail/PDF; Snapshot. | `open` |
| `withdrawalAndFixedPeriodRental` | Welche Widerrufsregeln gelten für Plattform- und privaten Mietvertrag, insbesondere bei privatem Anbieter, Unternehmerstatus, festem Zeitraum und ggf. vorzeitigem Leistungsbeginn? | Keine automatische Ausnahme annehmen; Anbieterstatus und Vertragstyp getrennt prüfen und verständlich anzeigen. | Teile A/B/C/I; Checkout; Bestätigung; Storno. | `open` |
| `partialPerformanceAndDivisibilityConsequences` | Welche Rechtsfolgen hat eine nur einzelne Position betreffende Unverfügbarkeit, Nichtübergabe, Mangelhaftigkeit oder vorzeitige Rückgabe? | Positionseffekt ohne automatische Gruppenauflösung, außer rechtlich oder vom Nutzerwillen zwingend. | Teile B-D; Statusmaschine; Quote/Refund; Audit. | `open` |
| `groupAndPositionCancellationRefundRules` | Wann ist Vollgruppen- bzw. Positionsstorno zulässig und wie werden Mietpreis, Gebühr, tatsächlicher Schaden und Erstattung berechnet? | Expliziter Scope; unveränderliche Positionsallokationen; keine pauschale Doppelbelastung. | Teil C/E; Ledger; Nutzertexte; Belege. | `open` |
| `sharedAppointmentAndPositionEvidenceEffect` | Welche Wirkung hat eine gemeinsame Terminbestätigung auf einzelne Übergaben, Rückgaben, Zustände und Beweislast? | Termin nur Gruppenkorrelation; Fotos, Zubehör, Bestätigung und Abweichung bleiben positionsbezogen. | Teil D; Evidence-Schema; Export; Streitfall. | `open` |
| `positionNeedsReviewAndUnrelatedRelease` | Darf ein Streit zu einer Position unstreitige Positionen oder Auszahlungen sperren, und welche Begründung/Rechtsbehelf sind nötig? | Nur betroffene Position halten; Gruppensperre nur bei separat belegtem Konto-/Systemrisiko. | Teile D/F/G/E; Moderation; Payout; Audit. | `open` |
| `groupPaymentAuthorizationAndProviderContract` | Erlaubt der konkrete PSP-Vertrag eine Gruppenautorisierung, Split/Connected Accounts, Capture und Auszahlung ohne Kundengeldbesitz durch SIT? | Ausschließlich lizenzierter Marketplace-PSP; SIT stellt Technik und Gebührenlogik, hält kein Mietgeld. | Teil E; PSP-Vertrag; Backend; KYC; Freigabegate. | `open` |
| `positionLedgerRefundAndChargebackAllocation` | Wie müssen Autorisierung, Capture, Teilrefund, Chargeback, Gebühr und Auszahlung gruppen- und positionsgenau zugeordnet werden? | Append-only Allokation je Position/Schuldner/Grund; unstreitige Positionen separat behandelbar. | Ledger; Teil C/E; Belege; Audit; E2E-Test. | `open` |
| `groupConfirmationAndReceiptIssuerContent` | Wer stellt welche Bestätigung, Rechnung oder sonstigen Beleg mit welchem Inhalt aus? | SIT weist nur eigene Gebühr als eigenen Umsatz aus; privater Mietpreis bleibt getrennt und eindeutig bezeichnet. | Teile A/B/E/I; PDF/E-Mail; Buchhaltung. | `open` |
| `privacyPurposesLegalBasesAndRecipients` | Welche Datenarten, Zwecke, Rechtsgrundlagen, Empfänger, Auftragsverarbeiter und Drittlandtransfers gelten je Gruppen- und Positionsprozess? | Datenminimierung, Zweck-/Empfängertrennung, dokumentierte Transfergrundlage; freiwillige Analyse getrennt. | Teil H; Verzeichnis; DPA/TIA; Consent; Export. | `open` |
| `accountExportCompletenessAndCounterpartyProtection` | Welche Gruppen-/Positionsdaten muss der Export enthalten, ohne Rechte und Adressen der Gegenpartei offenzulegen? | Verständliche Korrelation und eigene Nachweise, aber keine internen Schlüssel oder unnötigen Fremddaten. | Teil H; Exportformat; Zugriffskontrolle. | `open` |
| `retentionDeletionLegalHoldPeriodsAndTriggers` | Welche Fristen und Startpunkte gelten je Datenkategorie, und wie wirken Streit, Steuer-/Handelsrecht, Rechtsverteidigung, Löschantrag und Legal Hold? | Keine Frist ohne professionelle Entscheidung; Ausführung bleibt bis vollständiger Matrix fail-closed. | Teil H; Retention-Matrix; Löschjob; Audit. | `open` |
| `marketplaceTransparencyDsaAndModeration` | Welche Ranking-, Anbieterstatus-, AGB-, Melde-, Begründungs-, Beschwerde- und Traceability-Pflichten gelten für den geplanten Dienst? | Pflichten je konkreter Dienstkategorie prüfen; private/unternehmerische Anbieter technisch unterscheiden. | Teile A/F/G/I; Suche; Onboarding; Moderation. | `open` |
| `businessGlobalConsumerAndTraderVariants` | Welche Regeln sind ausschließlich für privaten Deutschland-Pilot tragfähig und welche benötigen neue Texte/Prozesse? | Strikte neue Version je Business-/B2C-/Land-/Währungs-/Providerkonfiguration. | Alle Teile; Feature-/Region-Gates; spätere Skalierung. | `open` |

## Antwortformat je Zeile

Für jede Zeile sind `decision`, `reasoning`, `requiredTextChanges`,
`requiredSystemChanges`, `assumptions`, `residualRisks`, `sourceCitations` und
`reviewerInitials` erforderlich. `approved_with_changes` ist erst erfüllt,
wenn die Änderungen implementiert, neu gehasht und erneut bestätigt wurden.
