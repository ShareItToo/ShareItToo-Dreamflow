# WP80 — CodeQL file-descriptor race remediation

Status: **COMPLETE LOCALLY AND ON GITHUB**.

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
Web/Wasm/loopback, Android minSdk/build and capacity checks. Exact package
commit `099c18958936aa56b59d4eb1f3dc09898de6f09c` passes GitHub Regression
`34412250285`, including clean-checkout reproducibility, and CodeQL
`34412250399`. The current PR-merge CodeQL analysis has zero open alerts.

The branch-specific code-scanning endpoint separately retains two historical
open entries from an older branch analysis. This workflow intentionally runs
on pull requests, so that stale branch snapshot is not current security proof.
It is recorded rather than hidden; no duplicate push-triggered CodeQL workflow
was added merely to change a historical endpoint count.

No device, candidate, Staging, production, Store, payment, provider,
Firebase, Cloud/VPS/DNS or PR state changed. The installed Pixel candidate
remains `1.0.0+2026090905`; WP80 does not make the newer source an installed
candidate.

WP81 now resumes the strictly read-only source-to-Staging-runtime parity
preflight.
