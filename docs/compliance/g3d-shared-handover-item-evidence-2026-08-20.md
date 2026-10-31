# G3D Shared Handover and Item Evidence - Technical Evidence

Date: 2026-08-20
Decision: G3A Variant A
Activation: disabled, internal technical path only

## Implemented boundary

- Migration 030 adds an immutable item-booking bridge, an idempotent shared-
  appointment command and exactly one pickup plus one return appointment.
- The database validates the final accepted group quote, exact position,
  listing, owner, renter, period, currency and cent allocation before binding.
- Every binding requires an existing V5.2 item platform contract on the exact
  underlying booking quote and both matching contract declarations.
- The appointment pair is derived entirely from group server truth. It stores
  the location compatibility hash, timezone and explicit policies internally,
  but exposes neither the hash nor an exact address in the group response.
- Read projection returns each item's evidence IDs and semantic slots,
  accessory evidence, counterparty confirmation, return state, damage case,
  timers and item booking thread independently.
- `groupNeedsReview` is deliberately absent as a state (`null` in the technical
  projection). `itemReviewIsolation=true` documents that one item review does
  not mutate or block another item.
- Only an active `user_suspensions.scope='account'` record for a participant
  elevates the whole overlay to `held_system_risk` and blocks appointment
  creation.
- Binding and appointment creation write append-only records and explicit
  audit events. Commands are actor-, group-, request-hash- and idempotency-
  bound.
- Account export and the read-only retention inventory cover all booking-group
  quote, state, command, binding and shared-appointment datasets.

## Preserved V5.2 boundaries

- Four presenter photos per segment remain required per booking:
  `overview`, `detail`, `accessories`, `critical`.
- Counterparty deviation evidence, confirmation and challenge verification
  remain per booking and per pickup/return segment.
- Message threads and exact-address disclosure remain item-booking scoped.
- Return T0, report and clarification windows, case response cadence,
  contested authorized amount and undisputed release remain item scoped.
- G3D does not aggregate or automatically collect damage and does not create a
  deposit, protection product or SIT collection service.

## Non-effects

- No booking, rental request, availability hold or contract is created.
- No payment, payout, refund, financial document or damage charge is created.
- No V5.2 history is updated or deleted.
- No production, public UI, Store, signing, cloud, provider or real-money state
  is changed.

## Verification contract

- Pure tests cover exact appointment derivation, four-slot accessory evidence,
  evidence identifiers, item-only `needsReview`, independent chat/timers and
  the explicit system-risk exception.
- Static tests cover disabled routing, the internal-only materializer seam,
  append-only and fail-closed migration boundaries, V5.2 contract/declaration
  validation and absence of an exact-address query.
- PostgreSQL integration covers forward/rollback migration, two real synthetic
  V5.2 item contracts and declarations, incomplete-binding rejection, account
  system-risk hold, idempotent appointment creation, independent item return
  states, item chat IDs, privacy export and immutable appointment rows.
- The full technical regression and exact commit-bound GitHub Actions run must
  pass before G3D is marked GREEN.

## Rollback and next package

Migration 030 rollback succeeds only while its three tables are empty and
otherwise refuses evidence loss. After exact green CI, V2.4 automatically
advances to G3E for disabled multi-item UX and end-to-end integration.
