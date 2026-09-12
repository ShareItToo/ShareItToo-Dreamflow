# ADR-069: Server-bound reviewed account-recovery guidance

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenarios `SUP-022` and `SUP-023` prohibit recovery through a possibly
compromised email channel and prohibit Support from requesting credentials.
Generic template drafting could allow a client or staff caller to replace the
safe channel, invent a completed action or publish stale guidance after the
recipient loses the independent authenticated path.

## Decision

SIT uses a dedicated `T-035` guidance route. The server accepts no message
variables, requires the exact P0 account-takeover reporter, active account,
active refresh-backed session and password reauthentication capability, and
binds the authenticated in-app security route plus explicit non-action facts.

The existing independent Administrator review binds the immutable message hash.
Publication rechecks current case, account/session and every recovery binding.
Migration `056` independently enforces the exact template, rendered copy,
structured variable set and false action flags on insert and publication.
Credential-soliciting free text is blocked across support templates.

This workflow records guidance only. Account recovery, password reset, session
revocation and external delivery are outside this package.

## Consequences

- A reported email address cannot become the sole recovery route.
- Neither a client nor generic staff call can substitute recovery instructions.
- Review cannot authorize a stale or altered recovery message.
- Database writes cannot forge a safe-channel or completed-action claim.
- Protective credential warnings remain usable while credential requests fail.
- SIT Business/Global tooling can reuse the versioned control without learning
  secrets or bypassing human review.
- Real recovery operations remain blocked pending a separate approved design.

## Rejected alternatives

- Generic `T-035` drafting: rejected because caller-controlled variables could
  weaken the recovery channel and effect boundaries.
- Email-only recovery: rejected because the reported channel may be controlled
  by the attacker.
- Support-collected password, PIN or code: rejected because Support must never
  receive authentication credentials.
- Automatic session revocation or recovery from the guidance endpoint: rejected
  because it would combine communication with a live security action and require
  separate identity, legal, operational and release gates.
