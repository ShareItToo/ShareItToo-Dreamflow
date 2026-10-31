# S4M return calendar deadlines - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`1f6481f2ce76febb38340cd8a4e49b480af2306f`. This is non-live technical
evidence, not legal advice, professional approval or launch authorization.

## Support Matrix result

| Scenario | Enforced result |
| --- | --- |
| `SUP-055` missing return confirmation | Remains neutral and never creates `needsReview` without a substantiated case. |
| `SUP-056` changed return T0 | Requires a complete proposal plus distinct owner/renter confirmation; otherwise scheduled T0 applies. |
| `SUP-057` no response by T0+5 | Closes neutrally after five booking-calendar days, idempotently. |
| `SUP-058` substantiated report by T0+48h | Opens only inside the inclusive exact 48-hour window and is the sole path to `needsReview`. |
| `SUP-059` incomplete damage assertion | Creates no case, extra charge or broader hold. |
| `SUP-060` first response deadline | T1+5 booking-calendar days, preserving local wall time across DST. |
| `SUP-061` status cadence | Next update is T1+7 booking-calendar days and advances in seven-calendar-day steps. |
| `SUP-062` repeated scheduler pass | Existing event keys and outbox uniqueness keep updates idempotent. |
| `SUP-063` booking chat | Open through inclusive T0+48h; afterward new issues use Support, except an active substantiated case stays open until closure. |
| `SUP-064` undisputed return | No unnecessary case, extra charge or new Payment state; only the already authorized undisputed share is releasable. |
| `SUP-065` evidence visibility | Evidence remains private and account-exported; audit and lifecycle records stay minimized. |

## Enforced controls

- Server runtime validates the booking IANA timezone before computing any new
  calendar deadline.
- PostgreSQL policy version 2 independently binds V5.2 five/seven-day
  deadlines to `AT TIME ZONE`; historical policy version 1 rows remain valid.
- The 48-hour report deadline remains an exact duration and the boundary is
  inclusive.
- Changed T0 needs two distinct booking participants and complete stored flow
  evidence; a boolean alone is insufficient.
- Missing confirmation never extends direct chat beyond 48 hours and never
  becomes an adverse finding.
- The client local/QA projection cannot supersede the server, Payment does not
  gain a new action and no refund/payout execution is introduced.
- Privacy/Retention inventories are hash-bound and remain draft/blocked;
  rollback refuses retained version-2 calendar evidence.

## Verification observed

Focused checks (44 Backend and 13 Flutter), Privacy/Retention tests (58), P0B
tests (37), all real privacy/retention/P0B validators, fresh PostgreSQL 16,
Backend (581 pass plus one expected skip), standard-parallel Flutter (379 pass
plus one documented skip), separate Google-only coverage, analyzer baseline
220, Web loopback smoke, Android debug build, syntax and secret scan passed
locally.

Spring and autumn DST, inclusive 48-hour closure, distinct-participant T0 proof
and seven-day recurrence use fixed injected instants. No wait, clock-bound
retry, serial Flutter mode, limiter change, IP rotation or production-limit
change was accepted. Temporary Node resolution and manual PostgreSQL lifecycle
remain open under `TD-RR-001` and `TD-RR-004`; exact-commit CI and all register
exit evidence are still required before release readiness.

P0B remains PSP `0/8 HOLD` and invited pilot `0/4 HOLD` / `NO-GO`. No
production, Payment, Store, Cloud/VPS/DNS, signed candidate, deployment, PR
merge, support decision, refund, payout or public activation occurred. GitHub
push/CI is not claimed.
