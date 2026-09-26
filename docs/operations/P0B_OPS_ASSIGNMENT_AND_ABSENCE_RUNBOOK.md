# P0B Operations Assignment and Absence Gate

Version: `P0B-OPS-2026-08-21.1`

Status: **Technical rehearsal prepared; real assignments, company RBAC and
human absence evidence are missing.**

## Purpose

This runbook turns the FI0/FI1 role model into an auditable gate without
storing names, email addresses, credentials or secrets in Git. It distinguishes
a deterministic configuration rehearsal from a real operational absence test.
Passing the former never implies passing the latter.

## Assignment record in the company system

For each of the six functional roles, the approved company system must record:

- an opaque primary principal reference;
- a different opaque delegate principal reference;
- scoped role/capability grants for both;
- MFA/step-up verification for both;
- grant time, approver role, review/expiry time and immutable audit reference;
- prohibited combinations and any four-eyes requirement; and
- revocation/rotation procedure.

The Git evidence contains only sanitized references. A personal email, device,
local Mac, chat, Maximus memory or undocumented verbal assignment is not a
company-system assignment.

## Technical rehearsal

For each FI1 process, the deterministic rehearsal verifies:

1. owner role and distinct delegate role match the approved role registry;
2. normal handling has a documented delegate fallback;
3. specialist thresholds route to a functional role, never automatically to a
   named founder;
4. missing assignment or audit evidence keeps the process on hold;
5. no real user data, real money, production mutation or provider traffic is
   used.

The four technical rehearsals may be green from repository tests while all
human assignments remain open.

## Real 72-hour absence test

The first human test may start only after all six primary/delegate assignment
records and required RBAC grants are verified. It uses synthetic cases and the
configured non-live environment.

Required evidence per process:

- RFC-3339 start/end timestamps spanning at least 72 hours;
- owner role, acting delegate role and sanitized company audit references;
- monitoring/queue evidence and each exercised escalation threshold;
- proof that no founder operational action occurred;
- proof of no real user data, real money or production mutation;
- observed failures, recovery, reviewer role and signed result.

The process fails if a required case has no owner, the delegate lacks access,
an alert is not handled, a secret/PII value appears in evidence, a founder
performs normal operations or the audit trail is incomplete.

## Source-aligned operational probes

The current Drive Support Test Matrix adds the following directly relevant
probes to the FI1 process drills:

- `SUP-007`: escalation without target owner/queue is blocked;
- `SUP-020`: out-of-queue support access is denied and audited;
- `SUP-024`/`SUP-025`: break-glass requires reason, time limit and audit;
- `SUP-158`: a P0 without owner raises an alert;
- `SUP-159`: overdue next update raises queue/alarm and correction path;
- `SUP-160`: scheduler failure has health check, alert and retry;
- `SUP-161`: unresolved SupportConfig blocks external build/feature release;
- `SUP-162` to `SUP-164`: missing PSP, DSA contact or retention facts keep the
  corresponding real-money/public gates closed.

These probes are requirements, not claims that the later full Support Packet
has already been implemented.

## Acceptance

Operations readiness is true only when all six role assignments, all six
distinct delegates, company RBAC/MFA evidence, all four technical rehearsals
and all four real 72-hour absence tests are complete. The gate does not enable
production, public access, Store submission, a PSP or real money.

## Current result

- technical configuration rehearsals: 4 of 4 passed;
- real functional-role assignments: 0 of 6 evidenced;
- real delegate assignments: 0 of 6 evidenced;
- human 72-hour absence tests: 0 of 4 passed;
- minimum bus factor: not evidenced;
- result: `hold-external-assignments-and-human-absence-tests`.
