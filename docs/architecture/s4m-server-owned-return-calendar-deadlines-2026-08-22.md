# S4M server-owned return calendar deadlines - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`1f6481f2ce76febb38340cd8a4e49b480af2306f`. This package closes the
non-live technical gaps in Drive Support Matrix scenarios `SUP-055` through
`SUP-065`. It does not authorize production, Payment, refund/payout execution,
Store, Cloud/VPS/DNS, signing, deployment, pilot activation or a support
decision.

## Source basis

- Drive Support Test Matrix, file `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`,
  reviewed read-only at revision time `2026-08-20T22:29:02.738Z`, scenarios
  `SUP-055` through `SUP-065`.
- Drive Support Playbooks, file `1p_CpVD5czaJh0LkO_yt6F1JIoHV5BqmW`,
  reviewed read-only at revision time `2026-08-20T22:25:05.383Z`.

No Drive document was modified. Existing controls already kept missing
confirmation neutral, required substantiated evidence inside the 48-hour
window, avoided a case for incomplete damage assertions, kept lifecycle
updates idempotent, released the undisputed authorized share and stored
evidence privately. S4M hardens the remaining time, confirmation and direct
chat authority.

## One calendar policy and one return authority

The server now computes five- and seven-day return deadlines as calendar days
in the booking's IANA timezone, preserving the local wall-clock time across
daylight-saving changes. The 48-hour report window remains an exact duration,
as required. `return_calendar_policy.js` validates the timezone and resolves
autumn ambiguity to the earlier instant and spring gaps compatibly and
deterministically.

The server uses this policy for V5.2 return cases, legacy private-pilot return
cases, clarification deadlines and recurring status-update cadence.
Notifications format the deadline in the booking timezone. The client-side
private-pilot projection implements the same Europe/Berlin DST boundaries only
for local demo/QA; a backend-enabled client never replaces server authority.
This separation leaves later Business/Global expansion able to use arbitrary
validated IANA booking timezones without making device-local time authoritative.

## Changed T0 and direct chat

A changed return T0 is accepted only when the stored flow contains a concrete
proposal label and instant, the requester and confirmer are both booking
participants, they are distinct, and the confirmation timestamp is valid.
Otherwise the scheduled return remains T0. An already stored actual return T0
continues to have priority.

Completed booking chat stays open through the inclusive T0+48-hour report
deadline. Missing confirmation remains neutral through its separate
five-calendar-day clarification process but does not extend direct participant
chat. After 48 hours new issues go through Support. A substantiated active
return case keeps the thread open only until that case is closed.

## Database compatibility and privacy

Migration `063` adds `deadline_timezone` and `deadline_policy_version` to
V5.2 return cases. Existing rows are grandfathered as policy version 1 with
their original fixed-duration invariant. New rows are version 2 and PostgreSQL
independently enforces five/seven calendar days using `AT TIME ZONE`. Rollback
refuses once any version-2 evidence exists.

Privacy export includes the policy version and timezone. Privacy and Retention
source inventories bind the new policy and migration plus every affected
server/client source by SHA-256. Both manifests remain fail-closed drafts; no
retention execution or public disclosure approval was enabled.

## Deterministic test architecture

Injected-clock tests cover the exact inclusive 48-hour boundary, both European
DST transitions, invalid timezones, repeated seven-calendar-day cadence and
complete versus forged changed-T0 evidence. PostgreSQL 16 applied migration
`063` from a fresh database and verified the versioned constraints. The full
Flutter suite ran at standard parallelism, without concurrency one, sleeps or
timer extensions.

The local temporary Node runtime and manually orchestrated PostgreSQL instance
remain development accommodations under `TD-RR-001` and `TD-RR-004`; they are
not product or release prerequisites. No new timing, rate-limit, IP-rotation or
parallelism workaround was introduced. Exact-commit CI, the repository-owned
PostgreSQL runner and all other open exit evidence remain mandatory before any
release-readiness claim.

## Local verification

- focused return/confirmation/message checks: 44 Backend plus 13 Flutter tests
  passed;
- Privacy/Retention validator tests: 58 passed and both real validators passed;
- P0B protection: all 37 tests and six real validators passed; PSP remains
  `0/8 HOLD`, invited pilot remains `0/4 HOLD` / `NO-GO`;
- fresh PostgreSQL 16 applied migrations through `063` and passed the complete
  integration;
- Backend package runner: 581 passed, one expected no-database skip;
- Flutter: 379 passed and one documented Google-profile skip at standard
  parallelism; the separate Google-only profile passed;
- analyzer: accepted 220-issue baseline with no forbidden new issue class;
- Web debug build and loopback smoke, Android debug APK, syntax, diff and secret
  scan passed.

GitHub push and CI are not claimed because the stored CLI credential remains
expired. Draft PR #7 remains unmerged.
