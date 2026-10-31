# RW22 Pixel public-profile cache resilience

Status: **CLOSED / PIXEL VERIFIED / STAGING HEALTHY** on 02.09.2026.

## Trigger and cause

The first Pixel-only installation of Stage-A candidate `2026090205` loaded the
public catalog, but the owner block on a listing stayed at `Laden ...`. Device
logs identified a strict local-cache decode failure for a legacy public user
record. The listing overlay called the complete local account-profile reader,
so one malformed cached profile prevented the independent authoritative public
profile request from running.

Strict decoding is intentional account and privacy protection. RW22 therefore
does not sanitize, delete, migrate or rewrite the malformed bytes. It confines
the exception handling to `DataService.getUserById`: a malformed public cache
entry is unavailable for that read, after which the Staging public-profile API
is the source of truth. Direct `getUsers()` access remains fail-closed.

## Permanent corrections

- The listing overlay uses the isolated public-profile lookup instead of
  loading the complete local account cache.
- A focused test proves that malformed legacy bytes remain byte-for-byte
  unchanged and that direct account-profile access still throws.
- The deployment helper now adds an ephemeral Compose override that names the
  exact inspected registry image. This removes the mismatch between a pulled
  GHCR image and the historical local Compose image name.
- The deployment rollback test permanently asserts the exact target image and
  retains the automatic previous-image recovery proof.

## Exact candidate and verification

- Artifact source and implementation commit:
  `a64586497516bfeac2d2a9eee4b76e31b8bc9948`.
- Android candidate: `com.shareittoo.app`, `1.0.0+2026090206`, Internal and
  Staging only, `minSdk 24`, `targetSdk 36`.
- AAB SHA-256:
  `e114b319c0e6167003bf1e12c047660c9accad1d45edc22b2b4ec7df64a798f5`.
- APK SHA-256:
  `d3cf66a8935c80b79e7e4365f7a1886cad819d16deece09907f4b795a694ccb5`.
- Upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Archive structure, package/version/SDK identity, signing, Firebase Android
  configuration and binary privacy scan passed. No Store upload occurred.
- Complete local regression passed after an initial fail-fast caused solely by
  insufficient disk capacity: 2,027 Node checks, backend/PostgreSQL, 636
  Flutter checks with three documented skips, analyzer zero, Web/Wasm,
  loopback smoke and Android debug with 448 tasks. Only rebuildable Gradle
  transforms and older generated candidates were removed; no permanent timing,
  retry, parallelism, dependency or test-path workaround remains.
- Exact-head GitHub Regression `33665318965` passed all five jobs, including
  clean-checkout reproducibility and API-image publication. Exact-head CodeQL
  `33665286253` passed; open code-scanning alerts were zero.

## Staging and Pixel proof

Staging deployed the exact commit and wrote server evidence at
`/docker/shareittoo/releases/staging-20260902T182538Z-a64586497516.json`.
Direct container readback returned the same full commit and healthy database,
mail queue, notification queue, payment ledger and support watchdog checks.
The Stage-A boundary remained `pilot`, private pilot enabled for Heilbronn,
Mail/Push/Payment transports `memory`, listing AI `mock`, and AI budget zero.

The existing Pixel 7 Pro installation was updated in place from `2026090205`
to exact APK `2026090206`; app data was preserved. Public discovery loaded,
the affected listing opened, and the owner block resolved to the authoritative
Staging owner instead of remaining at `Laden ...`. After a forced process stop
and cold restart, discovery and the same owner block passed again. The expected
caught cache-unavailable diagnostic remained visible, with no uncaught async
error, fatal exception or Flutter error. OnePlus was neither contacted nor
changed.

## Remaining boundaries

- Real personal-email registration is not proven while Staging mail remains in
  memory mode.
- OS push delivery is not proven while Staging push remains in memory mode;
  only in-app notification creation was proven by the preceding sanitized
  two-role Stage-A run.
- Real contracts, reservations, payments, payouts, refunds, handover, return,
  damage and reviews remain outside the non-binding simulation.
- Production, Store, tester lists, Firebase project state, DNS, public
  registration and PR merge were not changed.
- V5.2 remains draft-blocked pending independent professional approval and
  approved snapshots.

The Pixel is left on exact `2026090206` with the verified listing detail open.
The next useful bounded step is an authenticated Pixel-only owner/renter UI
smoke using the existing synthetic Staging accounts; it must remain
non-binding and must not claim real mail or OS push delivery.
