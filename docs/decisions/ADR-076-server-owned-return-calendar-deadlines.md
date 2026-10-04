# ADR-076: Server-owned return calendar deadlines

Status: accepted for non-live implementation on 22.08.2026.

## Context

The return policy distinguishes an exact 48-hour report window from deadlines
expressed as five or seven calendar days. Fixed 24-hour multiplication drifts
the user-visible wall time across daylight-saving changes. A confirmed boolean
alone also cannot prove that a changed T0 was proposed and accepted by two
different booking participants, and the client previously extended direct chat
beyond the required report window when confirmation was missing.

## Decision

Compute five/seven-day deadlines on the server in the booking's validated IANA
timezone while retaining exact-duration semantics for T0+48 hours. Persist a
deadline timezone and policy version on every new V5.2 return case and enforce
the calendar calculation again in PostgreSQL. Grandfather historical fixed-
duration rows under policy version 1.

Accept a changed return T0 only from complete stored proposal evidence with two
distinct booking participants. Keep completed direct chat open through the
inclusive 48-hour report deadline, or until closure of an active substantiated
return case; later new issues use Support. Treat the client calendar projection
as local demo/QA behavior only when server authority is absent by design.

## Consequences

- User-visible five/seven-day deadlines retain the booking-local wall time
  across DST and can scale to other IANA booking timezones.
- Historical cases keep their original invariant and new cases cannot silently
  fall back to fixed durations.
- Missing confirmation remains neutral but does not prolong direct participant
  messaging.
- A forged self-confirmation cannot redefine T0.
- The 48-hour report window, needsReview, undisputed amount, audit, evidence and
  Payment boundaries remain unchanged.
- Release readiness still requires exact-commit CI, normal Node/pnpm resolution,
  an automated PostgreSQL runner and closure of every open technical-debt item.
