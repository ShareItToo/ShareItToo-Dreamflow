# WP150 — Completed payment-command replay integrity

Status: **TECHNICAL CLOSURE; EXTERNAL GATES HOLD**.

## Decision

A trusted-v1 completed refund or payout command may return its already
persisted result after an abgelaufener Sandbox-Autorisierung only when the
whole durable result can be re-established exactly. The replay is bound to the command key and type,
Original-Actor, request hash, booking, payment, stored response hash, related
refund or payout row, its immutable command-time refunded/transferred
settlement snapshot, ledger header and the exact balanced ledger entries.
Anything incomplete or contradictory fails closed. A fresh or incomplete
command still reaches the execution authorization and returns **503** when that
authorization is unavailable or expired.

## Implementation

Migration 076 adds a deterministic SHA-256 digest, completion-integrity version
and immutable command-time settlement snapshot for completed response objects,
plus a one-shot database guard. It rejects malformed historical completion
pairs rather than repairing them. Historical completed commands retain a NULL
completion-integrity version and are never trusted for replay. Only a new v1
completion can establish the required settlement snapshot. Command identity,
the permitted single payment binding, and a completed result cannot later be
changed; a completed command cannot be deleted. The historical hash backfill
makes stored payloads immutable from the migration onward, but die Hashes liefern
keine authentische Provenienz for the period before the migration.
The settlement constraint explicitly requires both minor-unit snapshot values
to be non-NULL for v1 Refund/Release completion; SQL NULL cannot silently pass
the check.

Refund and payout replay validation now checks the current locked payment and
business rows plus exact ledger identity, references, currency, amounts and
entries before returning the stored response. A valid completed replay exits
before the execution gate and before fresh-work preparation. Der Replay-Pfad
verursacht keine Provider-Aktion, keine DML-Aktion und keinen
Notification-Worker side effect. The HTTP
routes also wake the worker only for a newly produced result.

The shared completion helper resolves a concurrent canonical Connect or
Checkout completion collision only after full identity, digest and exact
response-semantic validation, returning the stored response instead of
overwriting it or duplicating the audit. Admin payout
cancellation completes the original payout command with its Original-Actor,
not the later reviewing administrator.

Refund finalization has a deterministic owner-bound race case: when another
transaction completes the same refund after provider success, the loser
returns only the exact stored result and performs no second financial DML.
Checkout acquires one booking-scoped advisory lock before command, booking or
payment row locks. The canonical K0/K1 alias case proves one lock order and one
trusted result rather than competing provider work. Newly produced Connect and
Checkout responses are validated with the same response semantics before they
are persisted, so eine frische Antwort cannot create a replay receipt that its own
read path would reject.

## Verification and limits

Focused WP150 runtime, expiry, corruption-matrix, owner-bound refund race,
K0/K1 Checkout lock, fresh-response, completion-race, migration, R9 inventory
and static-wiring tests pass **18/18**. The Backend suite passes **939 with 2
intentional skips** and fresh PostgreSQL passes **2/2 and cleans up**. The
deterministic WP150 validator binds the implementation, tests, migration and
this handover. The complete CI-equivalent local technical regression passes.
Exact-head GitHub Regression/CodeQL remain pending until commit/push.

Two P2 items deliberately remain separate:

- `payment_commands.actor_id` still uses `ON DELETE SET NULL`. That conflicts
  with preserving the hard principal binding if physical user deletion is ever
  introduced. Current erasure is soft-anonymisiert, so WP150 does not change
  Privacy/Retention or the deletion architecture.
- The stored Refund row currently says `refund_platform_fee=true`, while the
  provider request sends the corresponding option as `false`. That durable
  DB/provider truth mismatch remains a separately bounded payment debt.

Alle externen Gates bleiben geschlossen. No provider request, Stripe mutation,
payment, money movement, deployment, Production, public activation, Store,
Firebase, credential, device or PR-merge action occurred. Professional legal
approval, owner adoption and real-money activation are not claimed.

Privacy/Retention classifications are unchanged. Their two manifests receive
reine Hash-Refreshes for the changed application source only; no disclosure,
retention period, deletion behavior or approval status is reclassified.
