# P0B Operations Role, Delegate and Absence Gate

Date: 2026-08-21

Authorization: `P0B_NEXT_OPS_ROLES_BACKUP_ABSENCE_ONLY`

Result: **technical configuration rehearsal complete; real people, company
RBAC and human absence tests remain an external hard gate.**

## Sources

The machine gate binds the existing FI0/FI1 manifests, P0B dossier, executable
readiness evaluator and runbook. It also binds three live Drive sources:

- Founder Independence and Delegation;
- Support Testkatalog und Pilot-Gates V1; and
- Support Test Matrix V1 with relevant operational probes `SUP-007`,
  `SUP-020`, `SUP-024`, `SUP-025` and `SUP-158` through `SUP-164`.

No Drive or repository source contained an actual role assignee, delegate,
company IAM/RBAC grant or completed human absence test.

## Implemented gate

`backend/src/operational_readiness_gate.js` requires exactly six functional
roles and four FI1 processes. A role is assigned only when the primary and
distinct delegate have opaque company-system references, separate RBAC
evidence, MFA verification and owner approval.

A real process absence test is accepted only with at least a 72-hour window,
valid start/end timestamps, sanitized audit evidence, no founder operational
action, no real user data, no real money and no production mutation.

The evaluator deliberately keeps technical rehearsal, human absence evidence,
bus factor and final readiness as separate booleans. Unit tests prove the
ready path using synthetic fixtures only; fixtures are not operational
evidence.

## Current evidence

`docs/operations/p0b-ops-role-delegate-absence-gate.json` records:

- required roles: 6;
- evidenced real role assignments: 0;
- required FI1 processes: 4;
- synthetic technical configuration rehearsals passed: 4;
- human 72-hour absence tests passed: 0;
- bus factor evidenced: false; and
- operations ready: false.

The read-only pilot cockpit now exposes the technical-only rehearsal separately
from the unopened human gate. It still returns no name, email, user ID,
credential or device identifier.

## Safety and privacy

Names, email addresses, credentials and permission grants do not belong in Git.
A later authoritative company system should store the assignments and emit
only sanitized immutable evidence references. A personal chat, local Mac or
verbal instruction cannot satisfy the gate.

No account permission, production, payment, provider, Store, public activation
or personal-data state changed. The gate remains
`hold-external-assignments-and-human-absence-tests`.

## Safe continuation

Actual staffing cannot be created by code. The unresolved human gate remains
visible and blocks any pilot activation. Independent work may continue to the
explicitly authorized signed-device evidence gate, with installed Pixel data
preserved unless a later safe procedure proves replacement is non-destructive.

Rollback is a normal source revert. There is no database migration or external
state to undo.
