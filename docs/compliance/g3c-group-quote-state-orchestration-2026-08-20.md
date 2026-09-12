# G3C Group Quote and State Orchestration - Technical Evidence

Date: 2026-08-20
Decision: G3A Variant A
Activation: disabled, internal technical path only

## Implemented boundary

- Migration 029 adds immutable group quotes, normalized quote positions,
  append-only state events and an internal idempotency command record.
- Every group item is freshly quoted by the existing server pricing workflow.
  The group quote exposes the exact item allocations and their integer-minor-
  unit sum; request prices and state are ignored.
- The owner may accept all, decline all or propose a changed item set. A
  counter-offer is revision 2 or later, linked to its predecessor and freshly
  requoted.
- The renter must expressly accept the exact counter-offer ID and hash.
  Stale consent, implicit consent and unchanged-set counter-offers fail closed.
- Database triggers bind group, actors, current quote chain, initial full item
  set and permitted transitions. Append-only guards reject evidence mutation.
- Successful commands are actor-, type- and request-hash-bound, replay their
  stored result and write both a state event and audit entry.

## Non-effects

- No booking, contract, reservation or availability hold is created.
- No payment, transfer, refund or financial document is created.
- No handover, return, damage or `needsReview` state is created.
- No existing V5.2 table or historical row is rewritten.
- No production, public UI, Store, cloud, provider or real-money state changes.

## Verification

- Focused domain and static boundary tests cover deterministic totals,
  immutability, changed-set counter-offers, exact consent and disabled routing.
- The backend suite covers all non-PostgreSQL behavior locally.
- The PostgreSQL integration covers forward migration, exact tables, disabled
  HTTP route, accept-all, decline-all, counter-offer plus consent, stale and
  unauthorized rejection, idempotent replay, audit/event order, zero creation
  of bookings/contracts/payments and fail-closed rollback.
- The full repository regression and exact commit-bound GitHub Actions run are
  required before G3C is marked GREEN.

## Rollback and next package

Migration 029 rollback is additive and succeeds only while all G3C tables are
empty; otherwise it refuses destructive evidence loss. On exact green CI,
V2.4 automatically advances to G3D. G3D must consume accepted group truth into
item-specific contracts without activating production or real payment.
