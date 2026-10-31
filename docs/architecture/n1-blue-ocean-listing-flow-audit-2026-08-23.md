# N1 Blue Ocean listing-flow audit

Status: **VERIFIED — READY FOR N2 — NON-LIVE ONLY**

N1 inspected the real manual listing UI, image path, allowlist, moderation,
draft/publication transaction, G5 enrichment, price fields, V5.2 fee path,
privacy/retention and feature gates. It changes no product code or stored data.
The machine-readable matrix is
`docs/evidence/blue-ocean/n1-listing-flow-audit-20260823.json`.

| Area | State | Current truth | Required continuation |
| --- | --- | --- | --- |
| Manual listing UI | DONE | Owner-controlled create, edit, draft and explicit publish actions exist. | Preserve unchanged as the fallback and edit surface. |
| Photo selection/storage | OPEN | Camera/gallery, backend sanitation and active-photo binding exist. | N4 adds an isolated analysis-derivative lifecycle. |
| Category allowlist | DONE | Client and server share a fail-closed private-pilot positive list. | Reuse the exact catalog identifiers. |
| Safety/moderation | OPEN | Listing moderation, account scope and review controls exist. | N2 adds AI-draft confidence, provenance and clarifications. |
| Draft model | CONFLICT | `draft` exists, but the common payload still requires publish-grade core fields. | N2 adds a separate versioned AI-draft model; historical `Item` rows are not weakened. |
| Publish transaction | CONFLICT | Manual publication is explicit and audited, but POST may create `active` directly. | N6 forces AI output through draft review and a separate owner publication action. |
| G5 enrichment | DONE | Deterministic, owner-confirmed, post-publication and external-AI-free. | Preserve separation; do not turn suggestions into detected truth. |
| Price fields | CONFLICT | Manual daily price and a coarse legacy heuristic exist. | N5 introduces `SIT_REGIONAL_PRICE_ENGINE_V2`; the legacy helper is not authority. |
| V5.2 fee integration | DONE | Server minor-unit price, quote and fee snapshots are authoritative downstream. | Recommendations may prefill price but cannot bypass quote issuance. |
| Privacy/retention | OPEN | Listing/upload export and retention inventories exist. | N2/N4 add prompt, derivative and observation lifecycles. |
| Feature flags | OPEN | Broad AI and G5 default off and fail closed. | N3 adds a narrow listing-AI gateway, mock mode and budget gate. |

## Architectural consequences

The existing `Item` remains the published/manual listing representation. N2
must add a separate versioned draft aggregate with field-level confidence and
provenance. This avoids making incomplete AI output look like accepted listing
truth and avoids silently rewriting historical rows.

The current publication operation stays the final listing authority, but AI
cannot call it directly. N6 must require an owner-visible draft review and an
explicit publish action. `listingAutoPublishAllowed` remains false.

The legacy price helper is intentionally classified as a conflict. It uses
coarse category and city multipliers with floating-point output and therefore
cannot be renamed or treated as `SIT_REGIONAL_PRICE_ENGINE_V2`. N5 must use
deterministic versioned snapshots and minor-unit arithmetic while preserving
the V5.2 quote and fee authority.

No provider call, billing, external account, Firebase, Store, production,
Cloud, real-money, public-release, PR-merge or historical-data mutation was
performed.
