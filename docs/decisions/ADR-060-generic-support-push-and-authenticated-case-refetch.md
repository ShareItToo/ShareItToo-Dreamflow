# ADR-060: Generic support Push and authenticated case re-fetch

Status: accepted as a non-live technical control on 22.08.2026. It does not
authorize live FCM, production, Store submission or external communication.

## Context

Drive scenarios `SUP-138` through `SUP-142` require support-update Push,
sensitive-content rejection, safe behavior after access loss and duplicate-safe
scheduling. The existing V5.2 contract already opens an identifier-free
authenticated notification feed, but support message publication did not
create a canonical notification and the support CTA still preferred a legacy
support chat.

## Decision

- Schedule one in-app and one Push outbox row only after a support message is
  user-visible.
- Use a deterministic publication-derived event key and the database uniqueness
  guard for duplicate evaluation.
- Keep case identity only in the authenticated in-app record. Send FCM exactly
  the generic title/body and two-field `v52/notifications` data contract.
- Broaden the neutral lock-screen title to ShareItToo wording so it remains
  accurate for booking and support updates without revealing either category.
- After the authenticated feed, re-fetch the selected case from the canonical
  support endpoint and require an exact identity match.
- Collapse missing, revoked, malformed and temporarily unavailable cases into
  the same data-free fallback.
- Do not add direct case deep links, cached case rendering, email delivery,
  live provider traffic or a production flag.

## Consequences

The Push can signal that an update exists without disclosing why. A stolen or
locked device receives no case identifier or sensitive detail, and a user who
lost access cannot recover stale data through the notification CTA. Duplicate
scheduler or workflow evaluation cannot create an additional notification.

Real-device Push receipt, provider credentials, legal/provider approval,
signed candidate, Store submission, production deployment and live support
staffing remain separate explicit gates.
