# G5A Deterministic Supply Enrichment - Technical Evidence

Date: 2026-08-21
Activation: disabled; authenticated owner-only technical routes
External generative AI: disabled and unused

## Non-blocking truth boundary

The ordinary `POST /v1/listings` transaction remains the sole publication
operation. Only after that response has succeeded and the success dialog has
completed may the disabled Flutter path call the separate
`POST /v1/listings/:id/supply-enrichment` route. All client-side generation,
parsing and dialog failures are caught without editing the created listing.

The server accepts only an active catalog-v1 listing belonging to the caller.
It maps the exact stored category/subcategory pair to a reviewed template and
returns zero to three questions. Detection metadata states that title analysis
and photo analysis were not used, the suggestion is not detection truth and no
external generative AI was used.

## Owner outcomes and downstream effects

| Outcome | Stored effect | Downstream boundary |
| --- | --- | --- |
| Included accessory | Owner-confirmed label plus `accessories` evidence-slot metadata | Public API may show the confirmed label; ordinary item-level handover/return evidence is still required. |
| Separate rental | Follow-up intent and server-validated source/target link | New listing still needs its own price, description, photo and ordinary validation. |
| Standalone listing | Same link control with category/location prefill | No implicit quote, availability, contract or booking-group membership. |
| Not part | Clarity reminder for photos and description | Does not change offer truth automatically. |
| Wrong detection | Bounded heuristic feedback | Explicitly not accepted as listing truth and not sent to analytics or an external provider. |

Each suggestion accepts one outcome. An identical retry is idempotent and a
different later outcome fails with a conflict. Follow-up linkage verifies the
same owner, exact suggested target category/subcategory and single target ID.

## Contract, money and lifecycle impact

G5A does not import or call quote, acceptance, availability, payment,
cancellation/refund, booking, contract, handover/return, damage or review
workflows. It changes no price and creates no reservation, request, booking,
hold, contract, payment, refund, payout or `needsReview` decision. The existing
G3 owner-group compatibility model remains the later multi-item transaction
authority. This keeps the first implementation suitable for later Business or
global classification work without combining country, currency, legal-set,
workspace or payment facts.

## Privacy, audit and retention

- The server owns the session; raw client listing input cannot create or
  replace it. Ordinary owner edits preserve the stored session only while the
  exact category/subcategory source remains unchanged; recategorization drops
  stale suggestion state.
- Public listing shaping removes the internal session and exposes only up to
  three confirmed included-accessory labels.
- Generation, outcome and completed follow-up linkage have first-party audit
  events with bounded identifiers and decision metadata.
- Account export already includes the owner listing payload. Account erasure
  rebuilds that payload without `supplyEnrichment`.
- The read-only retention inventory counts
  `listing_supply_enrichment` under `userIntent`; all retention periods remain
  open and no purge is enabled.
- Privacy and Retention exact source inventories include the G5A module,
  disabled controls, UI/model paths and every changed app/config source.

## Activation, tests and rollback

- `LISTING_SUPPLY_ENRICHMENT_ENABLED` defaults false in production and staging
  Compose and cannot be enabled when the backend environment is production.
- `SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED` defaults false and cannot expose
  the surface in a Flutter release build.
- Focused tests cover exact allowlisted templates, maximum count, unknown
  categories, all five outcomes, idempotency/conflicts, owner scope, safe
  prefill, link validation, server-owned/public shaping, fail-open ordering,
  export/erasure/retention and both feature gates.
- Full local backend: 322 passed, zero failed and one expected PostgreSQL skip
  without local `TEST_DATABASE_URL`; backend syntax checks passed.
- Full technical regression: 317 Flutter tests passed with one documented
  accessibility skip; the Google-only profile test, every legal/privacy/
  retention/release validator, web debug and Android debug builds passed.
- Analyzer improved to 222 accepted legacy items with no forbidden correctness
  code. The production dependency audit has no high or critical advisory; one
  transitive moderate `uuid` advisory remains without an unsafe forced
  override. The Git-history/worktree secret scan found no new high-confidence
  secret.
- Exact commit-bound GitHub Actions remains required before G5A closes.

Rollback removes the G5A module, routes, UI/model/config files and tests,
restores the small listing/data/repository changes and restores exact Privacy
and Retention inventories. There is no migration or external state to undo.
