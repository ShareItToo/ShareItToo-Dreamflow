# ADR-058: Separate Article 18 candidate review from external authority delivery

Status: accepted as a non-live technical control on 22.08.2026. It is not a
legal determination, professional legal approval, production activation or
authorization to contact an authority.

## Context

Drive scenarios `SUP-121` and `SUP-122` require suspected threats to life or
safety to enter a controlled Article 18 review path while preventing a normal
support agent from sending information to an authority. The current support
foundation already routes immediate danger and threat-or-violence cases to a
P0 Trust & Safety boundary, but it did not distinguish a conservative review
candidate from a human reporting-path assessment.

Article 18 of Regulation (EU) 2022/2065 is the primary legal source used to
shape the technical record. Applicability, the meaning of a suspected criminal
offence, the competent recipient and any disclosure remain human legal and
operational decisions.

## Decision

- A P0 simulation or internal-testing case with subtype
  `threat_or_violence` or `immediate_physical_danger` is marked as an Article
  18 **candidate**. This is deliberately conservative routing, not a finding
  that a crime occurred or that reporting is required.
- Only an active Administrator with a current session-bound Staff Step-up may
  list candidates or record an assessment. Normal support accounts are denied.
- The assessment is append-only and records one of `information_required`,
  `not_established` or `reporting_path_required`, its factual basis, symbolic
  evidence references, authorization evidence and an allowlisted minimum
  information scope.
- `reporting_path_required` must record either identified concerned Member
  State codes or the explicit fallback state that the concerned Member State
  could not yet be identified. Other outcomes cannot carry a disclosure scope.
- Human review is mandatory, automation role is exactly `none`, and automated
  or external delivery is always false. The dispatch route stays present only
  as a tested fail-closed boundary: even an Administrator receives
  `support_article18_external_dispatch_disabled`.
- Full assessment evidence is restricted operational evidence. User-facing
  support projections and automatic self-service privacy export do not expose
  it; the retention inventory counts it as security-audit data.

## Consequences

The system can prepare a minimized, reviewable internal record without
mistaking triage for a legal conclusion or creating an authority side effect.
External delivery cannot be enabled until a named legal/DSA owner, competent
and authenticated channels, jurisdiction handling, retention/legal-hold rules,
a disclosure log, precise authorization and professional approval exist.

Rollback refuses to discard recorded assessment evidence. No external message,
provider integration, production operation, payment, Store action, Cloud/VPS
change, public pilot or signed release is part of this decision.
