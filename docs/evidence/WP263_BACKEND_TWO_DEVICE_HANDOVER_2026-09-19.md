# WP263 – backend two-device handover/return closure

Scope: booking flow-time projection, participant-bound start/clear, expected
revision conflicts, idempotent server events/messages, source-message-bound
location acceptance, condition-evidence projection, and the three reachable
Flutter entry points.

Evidence collected locally:

- 19 backend unit tests passed (`booking_flow_time` and condition-evidence
  workflow tests); this includes participant/outsider checks, role/status
  guards, stale revision rejection, replay behavior, four-photo gating and
  counterparty confirmation.
- 43 focused wiring tests passed for BookingDetail, owner detail, condition
  evidence and server challenge/photo ordering.
- `pnpm run check` passed for the backend source checks.
- `flutter analyze` passed for the six changed client files.
- `git diff --check` passed.

The backend GET projection is the source for both participants and includes
active flags, evidence counts, gallery-origin flags, confirmations and flow
revisions. Backend cache refreshes are best-effort after a committed write.
Exact location acceptance is rechecked against the server reveal window,
participant source message and safety hold before persistence.

Remaining boundary: no physical OnePlus/device or live staging/store evidence
was attempted. PostgreSQL integration and release gates remain parent-package
responsibilities.
