# ADR-051: Support deadline watchdog

Status: accepted as a non-live technical control on 21.08.2026. It does not
authorize live support operations, external delivery, automatic case closure,
a payment action, a Store release or production activation.

## Context

The current Drive Support test matrix requires one operational alarm for an
unassigned P0 case, one alarm for an overdue `next_update_at`, idempotent
scheduler replay, observable worker health and a correction path when a
promised next update is already in the past. The existing support foundation
persisted the authoritative priority, owner and next-update fields, but it had
no recurring detector or minimized operational queue.

Sending email, push, SMS or a provider notification would exceed the current
non-live authorization and would also create new delivery, consent and
operations dependencies. Silently repairing a deadline or assigning an owner
would overwrite operational truth rather than surface it.

## Decision

- A recurring backend worker scans only active `simulation` and
  `internal_testing` support cases for two exact conditions: P0 without a
  current owner and `next_update_at` at or before the server time.
- Each condition creates an internal, append-only support event. Event
  idempotency is bound to the exact case condition, so a repeated scheduler run
  cannot duplicate the same alert.
- The worker changes no case status, owner, deadline or user-facing content and
  calls no mail, push, webhook or provider adapter.
- A singleton state table stores only worker version, timestamps, stable error
  code and aggregate counters. Health and readiness fail closed when the
  worker is stale or failed, or when either unresolved condition exists.
- Only an authenticated active admin with the existing Staff-Step-up may read
  the active operational queue. The response is `private, no-store` and omits
  summaries, message content, evidence, reporter data and raw structured event
  payloads.
- A template containing a next-update date/time placeholder cannot be created
  or published when the authoritative case deadline is absent, invalid or no
  longer in the future. Publication rechecks the locked current deadline.
- Privacy and retention inventories include the exact worker, route, state and
  migration sources while remaining draft and fail-closed.

## Consequences

SIT can now rehearse the technical core of Drive scenarios `SUP-041`,
`SUP-142`, `SUP-158`, `SUP-159` and `SUP-160` without inventing staff capacity
or performing an external action. Overdue operational truth becomes durable
and visible to an elevated administrator, and stale worker execution degrades
service readiness instead of failing silently.

The watchdog is not an incident-response team, notification channel or SLA
guarantee. A human or separately authorized workflow must still assign an
owner, correct the deadline and decide any user communication. No automatic
closure, escalation outside the database, payment/refund action or live
provider integration is added.

Rollback uses migration `039` only before operational-alert truth exists. Once
such an event has been recorded, rollback refuses to discard that history.
