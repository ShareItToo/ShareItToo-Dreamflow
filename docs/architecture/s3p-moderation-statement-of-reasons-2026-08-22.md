# S3P moderation Statement of Reasons - architecture

Status: technically verified for non-live operation on 22.08.2026 at
implementation commit `079dc0e139437a2c8b1732a5cd77a826b892d8c4`, follow-up
rate-limit isolation commit `23b9cb84e0286215661e78ac67638eeedcd819d4` and
successful GitHub Actions run `32542904176`. Production, external delivery and
public or invited pilot operation remain closed.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, scenarios `SUP-115` through `SUP-118`.
- Drive `07_TRUST_SAFETY_MODERATION_PRIVACY_LEGAL`, ID
  `1fxfhV8aBH2MKrqfnudY6_mKeC5P1HPDXac41c0KZpu4`, checked on
  22.08.2026.
- Regulation (EU) 2022/2065, Articles 17 and 20, official consolidated source:
  `https://eur-lex.europa.eu/eli/reg/2022/2065/oj/`.

## Data and transaction model

Migration `044` adds a separate one-to-one
`moderation_statements_of_reasons` table. Keeping the Statement separate from
the general decision row gives the versioned recipient document an explicit
append-only boundary without rewriting existing moderation history.

The workflow normalizes the decision and action-bound duration before any
insert. It then writes the moderation decision, Statement and sanitized audit
entry in one transaction. A deferred PostgreSQL constraint independently
refuses the commit if a significant measure has no Statement. A second trigger
requires the recorded reviewer to be the same Administrator who issued the
decision and rejects inconsistent automation evidence.

The Statement contains no duplicate free-text facts. The authoritative facts,
basis, reasoning, detection method and concrete automated means remain on the
linked immutable decision. The Statement adds its schema version, decision
ground and origin, exact territorial and functional scope, duration, effective
times, automation role, human-review flag and authenticated in-app channel.

## User and review surfaces

The authenticated `private, no-store` list endpoint left-joins the Statement so
legacy decisions remain readable without fabricated content. Flutter validates
the complete schema again before rendering facts, scope, duration, origin and
automation. Missing, unknown or internally inconsistent fields produce an
explicit unavailable state.

The user may submit one reasoned review request through the existing
authenticated, rate-limited and idempotent route while its server-authoritative
window is open. The button remains available for eligible legacy decisions even
when a complete Statement cannot be displayed. Review resolution remains a
separate Administrator action; no automated worker can resolve it.

## Decision boundary and exclusions

This package improves evidence and user access around moderation measures. It
does not establish that any content is illegal, execute a provider action,
send email or push, publish to a DSA transparency database, assign an
independent reviewer, reverse a measure automatically or approve final legal
copy. Historical records are not backfilled.

No production service, Cloud/VPS/DNS, payment, payout, Store, real-money,
signed-release or public-pilot state changes.
