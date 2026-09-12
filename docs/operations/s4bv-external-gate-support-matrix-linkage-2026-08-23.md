# S4BV external-gate Support Matrix linkage operations

Status: technically verified, non-live.

## Current preflight

Run from the repository root:

```sh
node --check tool/validate_support_test_matrix_traceability.mjs
node --check tool/validate_external_gate_setup.mjs
node --test test/tool/validate_support_test_matrix_traceability.test.mjs
node --test test/tool/validate_external_gate_setup.test.mjs
node tool/validate_support_test_matrix_traceability.mjs
node tool/validate_external_gate_setup.mjs
```

Expected external-setup result:

```json
{"status":"prepared-hold","requiredGateCount":10,"technicallyPreparedGateCount":10,"externallyReadyGateCount":0,"supportScenarioCount":167,"supportExternalEvidenceRequiredCount":47,"supportExternalEvidencePresentCount":0,"releaseDecision":"hold-no-go"}
```

Both strict commands remain intentionally red:

```sh
node tool/validate_support_test_matrix_traceability.mjs --require-release-ready
node tool/validate_external_gate_setup.mjs --require-ready
```

The first must report 47 unresolved external Support scenarios. The second
must report all ten unresolved external gates. A green technical preflight is
not permission to weaken either hold.

## Final configuration rule

When authentic evidence is later created, update its canonical Legal,
Operations, Device, account, PSP, Privacy/Retention, Store, Economics, pilot
or activation source first. Add only a sanitized repository evidence
reference after its specialist validator passes. Then update the aggregate
external setup and rerun both strict checks.

For the five Support Matrix consumer gates, also reconcile the exact external
scenario span in
`docs/evidence/support/support-test-matrix-v1-traceability.json`. Never reduce
47 merely by changing a count or classification; each closed scenario needs
its authentic canonical evidence. No Pilot or Quality scenario may be used to
dilute that release hold.

## Acceptance evidence

The exact implementation commit is
`66f022e5d823d7d96bd6747e0096208cd71f0f7c`. Focused validation comprises 14
tests. The complete local technical gate passes analyzer zero, 385 Flutter
tests plus one documented skip, Google-only, Web/WebAssembly, loopback smoke,
Android 448 tasks and the fixed host-capacity guard with 12 KiB generated
growth.

Clean-host run `32622784481` passes PostgreSQL in 38 seconds, Backend in 1:39
and Flutter/Web/Android in 7:17. Signing and publication are skipped. External
readiness remains 0/10, external Support evidence remains 0/47 and P0B remains
`HOLD` / `NO-GO`.

Do not store personal data, reviewer identities, account IDs, tester rosters,
device IDs, credentials, secrets or payment details in these aggregate
artifacts. Do not start a paid service, accept a contract, submit a Store
build, deploy, enable real money or activate a pilot/public path without the
separate authorized gate.
