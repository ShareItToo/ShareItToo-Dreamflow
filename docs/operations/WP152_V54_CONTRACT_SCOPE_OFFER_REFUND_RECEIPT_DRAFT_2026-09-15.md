# WP152 — V5.4 contract scope, offer, refund and receipt draft

Status: **TECHNICAL DRAFT CLOSURE COMPLETE; V5.4 INACTIVE; ALL EXTERNAL GATES HOLD**.

## Decision

WP152 creates `V5.4-2026-09-15` as a new nine-part, hash-bound and explicitly
inactive AI legal draft. It does not edit, replace or relabel either historical
`V5.2-2026-08-16` or the inactive V5.3 predecessor. The retained Astra result
remains `CORRECTIONS_REQUIRED` and incomplete because only its normalized
outcome, not a complete raw per-question response, was preserved.

This package addresses the tightly coupled contract layer before another broad
hardening package:

- scope, beginning and end of the booking-related SIT platform service;
- listing, offer, access, unchanged acceptance, changed/late counteroffer and
  disclosed payment-condition semantics;
- pre-order information, correction opportunity, payment-explicit button and
  durable confirmations separated by event;
- platform withdrawal, C2C rental, partial performance, position-first
  cancellation and refund consequences; and
- debtor, creditor, service-provider, document-type and issuer roles.

The text is a conservative implementation draft, not professional legal advice
or approval. Proposed wording and cancellation figures remain subject to final
AGB, consumer, tax and provider review.

## Official primary-source check

The legal interpretation was refreshed against current official BMJ/BfJ pages
on 2026-09-15. The law text and the project interpretation remain separately
identified:

| Source | Law-text checkpoint | V5.4 project interpretation |
| --- | --- | --- |
| BGB §§ 145, 147 and 150 | An offer binds unless excluded; acceptance has a time boundary; late or changed acceptance is a new offer. | A listing is an invitation; exact quote acceptance only, otherwise a new counteroffer revision and no payment. |
| BGB § 158 | A suspensive condition takes effect when the condition occurs. | If payment authorization is used as the disclosed condition, the rental effect waits for provider-confirmed success; unknown transport stays unresolved. |
| BGB § 312j and EGBGB Art. 246a §§ 1, 4 | Payment-relevant information must be timely, clear and prominent; the order action must make the payment obligation explicit. | Proposed final button is `Zahlungspflichtige Mietanfrage senden`; parties, positions, duration, prices, costs, binding period and correction are shown from one server quote. Final legal approval remains open. |
| BGB §§ 126b and 312f | Text form requires a readable, personally addressed, storable and unchanged reproduction; a distance-contract confirmation is due on a durable medium within the statutory timing. | Receipt content, hashes, versions and distinct events are immutable and downloadable; access, acceptance and payment are not collapsed into one success state. |
| BGB §§ 355, 356a and 357 | Withdrawal, electronic withdrawal function and repayment consequences have separate requirements. | The SIT platform service and private C2C rental are kept distinct; no automatic fixed-period exception or early-expiry claim; the electronic flow and durable acknowledgement remain an activation prerequisite. |
| BGB § 535 | The landlord grants use and the tenant owes rent. | The renter is the rent debtor; the private owner is the rent creditor and rental-service provider. V5.2 Part E's contrary wording is corrected only prospectively. |
| EGBGB Art. 246d § 1 | Marketplace information includes provider status, consumer-law consequence and operator involvement in performance. | Private/trader status and SIT's limited role must be disclosed; an unclear or business provider remains blocked until a separate B2C version exists. |

Official URLs:

- https://www.gesetze-im-internet.de/bgb/__126b.html
- https://www.gesetze-im-internet.de/bgb/__145.html
- https://www.gesetze-im-internet.de/bgb/__147.html
- https://www.gesetze-im-internet.de/bgb/__150.html
- https://www.gesetze-im-internet.de/bgb/__158.html
- https://www.gesetze-im-internet.de/bgb/__312f.html
- https://www.gesetze-im-internet.de/bgb/__312j.html
- https://www.gesetze-im-internet.de/bgb/__355.html
- https://www.gesetze-im-internet.de/bgb/__356a.html
- https://www.gesetze-im-internet.de/bgb/__357.html
- https://www.gesetze-im-internet.de/bgb/__535.html
- https://www.gesetze-im-internet.de/bgbeg/art_246a__1.html
- https://www.gesetze-im-internet.de/bgbeg/art_246a__4.html
- https://www.gesetze-im-internet.de/bgbeg/art_246d__1.html

## Contract and state model

