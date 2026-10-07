# WP92 — Pixel permission matrix and final restart

Status: **PARTIAL: THE THREE-GROUP MATRIX AND EXACT RESTORATION PASS; THE FINAL
IN-CYCLE RESTART REMAINS UNPROVEN.**

The exact candidate passed archive, source, manifest, unlocked-device and
authenticated-navigation preflight. Camera, location, and notifications each
completed denied state, allowed state and authenticated restart. The Android
app-permission settings surface was read-only verified. All four runtime
permission states, flags and effective AppOps were then restored exactly.

The new private checkpoint journal records that this progress completed through
`lifecycle-before-final-restart`. The final restart immediately after that
restoration lacked bottom navigation, so the complete lifecycle is not accepted.
It did not leave altered device state: the journal is owner-only, requires no
recovery and a direct four-permission readback is exact. One independent,
post-recovery five-destination navigation diagnostic then passed.

This isolates the open condition to the final restart boundary. It neither
proves an app root cause nor turns a later normal start into proof that the
in-cycle restart succeeded. No account, listing, booking, message, provider,
Store, Production or OnePlus state changed.

The next safe action is one bounded, non-private foreground-process
classification at that final restart boundary before any lifecycle replay. No
fixed delay or automatic retry may convert the condition into success.

Machine-readable evidence:
`docs/evidence/release-readiness/wp92-pixel-permission-matrix-final-restart-20260910.json`.
