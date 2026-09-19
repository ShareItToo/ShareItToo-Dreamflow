# S4BV external-gate Support Matrix linkage

Status: technically verified, non-live at exact implementation commit
`66f022e5d823d7d96bd6747e0096208cd71f0f7c`.

## Closed technical gap

S4BU established a complete non-live map for all 167 canonical Support Packet
scenarios, including the 47 Public Launch and Real Money scenarios that still
require authentic external evidence. The existing S4BH external-gate setup
prepared ten ordered human/provider gates, but it did not machine-bind those
gates to the Support Matrix hold.

S4BV adds that binding. The external setup manifest now records the exact
Support traceability artifact and its current 167/47/0 counts. The common
reference is mandatory for the five gates that can close Support Matrix
external evidence:

1. professional Legal and operator approval;
2. PSP contract and sandbox E2E;
3. Privacy, retention and legal hold;
4. Store submission and closed testing; and
5. the final explicit activation decision.

The reference is forbidden on the other five gates, preventing the matrix
from being presented as evidence for an unrelated Operations, Apple device,
Firebase-owner, Economics or pilot-roster condition.

## Fail-closed behavior

`tool/validate_external_gate_setup.mjs` runs the complete Support Matrix
validator before accepting the external setup. It rejects source/count drift,
an omitted or misplaced common reference, a changed external-evidence state or
any attempt to present the ten setup gates as ready.

The ordinary preflight returns ten technically prepared gates, zero externally
ready gates, 167 mapped scenarios, 47 external-evidence requirements, zero
present external evidence and `hold-no-go`. Strict readiness still fails on
all ten gates. The final runbook additionally requires the 47-scenario hold to
reach zero before any release-ready claim.

This package does not turn a repository reference into Legal, provider,
physical-device, Store or operator evidence. It performs no login, contract,
account, production, Payment, Store, Cloud/VPS/DNS, pilot, real-money,
signing, publication or merge action. P0B remains `HOLD` / `NO-GO`.

## Verification

Eight external-setup tests and six Support traceability tests pass. The
complete local gate passes analyzer zero, 385 Flutter tests plus one documented
skip, the Google-only profile, Web/WebAssembly, loopback smoke and a 448-task
Android debug build with binary minSdk 24. Capacity started with 1,188,748 KiB
free and 3,201,016 KiB generated and ended with 1,181,720 KiB free and
3,201,028 KiB generated: 12 KiB bounded growth.

Exact GitHub Actions run `32622784481` passes the implementation head with
PostgreSQL in 38 seconds, Backend in 1:39 and Flutter/Web/Android in 7:17.
Candidate signing and API-image publication remain skipped.
