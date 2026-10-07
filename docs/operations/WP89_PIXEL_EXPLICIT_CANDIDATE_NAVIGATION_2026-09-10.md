# WP89 — Pixel explicit-candidate navigation

Status: **COMPLETE FOR FIVE READ-ONLY NAVIGATION DESTINATIONS.**

The first WP88 attempt correctly failed before mutable permission work because
the old navigation runner defaulted to a retired private archive location. WP89
adds an explicit private-candidate input that is structurally and
cryptographically validated before the runner ever talks to the Pixel. It also
converts any future missing-navigation result into a small fixed vocabulary,
never raw UI hierarchy content.

With the exact signed Pixel candidate `1.0.0+2026090905`, the physical,
unlocked device passed all five authenticated, read-only main destinations.
The run stored no screenshot, account content, credential or raw device
identifier. It made no account, listing, booking, cart, message, permission,
Store, provider, Production or OnePlus change.

This is navigation-only evidence. It does not accept the permission lifecycle,
business actions, legal/V5.2 flows, payments, providers or the candidate as a
whole. The next safe action is the separate exact-candidate permission
lifecycle, with exact restoration required on every exit path.

Machine-readable evidence:
`docs/evidence/release-readiness/wp89-pixel-explicit-candidate-navigation-20260910.json`.
