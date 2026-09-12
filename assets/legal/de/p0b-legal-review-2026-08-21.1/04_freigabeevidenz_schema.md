# P0B-L1 Schema für professionelle Freigabeevidenz

Paketversion: `P0B-L1-LEGAL-REVIEW-2026-08-21.1`

Dieses Dokument beschreibt, welche externe Evidenz später maschinenlesbar
eingelesen werden darf. Es ist selbst keine Freigabe.

## Erforderlicher JSON-Nachweis

```json
{
  "schemaVersion": 1,
  "reviewPackageVersion": "P0B-L1-LEGAL-REVIEW-2026-08-21.1",
  "reviewStatus": "approved_with_changes",
  "reviewedAt": "RFC-3339 timestamp",
  "jurisdiction": "DE",
  "reviewer": {
    "fullName": "required",
    "organisation": "required",
    "professionalCapacity": "required",
    "registrationOrAuthorityReference": "required",
    "contactReference": "required"
  },
  "reviewedSources": [
    {
      "pathOrDriveId": "required",
      "sha256OrModifiedTime": "required"
    }
  ],
  "decisions": [
    {
      "key": "one exact key from 02_entscheidungsarbeitsblatt.md",
      "decision": "approved | approved_with_changes | rejected",
      "reasoning": "required",
      "requiredTextChanges": [],
      "requiredSystemChanges": [],
      "assumptions": [],
      "residualRisks": [],
      "sourceCitations": [],
      "reviewerInitials": "required"
    }
  ],
  "approvedArtifacts": [
    {
      "logicalPart": "A-I or named checkout/confirmation artifact",
      "path": "required",
      "sha256": "64 lowercase hex characters",
      "locale": "de",
      "effectiveScope": "required"
    }
  ],
  "conditionsPrecedent": [],
  "expressExclusions": [],
  "approvalStatement": "required",
  "authentication": {
    "method": "qualified signature, professional portal or independently verifiable equivalent",
    "evidenceReference": "required"
  }
}
```

## Annahmeprüfung

Der Import muss ablehnen, wenn:

- Prüferidentität, berufliche Befugnis oder Authentifizierung fehlt;
- die Paketversion oder eine geprüfte Quelldatei nicht exakt gebunden ist;
- ein Entscheidungsschlüssel fehlt, doppelt vorkommt oder weiterhin offen ist;
- ein Ergebnis keine Begründung und Primärquellenangabe besitzt;
- `approved_with_changes` ohne umgesetzte, neu gehashte und erneut bestätigte
  Artefakte verwendet wird;
- finale Texte, Checkout-/Bestätigungswortlaute oder Hashes fehlen;
- PSP-/ZAG-Einschätzung ohne den echten PSP-Vertrag behauptet wird;
- Betreiber-, Register-, Steuer-, Provider- oder Empfängerdaten als
  Platzhalter vorliegen; oder
- die Erklärung Produktion, Store, öffentliches Angebot oder Real Money ohne
  die separaten Gates aktivieren soll.

## Zustandsübergänge

1. `prepared-awaiting-independent-professional-review`: aktueller Zustand.
2. `external-review-received-unverified`: Dateien eingegangen, aber Identität,
   Quellbindung und Vollständigkeit noch ungeprüft.
3. `external-review-verified-remediation-required`: authentisch und
   vollständig, aber Änderungen erforderlich.
4. `legal-content-hash-approved`: alle verlangten Änderungen implementiert und
   die finalen Hashes extern bestätigt.

Keiner dieser Zustände setzt automatisch `publicActivationAllowed`,
`productionProvisioningAllowed`, `storeSubmissionAllowed` oder
`realMoneyAllowed` auf `true`.
