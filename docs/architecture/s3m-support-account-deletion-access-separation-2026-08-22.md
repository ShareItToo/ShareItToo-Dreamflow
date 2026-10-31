# S3M support/account-deletion access separation - architecture

Status: technically verified for non-live operation on 22.08.2026. Production,
external delivery and public or invited pilot operation remain closed.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, modified
  `2026-08-20T22:29:02.738Z`.
- Scenario `SUP-029`: eligible case and legal-hold data remain controlled after
  account deletion, while user access is separated.
- Existing account-erasure preflight, support-message publication and
  append-only support audit controls.

## Separation model

The account-erasure preflight still fails closed for active bookings, payouts,
payments, disputes, reports and active legal holds. Support cases move to a
separate `retainedRecords` projection with an opaque identifier, user-safe
label and count. The Flutter flow requires a distinct confirmation of that
retention/access boundary before the existing final deletion confirmation.

On successful deletion, the existing account lifecycle invalidates sessions
and removes user access. The audit entry identifies pseudonymous support-case
records as retained; support rows and append-only case history are not deleted.

Support-message creation locks and verifies the recipient account as active.
Publication locks both message and recipient and performs the same check again
at the final state transition. Migration `041` adds database triggers for
direct inserts and `send_status` transitions, so a bypass or race is rejected
even outside the service workflow. Idempotent replay of an already sent record
does not perform a second transition or fabricate delivery.

## Explicit exclusions

- no inferred legal basis or retention duration;
- no deletion while an active legal hold exists;
- no new message or notification to a closed account;
- no external provider, production, Cloud, VPS, DNS, payment, Store or
  real-money mutation.
