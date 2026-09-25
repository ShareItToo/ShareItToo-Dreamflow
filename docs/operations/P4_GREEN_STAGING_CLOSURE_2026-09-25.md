# P4 — Green Staging closure — 2026-09-25

## Result

P4 is **PASS for the bounded Green Staging promotion and readback**. The
accepted runtime is source commit
`c2da8585b1f822e123307d7c763530dc0f598893` with image digest
`sha256:cb7f92814225044a677106d9979b95bc7d019a549ca223228c17bd281a2b97d8`.
The promotion contract is bound to Ops commit
`928861bd4cfd080f90463d0445d59810c3280ad2`.

The canonical Green readback reached schema `98` from source schema `97` via
`098_booking_checkout_declaration_constraints.up.sql`. The source migration
ledger is
`950377bd739458e22978e0b237d79930dd1822b3a2fc6d9669de47068ba8adf0`; the
terminal ledger is
`796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196`.
The manifest-bound target digest is
`585422e5880147459571a1ca8bbae7a586987b9c08f745334fdb7d491f8d6b84`.

## Attempts and retained evidence

- Attempt 01 stopped before mutation because the local tag was missing; cleanup
  was verified and no artifacts remained.
- Attempt 02 stopped before mutation because private checkout mount
  permissions were unavailable; cleanup was verified and the protected pgdump
  remained retained at
  `/docker/shareittoo/evidence/green-promotion-56ec5dc1-ops-928861bd-to-c2da8585-attempt-02.json.pgdump`,
  SHA-256
  `e5bbc45b89e0a358d6b3867cc4c8b0274017054762adc2dd0634908ec978cb5f`,
  mode `0600`.
- Attempt 03 succeeded. Its sanitized remote evidence is
  `/docker/shareittoo/evidence/green-promotion-56ec5dc1-ops-928861bd-to-c2da8585-attempt-03.json`,
  SHA-256
  `42ad29e2e379985bb9c028681663bb7dc4a0ed3497ef325b490b457a67eeb135`,
  mode `0600`. The successful promotion pgdump SHA-256 is
  `adde437e5f101da5c432909e76f34916cd6102821b40cb8f5f749931868e34c4`,
  mode `0600`.

Four seals are stopped and cleanup is verified; no transient resources remain.
The evidence is sanitized and contains no credentials or secret values.

## Safety and boundaries

The promoted runtime remains provider-safe: payment transport is `memory`,
external provider traffic is off, and Listing AI is `on_device`. This closes
the technical P4 promotion/readback gate only. It does not claim provider,
payment, Play, production, legal, pilot or Astra/Gemini approval.

This documentation update performed no remote mutation, provider call, Gemini or
Astra action.

Machine-readable evidence:
`docs/evidence/release-readiness/p4-green-staging-closure-20260925.json`.
