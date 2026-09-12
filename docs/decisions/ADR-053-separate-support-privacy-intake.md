# ADR-053: Explicit Privacy route inside normal support intake

Status: accepted as a non-live technical control on 22.08.2026. It does not
constitute legal approval and does not authorize live support, external
delivery, a statutory deadline promise, production, payment or Store changes.

## Context

Drive scenario `SUP-028` requires a Privacy request entered through normal
support to become its own Privacy case with a deadline and owner. The canonical
backend taxonomy and owner route already included seven `privacy_security`
subtypes and `privacy_owner`, but the user-facing normal support intake exposed
no explicit Privacy category. A generic or booking category could therefore
send an otherwise explicit request down the wrong route.

Classifying free text automatically would introduce an unexplained semantic
decision and could misroute sensitive requests. A legal response deadline is
not a safe value to invent from product code or the support matrix.

## Decision

- Normal support exposes a dedicated `Datenschutz & Daten` category after the
  existing safety-first and single-issue gates.
- Its seven explicit choices map one-to-one to the canonical backend Privacy
  subtypes. There is no text classifier or heuristic fallback.
- The existing server route remains authoritative: `privacy_security` receives
  `privacy_owner`, `p2`, `red_explicit_decision`, `privacyFlag=true` and a
  four-hour internal next-update checkpoint in simulation mode.
- The four-hour value is only an operational update commitment. It is not
  presented as a statutory response or completion deadline.
- The client accepts a canonical receipt only if its server-confirmed case type
  and subtype equal the selected route. A matching Privacy receipt states that
  a separate Privacy case was created and displays the server-provided next
  update.

## Consequences

An explicit Privacy request can be routed safely from the normal support flow
without AI, provider traffic or invented legal facts. The same request remains
one independently reviewable case under S3K.

Free text submitted under a different selected category is not automatically
reclassified. Statutory rights-request deadlines, identity verification,
export/deletion execution, incident response and real staffing remain separate
controls and gates.
