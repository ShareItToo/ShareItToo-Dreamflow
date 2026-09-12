# ADR-035: G5A Deterministic Supply Enrichment

Status: accepted for inactive technical implementation on 2026-08-21.

## Context

The Growth source requires up to three useful follow-on questions after an
owner successfully creates a listing. The primary publication must remain the
truthful atomic result: optional suggestions may neither delay it nor turn an
unproven category association into a detected object. G5A must support five
owner decisions while preserving the private-pilot catalog, V5.2 contract,
quote, payment, cancellation/refund, handover/return, damage and review
boundaries.

## Decision

- Generate suggestions through a separate authenticated route only after the
  active source listing has committed. Client failures are swallowed after the
  success flow, so generation cannot roll back or block the main publication.
- Use only exact source category/subcategory templates. Return at most three
  question-form suggestions whose target categories also belong to the
  existing private-pilot allowlist. Do not inspect titles or photos, call an
  external generative-AI provider, or claim object-detection truth.
- Store a bounded server-owned `supplyEnrichment` session in the existing
  owner-scoped listing payload. Ordinary listing writes preserve this field
  from stored state only while category/subcategory remain unchanged, and
  ignore any client-supplied replacement.
- Support exactly five outcomes:
  - `included_accessory` records the owner-confirmed label and the existing
    `accessories` handover evidence slot;
  - `separate_rental` begins a shortened linked follow-up listing;
  - `standalone_listing` begins a prefilled linked standalone listing;
  - `not_part` records that photos and description require clarity;
  - `wrong_detection` records bounded heuristic feedback without accepting it
    as listing truth.
- Prefill only title, reviewed target category/subcategory, the source
  location and an opaque server-validated link. Price, description and photos
  are never copied. The target is created through the ordinary listing
  validation and upload path before the server links it to the source.
- Publish only owner-confirmed included-accessory labels from the internal
  session. Internal suggestions, feedback, timestamps and links stay private.
- Keep contract formation, booking groups, quotes, acceptance, availability,
  payment, cancellation/refund, handover/return, damage handling and
  `needsReview` unchanged. The handover slot is documentation metadata, not a
  substitute for the existing item-level evidence process.
- Add independent backend and Flutter flags. Both default false; the backend
  rejects production enabling and the Flutter surface is unavailable in
  release mode. Public release and external generative AI remain fixed false.

## Consequences

G5A provides repeatable suggestions for reviewed catalog pairs and no result
for unknown source pairs. Owner choices and linkage are transactional,
idempotent where identical, owner-scoped and audit logged. A conflicting later
outcome or a target with another owner/category fails closed, but cannot affect
the already-published source listing.

The listing payload is already returned by account export. Account erasure
rebuilds the listing payload from a small allowlist and therefore removes the
session. The count-only retention inventory separately identifies listings
containing G5A user-intent data. No migration, new table, external processor,
analytics stream or provider traffic is introduced.

Rollback is a code/config revert plus restoration of the exact Privacy and
Retention source inventories. Existing listings remain valid because the
field is optional and ignored by pre-G5A code.
