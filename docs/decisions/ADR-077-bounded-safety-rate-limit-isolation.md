# ADR-077: Keep protected Safety intake bounded and independent of general traffic

- Status: Accepted locally for non-live implementation
- Date: 2026-08-22
- Implementation: `6da227ba2abaf3d5aa75e6f0f235b31bf655eb4f`

## Context

An urgent Safety request could be denied after unrelated traffic exhausted the
general limiter, despite unused capacity in the dedicated Safety limiter.
Removing or increasing a production limit would reduce abuse protection and
would turn a timing workaround into product behavior.

## Decision

Use immutable central policies and fresh limiter stores per application.
Exact protected Safety support intake and the exact handover-exception route
skip only the general bucket and always enter the dedicated 30-attempt bucket
before authentication and persistence. Ordinary support keeps its 10-attempt
bucket and all other routes keep the 240-per-minute general policy.

Test the real boundaries over loopback with a fixed request source and repeat
the full sequence in a fresh application. Do not use sleeps, reset hooks, IP
rotation, higher production limits or serial execution as acceptance evidence.

## Consequences

- Genuine urgent intake cannot be starved solely by unrelated general traffic.
- Safety intake remains rate-limited and gains no authorization or outcome
  authority from preliminary classification.
- Application instances no longer share implicit limiter state.
- `TD-RR-002` advances but remains open until historical request-source
  accommodations are removed from the complete integration and exact-commit CI
  passes.
- No live or external state changes.
