# S3V product-safety contact and rapid triage - architecture

Status: locally and CI-verified non-live package on 22.08.2026 at exact
implementation commit `c71c263f785b5305800706a5129a321a00f76937` and
successful GitHub Actions run `32558511471`. No authority report, Safety Gate
submission, listing action, production operation, Store action or real-money
flow is enabled.

## Source basis

- Drive Support Packet `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenario `SUP-137`.
- Current V5.2 and Support source-of-truth records in the SIT Drive folder.
- Article 22 of Regulation (EU) 2023/988, using the official consolidated
  EUR-Lex text as the technical source for a single consumer contact point,
  internal product-safety processes and handling notices without undue delay:
  https://eur-lex.europa.eu/eli/reg/2023/988/2026-05-29/eng

This package converts those inputs into conservative technical controls. It is
not a product-safety finding, legal advice, professional approval or authority
to notify an authority, the Safety Gate Portal, a manufacturer or another
economic operator.

## Authenticated consumer intake

The existing support flow now contains the distinct category
`Produktsicherheit melden` with two exact choices: a possibly dangerous product
and an accident or injury involving a product. Both use the server route
`trust_safety/dangerous_item_or_injury` and submit a versioned
`SupportProductSafetyNotice` containing:

- the bounded issue kind and whether an injury is reported;
- a product/listing/manufacturer/model identification supplied by the reporter;
- a separate risk, accident or injury description; and
- an explicit acknowledgement of the immediate safety guidance.

The screen tells the reporter to stop using or handing over the product. Acute
danger or injury is directed to 112 before the normal categories; the SIT
contact is explicitly not an emergency service and provides neither medical
nor technical remote assessment. The normal product-safety route cannot be
submitted without all structured fields and the acknowledgement.

## Server routing, receipt and evidence

The Backend accepts the product-safety payload only for the exact route and
exact version pair. It creates a `p1` Trust & Safety case with a RED explicit
decision boundary, product-safety/authority flags and an opaque unique
`SIT-P-*` receipt. Immediate danger remains on the existing separate `p0`
emergency route.

Migration `049` stores immutable product-safety evidence and a candidate
triage due time. PostgreSQL independently requires the exact taxonomy,
version, issue kind, acknowledgement, RED decision level and a due time no
later than 60 minutes after creation. The 60-minute checkpoint is an internal
SIT safety target stricter than the outer legal source; it is not represented
as a statutory deadline.

The reporter projection exposes only the receipt and triage time. The full
structured evidence is included only in that reporter's authenticated privacy
export. Narrative product, risk and injury descriptions are deliberately
excluded from normal audit/event metadata. Article 18 candidacy remains false
for this route; a product-safety report is not silently treated as suspected
criminal conduct.

Rollback removes migration `049` only while no product-safety evidence exists.
It cannot erase a recorded notice or triage record.

## Public contact and release boundary

The public product-safety contact is independent from the authenticated intake
and closed by default. A complete configuration requires all of the following:

- explicit approval and a version;
- a valid consumer contact email;
- confirmed competent-authority contact registration;
- confirmed Safety Gate registration; and
- an approved internal product-safety process.

`PUBLIC_COMPLIANCE_APPROVED=true` fails startup while any product-safety field
is incomplete. The public support page remains draft, the compliance overview
reports `productSafety: draft`, and Store-required preflight runs the validator
with `--require-approved`. Environment and Compose examples contain only
false/blank defaults.

Even a complete configuration adds no authority or Safety Gate transport. The
validator permanently reports `authorityTransportEnabled=false` and
`automaticListingActionEnabled=false`. There is no automatic delisting,
account action, manufacturer message, authority report or external send.

## Privacy and Store truth

Because a voluntary accident or injury report may contain health information,
the privacy inventory and prepared Google Play Data Safety matrix now include
`Health and fitness / Health info` as optional, user-linked and non-tracking.
The prepared matrix therefore contains 18 reviewed data types, 17 selected and
one unselected. It remains unsaved, legally/provider-blocked and cannot be sent
for review. The local current-candidate binding and app-content handoff were
updated only to preserve truthful source/hash evidence; no Play Console field
was changed.

The public privacy copy discloses possible product, danger, accident and injury
information. Retention remains under the existing open support-case policy;
no period, purge, erasure execution or Legal Hold outcome was invented.

## Local verification

- Focused Backend/domain/workflow/config/account/validator checks passed all 67
  tests. Focused Flutter intake checks passed all 18 tests.
- Privacy, retention and Data Safety protection checks passed all 66 tests;
  the manifests remain draft and the prepared Play matrix remains unsaved.
- The complete Backend unit run passed 488 tests with one intentional
  PostgreSQL-environment skip. The skipped foundation integration then passed
  separately against isolated PostgreSQL 16.15 and applied every migration
  through `049` twice without drift.
- The complete pinned Flutter 3.41.7/Dart 3.11.5 regression passed the accepted
  220-issue analyzer baseline, 363 tests with one documented skip and the
  separate Google-only profile test.
- Web debug build, loopback smoke and Android debug APK passed.
- P0B PSP and invited-pilot source bindings were refreshed only for changed
  repository evidence. Both gates remain HOLD/NO-GO: no provider contract,
  sandbox pass, participant activation or real-money path was claimed.
- GitHub regression `32558511471` is green for exact implementation head
  `c71c263f785b5305800706a5129a321a00f76937`; Actions tested PR merge
  snapshot `bdfea22d35d2cf6b39486318563d8fbd0f2ddaae`. Backend passed all
  489 tests without skips on PostgreSQL 16, dependency/history audit, Compose
  validation and the commit-labelled API image build. Flutter passed the
  accepted 220-issue analyzer baseline, all 363 tests with one documented
  skip, the separate Google-only test, Web smoke/build and Android debug APK.
  Signed-candidate construction and API-image publication remained skipped;
  Draft PR #7 remained open, mergeable and unmerged.

Professional legal review, real operator/contact facts, competent-authority
and Safety Gate registrations, named staffing, an approved internal process,
external transports, production configuration, payment, Store, signed
candidate and every live path remain separate closed gates.