V5.4 keeps two contracts visible: renter–SIT for the platform service and
renter–private owner for the itemized group rental. One group contract has an
ordered position annex; the group total is derived only from position amounts.
The platform service does not promise physical handover, condition, ownership,
safety, insurance or private-contract performance. It runs through final
booking rejection/expiry/termination or through return and closure of its
technical cancellation, refund and support states; beginning service is not
mislabelled as full performance.

The proposed operative sequence is:

1. Listing is an invitation, not an offer.
2. The renter sees one immutable server quote and sends separate platform and
   private-rental offers.
3. Receipt of that action is acknowledged without claiming acceptance.
4. SIT separately accepts the platform offer and makes the complete receipt
   durably available before the service begins.
5. The owner either accepts the exact private offer or creates a new
   counteroffer. Any changed field requires a new quote and renter consent.
6. If a prominently disclosed provider condition applies, only confirmed
   provider success activates the private rental. Timeout/transport ambiguity
   remains unresolved and cannot trigger retry payment or success/denial copy.
7. Final private-rental confirmation is a later, separately durable event.

## Cancellation, partial performance and refund

Part C now distinguishes contract non-formation, counteroffer, unknown provider
outcome, renter cancellation, owner failure, platform withdrawal, contractual
exit, non-performance, actual loss and provider execution. Position comes
before group. An affected item does not automatically change unrelated items;
whole-group exit needs an express rule, mandatory law or an objectively
interestless remainder plus the required user declaration. A damage allegation
alone cannot hold unrelated or undisputed amounts.

The current 24-hour/50-percent/60-minute proposal is preserved only as a
professional-review-open proposal. It expressly requires saved expenses,
replacement rental and proof of lower loss to be considered. Provider success
does not create the legal claim, and the legal claim does not prove provider
execution.

## Receipt and payment roles

The prospective correction is explicit:

- renter = debtor of the private rent;
- private owner = creditor and service provider of the private rent;
- renter = debtor of the SIT platform fee;
- SIT = creditor and service provider of the SIT platform fee; and
- the PSP's payment confirmation is not an invoice for either underlying
  service.

SIT can issue only its own platform-fee document. A private-rental document is
attributed to the private owner without inventing an entrepreneur invoice or
VAT. A combined overview may correlate both contracts but cannot masquerade as
one invoice. Corrections create a new immutable version instead of overwriting
history.

## Runtime guard and verification

`backend/src/legal_contract_version_registry.js` recognizes the existing exact
V5.2 runtime and the prepared V5.4 draft. Only V5.2 has binding acceptance
enabled. V5.4 returns `legal_contract_version_inactive`; unknown, padded,
truncated or lowercase identifiers return `legal_contract_version_unsupported`.
The existing V5.2 readiness and persistence paths both pass this guard. No
environment flag, owner token or fallback can activate V5.4.

Because that existing workflow file gained only this guard, its dependent
Privacy source inventory receives a hash-only refresh. No privacy purpose,
recipient, legal basis, retention statement, approval or runtime behavior is
changed.

Focused V5.4 and legal-readiness tests pass **19/19**. The version-registry and
existing V5.2 workflow tests pass **10/10**, and the Backend static check passes.
All Tool tests pass **3026/3026**, the complete Backend suite passes **988**
with **2 intentional skips**, fresh PostgreSQL passes **2/2 and cleans up**,
and the default Flutter suite passes **952** with **33 intentional skips**.
Analyzer reports zero issues; Web/Wasm, loopback smoke and the Android minSdk
24 build pass. The complete local CI-equivalent technical regression exits 0.
Exact-head GitHub Regression/CodeQL remain pending until the closure commit is
pushed.

The first local rollover-mode invocation stopped safely after its repository
tests because the metadata-bound `2026091311` private candidate directory had
been moved to the Crucial-backed volume and replaced locally by a symlink. The
unchanged archive validator correctly refuses symlinked candidate directories.
The successful full run used the repository-supported CI metadata-only path;
it proves source regression, not private-candidate archive validity. No retry,
weakened assertion or relocated artifact is accepted as release evidence. The
storage-path mismatch is retained in the technical-debt observation log.

## Remaining risk and next legal work

WP152 does not close Astra's remaining corrections for position review,
privacy/provider matrices, export/counterparty protection, retention triggers
or DSA/marketplace moderation. It also cannot establish operator/register facts,
the real Stripe Connect contract/configuration and ZAG result, or Business and
Global variants. The § 193 BGB weekend/holiday extension remains open as
documented by WP149. No AI review is represented as a lawyer, tax adviser or
provider approval.

No provider request, payment, money movement, deployment, Production, public
activation, Store, Firebase, Cloud/VPS, credential, device or PR-merge action
occurred. All external gates remain closed.
