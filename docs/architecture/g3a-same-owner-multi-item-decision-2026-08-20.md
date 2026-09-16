# G3A Decision Package: Multiple Items from the Same Owner

Status: **architecture recommendation complete; Walid decision required**

Date: 2026-08-20

Scope: decision and target architecture only; no productive implementation

## 1. Executive recommendation

Choose **Variant A: owner booking group with normalized item positions**.

The legal and transactional root is one `booking_group` for exactly one
renter, one owner and one compatible legal/payment context. The existing
single-item `bookings` evolve into the independently auditable item positions
of that group. The group provides one request, one acceptance decision, one
appointment and, later and only after its own gate, one payment operation. Each
position keeps its own immutable quote, price allocation, availability,
handover/return evidence, damage case and refund allocation.

This is the only evaluated variant that satisfies both sides of the Growth
requirement:

- the customer and owner receive a genuinely grouped process; and
- every item remains independently provable and financially traceable.

The choice is an architecture decision, not permission to implement it.

## 2. Authority and reviewed evidence

The package was checked against:

- the current repository on branch `codex/master-workflow-20260808`, base HEAD
  `580ebbd39569c86110e049434e12e1fa42a5e685`;
- [V5.2 Core Specification](https://drive.google.com/file/d/1HQR2EWJg6FUcU41l5uwditfFzNoCe6Zx/view?usp=drivesdk);
- [V5.2 Rechtsmappe Privatlaunch](https://drive.google.com/file/d/1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2/view?usp=drivesdk);
- [SIT Master V2 Deutschland zu Global](https://drive.google.com/file/d/1z9GdNlilUrpq1P34lrXdqv6RmJHYSQfJ/view?usp=drivesdk);
- [Growth Produkt Projektkorb und Planer](https://drive.google.com/file/d/159xMd9qoMqp_5x0x0evYG511auKgk4Nu/view?usp=drivesdk);
- [SIT Business Produktstrategie](https://drive.google.com/file/d/1UdwK9GB79Zlt1jIKcWoG43J8LQezJDdE/view?usp=drivesdk); and
- [Global Expansion Playbook](https://drive.google.com/file/d/1ZO9ocAHLOxVY-cAKlsKjwvH4oRB5F76J/view?usp=drivesdk).

The Rechtsmappe and official BGB text were used to identify decisions that
need a new prospective legal version. This document is an architecture
analysis, not professional legal approval. In particular:

- a submitted offer is binding under the general rule in
  [BGB section 145](https://www.gesetze-im-internet.de/bgb/__145.html), so an
  owner must not silently turn an all-item offer into a partial acceptance;
- consequences of partial performance require an explicit contract design;
  [BGB section 323(5)](https://www.gesetze-im-internet.de/bgb/__323.html?level=1)
  must not be replaced by an implicit system assumption;
- item duties remain itemized against the lease duties in
  [BGB section 535](https://www.gesetze-im-internet.de/bgb/__535.html); and
- the relevant electronic-order information and button design for future
  consumer/trader branches must be separately checked against
  [BGB section 312j](https://www.gesetze-im-internet.de/bgb/__312j.html).

## 3. What the current code actually models

The current V5.2 path is single-item end to end:

| Area | Current cardinality and binding |
| --- | --- |
| Request/booking | `bookings` has one required `listing_id`, owner, renter and period. The overlap exclusion is per listing. |
| Quote | `booking_quotes` binds one renter, listing and period to one immutable quote. |
| Contract | `platform_contracts` is unique per booking and binds one quote plus the legal/document snapshots. |
| Payment | Payment and payout records bind to one booking; refunds bind to its payment. |
| Cancellation/refund | V5.1/V5.2 obligations and actual-loss cases are booking-scoped. |
| Pickup/return | Condition evidence and confirmations are booking-scoped; a V5.2 return case is unique per booking. |
| Damage/review | Contested amounts and release decisions currently operate on the booking amount. |
| Documents | Financial and booking documents are generated per booking. |
| Audit | The generic resource type/id log can correlate a future group and its positions, but no group exists today. |
| Cart | G2 can hold several cart lines and preview each quote. It deliberately creates no request, booking, reservation or payment and still enters the single-item checkout one line at a time. |

Consequently, adding `listing_ids` JSON to the existing booking would not be a
small extension. It would weaken present database, quote, evidence, damage and
financial invariants. A normalized aggregate is required.

Direct code evidence for that conclusion is concentrated in:

- `backend/sql/migrations/001_b3_foundation.up.sql` and
  `backend/src/booking_workflow.js` for the single-listing booking and overlap
  boundary;
- `backend/sql/migrations/015_v51_contract_persistence.up.sql`,
  `016_v51_booking_quotes.up.sql` and `023_v52_contract_binding.up.sql` for the
  booking/quote/contract binding;
- `018_v51_withdrawal_and_refund_obligations.up.sql`,
  `019_v51_condition_evidence.up.sql` and
  `025_v52_handover_return_evidence.up.sql` for booking-scoped refund and
  condition evidence; and
- `027_g2_persistent_rental_cart.up.sql` plus
  `lib/screens/wishlists_screen.dart` for the multi-line but non-booking cart
  and its line-by-line checkout handoff.

The V5.2 Rechtsmappe and confirmation model also describe the rental object in
singular form. A group must therefore use a new prospective legal/document
version with an itemized position annex; it cannot reuse the old snapshot text
under a new database cardinality.

## 4. Non-negotiable G3A invariants

Any acceptable design must preserve all of these rules:

1. A group contains exactly one renter and one owner.
2. All positions share a compatible period, handover location and handover
   policy.
3. All positions share one immutable compatibility key: provider/workspace
   type, country configuration, currency, legal-document set, cancellation
   policy and payment-provider configuration.
4. Private and SIT Business positions never share a booking group.
5. Different countries, currencies, legal versions or payment recipients never
   share a booking group.
6. A submitted membership list is immutable. Removing or adding a position
   creates a newly quoted offer revision and requires fresh consent.
7. `group_total` is the exact sum of immutable position totals. Rent, SIT fee,
   discounts, refund bases and later payment allocations remain position
   precise; no second group-level rounding algorithm may change the sum.
8. Availability for all positions is checked and reserved atomically. The
   system must not confirm a half-created group.
9. Pickup/return proof, accessories, deviations, damage and disputed amounts
   remain item-specific.
10. One reviewed or disputed item must not automatically freeze undisputed
    positions.
11. Historical V5.2 contracts, quotes and evidence remain immutable. G3 needs a
    prospective document/legal version and a compatibility read model for old
    singleton bookings, not a retroactive rewrite.

## 5. The three variants

### Variant A - owner booking group plus item positions (preferred)

Add a group aggregate and retain normalized single-item bookings as its
positions. Every newly grouped transaction is one legal/process group with
position-precise evidence and money allocation.

### Variant B - coordinator over independent bookings

Keep every item as a complete independent V5.2 booking and add only a UI/process
coordinator. The user may initiate them together, but legally and financially
there are N offers, N acceptances and N booking lifecycles.

### Variant C - synthetic bundle listing

Publish the selected items as one temporary or permanent synthetic listing and
run that bundle through the current single-listing booking path.

## 6. Impact comparison

| Domain | Variant A: group + positions | Variant B: independent bookings | Variant C: synthetic bundle |
| --- | --- | --- | --- |
| Contract | One itemized group platform contract and one group rental offer/contract under a new legal version; position snapshots are annexed and hashed. | N current contracts are legally clearer initially, but there is no true single booking agreement. | One bundle contract hides the legal and factual identity of the individual rental items and becomes fragile when membership changes. |
| Quote | One immutable group quote references an ordered set of immutable position quote IDs/hashes; total equals their sum. | N valid quotes; a displayed total is only a coordinator total and can drift as individual quotes expire. | One bundle quote loses position-level price, discount and refund bases unless a second shadow model is reintroduced. |
| Acceptance | Owner accepts all or rejects all. A partial offer is a counter-offer/new group revision that the renter must actively accept. | Each item can be accepted independently; atomic all-item intent cannot be guaranteed and notification/state volume multiplies. | Bundle can be accepted once, but unavailable or removed items require recreating the listing/offer and make consent history opaque. |
| Payment | Later: one group PSP operation only for one compatible payee/config, with immutable allocations and ledger entries per position. No payment activation is part of G3A. | Safe reuse implies N payment operations. Combining them outside a group creates refund, chargeback and ledger ambiguity. | One payment is easy superficially, but position allocation is absent exactly where partial refund or damage handling needs it. |
| Cancellation/refund | Full-group and selected-position scopes are explicit. Rent and SIT-fee obligations remain per debtor and position; an aggregate provider refund may batch only those allocations. | Existing item cancellation works, but an all-item cancellation becomes N operations and can end in mixed partial success. | A partial cancellation has no natural item boundary; refund calculations and debtor evidence become bundle-wide or ad hoc. |
| Pickup/return | One appointment/session, with mandatory photos, accessory list, counterparty confirmation and deviation per position. | N evidence sessions can be coordinated in UI, but repeated confirmations and state transitions undermine the promised single handover. | One evidence set cannot reliably prove which item/accessory was handed over or returned. |
| Damage | One case and maximum contested allocation per affected position; unrelated allocations can be released. | Existing per-booking isolation is strong, but all group context must be reconstructed across bookings. | A bundle damage claim risks holding the whole amount and cannot cleanly attribute condition or value. |
| `needsReview` | Position-scoped only. The group exposes a derived summary such as `partially_under_review`; it never becomes a blanket financial hold. | Naturally item-scoped but operational queues receive N cases and lack a canonical group summary. | Review becomes bundle-scoped unless another item submodel is added, defeating the variant. |
| Audit | One append-only group command plus correlated position events, membership/version hashes and allocation evidence. | Current audit can cover each booking; cross-booking atomic intent and consent need a fragile correlation convention. | Listing mutations, booking evidence and changing bundle membership are hard to reconcile into an immutable chain. |
| SIT Business/global | Compatibility key prevents mixing private/business, workspace, country, currency, legal set or payment configuration. A future project may contain several separate groups. | Separation is safe but customer/provider operations multiply; common booking value and later orchestration remain limited. | Bundles couple inventory presentation to one legal/country context and scale poorly across tax, invoice, workspace and localization rules. |

## 7. Preferred target model

The target relationship is:

```text
project/cart
  -> booking_group (one renter + one owner + one compatibility key)
       -> group_offer_revision / group_quote
       -> group_contract_snapshots
       -> payment_intent (future gate only)
            -> position allocations
       -> handover_session / return_session
       -> booking position A (existing booking concept)
            -> position quote + listing snapshot
            -> evidence + confirmations + damage/refund cases
       -> booking position B
            -> position quote + listing snapshot
            -> evidence + confirmations + damage/refund cases
```

For future implementation, `bookings` should remain the authoritative item
position rather than being replaced by an array. New grouped flows reference a
new `booking_groups` row. Historical V5.2 bookings are exposed as legacy
singleton groups in a compatibility read model; their stored contracts and
hashes are not changed.

### 7.1 Request, quote and acceptance

1. The renter selects compatible lines belonging to the same owner.
2. The server locks/rechecks the listings in deterministic order and generates
   one position quote per item.
3. The server creates an immutable group quote whose ordered membership and
   total are hashed.
4. The renter submits one group rental offer and concludes the applicable
   itemized platform contract using a new legal/document version.
5. The owner may:
   - accept the complete offer;
   - reject the complete offer; or
   - propose a stated subset. That subset is a new server-quoted counter-offer,
     never a partial acceptance. It requires new renter consent before payment.

### 7.2 Payment, payout and financial documents

Payment remains disabled by this package. The architecture prerequisite for a
later payment gate is:

- one group payment operation only when every position has the same recipient,
  currency and provider configuration;
- an immutable allocation for rent, SIT fee, discount, tax facts where
  applicable and refundable amount per position;
- position-precise ledger transactions even when a provider operation or owner
  payout is grouped; and
- an itemized group confirmation/receipt whose sum is derived from those same
  allocations.

If a provider cannot preserve those allocations for refunds and chargebacks,
the grouped checkout must fail closed. It must not silently fall back to an
unexplained mixed payment flow.

### 7.3 Cancellation and refund

Every cancellation command states its scope: complete group or named active
positions. Policy evaluation and refund obligations run per position and keep
the existing separation between rent refund and SIT-fee refund debtors. The
group only derives and presents the aggregate.

The new legal version must state the consequences when one position becomes
unavailable, is not handed over, is returned early or is materially defective.
The system must not infer that one affected position either always cancels or
never cancels the complete group. Until this clause and its tests receive legal
approval, grouped contract activation is blocked.

### 7.4 Handover, return, damage and review

The appointment and session challenge may be shared. Proof may not be shared:

- all four required condition-photo phases remain linked to a position;
- required accessories and deviations are confirmed per position;
- a missing item at pickup creates a position deviation and an explicit next
  decision, not a silent successful group handover;
- damage evidence, claimed amount and contested authorized amount are capped
  by the affected position allocation; and
- only the substantiated position case enters `needsReview`. Missing return
  confirmation retains the non-review waiting state. Undisputed positions can
  proceed to release.

### 7.5 Audit and idempotency

Every group command receives one idempotency key and correlation ID. The
append-only audit chain records:

- the group command and actor;
- ordered position IDs and quote hashes;
- the compatibility-key and legal-version snapshot;
- each derived position event and money allocation;
- owner/renter declarations and timestamps; and
- later changes as new revisions, never overwritten membership.

Group status is a summary, not a substitute for position truth. In particular,
`partially_under_review`, `partially_cancelled` or `partially_returned` are
derived operational views and must not authorize a group-wide hold by
themselves.

## 8. Business and global scaling rule

A project or cart may later contain multiple booking groups. The group boundary
is always the smallest shared legal and financial context:

```text
owner + renter + workspace/provider type + country configuration + currency
+ legal set/version + cancellation policy + payment recipient/configuration
+ compatible period/location/handover policy
```

Therefore:

- a private owner and a SIT Business provider always produce separate groups;
- two owners always produce separate groups, contracts, handovers and payouts;
- different country or currency configurations always produce separate groups;
- a future common project checkout is only orchestration over those groups and
  needs its own end-to-end payment/refund/chargeback/ledger approval; and
- no group is moved between private/business workspaces or countries after
  offer submission.

This preserves the Growth Master sequence: G3 solves same-owner grouping; G6
may later orchestrate multi-owner projects without weakening the G3 legal and
ledger boundary.

## 9. Why Variant A wins

Variant A requires a real aggregate, new legal documents and deliberate
payment allocations, so it is not the smallest code change. It is nevertheless
the smallest **coherent domain change**. It keeps current single-item evidence
as normalized child truth, provides the promised one-request/one-acceptance
experience and creates a stable boundary for Business and country versions.

Variant B is acceptable only as an internal transition experiment; it does not
meet the final product promise. Variant C should be rejected because it moves
transaction complexity into the listing model and destroys exactly the
position precision demanded by legal evidence, refunds and damage handling.

## 10. Implementation gates deliberately left closed

No source, migration, API, Flutter flow, contract template, payment provider,
Store, cloud, VPS or production state was changed by G3A.

After Walid chooses a variant, a separately authorized follow-up package must
still provide, in order:

1. professional review and approval of the new group contract/offer,
   partial-offer and partial-performance semantics;
2. a schema/API/state-machine design with migration and rollback plan;
3. deterministic quote, concurrency, idempotency and audit test vectors;
4. position-level cancellation/refund/damage/release tests;
5. privacy, retention, financial-document and support-operation updates; and
6. a separate payment activation gate. Architecture approval alone enables
   none of these live changes.

## 11. Walid decision gate

Choose exactly one architecture direction:

- `G3A_ENTSCHEIDUNG_A` - owner booking group plus item positions
  (**recommended**);
- `G3A_ENTSCHEIDUNG_B` - coordinator over independent bookings; or
- `G3A_ENTSCHEIDUNG_C` - synthetic bundle listing (not recommended).

Stop after this package. Do not start implementation, G3B/G3C, payment or a
later Growth package until Walid gives the next explicit authorization.
