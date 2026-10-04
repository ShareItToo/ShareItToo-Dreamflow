# WP264 – return damage case handoff

Scope: make the return-stepper damage path server-receipt-bound, principal-bound
and retry-safe without creating an extra charge locally.

Evidence collected locally:

- Damage remains return-flow-only; no-damage keeps the existing path.
- A damage report requires a bounded description, at least one protected
  evidence photo and an authorized contested amount; the amount cannot exceed
  the booking quote.
- Evidence uploads are retained per slot and the return-case request uses one
  opaque idempotency key. Completion cannot advance until the server receipt is
  recorded.
- Account/epoch invalidation is checked before and after the remote mutation;
  a late Account A response cannot become Account B truth.
- `flutter analyze` passed for the changed safety/stepper files.
- Focused WP264 wiring passed 7/7; principal/transport return-case tests passed
  15/15; privacy disclosure validation passed.
- `git diff --check` passed.

Remaining boundary: no live provider, staging, Play, payment or device action
was attempted. This package is local technical evidence only.
