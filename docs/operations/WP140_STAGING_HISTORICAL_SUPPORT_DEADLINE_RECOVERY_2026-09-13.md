# WP140 — Staging historical Support deadline recovery

Status: **COMPLETE; THREE HISTORICAL SIMULATION DEADLINES RECOVERED WITHOUT
EXTERNAL DELIVERY OR RECIPIENT REACTIVATION**.

## Why this package came next

WP139's registry audit left Staging operationally healthy except for three
noncritical, overdue Support follow-ups created by earlier synthetic
simulation packages. They kept the public readiness endpoint at `503` even
though the database, mail, notifications and payment checks were healthy.
Removing that known operational debt had greater launch value than starting a
new broad hardening package.

## Exact recovery

The runner bound the cohort to exactly three simulation-only, P3 Support cases
with repository-owned SHA-256 references. It preserved every prior message and
event.

Two cases still had valid synthetic recipients. Each received one truthful,
bounded progress proposal through the official Support workflow, review by a
different temporary administrator, publication without external delivery and
reporter/API readback. The third was the retained WP68 simulation whose
synthetic reporter had deliberately been closed. The backend correctly
rejected a new message to that closed recipient with the structured
`support_message_recipient_account_closed` error. WP140 did not reactivate the
account, insert a message or write the Support table directly. It advanced the
case from `received` to `acknowledged` through the official administrator
status-transition endpoint with a truthful future internal checkpoint.

The final result is exactly two independently reviewed progress publications,
one official closed-recipient status transition and three future deadlines.
Independent database readback shows three cohort cases, 22 retained events,
three messages and three progress records; no pending proposal or overdue
active case remains.

## Fail-closed attempts and resumability

The early preparation attempts stopped before Support mutation while the
remote provenance checks were being hardened. Temporary administrators from
those attempts were revoked and closed; one invalid-regex attempt created no
accounts.

The first valid partial run published the first two cases and then stopped on
the closed-recipient `409`. That partial truth was retained, not rolled back or
duplicated. A following retry performed no new Staging mutation because its
local response validator expected a `progressUpdates` property that the real
Support-detail endpoint does not return. The validator was corrected against
the actual response shape. The final retry discovered the existing two
repository markers, resumed only the remaining case and completed the official
transition. These failures are part of the audit history and are not reported
as successful runs.

## Independent closure readback

After cleanup, `https://staging.shareittoo.com/api/health/ready` returned `200`
and `status=ok`. The Support watchdog reported zero overdue next updates, zero
critical overdue next updates and zero P0 cases without an owner. The running
container remained
`ghcr.io/shareittoo/shareittoo-api:df39a14b7a19afe467842461a28f1e77fec8445e`
with restart count zero.

Both temporary administrators are closed, all of their sessions and staff
elevations are revoked, and the owner-only credential vault is deleted. No
account, case or credential identity is retained in repository evidence.

## Verification and boundaries

Ten focused runner checks pass. The complete local technical regression passes
in the supported combined CI-metadata and candidate-rollover mode. Exact
implementation-head Regression `34764505554`, including independent clean
checkout, and CodeQL `34764505588` both pass.

`historical-support-deadline-recovery` is promoted from OPEN to **PASS**. The
conservative portfolio is now **21 PASS, 4 PARTIAL and 7 OPEN**.

No Production, payment, real money, Google Play, Firebase, app candidate,
Pixel, OnePlus, external Support delivery or PR merge changed. No old event was
rewritten or deleted.

Machine-readable evidence:
`docs/evidence/release-readiness/wp140-staging-historical-support-deadline-recovery-20260913.json`.
