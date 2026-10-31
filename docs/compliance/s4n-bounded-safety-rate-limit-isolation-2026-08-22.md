# S4N bounded Safety rate-limit isolation - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`6da227ba2abaf3d5aa75e6f0f235b31bf655eb4f`. This is non-live technical
evidence, not legal advice, professional approval or launch authorization.

## `SUP-109` result

| Risk | Enforced result |
| --- | --- |
| Ordinary intake abuse | Ten attempts per 15 minutes per limiter key, then 429. |
| Safety intake abuse | Thirty attempts per 15 minutes per limiter key, then 429. |
| General application abuse | 240 attempts per minute per limiter key, then 429. |
| General bucket starvation | Only exact protected Safety and handover-exception requests bypass that bucket. |
| Unbounded bypass | Impossible through this policy: both bypassed routes enter the dedicated 30-attempt limiter before auth/database work. |
| Privilege or outcome escalation | None: limiter classification cannot authorize, persist, decide, moderate, charge, refund or change a booking. |

## Fail-closed controls

- Method and path matching are exact; unrelated endpoints remain governed by
  the general bucket.
- The support path gets the Safety bucket only when the body matches the
  existing protected Safety intake classifier.
- Handover exceptions remain authenticated, participant-only and constrained
  by their existing kind-specific acknowledgement and evidence rules.
- All limiter stores are fresh per application instance, which supports
  deterministic isolation without production resets.
- Privacy and Retention manifests hash-bind the new policy and changed server
  wiring; both remain draft/blocked.

## Verification observed

The focused 39-test package asserts real 10, 30 and 240 boundaries twice with
one fixed request source. Sixty-eight Privacy/Retention tests, 37 P0B tests,
all eight actual fail-closed validators, two fresh PostgreSQL 16 runs, 587
Backend passes plus one expected skip, 379 standard-parallel Flutter passes
plus one documented skip, separate Google-only coverage, analyzer baseline
220, Web loopback smoke, Android debug build, syntax, diff and secret scan
passed locally.

No sleep, clock-bound retry, limiter reset, IP rotation, production-limit
increase or serial Flutter mode was accepted as proof. `TD-RR-002` remains open
for removal of historical request-source accommodations from the monolithic
integration plus exact-commit CI. Temporary Node resolution, manual PostgreSQL
lifecycle and the other release-debt entries remain open.

P0B remains PSP `0/8 HOLD` and invited pilot `0/4 HOLD` / `NO-GO`. No
production, Payment, Store, Cloud/VPS/DNS, deployment, signed candidate,
support decision, refund, payout, merge or public activation occurred.
