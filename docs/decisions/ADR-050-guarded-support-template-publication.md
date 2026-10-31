# ADR-050: Guarded support-template publication

Status: accepted as a non-live technical control on 21.08.2026. It does not
authorize live support operations, external delivery, a payment action, a
decision, a Store release or production activation.

## Context

The current Drive Support Packet defines 55 German message templates and four
mandatory catalog rules: unresolved placeholders block publication, rendered
text and template version are retained, sensitive content is excluded from
push, and RED templates are never automatic. Its test matrix additionally
requires exact approval-to-payload binding, human review for YELLOW content,
immutable corrections, Berlin time semantics and fail-closed treatment of
money, liability, refund and personal-data claims.

The existing `support_messages` table was only a data-model foundation. It did
not bind an exact catalog snapshot, immutable rendered hash, independent review
or an authenticated user display. Directly adding email, push or provider
delivery would also exceed the current non-live authorization.

## Decision

- The exact Drive JSON catalog is imported as a read-only runtime snapshot.
  Startup validates packet identity, all 55 templates, placeholder topology and
  the Drive raw-source SHA-256 before any template can be used.
- The generic workflow accepts only GREEN and YELLOW templates that do not
  require a money snapshot. RED and money-bearing templates stay on the
  existing decision/snapshot paths and fail closed here.
- Case identifiers and available case deadlines are always rendered from the
  locked server case. Date and time output uses `Europe/Berlin`; conflicting or
  unavailable server-bound values are rejected.
- Free variables reject unresolved placeholders, control characters,
  recognizable credentials, financial identifiers, direct contact data,
  address-like values, guilt assertions, guarantees and completed-refund
  promises.
- Immediate GREEN publication is limited to an explicit template/status
  allowlist. YELLOW publication requires a different active administrator to
  approve the exact rendered SHA-256 and optimistic version first.
- Publication creates only the authenticated in-app record. Events and audits
  record hashes and control state, never rendered content or variables, and
  always state `externalMessageSent=false`.
- Rendered content, variables, recipient, template identity, approval tier and
  correction link are immutable. A correction is a new message referencing an
  earlier sent message for the same case and recipient; neither message can be
  deleted or rewritten.
- Users receive only sent messages addressed to them. Drafts, review metadata,
  hashes, staff identifiers and structured variables remain outside the user
  projection. Flutter rejects malformed timestamps, UUIDs, unresolved
  placeholders and any response that claims external delivery.

## Consequences

SIT can now rehearse a truthful template-to-user support communication path in
`simulation` and `internal_testing`, with exact catalog provenance and durable
review/audit evidence. This directly covers the technical core of `SUP-031`,
`SUP-033`, `SUP-037`, `SUP-038`, `SUP-039`, `SUP-040` and `SUP-044`, and adds
bounded protections relevant to `SUP-032`, `SUP-034`, `SUP-035`, `SUP-036` and
`SUP-045`.

It does not make every catalog entry operational. Templates requiring missing
server bindings, money snapshots, an approved decision or RED authorization
remain unavailable on the generic path. No scheduler, email, SMS, push,
provider, appeal adjudication, payment, refund, payout or live support action is
added.

Rollback uses migration `038` only while no support-message truth exists. Once
a message has been recorded, rollback refuses to discard that history.
