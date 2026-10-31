# N2 Blue Ocean listing-AI foundation

Status: **IMPLEMENTED — NON-LIVE — PROVIDER DISABLED**

N2 adds an isolated listing-AI draft domain next to the existing `listings`
model. It does not weaken the manual listing form, alter a historical listing,
publish a listing or expose an HTTP route. Migration `066` creates only new
tables and its rollback refuses to remove them after any N2 data exists.

## Domain boundary

One draft has append-only revisions. Each generated field carries a value,
`HIGH` / `MEDIUM` / `LOW` confidence, source type, optional opaque source-image
reference, reason code, prompt version, schema version and owner-confirmation
state. A `LOW` value must remain blank. A `MEDIUM` value must be reviewed.
Condition, accessories and replacement value always require owner confirmation.

The first draft accepts one to four opaque image references and no more than
three clarification questions. The domain initializes and evaluates the exact
eleven owner confirmations for ownership, identity, allowlisted category,
functionality, condition, accessories, owner price, duration discounts,
availability, pickup region and final publication. Missing functionality is a
hard readiness blocker. Even a complete draft returns only
`explicit_owner_action_required`; automatic publication is always false.

## Separate persisted foundations

- `listing_ai_drafts` stores owner scope and the current revision pointer.
- `listing_ai_draft_versions` stores immutable schema/prompt-bound revisions.
- `listing_ai_analysis_derivatives` has a forward-only lifecycle from prepared
  through consumed to purged, with a bounded expiry.
- `regional_market_observations` stores only a coarse region, integer minor
  units and source provenance; exact addresses are outside this model.
- `regional_price_engine_snapshots` accepts only
  `SIT_REGIONAL_PRICE_ENGINE_V2` as deterministic price authority.
- `listing_ai_cost_ledger` and `listing_ai_budget_aggregates` provide the
  additive cost-control truth needed by N3. Disabled and mock providers cannot
  record billed spend.

Append-only payloads reject updates but may still be deleted through their
owning draft's privacy-erasure cascade. N8 must connect these new tables to the
existing export, account-erasure and retention inventories before any writer or
pilot route can be enabled.

## Deferred by design

N3 owns provider configuration, a deterministic mock, strict response schema,
prompt-injection boundary, timeout, idempotency, budget/rate limit and manual
fallback. N4 owns image sanitization and actual derivative cleanup. N5 owns the
Engine V2 algorithm. N6 owns draft-to-listing review and explicit publication.
N8 completes privacy integration. Until those packages pass, the N2 schema has
no application writer and no provider transport.

N2 performs no paid/provider call, billing, user enrollment, Firebase/Store/
Apple mutation, production/VPS/DNS/cloud action, real-money/PSP/KYC action,
public release, PR merge, history rewrite or automatic publication.
