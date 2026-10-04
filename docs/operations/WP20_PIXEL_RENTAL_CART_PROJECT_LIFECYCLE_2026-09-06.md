# WP20 Pixel rental-cart and project lifecycle

## Outcome

WP20 is physically complete on the Pixel 7 Pro for signed Staging candidate
`1.0.0+2026090507`, source commit
`5b90da53b0bc1b18c073fe0d6e92b89b5a30fae2`. The update preserved the
existing installation and app-data container. The candidate archive,
canonical upload signature, APK/AAB hashes and privacy scan all validate.

The physical two-role journey submits the same non-reserving cart intent twice
and proves exactly one stable server item. It creates and assigns one project,
proves the assignment in both UI and server truth, preserves it across a
terminated-process restart, keeps it absent for the other principal, restores
it for the renter, removes it through the exact item row and restores the
pre-run cart baseline. No rental request, booking, reservation, contract or
payment is created. The isolated listing is ended and publicly absent, and the
protected owner session is restored.

## Diagnostic corrections

Diagnostic commit `142d1e553344513fd1608af6cc276f083949854b` closes four
false assumptions exposed only by the real account state:

- the calendar now chooses the first future server-eligible date rather than
  local day zero, which is already in the past at server midnight;
- the post-selection surface expects the selected-range semantics instead of
  the pre-selection `Verfügbarkeit prüfen` label;
- project assignment and its confirmation are bound to the exact listing row,
  not the first global action when another cart item exists;
- final removal is also bound to that exact listing row.

The remote-settle budget is explicitly longer than the existing 20-second
transport contract and is ratcheted by a deterministic test. Month rollover,
composite subtitle rendering, multiple project controls and multiple removal
controls are covered. No timeout, retry, parallelism, cache or weakened-result
workaround was added.

One failed diagnostic selected a pre-existing synthetic QA cart row before the
row-binding correction. Its original project assignment was restored from the
captured private baseline; project and item counts were preserved and the
failed fixture left zero items and zero projects. The final passing run began
after this recovery and independently restored its exact baseline.

## Evidence and boundaries

Sanitized machine-readable evidence is
`docs/evidence/release-readiness/wp20-pixel-rental-cart-project-lifecycle-20260906.json`.
It contains no account identity, credential, token, fixture identifier, raw
device identifier or private filesystem path.

OnePlus, Google Play, Production, public registration, Stripe/live money,
external providers, Firebase Console, Cloud/VPS/DNS and PR merge were not
changed. PR #7 remains Draft and unmerged. Exact closure-head local regression,
GitHub Regression and CodeQL are the final repository gate and are reported
against the final evidence commit.
