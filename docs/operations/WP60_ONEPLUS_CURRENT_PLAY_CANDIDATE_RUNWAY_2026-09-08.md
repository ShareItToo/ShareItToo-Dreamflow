# WP60 — OnePlus current Play candidate runway

Status: **TECHNICALLY COMPLETE LOCALLY AND ON GITHUB; PHYSICAL ONEPLUS RESULT
NOT RUN**.

## Decision and exact candidate

WP59 made the Pixel-verified candidate available on Google Play Internal. The
highest-value next evidence is therefore a data-preserving second-device check
of that same candidate rather than another Android rebuild or broad hardening
package. Historical RW20 files remain immutable snapshots for build
`2026082601`; WP60 adds a separate current-candidate binding instead of
rewriting those results.

The new fail-closed manifest binds:

- application `com.shareittoo.app`;
- version `1.0.0+2026090711`;
- artifact source `c819c5f4445d0b998b2ee319e64f8c95cfb01eda`;
- AAB SHA-256
  `a2e72a5afd09e44a20c82d60236e63143d963f7a3ba6ac6e95389e87ce1e3681`;
- Staging API `https://staging.shareittoo.com/api/v1`;
- Google Play Internal release `1.0.0-internal-2026090711`, active and
  available to existing internal testers;
- the last proven OnePlus Play build `2026090204` as the only accepted previous
  build before an update.

The validator reads the current rollover candidate, WP59 Play evidence and the
previous sanitized OnePlus evidence directly. It refuses mismatched candidate,
release, SDK, artifact, signing, Staging, payment, listing-AI, track, prior
version, transport or device-safety facts.

## Safe device runner

`tool/run_wp60_oneplus_current_candidate.mjs` provides three explicit modes:

1. `inspect` performs read-only package, Play-installer, split-delivery,
   continuity-marker, process and non-identifying device inspection. It
   distinguishes exactly the previous Play build from the current candidate.
2. `verify` requires the exact current version, SDK metadata, Google Play
   installer and split package layout.
3. `lifecycle` reuses the bounded cold/warm/background/resume proof and checks
   that installation and app-data identity remain unchanged.

Both USB ADB and Wireless ADB are accepted because the owner's OnePlus is
attached to the MacBook by USB. The historical wireless-only default remains
unchanged for older RW20 callers. Every WP60 mode requires the exact Internal
release and personal-device non-destructive confirmations before its first ADB
call.

The runner never installs, updates, sideloads, uninstalls or downgrades the
application; never clears app data; never enters a passcode; never changes a
network, permission or global setting; and never captures account content,
screenshots, UI hierarchy or logcat. If build `2026090204` is present, the only
permitted update mechanism is the owner's existing Google Play Internal path.

## Current verification and availability

The manifest validator and 18 focused tests pass. They cover exact source
binding, destructive-boundary drift, authorization-before-ADB, USB transport,
previous/current/unknown version classification, Play-installer enforcement,
continuity markers, sanitized output and the existing lifecycle runner.

The complete local candidate-rollover regression passes at standard repository
settings through all 2,470 tool tests, the 909-test Flutter suite with 33
declared skips, the mandatory randomized security profiles, analyzer with zero
issues, Web/Wasm, loopback smoke and Android debug build at minSdk 24. No
timing, cache, retry or parallelism accommodation was introduced.

The MacBook Codex host is visible online, but direct authenticated shell access
from this Mac mini is not established. That is not made a permanent WP60
dependency: the checked-in runner can execute locally in a MacBook Codex task.
The current-host read-only selection check rejected the attached non-OnePlus
device before querying any application package. No physical OnePlus command
has run in WP60, so installed version, Play propagation, lifecycle and
functional behavior remain unclaimed.

Exact implementation HEAD
`d2c2fe28e220fd591efe876f33130addd6a98a2c` passes GitHub Regression
`34259777038`: Flutter job `102174535079`, Backend `102174535270`, PostgreSQL
`102174535286` and clean-checkout reproducibility `102174535391`. CodeQL run
`34259776885`, job `102174532980`, also succeeds. The post-run branch readback
found three older open CodeQL alerts in diagnostic tooling; none points to a
WP60 file. They are not hidden by the green workflow conclusion and are
escalated as the separate, higher-priority WP61 security closure before any
pilot-readiness claim.

## Boundaries, rollback and next action

No Android binary, Staging runtime, Google Play release, tester list, Store
metadata, Data Safety answer, Firebase/provider/payment configuration,
Production/Open/Closed track, Cloud/VPS/DNS state, PR or device state changed.
Rollback is deletion of the new WP60-only tooling and evidence; historical
evidence and the active Internal release remain untouched.

After WP61 closes the three branch alerts, execute `inspect` on the
MacBook-connected OnePlus. If `2026090204` is reported, expose only the existing
Internal Play update to the owner. Do not uninstall or sideload. Once Play
supplies `2026090711`, run `verify`, then the bounded lifecycle proof, and record
the sanitized result in a distinct physical-evidence commit.

Machine-readable evidence:
`docs/evidence/release-readiness/wp60-oneplus-current-play-candidate-runway-20260908.json`.
