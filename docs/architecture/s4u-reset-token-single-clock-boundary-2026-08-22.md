# S4U reset-token single-clock boundary - architecture

Status: locally verified on 22.08.2026 at implementation commit `db92a8c`.
This is a non-live security/release-readiness package for `TD-RR-006`; it
changes no production configuration, Payment, Store, Cloud/VPS/DNS or pilot
state.

## Boundary defect and source invariant

The PostgreSQL 30-minute reset-token constraint previously exposed a real
clock-boundary defect: `created_at` could come from database transaction time
while `expires_at` came from a later process clock. Even a small difference
could violate the upper bound. The product fix already creates one process
`createdAt`, derives `expiresAt` from that exact instant and inserts both values.

Migration `057_account_recovery_session_integrity` independently requires
`expires_at > created_at` and caps `reset_password` tokens at
`created_at + interval '30 minutes'`. The unit contract asserts an exact
1,800,000-millisecond difference between the two persisted parameters.

## Retained repeated proof

S4U adds a clean-exact-commit command that runs the focused single-clock unit
test five times and then runs the repository-owned fresh PostgreSQL 16
integration twice. Every failure stops immediately. The command contains no
sleep, retry, time extension, clock wait, alternate database or manual cleanup.

A static wiring contract, included in every complete technical regression,
locks the one-clock source shape, exact unit assertion, validated database
constraint, repeat counts, canonical PostgreSQL runner and absence of timing
accommodations.

## Local evidence and remaining boundary

At `db92a8c6564a9554bc6379c95783eec6d3406a69`, all five focused unit runs and
both fresh PostgreSQL 16 integrations passed. Each database run applied the
canonical migrations, exercised the reset flow through the complete HTTP
integration and cleaned its unique cluster; temp roots remained `0 -> 0`. The
command emitted:

```json
{"status":"passed","unitRuns":5,"postgresRuns":2,"clock":"single-issued-at","commit":"db92a8c6564a9554bc6379c95783eec6d3406a69"}
```

The complete clean-head local metadata gate also passed with analyzer baseline
220, 379 Flutter tests plus one documented skip, Google-only, Web/loopback
smoke and Android debug. This implements the local deterministic part of
`TD-RR-006`; formal closure still requires retained exact-commit CI on
PostgreSQL 16. Local metadata mode is not actual CI, Store or device evidence.
