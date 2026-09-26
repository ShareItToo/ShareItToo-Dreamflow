# N5 Blue Ocean regional market price engine V2

## Decision

`SIT_REGIONAL_PRICE_ENGINE_V2` is the only authority for the Blue Ocean daily
price recommendation. Image/model output may suggest category, condition and a
replacement-value band, but it cannot provide or override a price. The owner
may edit every recommendation and must confirm the selected daily price before
N6 can allow publication.

The engine is a pure server-side domain module. N5 adds no route, provider call,
scraper, publication action or live configuration. The existing V5.2 quote
engine remains the authority for discounted owner rent, the 10 percent SIT
platform contribution and the simulated renter total.

## Cold-start anchor and integer money

The six versioned category rules implement the owner-approved fixed component,
replacement-value percentage, minimum and maximum. The five replacement-value
bands use their specified representatives; `over_1000` requires an approximate
owner-confirmed value. MEDIUM/LOW band confidence also requires confirmation.

Condition factors are 1.00, 0.90 and 0.80. Unconfirmed functionality blocks
the calculation and defective items remain outside Stage A. All money enters
and leaves the engine as EUR integer cents. Category anchors, owner options and
the final recommendation use `EUR_FULL_UNIT_HALF_UP_V1`.

## Reviewed observation boundary

Migration 067 additively enriches the N2 append-only observation and snapshot
tables. Existing N2 rows remain engine-ineligible. A V2 observation records a
coarse geography bucket, distance, source class and exact configured source
quality, condition, private/commercial classification, rent-only truth,
reviewed provenance reference and exclusion state. It stores no address or
personal identity.

Only reviewed EUR daily-equivalent rent is comparable. Deposit, delivery,
insurance and other service amounts are excluded. Synthetic fixtures have
exactly zero source quality and can never become engine-eligible. The empty
header-only CSV template is for later lawful manual review; it contains no
invented regional observations. A future API adapter must emit the same closed
observation schema and cannot bypass review or quality rules.

## Geography, weights and robust center

The engine evaluates cumulative scopes in this order:

1. within 20 km;
2. within 50 km;
3. within 100 km;
4. Baden-Württemberg;
5. Germany.

It selects the narrowest scope with at least three effective observations. If
none qualifies, it uses the broadest available evidence only as LOW-confidence
input. Category mismatch, stale/future rows, non-rent amounts and synthetic
rows receive explicit exclusion reason codes.

Each positive weight is the configured source quality times deterministic
category/subcategory/brand/condition similarity, distance decay and age decay.
The final weight is quantized to integer micro-weight before weighted
percentiles, effective sample size and shrinkage. A weighted-median/MAD screen
removes robust outliers. The market center uses the required rational shrinkage
formula `n_eff / (n_eff + 8)`, calculated from integer micro-weights.

HIGH requires `n_eff >= 8`, multiple good matches and at most 50 km. MEDIUM
requires `n_eff >= 3` without state/national fallback. Broad or weak evidence
is LOW and uses the honest fallback-led explanation. No output is called a
Heilbronn market price when broader data was used.

## Demand, owner options and duration

Demand remains exactly 1.00 until at least 20 authentic server-observed renter
requests and 10 authentic active listings exist for the configured window.
After the threshold, the deterministic request/listing ratio adjustment is
bounded to 0.90–1.10. Synthetic activity is always neutral.

With sufficient evidence the three editable owner options use weighted 35th
percentile, the shrunk center and weighted 65th percentile. Otherwise they use
90/100/110 percent, always respecting category bounds. The UI principle is:

> Unverbindliche SIT-Preisempfehlung. Du entscheidest über deinen Mietpreis.

The default owner-editable duration tiers are 0, 10, 15, 30 and 40 percent for
1, 2, 3–6, 7–13 and 14–30 days. They are explicitly not claimed as
market-derived and can be disabled. V5.2 discounts rent first and calculates
the 10 percent SIT contribution afterward. Every preview remains a simulation
with no deposit, insurance promise, hidden charge or real money.

## Rollback and next integration

Migration 067 is additive and keeps historical listings untouched. Its down
migration refuses to discard any V2 observation or N5 snapshot. N6 may add an
authenticated UI/application boundary only after it preserves the manual
editor, all owner confirmations, explicit publication and the default-off
Stage-A feature gate.
