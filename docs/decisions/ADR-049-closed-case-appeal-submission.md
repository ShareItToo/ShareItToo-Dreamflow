# ADR-049: Closed-case electronic appeal submission

Status: accepted as a non-live technical control on 2026-08-21. It does not
authorize a live support operation, an appeal outcome, an automatic reopen, an
outbound message or any external measure.

## Context

ADR-048 makes a published final support decision visible only after exact
approval, verified implementation and explicit internal publication. The Drive
Support Packet additionally requires a closed case to explain its review path
(`SUP-151`), a reopened case to retain owner and next-update truth (`SUP-014`),
and receipt template `T-042` to identify the original case, the separate review
process, the material received, the interim effect and the next update.

No approved universal appeal period exists in the packet. Evidence upload is
also not yet ownership-bound to the reporter. The application therefore must
not invent a deadline, accept arbitrary evidence identifiers, reopen a case on
its own or imply that an outbound acknowledgement was sent.

## Decision

- Every new `resolved -> closed` transition must record an explicit staff
  choice: electronic appeal unavailable, or available until one exact future
  server timestamp. The latter is allowed only for an exact published decision.
- PostgreSQL migration `036` records who configured that choice and when.
  Legacy closed rows remain unconfigured and the Flutter client fails closed
  instead of guessing their review state.
- Only the authenticated reporter may submit. The request binds the current
  optimistic case version, the exact published decision and an idempotency key.
  One submission per reporter and published decision is enforced in the
  database.
- Every accepted submission receives a separate ambiguity-safe `SIT-R-*`
  review number. Its next-update checkpoint is server-derived from the existing
  support-priority checkpoint policy; it is not supplied by the client.
- Submission grounds are retained in `support_appeals` and the personal-data
  export. They are deliberately excluded from user-visible timeline payloads
  and audit metadata. The receipt gives a bounded material summary instead.
- New evidence identifiers must be empty. Migration `036` rejects evidence
  linkage until a later package can prove uploader ownership, case scope and
  safe file handling.
- The receipt explicitly records `externalMessageSent=false` and
  `automaticReopen=false`. No template, email, push, payment, provider or
  account adapter is called.
- `closed -> reopened` remains a separate staff transition and now requires an
  exact active owner in addition to the existing reason, next action and
  next-update timestamp.
- The authenticated case detail exposes the separate review reference and
  server-confirmed times without exposing grounds, staff identities, hashes or
  internal decision codes. Unknown, incomplete or contradictory appeal state
  fails closed in Flutter.

## Consequences

The internal simulation now has a truthful end-to-end submission path for a
published closed decision. It gives the reporter a durable receipt and makes
the absence, expiry or completion of the electronic submission window clear.
It does not decide the appeal, change the original decision, reopen the case,
attach evidence, render `T-042`, send an acknowledgement or execute any live
measure. Those are later, separately gated packages.

Rollback uses migration `036` down only before an appeal configuration or
submission exists; otherwise it refuses to discard the new truth.
