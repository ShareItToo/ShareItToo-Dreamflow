# S4L handover exception intake - technical compliance record

Status: locally verified on 22.08.2026 at implementation commit
`27b29e93ef02a987f6414eb780556137de03efcf`, with deterministic runner commit
`487c34a862676607af47eaf767afcca3e174bf38`. This is non-live technical
evidence, not legal advice, professional approval or launch authorization.

## Support Matrix result

| Scenario | Enforced result |
| --- | --- |
| `SUP-049` QR failure | Existing manual-code fallback remains counterparty-bound; no self-confirmation. |
| `SUP-050` self-confirmation | Existing presenter/consumer role separation blocks it. |
| `SUP-051` fewer than four handover photos | Existing server evidence guard blocks pickup confirmation. |
| `SUP-052` materially different item | P1 neutral review after safe-abort guidance; no automatic guilt, status or money effect. |
| `SUP-053` off-platform deposit demanded | Immediate do-not-pay guidance and P1 Trust review; no fraud finding or account/listing action. |
| `SUP-054` handover no-show | Requires reached counterparty-confirmed appointment and server-visible chat contact; no fixed 100-percent consequence. |

## Enforced controls

- One participant-only endpoint owns kind-to-route mapping; generic support
  cannot submit its three reserved routes.
- Booking state must be `accepted` or `confirmed`; acute danger uses the
  established safety route.
- No-show truth is booking-timezone and server-clock based. Contact count is
  recomputed from the database.
- Audit metadata is exact, minimized and contains neither narrative details,
  messages, addresses, participant IDs nor payment/refund IDs.
- Handover, booking, money, guilt, account and listing effects are all recorded
  as false and independently enforced by PostgreSQL migration `062`.
- Rollback refuses after durable specialized evidence exists.
- Privacy and Retention manifests bind all new and changed sources and remain
  draft/blocked; no retention execution was enabled.

## Verification observed

Focused checks (`50`), Privacy/Retention tests (`58`), P0B tests (`37`), real
privacy/retention/P0B validators, fresh PostgreSQL 16, Backend (`568` pass plus
one expected skip), two standard-parallel Flutter runs (`376` pass plus one
documented skip each), separate Google-only coverage, analyzer baseline `220`,
Web loopback smoke, Android debug build, syntax and secret scan passed locally.

The monolithic PostgreSQL HTTP suite's shared limiter bucket reproduced a
known integration-architecture problem. No timing wait, IP rotation, limiter
bypass/reset or production-limit change was accepted. Route/limiter wiring and
transactional database truth are tested separately; dedicated isolated limiter
threshold evidence remains open under `TD-RR-002`.

The repository default no longer serializes Flutter tests and the Backend test
command no longer depends on undocumented shell values. Two local standard
parallelism runs are positive evidence, not closure: exact-commit CI and the
remaining release-debt exit criteria are still required.

P0B remains PSP `0/8 HOLD` and invited pilot `0/4 HOLD` / `NO-GO`. No
production, Payment, Store, Cloud/VPS/DNS, signed candidate, deployment, PR
merge, support decision, refund or public activation occurred. GitHub push/CI
is not claimed.
