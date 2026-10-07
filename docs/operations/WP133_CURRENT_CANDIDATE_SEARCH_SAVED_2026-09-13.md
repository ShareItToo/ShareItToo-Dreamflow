# WP133 — Exact-current search and saved-state lifecycle

## Result

WP133 is **complete** on the physical Pixel for signed Internal/Staging
candidate `com.shareittoo.app` `1.0.0+2026091309`, source
`abf911d1c944a4e5874269111985d0cc4736546e`.

The renter found the exact isolated listing with a unique run-bound query and
the `Werkzeuge & Kleingeräte` category, opened its exact details and saved it
to the built-in `Für später` list. The saved listing remained present through
a process restart. It was absent under the distinct owner principal, remained
present after restoring the renter, and was then removed through the exact
listing control. Three consecutive settled observations confirmed both each
presence claim and the final absence claim; loading and error surfaces never
counted as empty truth.

## Why this replay was required

WP114 proved the same broad requirement on candidate `2026091110`. Candidate
`2026091309` changed shared search implementation while WP132 exercised only
run-bound search needed for report/block isolation. Transferring the saved-
state, restart and principal-isolation claims would therefore have been too
broad. WP133 replays those claims on the exact current candidate instead.

## Cleanup and portfolio

The isolated listing is ended and absent from the public catalog, the related
saved assignment is removed, the temporary two-role fixture is retired, and
the protected Pixel owner is restored. No unrelated saved items were changed.
No booking, contract or reservation was created, the payment endpoint was not
called, and monetary effect is zero.

`search-filter-favorites-wishlists` moves from PARTIAL to PASS. The portfolio
is now **17 PASS / 7 PARTIAL / 8 OPEN**.

Machine-readable evidence:
`docs/evidence/release-readiness/wp133-current-candidate-search-saved-20260913.json`.

## Verification

- Exact physical Pixel lifecycle: passed and restored.
- Focused diagnostic contract: 13/13 passed.
- WP132 predecessor HEAD: local full regression, GitHub Regression including
  clean checkout, GitHub CodeQL and zero open code-scanning alerts passed.
- Full local and GitHub verification is required again on the exact WP133
  closure HEAD before remote closure.

No Production, Google Play, Firebase, payment provider, real money, OnePlus or
PR-merge state changed. No credential, identity, private path, fixture
identifier or raw device identifier is committed.
