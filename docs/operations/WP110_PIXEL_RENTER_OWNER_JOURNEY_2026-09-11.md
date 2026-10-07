# WP110 — Current-Candidate Pixel Renter/Owner Journey

## Result

The exact signed Internal/Staging candidate `com.shareittoo.app`
`1.0.0+2026091109`, source
`5d8b89c82926a9f0a28627a7f36d26a88a9574fe`, passes the complete currently
executable non-binding renter/owner journey on the physical Pixel 7 Pro. The
booking-history correction is deployed from technical head
`cbe62931b79964465f2d3956afd3f698dd4c6dea`, and the public API reports that
same exact head.

This closure is deliberately narrower than a launch claim. It proves the
technical Staging journey without a binding V5.2 contract or payment. It does
not convert the memory payment provider into Stripe evidence, does not activate
Production or Google Play, and does not transfer Pixel evidence to OnePlus.

## Physical journey passed

- Two distinct email-verified synthetic principals completed the owner/renter
  role switch with Account-A/B isolation and protected-owner restoration.
- The owner created and published a draft through the Pixel; the server and
  public catalog independently confirmed the active listing. The renter then
  discovered that exact listing and opened its detail.
- A non-binding request simulation reached the owner, was accepted in the
  permitted simulation boundary, and produced renter-visible chat without a
  contract, reservation, payment endpoint or money movement.
- FCM passed in foreground, background and terminated-process states. The
  hash-bound private notification-shade capture has now passed visual review:
  both ShareItToo notification cards show the correct, clear brand mark without
  clipping, substitution or a blank/placeholder icon. See the separate WP111
  review closure for the privacy-preserving visual and resource evidence.
- Listing edit, publish, pause, stable public hide, reactivation and terminal
  end passed with strictly advancing server revisions.
- Exact search, coarse-category search, detail, save/remove, restart
  persistence and Account-A/B saved-state isolation passed.
- Rental-cart submission was idempotent, non-reserving and persisted through a
  restart. Project creation, assignment and account isolation passed, and the
  exact intent was removed afterward.
- A synthetic image attachment, counterparty visibility, two-party handover
  time, two-party return time and terminated-process message persistence
  passed. Exact location remained blocked before the server reveal window and
  no premature location message was created.
- During a controlled 15-second offline interval, a new message stayed absent.
  The same surviving process received it after the original network state was
  restored, with no fatal entry.

## Cleanup and baseline preservation

Every isolated WP110 listing was ended and proven absent from the public
catalog by exact fixture identity. Every temporary booking was cancelled, the
temporary device image was removed and the protected owner session was
restored. The public catalog contained one unrelated pre-existing listing
before the runs and still contains one afterward; WP110 neither edits nor
attributes that record. This replaces the unsafe shorthand “catalog empty”
with exact-fixture cleanup truth.

## Verification

- The full local technical regression passed at
  `cbe62931b79964465f2d3956afd3f698dd4c6dea`, including all tool, Backend,
  PostgreSQL, Flutter, analyzer, Web/Wasm, loopback and Android build gates.
- GitHub Regression `34595796885` passed on the same head, including the R10
  clean-checkout reproduction. CodeQL `34595796884` passed and the current
  branch has zero open code-scanning alerts.
- The separately authorized image publication run `34597332701` passed on the
  same head, including `publish-api-image`. Staging runs immutable image digest
  `sha256:ac550be1b11d50323e75bd7d0967e2003ed92d5e0f30a05491a7c2123d783fb9`;
  API and database are healthy with zero container restarts. Readiness is
  degraded only by the already known non-critical support follow-ups.
- PR #7 remains draft, open, mergeable and unmerged.

Machine-readable evidence:
`docs/evidence/release-readiness/wp110-pixel-renter-owner-journey-20260911.json`.

## Remaining gates

- Professional approval and provisioning of the V5.2 legal snapshots before a
  binding booking, pickup/return, damage/needsReview and review journey.
- Official Stripe sandbox readiness before test payment, refund and simulated
  payout evidence.
- Separate exact-candidate OnePlus/two-device replay when explicitly resumed.
- Google Play upload/activation, Production, public registration and PR merge
  remain unchanged and unclaimed.
