# ADR-047: Server-authoritative support user-action deadline

Status: accepted for the non-live implementation candidate on 2026-08-21.

## Context

Drive Support Test Matrix scenario `SUP-144` requires a case waiting for the
user to show both the concrete action and its deadline. The existing support
case model already contains `evidence_due_at`, but no transition owned or
projected it. The separate `next_update_at` is a support checkpoint and must
not be relabelled as the user's response deadline.

## Decision

- `waiting_for_user` transitions require an explicit future
  `userActionDueAt`; no client or server default is derived.
- The value is persisted in the existing `support_cases.evidence_due_at`
  column, cleared by every non-user-waiting transition and recorded in the
  append-only event and audit metadata.
- Migration `034` enforces that the field exists exactly in
  `waiting_for_user` and is null in every other lifecycle state.
- The authenticated user projection provides both the ISO value and a
  server-rendered Europe/Berlin display value. The Flutter model requires both
  for `waiting_for_user` and rejects stale or incomplete combinations.
- The UI labels `Antwort bis` and `Nächstes Update` separately.

## Consequences

- A missing, expired-at-transition or contradictory user deadline fails closed
  before persistence.
- Existing inconsistent rows cause migration validation to fail instead of
  being silently rewritten.
- The deadline is display-only in this package. No automatic closure, reminder,
  external message, sanction, payment, refund or live support action is added.
- A later automatic no-response flow would require its own approved policy,
  notification evidence, grace handling and implementation package.
