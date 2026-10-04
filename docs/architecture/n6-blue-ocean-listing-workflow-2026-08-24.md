# N6 Blue Ocean complete listing workflow

Status: **IMPLEMENTED — DEFAULT OFF — MOCK/TEST BOUNDARY ONLY**

## Decision

N6 connects the isolated N2–N5 components through an authenticated,
owner-scoped draft workflow and the existing Flutter listing editor. The
ordinary manual listing path and historical listings are unchanged. The new
Flutter surface is hidden unless the compile-time
`SIT_BLUE_OCEAN_LISTING_ASSISTANT` flag is explicitly enabled, while every
backend route independently requires the non-production, zero-cost `mock`
provider configuration. Production configuration rejects that provider.

The default server image-screening adapter deliberately reports an incomplete
visual scan. It therefore opens the manual fallback and cannot call even the
mock gateway. A completed screening adapter exists only as an injected test
dependency for deterministic workflow and PostgreSQL route tests. N6 does not
pretend that this fixture is a real image-safety scanner. Provider/scanner
selection and approval remain N7 work.

## Owner journey

The editor retains camera and gallery entry and adds the exact versioned image
analysis disclosure, an unchecked opt-in, an explicit analysis button and a
live progress state. One to four already-sanitized owner uploads are resolved
server-side; the client cannot submit filesystem paths, external URLs or local
screening claims.

After a successful technical mock, the owner receives all thirteen N2 fields
with textual HIGH/MEDIUM/LOW meaning, provenance-preserving revision state and
at most three clarification questions. Title, category, subcategory,
description and condition remain in the normal editor. Brand, model,
accessories, project tags, use cases, safety notes, replacement value and the
coarse pickup region are editable in the assistant card. Photo order, warnings
and missing-photo suggestions are shown without replacing the original listing
photos.

All eleven owner confirmations are visible and unchecked. Functionality is a
hard gate. A defective or unsupported condition remains outside Stage A. Error
messages are live regions, focus returns to the assistant card, confidence and
readiness use text and icons rather than color alone, and controls reflow under
large text.

## Price, duration and quote authority

Only `SIT_REGIONAL_PRICE_ENGINE_V2` creates the three editable daily-price
options. The owner must confirm the replacement-value band before calculation
and must separately confirm the selected price. No observation is invented:
the N6 technical flow supplies an empty observation set, so the N5 cold-start
explanation remains honest.

The owner may edit or disable duration discounts. One- and seven-day previews
use the V5.2 quote engine, label owner rent, the exact SIT contribution and
renter total, and remain `simulation=true`, `noRealMoney=true`.

## Draft-first publication boundary

The application exposes three authenticated and moderation-scoped technical
routes: analyze, review and publish. Analyze persists an append-only first
revision only after privacy preflight and schema validation. Review appends a
new owner-input revision and an N5 price snapshot. Migration 068 adds consent,
preflight and publication linkage without rewriting listings, plus an immutable
publication receipt bound to the exact draft revision hash.

`NEEDS_REVIEW` remains until suitable photos, valid consent, all reviewed
fields, all clarifications, owner price and every confirmation except the final
publication confirmation are complete. `READY_TO_PUBLISH` additionally
requires that final confirmation. Even this state does nothing by itself. Only
an authenticated request carrying the exact visible action
`Anzeige veröffentlichen` may create an active listing. The server redoes the
review, matches the selected integer-cent price and exact analyzed photo set,
creates the listing and publication receipt in one transaction, and records a
minimized audit event. No automatic status transition or provider publication
authority exists.

The resulting listing returns through the existing `DataService` path. N6
initially carried an existing G5 supply-enrichment follow-up into the guarded
publication transaction. N7 evaluation later identified that optional
enrichment failure must not roll back the main listing and moved the link into
a separate post-publication transaction. The UI keeps the owner inputs and
photos for correction.

## Failure and rollback

Disabled technical access, incomplete/unsafe screening, timeout, rate limit,
schema failure, changed photos, stale revision, price mismatch or missing
confirmation fails closed. The UI preserves photos and manual input and keeps
the ordinary editor open. There is no automatic retry or paid call.

Migration 068 can roll back while it contains no publication receipt or
published draft. It refuses rollback once publication linkage exists. N8 must
add the new workflow datasets to privacy export, erasure and retention before
any invited-person activation.

The complete supported candidate-rollover regression passes in CI metadata
mode: 663 Backend tests plus one documented skip, PostgreSQL 16 with actual
analyze/review/explicit-publish route coverage, 387 Flutter tests plus one
documented skip, Web/Wasm, loopback smoke and the 448-task Android debug build.
The stricter local Store handoff still reports the already documented missing
private archived AAB; N6 neither recreates it nor converts that external
artifact gap into a pass.

The exact implementation commit
`7a8290408edf225c6c41e12eb5b3b278437984e6` passed GitHub regression run
`32672867686` and CodeQL run `32672867642`. N6 is therefore closed and N7 owns
the synthetic evaluation corpus and any narrowly evidenced correction it
reveals.
