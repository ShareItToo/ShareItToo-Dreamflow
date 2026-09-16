# WP153 — Position review and unrelated-release parity

Status: **TECHNICAL CLOSURE; FULL LOCAL REGRESSION PASSED; V5.5 INACTIVE; EXTERNAL GATES HOLD**.

## Decision and verified defect

The booking-group handover projection already separated each position, emitted
`groupNeedsReview: null` and `itemReviewIsolation: true`, and blocked a whole
group only for a separately recorded account-level system-risk hold. The payout
path did not have equivalent source integrity: `releasePayout` derived the
contested amount from mutable `rental_requests.payload` although the exact
append-only `v52_return_cases` record already existed. A mutable amount could
therefore understate or contradict the real position hold.

WP153 removes that path. An open position review now releases money only from
the exact booking's canonical return-case record plus its current booking-case
status. Missing, foreign, closed/open-state-drifted or arithmetically
inconsistent truth fails closed before any provider mutation. The payout audit
records the exact review scope, case, reason and contested amount without
recording private free text.

## Durable position invariant

For each booking position:

1. `needsReview` requires one exact V5.2 return-case identity and an open
   `booking_cases` state.
2. The immutable authorized amount must equal the payment amount; contested
   amount must be positive and no greater than authorization; undisputed amount
   must be the exact remainder.
3. Only the proportional owner share of that contested position amount is
   held. The rest of that position remains releasable after its own gates.
4. Provider dispute queries remain bound to the same booking ID. Another
   position is not consulted and is not marked disputed.
5. Group projection refuses a review state without canonical case truth. Its
   typed client parser independently requires scope `booking_position`, a case
   and reason for an active review, human review, and
   `unrelatedPositionsBlocked: false`.
6. A separate account/payout suspension or an externally imposed provider hold
   remains a distinct, principal-bound ground; it is not inferred from an item
   review.

## Deadline and payout race

`openV52ReturnCase` first locks the booking. Only after that statement returns
does a separate PostgreSQL `clock_timestamp()` statement establish the opening
time. A stale client clock, transaction-start clock or timestamp evaluated
before a lock wait cannot reopen the inclusive T0+48-hour window.

While still holding the booking lock, the workflow checks whether a payout for
that exact booking is already `scheduled`, `pending`, `paid` or `reversed`.
Such a late ordinary return-case request fails with
`v52_return_case_conflicts_with_payout` before evidence or case writes. If the
case wins the booking lock, the later payout reads its canonical case; if the
payout wins, the later case observes the started payout and is refused. The
conflict does not claim that the allegation is rejected; it requires a
separate support/manual path.

## Inactive V5.5 legal successor

`V5.5-2026-09-15` is a new nine-part, hash-bound AI draft derived from the
unchanged V5.4 predecessor. Parts D, E and G now state the position scope,
reason, evidence, disputed amount, time limits, human review, notification,
formal result and applicable later review path. They distinguish a user's
claim from provider liquidity/reserves and preserve independent release of
unrelated positions.

This wording is a conservative project interpretation, not professional legal advice or
approval. The official Digital Services Act source was checked for
the surrounding statement-of-reasons and complaint context, but SIT's DSA
classification and complete public procedure remain a separate open package:
https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32022R2065

V5.2 remains the only binding version. V5.4 and V5.5 both return
`legal_contract_version_inactive`; no flag, fallback or owner action in this
package activates V5.5.

## Verification

- focused Backend position/payment/return/group set: **60/60 passed**;
- focused Flutter booking-group parser/UI set: **5/5 passed**;
- focused V5.5/legal-readiness set: **19/19 passed**;
- Backend full suite: **988 top-level tests, 997 passed, 2 intentional skips**;
- Backend static syntax check: **passed**;
- fresh PostgreSQL integration: **2/2 passed and cleaned up**;
- all Tool tests: **3036/3036 passed**;
- complete CI-equivalent technical regression: **passed with exit 0**;
- exact-head GitHub Regression and CodeQL: **pending until commit/push**.

## Boundaries and remaining risk

No provider request, payment, money movement, deployment, Production, Store,
Firebase, Cloud/VPS, credential, device or PR-merge action occurred. V5.5 is
inactive and has no professional legal approval.

Historical or corrupted `needsReview` rows without a canonical V5.2 case now
block payout instead of guessing an amount; they require explicit support/data
reconciliation. Provider reserves, chargebacks and independently documented
account/payout restrictions may still affect a wider balance externally and
must remain separately explained. The four Astra corrections for privacy,
export/counterparty protection, retention/legal holds and DSA/marketplace
moderation remain open, as do the operator, PSP/ZAG and Business/Global facts.
