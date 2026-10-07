# ADR-054: Separate account access from controlled support-case retention

Status: accepted as a non-live technical control on 22.08.2026. It does not
constitute legal approval, define a retention period or authorize production,
external delivery, payment, Store submission or live support.

## Context

Drive scenario `SUP-029` requires eligible support-case and legal-hold data to
remain controlled when an account is deleted, while user access is handled
separately. The prior deletion preflight treated every support case as an
undifferentiated blocker. That prevented an otherwise eligible deletion and
did not make the retained-record consequence explicit to the user.

Deleting the support rows would destroy case and audit truth. Keeping the
account active merely to retain those records would preserve more access than
needed. Allowing new messages after deletion would create a misleading
delivery state for a recipient who can no longer authenticate.

## Decision

- Support cases are reported as `retainedRecords`, not generic deletion
  blockers.
- Active legal holds remain deletion blockers and fail closed.
- The client requires a separate, non-dismissible acknowledgement that support
  records may remain controlled while account access ends.
- Successful deletion invalidates sessions and user access but preserves
  pseudonymous support-case and append-only audit history.
- New support-message creation and the transition to `sent` require an active,
  non-deactivated recipient in both the service workflow and PostgreSQL
  migration `041`.
- Idempotent replay of an already published historical message does not create
  a new delivery and remains unchanged.

## Consequences

Account deletion and evidence retention now have independent, explicit state.
The database trigger protects direct SQL paths and races in addition to the
application check. Closed users cannot receive newly created or newly
published in-app messages, while historical case truth remains reviewable by
authorized roles.

The final lawful retention basis and duration, legal-hold policy, identity
verification, production deletion operation and external communication remain
separate legal and operational gates.
