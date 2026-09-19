# ADR-055: Separate DSA notice-and-action intake from general support

Status: accepted as a non-live technical control on 22.08.2026. It does not
constitute a legal determination, legal approval, public-channel activation or
authorization for production, external delivery, content removal, payment,
Store submission or live support.

## Context

Drive scenario `SUP-027` requires a report of allegedly illegal content that
arrives through general booking support to keep its receipt time and move into
an independent DSA notice-and-action path. The Trust & Safety source requires
an exact content locator, a reasoned illegality statement, reporter identity,
a good-faith declaration and an optional jurisdiction or legal basis.

Treating that report as ordinary free-text support would not preserve the
required evidence shape. Treating intake as proof of illegality or as an
automatic removal instruction would exceed both the available facts and the
permitted automation boundary.

## Decision

- The authenticated app exposes a distinct `Rechtswidrigen Inhalt melden`
  route after safety and single-issue triage.
- The server accepts only versioned structured notice evidence with an exact
  content type, locator, reasoned illegality statement, good-faith
  confirmation and optional jurisdiction or legal basis.
- Reporter name and email are derived from the authenticated server-side user
  record and fail closed when incomplete; the client cannot assert identity.
- Each accepted notice receives an opaque, ambiguity-safe `SIT-N-...` Notice
  ID and an immutable PostgreSQL evidence snapshot.
- The ordinary user projection, events and audit metadata expose only the
  Notice ID and minimized classification facts. Full notice evidence is
  exported only for the reporter, never for an affected third party.
- Intake and routing are deterministic. Any decision about illegality,
  restriction, removal, notification or redress remains a
  `red_explicit_decision` requiring authorized human review.

## Consequences

The DSA evidence path is explicit, receipt-preserving, independently
searchable and resistant to accidental mutation. An incomplete or abusive
report cannot become automatic truth or trigger an automatic measure. The
technical implementation supports authenticated in-app intake only.

Public or guest accessibility, final legal wording, lawful notice exceptions,
real operator assignment, statutory timing, affected-party communication,
Statement of Reasons delivery and production operation remain separate legal
and operational gates.
