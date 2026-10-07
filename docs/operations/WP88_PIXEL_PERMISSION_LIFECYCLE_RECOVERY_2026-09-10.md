# WP88 — Pixel permission-lifecycle recovery

Status: **PARTIAL; RECOVERY IS PROVEN, THE FULL LIFECYCLE IS NOT ACCEPTED.**

WP88 ran only against the exact installed Pixel candidate
`1.0.0+2026090905` (source `e1c182ea496f013989863155c13bfda649255a7e`).
The private archive, package identity, clean candidate source and exact
four-runtime-permission manifest were all verified before any permission
transition.

The authenticated ShareItToo main navigation did not appear deterministically
after a controlled app restart. The diagnostic therefore cannot truthfully
accept its deny/allow/restart matrix. Its guaranteed cleanup returned camera,
coarse/fine location and notifications to the exact runtime-grant, flag and
effective-AppOps state captured before the run. A direct readback confirms all
four states match. The owner-only recovery journal is mode `0600`, records
`restored-after-failed-run`, requires no recovery, and explicitly marks the
lifecycle result unproven.

The diagnostic was hardened so that a recovered interrupted run is not left
as false mutable work in progress; a failed run that has restored its original
state is recorded as restored-but-unproven rather than passed. Focused tests
cover both outcomes.

No account identity or credential was read, no account/listing/booking/payment
action occurred, and no Production, Play, Firebase, provider, OnePlus or merge
state changed. The Gradle-cache `aapt2` lookup used for this local diagnostic is
recorded as technical debt; it is not a release prerequisite or a substitute
for a reproducible Android SDK toolchain.

The next safe action is one fresh exact-candidate lifecycle only when the
authenticated Pixel navigation is stable and directly observable. It must not
be replaced by a timing workaround or a broad candidate acceptance claim.

Machine-readable evidence:
`docs/evidence/release-readiness/wp88-pixel-permission-lifecycle-recovery-20260910.json`.
