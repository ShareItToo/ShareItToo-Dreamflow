# N8 Blue Ocean synthetic pilot harness

Status: **IMPLEMENTED — DETERMINISTIC DOMAIN SIMULATION — NON-LIVE**

## Decision

N8 adds one repository-owned harness that deterministically executes 40
attempts for exactly 30 synthetic participants. Thirty-seven flows complete,
which is inside the required 30–50 range. The cohorts are CORE (13 attempts),
GROWTH (13) and BLUE OCEAN (14). Results contain aggregates only; participant,
owner, draft and attempt records never leave the harness.

This harness is planning evidence, not observed human evidence and not a
Flutter or device E2E claim. CORE and GROWTH use deterministic manual-listing
assumptions. BLUE OCEAN executes the real N3 mock/refusal gateway, N5 regional
price recommendation and V5.2 quote domain. G3, G4 and G5 are bounded cohort
simulations here; their already verified product domains remain separate.

## Measurements and interpretation

Every cohort records aggregate draft and publish-ready time, field-edit rate,
category accuracy, brand/model precision, unsupported-claim rate, price
acceptance and edit delta, clarification count, abandonment, manual fallback,
project/search/cart/request/accept/reject counts, simulated completion,
distinct synthetic owners, handovers and support need. One BLUE OCEAN G5
continuation failure proves the N7 contract that the main listing survives.

The fixed run produces 37 completed flows from 40 attempts. Its BLUE OCEAN
cohort has two safe manual fallbacks, one disabled-provider case and one
zero-budget refusal. The timing and funnel numbers are deterministic planning
inputs. They must not be described as conversion, accuracy or speed observed
from real people.

## Reproducibility and boundary

The output is frozen and bound to replay SHA-256
`1c95d0ace4b101bdf7c09c5ad7116abf749430b1f08d834ec4c6868504f8ecd0`.
The source has no clock, random, environment, network or arbitrary provider
dependency. Eight focused tests execute the harness twice and verify exact
replay, cohort composition, aggregate-only output, metric coherence, fallback,
G5 survival, V5.2 use and all non-live boundaries.

The complete repository technical regression passes in CI-metadata candidate-
rollover mode, including 719 Backend tests plus one documented skip, 387
Flutter tests plus one documented skip, Web/Wasm, loopback smoke and the
448-task Android debug build. The strict local Store handoff still fails closed
on its separately documented missing private archived AAB; it was neither
recreated nor treated as a prerequisite for this non-Store package.

GitHub regression run `32674496053` and CodeQL run `32674496079` are exact and
successful at implementation commit
`9ba15e519edf1fdec01e4bdf74a94c9c03bd0ea8`. N8 is complete and N9 is active.

No external provider or scanner call, personal data, paid call, billing,
automatic publication, human pilot, production, Store, Firebase, Cloud/VPS/DNS
or real-money change is made. N13 remains responsible for the final integrated
regression; an authorized future human pilot remains necessary before any
product conclusion.

Rollback is a normal revert of the harness, tests, evidence and documentation.
N8 adds no schema and stores no participant record.
