# WP90 — Pixel permission-lifecycle restart recovery

Status: **PARTIAL; EXACT RECOVERY PROVEN, LIFECYCLE NOT ACCEPTED.**

WP90 began only after the exact archive, clean candidate source, manifest,
unlocked physical device and authenticated navigation preflight all passed for
the installed `1.0.0+2026090905` Pixel candidate. During an in-cycle controlled
restart, the fixed, non-private navigation classifier reported
`bottom-navigation-absent`. The root cause is not claimed.

The lifecycle stopped fail-closed and its guaranteed cleanup restored camera,
coarse/fine location and notifications exactly, including runtime grants,
mutable flags and effective AppOps. A direct four-permission readback matches
the journal's original state. The owner-only journal is `0600`, says
`restored-after-failed-run`, requires no recovery and records the result as
unproven. It does not contain a credential, account identity or raw device
identifier.

The runner now records only one fixed safe failure class in this condition; it
never writes a raw Android error or UI content to evidence. No account,
listing, booking, message, provider, Store, Production or OnePlus state
changed. The Gradle-cache `aapt2` lookup is technical debt only, not a release
substitute.

The next safe package is a non-mutating exact-candidate cold-start stability
diagnostic. It must identify whether controlled launches remain navigable
before any permission lifecycle is retried; no timing extension may be used to
claim success.

Machine-readable evidence:
`docs/evidence/release-readiness/wp90-pixel-permission-lifecycle-restart-recovery-20260910.json`.
