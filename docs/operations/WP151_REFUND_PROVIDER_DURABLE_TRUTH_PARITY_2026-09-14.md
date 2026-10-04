# WP151 — Refund provider/durable-truth parity

Status: **TECHNICAL CLOSURE; FULL REGRESSION PASSED; EXTERNAL GATES HOLD**.

## Decision

SIT uses one explicit refund model for its Separate Charges and Transfers
architecture: `separate_charge_manual_transfer_reversal_v1`. The customer
refund applies to the platform charge. Any already transferred owner share is
recovered through separately persisted transfer-reversal work. A local
`platform_share_minor` is an allocation in SIT's own ledger and receipt; it is
not evidence of a Stripe Application Fee and must not cause
`refund_application_fee` or `reverse_transfer` to be sent with the Stripe
refund request.

## Durable and provider truth

Migration 077 renames the former `refund_platform_fee` value to
`legacy_refund_platform_fee_claim`. Every historical value is preserved
exactly, but its meaning remains an unverified pre-WP151 application claim and
is never promoted to provider-outcome evidence. Historical rows therefore have
no trusted `provider_refund_model`. New rows require the exact canonical model
and a NULL legacy claim. The database guard also forbids refund deletion,
freezes preparation identity and makes a confirmed provider outcome complete
and immutable.

The runtime writes the canonical model when a new refund is prepared and binds
the same value into provider metadata as `sit_refund_model`. Provider readback
must match the persisted refund, payment, booking, amount, currency, livemode
and refund model. The Stripe adapter receives only charge, amount, metadata and
the idempotency key; no Connect refund flag is accepted or emitted.

The owner-share reversal amount and the platform-share refund amount remain
represented by their existing exact minor-unit split, ledger entries and
receipt. WP151 changes truth representation and verification, not payment
economics.

## Execution, replay and recovery behavior

An existing or completed refund whose canonical model is missing or whose
legacy claim remains populated fails closed before authorization, provider,
payout or replay work. An unfinished canonical refund must retain its exact
command, payment and immutable preparation snapshot. Finalization re-locks and
revalidates that snapshot after the provider call. It also rechecks provider
funds withdrawal and unfinished dispute-transfer recovery after reacquiring
the financial locks. A dispute/recovery webhook that wins that lock order
therefore cannot be missed by local settlement; confirmed provider refund
truth is retained as `needsReview` rather than converted into a false local
success or provider failure. Lost-response lookup and reversal retry use the
same provider model and only the residual unsatisfied transfer-reversal amount.
Health and the reconciler isolate ambiguous history as `needsReview`; it cannot
appear as ordinary pending recovery.

Checkout has the same post-provider principal fence. If owner or renter
commerce eligibility changes after Stripe creates the Session but before its
durable local delivery, SIT expires that exact Session and records the local
payment as cancelled before returning the original rejection. If expiration
cannot be proved, the result is `payment_checkout_cleanup_required`; an
externally open or completed Session is never represented as safely rejected.

The migration performs no historical UPDATE or inferred backfill. Its down
migration is permitted only while every refund is still a preserved legacy
row. Once any canonical post-migration refund exists, rollback stops with the
named guard rather than recreating an invented Boolean.

## Downstream financial truth

The same classification now reaches every consumer. Account deletion blocks
open or historical-unverified refunds. Refund obligations sum only confirmed
canonical outcomes. Withdrawal first locks its Booking and Request, then reads
refund truth in a fresh second statement under PostgreSQL READ COMMITTED.
Untrusted history, unresolved canonical refunds, an already cancelled booking
or inconsistent booking/refund status enters manual review and creates no new
booking or refund effect. Refund notifications require the central
`sit_payment_refund_truth` result to be `providerBound` in addition to the exact
event identity `refund:<id>:succeeded` and the complete canonical success tuple;
another successful refund for the same Booking cannot promote a stale notification.
Old or ambiguous messages are suppressed or labelled `historical_unverified`
with `needsReview`, never presented as a confirmed provider result.

Financial-document creation and both list/artifact readback require the central
truth to be `providerBound` as well as the exact canonical success tuple:
provider model, empty legacy claim, `status=succeeded`, provider refund
identifier and persisted success instant. Privacy export distinguishes
`provider_bound`, `provider_outcome_unconfirmed` and
`historical_unverified`. Staff aggregates compare the stored payment refund
total and payment status with the canonical confirmed sum. Failed/cancelled
refund rows or status drift return `needsReview` with no exact amount.

Compliance sums only canonical confirmed platform-share refunds and counts
untrusted or unresolved refund rows separately. Either class forces
professional review and suppresses exact net/threshold truth. The pilot
cockpit may retain gross capture facts, but untrusted/unresolved refund truth
makes refund-derived net, cash, provider-cost, VAT and profitability metrics
unavailable; profitability is `undetermined`. Per-captured-booking and
per-completed-handover metrics carry the same refund-truth reason rather than a
generic missing-input reason.

## Verification and limits

The consolidated 17-file focused Backend matrix passes **128/128**, including
fresh create, uncertain-response lookup, residual reversal retry, snapshot
drift, post-provider dispute/recovery races, Checkout principal-race cleanup,
completed replay, notification event and central-truth binding, staff/cockpit
classification, legacy/unresolved consumers, provider metadata, no-flag Stripe
payloads and migration behavior. Targeted tool tests pass **64/64**, all
repository Tool tests pass **3015/3015**, and the focused Flutter truth/UI
matrix passes **20/20**. The complete Backend suite
passes **985 with 2 intentional skips** (987 total).
Fresh PostgreSQL integration passes **2/2 and cleans up**, including exact
legacy preservation, canonical inserts, outcome/preparation immutability,
deletion refusal, unsafe-rollback refusal and the synchronized real V5.1
lock/READ-COMMITTED race.

The deterministic WP151 validator binds the implementation, focused tests,
migration pair, R9 recovery inventory and this handover. The complete local
CI-equivalent technical regression passes with exit 0, including Analyzer,
full Backend and Flutter suites, Tool tests, fresh PostgreSQL, Web/Wasm,
loopback smoke and Android debug assembly. Exact-head GitHub Regression/CodeQL
are still pending and are not claimed here.

Provider economics, Stripe configuration, live or test provider state,
payment execution, money movement, deployment, Production, Store, Firebase,
credentials, devices and PR merge are unchanged. Professional legal approval,
owner adoption and real-money activation are not claimed. The Astra/WP149
comparison remains **CORRECTIONS_REQUIRED** (3 CONFIRM / 12 CORRECT / 3
INSUFFICIENT_EVIDENCE); § 193 BGB and the remaining legal corrections stay
open and are not professional approval. All external gates remain closed.
