# S3O DSA notice locator completion - architecture

Status: technically verified for non-live operation on 22.08.2026 at exact
implementation commit `0c8724c3ba05b4b2afd8622087ae00970b573a8e` and
successful GitHub Actions run `32539524697`. Production, external delivery and
public or invited pilot operation remain closed.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, scenarios `SUP-113` and `SUP-114`.
- Drive `07_TRUST_SAFETY_MODERATION_PRIVACY_LEGAL`, ID
  `1fxfhV8aBH2MKrqfnudY6_mKeC5P1HPDXac41c0KZpu4`, checked on
  22.08.2026.
- Drive `08_MAXIMUS_AUTOMATION_APPROVAL_CODEX_SPEC`, ID
  `1v5SOAWn0B6UO5jAFv2eo3P_l0jVdqE1PpMz99mPRjzQ`, checked on
  22.08.2026.

## Intake and completion model

The Flutter intake permits an initially empty locator only when the remaining
DSA notice evidence is valid. The backend creates the Notice ID first, stores
the immutable original evidence and classifies the locator deterministically.
An exact safe HTTP(S) URL or content-type-bound internal reference is complete;
missing or descriptive text becomes `needs_clarification`, not rejection.

The reporter-only completion endpoint requires authentication, rate limiting,
the exact expected case version and an exact locator. Under the case lock it
first rechecks idempotent replay, appends the amendment and then changes the
derived locator status to `complete`. Migration `043` independently enforces
case, notice, reporter, status and locator-kind linkage. Original S3N evidence
is never rewritten.

The user projection exposes only the status, targeted prompt and whether the
reporter can submit a locator. Events and audit rows retain only the status and
kind. The raw locator is omitted from those surfaces and exported only to the
reporter; an affected user receives neither the amendment nor reporter-only
follow-up state.

## Decision boundary and exclusions

Locator classification is deterministic completeness routing. It is not a
legal classification, moderation decision, content measure or proof of the
notice's merits. No removal, restriction, affected-party message, Statement of
Reasons, appeal decision or provider action follows automatically.

The package adds no public/guest channel, production service, Cloud/VPS/DNS,
payment, Store, real-money or signed-release mutation. It also invents no
statutory deadline: the stored four-hour checkpoint is an internal operational
next-update target only.
