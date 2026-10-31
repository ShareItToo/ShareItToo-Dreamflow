# WP131 — Exact-current Android permission lifecycle

## Result

WP131 is **complete** on the physical Pixel for unchanged signed
Internal/Staging candidate `com.shareittoo.app` `1.0.0+2026091201`, source
`1546812f625b4e8f1e700bf976410097cd45ac2f`.

Camera, coarse/fine location and notifications each completed denied and
allowed states with an authenticated restart after both transitions. Android's
app-permission surface was opened read-only. The exact original runtime grants,
mutable flags and effective AppOps modes were then restored. The package data,
identity and authenticated session remained intact through the final restart.

No photo was captured or selected, no location was read or persisted, no
notification preference or push registration changed, and no message, account,
listing, booking or payment mutation occurred.

## Deterministic platform settlement

WP128 proved that Android permission-revocation callbacks can outlive the
synchronous grant/flag/AppOps restore commands and terminate a newly launched
process. The PackageManager foreground/background handler waits and Android
broadcast barrier are genuine completion signals on this Pixel/OS. Their old
ten-second command boundary was too narrow under the real queued lifecycle.

WP131 gives each platform signal a bounded maximum of sixty seconds. It does
not sleep, retry or accept elapsed time as success. The one authorized physical
replay received all three exact completion signals, restored the exact state
and then passed the final authenticated restart. The private journal is
`completed-restored`, owner-only and requires no recovery.

The WP128 validator now reads its recorded source files from the exact WP128
closure commit rather than the mutable current tree. This preserves the prior
partial evidence while permitting reviewed later diagnostic hardening.

## Portfolio and boundaries

The 32-area portfolio moves from **15 PASS / 9 PARTIAL / 8 OPEN** to
**16 PASS / 8 PARTIAL / 8 OPEN**. Only `android-permission-lifecycle` is
promoted.

No app or Backend runtime, Production, Google Play, Firebase, payment, money,
account/business data, OnePlus or PR-merge state changed. No credential,
identity, private path, UI hierarchy or raw device identifier is committed.

Machine-readable evidence:
`docs/evidence/release-readiness/wp131-current-candidate-android-permission-lifecycle-20260912.json`.

## Verification

- Focused diagnostic and evidence tests: 24 passed.
- Full local technical regression: passed, including analyzer, Web/Wasm,
  loopback smoke and Android debug build.
- GitHub Regression and CodeQL: required on the exact WP131 closure HEAD
  before this package is treated as remotely closed.
