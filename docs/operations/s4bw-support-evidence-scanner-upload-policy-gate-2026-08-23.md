# S4BW Support evidence scanner and upload-policy operations

Status: technically verified, non-live.

## Current preflight

Run from the repository root:

```sh
node --check tool/validate_support_evidence_external_readiness.mjs
node --check tool/validate_external_gate_setup.mjs
node --test test/tool/validate_support_evidence_external_readiness.test.mjs
node --test test/tool/validate_external_gate_setup.test.mjs
node tool/validate_support_evidence_external_readiness.mjs
node tool/validate_external_gate_setup.mjs
```

Expected scanner-readiness result:

```json
{"status":"prepared-hold","requiredDecisionCount":8,"completedDecisionCount":0,"intakeEnabled":false,"scannerTransport":"none","externalReadiness":false}
```

Expected aggregate result:

```json
{"status":"prepared-hold","requiredGateCount":11,"technicallyPreparedGateCount":11,"externallyReadyGateCount":0,"supportScenarioCount":167,"supportExternalEvidenceRequiredCount":47,"supportExternalEvidencePresentCount":0,"supportEvidenceRequiredDecisionCount":8,"supportEvidenceCompletedDecisionCount":0,"releaseDecision":"hold-no-go"}
```

Both strict commands remain intentionally red:

```sh
node tool/validate_support_evidence_external_readiness.mjs --require-ready
node tool/validate_external_gate_setup.mjs --require-ready
```

The first must list all eight open scanner/upload-policy decisions. The second
must list all 11 unresolved external gates. A green technical preflight does
not authorize intake or weaken either hold.

## Final configuration sequence

Use
`docs/operations/SUPPORT_EVIDENCE_SCANNER_AND_UPLOAD_POLICY_RUNBOOK.md` for the
human/external setup. Choose either a reviewed managed scanner or an approved
self-hosted scanner, then complete security, processor/transfer, upload-size,
MIME, retention/legal-hold and operator approvals. Bind only the exact signed
candidate and target environment after isolated synthetic tests pass.

Keep credentials and account identifiers outside Git and chat. Never use
private support evidence for setup tests. Do not enable external AI, public
original access or fail-open scanning. Do not start a paid service, accept a
contract or enable intake without the separate cost and activation decisions.

After authentic sanitized evidence exists, update the scanner-readiness
artifact first, rerun its strict validator, then update the aggregate gate and
rerun aggregate strict readiness. The 8 MiB value is a technical default until
explicitly approved; it must not be carried into external operation silently.

## Acceptance evidence

The exact implementation commit is
`7f81757abe39bc50d3dc2af8fd7cc9464f7bf1f8`. The 22 direct tooling tests and
70 related workflow/security/privacy/retention tests pass. The complete local
gate passes analyzer zero, 385 Flutter tests plus one documented skip,
Google-only, Web/WebAssembly, loopback smoke, Android 448 tasks, binary minSdk
24 and zero generated-footprint growth.

Clean-host run `32623897547` passes PostgreSQL in 26 seconds, Backend in 1:16
and Flutter/Web/Android in 7:03. Signing and publication are skipped. External
readiness remains 0/11, scanner decisions remain 0/8, external Support evidence
remains 0/47 and P0B remains `HOLD` / `NO-GO`.
