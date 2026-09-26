# S4BU support matrix traceability operations

Status: technically verified, non-live.

## Canonical checks

Run from the repository root:

```sh
node --check tool/validate_support_test_matrix_traceability.mjs
node --test test/tool/validate_support_test_matrix_traceability.test.mjs
node tool/validate_support_test_matrix_traceability.mjs
```

Expected current result:

```json
{"status":"technical-map-valid-hold","scenarioCount":167,"technicalCoverageCount":167,"gateCounts":{"PILOT_BLOCKER":112,"PUBLIC_LAUNCH_BLOCKER":20,"QUALITY":8,"REAL_MONEY_BLOCKER":27},"externalEvidenceRequiredCount":47,"externalEvidencePresentCount":0,"strictReleaseReady":false}
```

`--require-release-ready` must fail with
`support_matrix_external_evidence_open:47`. Do not change that outcome by
editing the traceability map. Close external scenarios only through their
canonical legal, operator, PSP, Store, physical-device or activation evidence
flows.

## Source revalidation

If Drive file `13_SIT_SUPPORT_TEST_MATRIX_V1.md` changes:

1. fetch the exact current Drive file by ID;
2. verify its SHA-256, row count, unique `SUP-nnn` count and gate totals;
3. review changed scenario wording and expectation against executable tests;
4. update mappings, evidence anchors and source binding together;
5. run focused tests, the complete gate and clean-host CI.

Never refresh only the declared hash. The CI validator cannot access Drive and
therefore intentionally requires a human-reviewed source rebind.

## Local acceptance

Six focused mutation tests pass. The complete local technical regression
passes analyzer zero, 385 Flutter tests plus one documented skip, Google-only,
Web/WebAssembly, loopback smoke and one 448-task Android debug build. Capacity
started with 1,194,540 KiB free and 3,200,996 KiB generated and ended with
1,185,036 KiB free, 3,201,004 KiB generated and 8 KiB growth.

Clean-host run `32622192273` is bound to exact implementation commit
`a4fbb280d6908c5f8c8be7b758664bdc563a834f` and passes PostgreSQL in 58
seconds, Backend in 1:18 and Flutter/Web/Android in 6:30. Candidate signing and
publication remain skipped.

## External-gate handoff

The map prepares the final external work by making its scope explicit:

- 27 real-money scenarios require provider contract and sandbox E2E truth;
- 20 public-launch scenarios require their legal, operator, DSA,
  product-safety and activation truth;
- external evidence present is still zero;
- strict release readiness remains false.

This document is not approval to log in, accept terms, configure a provider,
submit a Store build, deploy, spend money or activate any public or pilot path.
