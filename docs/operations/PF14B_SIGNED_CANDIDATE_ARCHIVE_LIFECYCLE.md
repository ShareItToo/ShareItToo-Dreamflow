# PF14B signed-candidate archive lifecycle

Status: **SIGNED DATA-PRESERVING PHYSICAL REMEDIATION PASS — STORE, MANUAL REVIEW AND STAGE A HOLD / NO-GO**

Observed: 2026-08-23

PF14B's first signed internal Staging build for build `2026082302` completed
the AAB, APK and privacy scan. It then failed closed with `ENOSPC` while
copying the exact artifacts into the owner-only private archive. The incomplete
archive was removed by the existing archival transaction, so no candidate from
that attempt is eligible for installation or evidence.

## Durable correction

The signed Android builder now owns its generated Flutter lifecycle. After the
fixed capacity preflight it performs one cold `flutter clean`, builds and
verifies both artifacts, creates the private archive and only then removes the
generated tree. A fail-closed exit trap performs the same generated cleanup
after any failure without hiding the original failure. The private archive is
outside Flutter's generated tree and is never removed by this lifecycle.

A source contract fixes that ordering and rejects cleanup by `rm`, capacity
environment overrides, sleeps or retries. The shared capacity limits remain
unchanged. Manual cleanup after the failed attempt is incident hygiene only,
not release evidence.

## Android 17 package-metadata compatibility

The first strict Pixel updater invocation stopped before installation because
Android 17 emits the current user's `ceDataInode` on the `User 0:` summary line
rather than on a dedicated line. No package or app data changed. The updater
now asks Android for the active user, scopes both `firstInstallTime` and
`ceDataInode` to that exact user block and rejects another profile's facts.
Fixtures reproduce the Android 17 shape and prove fail-closed cross-user
handling. This changes only diagnostic parsing; the required inode and first
install-time equality remain unchanged.

## Deterministic exit evidence

`TD-RR-021` is closed by one clean candidate commit:

1. the unchanged complete local regression passed 387 Flutter tests plus the
   existing documented skip, Web/Wasm smoke and the Android debug build;
2. exact-head GitHub regression `32644493652` and CodeQL `32644493643` passed
   at `1b3e86e`;
3. that same commit produced the signed internal Staging AAB/APK, passed the
   binary privacy scan, retained its complete four-file owner-only archive and
   ended with 5,495,736 KiB free; and
4. the Pixel update `2026082301 -> 2026082302` preserved both first-install
   time and CE data inode, matched the exact APK bytes and signature, and
   launched in the foreground without uninstall, reset or downgrade.

At 200% font scale the exact installed candidate exposed five distinct,
in-display, enabled and clickable Android Buttons. The smallest target was
96.81dp wide by 70.92dp high, so all five exceeded 48dp in both dimensions.
The diagnostic retained no screenshot or raw hierarchy and restored the prior
font scale exactly to 0.85. The independent post-run check confirmed build
`2026082302`, font scale 0.85 and an unlocked device.

No Store upload, production/provider change, Payment action, public release,
manual TalkBack claim or manual visual-review claim is part of this package.
