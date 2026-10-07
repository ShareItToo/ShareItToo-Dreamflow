# ADR-062: Aggregate support metrics and crash-key allowlist

Status: accepted as a non-live technical control on 22.08.2026. It does not
authorize production analytics, Firebase activation, Store work or public use.

## Context

Drive scenarios `SUP-165` through `SUP-167` require correct reopen and late
update measurements without PII analytics, Crashlytics disabled without user
consent and a ban on case/user identifiers in diagnostics. Raw event ratios or
row-level exports would make the metric ambiguous and create an unnecessary
privacy surface.

## Decision

- Define reopen rate as reopened members of the distinct case cohort closed
  inside one bounded window, not as unrelated close and reopen event counts.
- Define late-update rate as a labelled point-in-time ratio of overdue active
  cases to all active cases.
- Return aggregate counts and basis points only through an elevated
  Administrator endpoint; never place them in public health output or an
  external analytics transport.
- Keep the calculation limited to simulation/internal-testing support truth.
- Centralize Crashlytics collection behind release mode plus the independent
  persisted user choice.
- Permit controlled diagnostic custom keys only through one exact allowlist
  helper and prohibit Firebase user identifiers.

## Consequences

The rates have stable denominators and cannot disclose row-level case or user
data through the API. Empty denominators are deterministic zero rather than
NaN or infinity. Operational consumers must retain the metric version and
window/as-of definitions when interpreting results. No historical snapshot of
the late-update queue is invented; future trend storage or external analytics
would require a separate privacy, retention and activation decision.
