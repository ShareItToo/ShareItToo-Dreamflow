# WP80 — CodeQL file-descriptor race remediation

Status: **LOCAL CLOSURE COMPLETE; EXACT-HEAD GITHUB VERIFICATION PENDING**.

## Why this package supersedes the prior parity preflight

The final WP79 readback found two open high-severity `js/file-system-race`
alerts. They are in local diagnostic tooling, not Android or Backend runtime,
but they read owner-only release/journal JSON and therefore take precedence
over the planned successor-candidate parity preflight. The earlier WP61
descriptor approach prevented a symlink follow and a path-based second read,
but the current CodeQL analysis still correctly retained a race concern around
the bounded read operation. This package strengthens that boundary instead of
dismissing or suppressing either finding.

## Remediation

Both affected readers now:

- open once in read-only no-follow mode;
- validate regular-file, owner-only and bounded-size metadata from that exact
  descriptor;
- read exactly the validated byte count from that descriptor;
- reject any growth, shrink or metadata change before accepting the JSON; and
- close the descriptor in `finally`.

The permission journal additionally receives an explicit 16 KiB maximum. The
release-record maximum remains 16 KiB. There is no later path-based read and
no scanner suppression, alert dismissal, timing workaround or test exclusion.

## Verification and boundary

Fourteen focused tests and both syntax checks pass. The complete local
CI-metadata rollover regression passes through Backend, Flutter/analyzer,
Web/Wasm/loopback, Android minSdk/build and capacity checks. The exact package
commit must still pass GitHub Regression and CodeQL before the two original
alerts may be called closed.

No device, candidate, Staging, production, Store, payment, provider,
Firebase, Cloud/VPS/DNS or PR state changed. The installed Pixel candidate
remains `1.0.0+2026090905`; WP80 does not make the newer source an installed
candidate.

WP81 will resume the strictly read-only source-to-Staging-runtime parity
preflight only after this security closure.
