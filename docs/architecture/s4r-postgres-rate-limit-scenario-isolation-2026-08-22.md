# S4R PostgreSQL rate-limit scenario isolation - architecture

Status: locally verified on 22.08.2026 at implementation commit `0dffd6c`.
This is a non-live security/release-readiness package for `TD-RR-002`; it
changes no production limiter, Payment, Store, Cloud/VPS/DNS or pilot state.

## Failure mode removed

The long PostgreSQL HTTP integration shared one in-memory limiter lifecycle
across unrelated business scenarios. Historical additions assigned reserved
`X-Forwarded-For` values to DSA, evidence, recovery, export and authentication
requests so a previous scenario could not consume a later scenario's bucket.
Those addresses were test-order accommodations, not product assertions.

No production-limit increase, wait for window expiry, rate-store reset hook or
silent limiter bypass is accepted as a deterministic fix.

## Scenario-owned application lifecycle

The integration now owns a `restartApplicationServer` helper. At each bounded
scenario boundary it closes the current loopback server, constructs a fresh
`createApp(applicationOptions)` instance with new repository-owned limiter
stores and continues against the same isolated PostgreSQL database. Database
state remains continuous while unrelated in-memory request budgets do not.

This mirrors separate application-test fixtures and exercises the unmodified
production middleware stack. The product limits remain 240 general requests
per minute, ten ordinary support attempts per 15 minutes and 30 protected
Safety attempts per 15 minutes, with every specialized limiter unchanged.

## Explicit distributed-attack exception

Exactly one forwarded-source header remains in the monolithic integration. It
belongs to the account-lock security scenario: ten failed credentials arrive
from ten distinct reserved sources and must still lock the target account.
Source diversity is the threat being tested there, not a way to make another
test pass. A committed source contract rejects any second forwarded header or
return of the historical reserved-source variables.

The final login-limiter assertion starts from a fresh application and uses one
ordinary loopback source. The separate limiter policy suite continues to prove
the exact 10/30/240 thresholds and general-starvation isolation with fixed
sources and fresh instances.

## Local evidence and remaining boundary

Two consecutive repository-owned PostgreSQL 16 runs passed through every
migration and the complete HTTP integration. The Backend suite passed 602
tests plus one expected skip. Two consecutive complete technical regressions
passed with standard Flutter parallelism and temp-fixture disk growth
`0/0 KiB -> 0/0 KiB`.

The local deterministic requirement of `TD-RR-002` is implemented. Formal
closure still requires green CI on the exact pushed commit together with the
isolated threshold suite. No release-readiness, deployment, Store submission
or live-provider claim follows from the local result.
