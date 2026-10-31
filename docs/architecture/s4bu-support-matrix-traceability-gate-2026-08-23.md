# S4BU support matrix traceability gate

Status: technically verified, non-live at exact implementation commit
`a4fbb280d6908c5f8c8be7b758664bdc563a834f`.

## Canonical source and scope

The source is Drive file `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, file ID
`1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, Support Packet version
`SIT_SUPPORT_PACKET_V1_2026-08-20`, SHA-256
`83cc25371f24b3486230f3ac4e2b7e9c26c49a48bd5aca22a5449636c9ffc6d3`.
A direct source read confirmed 167 rows and 167 unique IDs from `SUP-001`
through `SUP-167`.

The source declares exactly:

- 112 `PILOT_BLOCKER` scenarios;
- 20 `PUBLIC_LAUNCH_BLOCKER` scenarios;
- 8 `QUALITY` scenarios;
- 27 `REAL_MONEY_BLOCKER` scenarios.

S4BU closes the S1 traceability backlog, not any external readiness gate. It
maps every scenario exactly once into ten functional areas and binds each area
to existing executable test files and exact behavior anchors.

## Evidence semantics

The machine-readable map uses `automated-non-live` deliberately. It proves
that each scenario has a repository-owned automated contract covering its
technical behavior class. It does not reinterpret a unit or synthetic test as
a live provider, production, physical-handover, legal-review or operator
observation.

Evidence anchors must remain inside executable Dart, Node or backend test
files. Validation fails if a referenced file disappears, an anchor no longer
exists, a scenario is missing or duplicated, the area order changes, or the
source/gate counts drift.

The Drive matrix remains the source of truth and is not copied into a second
editable matrix. Any source hash change requires a fresh Drive read and an
explicit mapping review before the bound hash can move.

## External hold

Every `PUBLIC_LAUNCH_BLOCKER` and `REAL_MONEY_BLOCKER` scenario is also mapped
to an open external-evidence span. That is 47 scenarios in total. No Pilot or
Quality scenario may be mislabeled as satisfying that external evidence.

The strict validator always fails with 47 unresolved external scenarios in the
current state. External evidence present remains zero. This matches the
existing external-gate register: technical setup can be complete while legal,
operator, PSP, Store, device and activation truth remains absent.

## Permanent enforcement

`tool/validate_support_test_matrix_traceability.mjs` checks source identity,
all 167 IDs, all four gate counts, executable evidence anchors, the exact
47-scenario external hold and non-live boundaries. Its six mutation tests and
CLI execution are permanently registered in
`scripts/technical_regression_check.sh`.

No production, PSP, Store, Firebase Console, Cloud/VPS/DNS, real-money,
external-message, pilot, signed-release or merge action is part of S4BU. P0B
remains `HOLD` / `NO-GO`.
