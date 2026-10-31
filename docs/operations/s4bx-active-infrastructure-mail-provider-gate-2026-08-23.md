# S4BX active infrastructure and mail provider operations

Status: technically verified, external facts and approvals still required.

## Current preflight

Run from the repository root:

```sh
node --check tool/validate_active_infrastructure_mail_provider_readiness.mjs
node --check tool/validate_external_gate_setup.mjs
node --test test/tool/validate_active_infrastructure_mail_provider_readiness.test.mjs
node --test test/tool/validate_external_gate_setup.test.mjs
node tool/validate_active_infrastructure_mail_provider_readiness.mjs
node tool/validate_external_gate_setup.mjs
```

Expected provider result:

```json
{"status":"prepared-hold","classifiedActiveProcessorCount":5,"newlyExplicitActiveProcessorCount":2,"requiredDecisionCount":10,"completedDecisionCount":0,"externalReadiness":false}
```

Expected aggregate result:

```json
{"status":"prepared-hold","requiredGateCount":11,"technicallyPreparedGateCount":11,"externallyReadyGateCount":0,"supportScenarioCount":167,"supportExternalEvidenceRequiredCount":47,"supportExternalEvidencePresentCount":0,"supportEvidenceRequiredDecisionCount":8,"supportEvidenceCompletedDecisionCount":0,"classifiedActiveProcessorCount":5,"newlyExplicitActiveProcessorCount":2,"activeProviderRequiredDecisionCount":10,"activeProviderCompletedDecisionCount":0,"releaseDecision":"hold-no-go"}
```

Both strict commands remain intentionally red:

```sh
node tool/validate_active_infrastructure_mail_provider_readiness.mjs --require-ready
node tool/validate_external_gate_setup.mjs --require-ready
```

The first must name all ten hosting/SMTP decisions; the second must name all
11 unresolved top-level gates. Do not weaken either failure.

## Final configuration sequence

Use
`docs/operations/ACTIVE_INFRASTRUCTURE_AND_MAIL_PROVIDER_RUNBOOK.md`. Review
authentic account, contract/DPA, service-seat, region, transfer, subprocessor,
retention, deletion, backup/restore, suppression, incident and exit evidence
with Walid. Keep account identifiers, contacts, endpoints, credentials and
private mail outside Git and chat. Store only sanitized opaque evidence
references.

Update the provider readiness artifact first, then the canonical Privacy and
Retention artifacts. Only after their strict validators pass may the aggregate
manifest be changed. A provider login or existing configuration is evidence
input, never approval, Store submission or activation.

Do not accept a contract, upgrade or start a paid service without Walid's
specific cost approval. Do not change VPS, database, backups, SMTP routing,
DNS, Cloud, production, Store, Payment, pilot, public or real-money state while
using this runbook.

## Acceptance evidence

The exact implementation commit is
`aa1b821a940ac5a8cb808ec1dd5599086360995c`. The 81 focused and 58 adjacent
contracts pass. The complete local gate passes analyzer zero, 385 Flutter
tests plus one documented skip, Google-only, Web/WebAssembly, loopback smoke,
Android 448 tasks, binary minSdk 24 and 12 KiB generated growth.

Clean-host run `32625380409` passes PostgreSQL in 30 seconds, Backend in 1:51
and Flutter/Web/Android in 6:36. Signing and publication are skipped. External
readiness remains 0/11, active-provider decisions remain 0/10 and P0B remains
`HOLD` / `NO-GO`.
