# WP164 — Current candidate Pixel update

Status: **COMPLETE — exact signed Staging candidate installed by a
data-preserving update.**

The signed Internal/Staging candidate `com.shareittoo.app` `1.0.0+2026091601`
was installed on the connected Pixel with `adb install -r`. The update used
the owner-only APK bound to source `707d95e93c463ad4bbb0adbf382526d8869992c5`;
its SHA-256 is
`32e2e28008e19e11d1fc00497c3f7f08f60eb42c48c0dea93878f8ae6670e464` and its
approved upload certificate is
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The previous installed version was `2026091312`. The package readback now
reports `2026091601`, minSdk 24, targetSdk 36 and signing version 2. The APK
was pulled back from the device and matched the candidate byte-for-byte.
`firstInstallTime` stayed `2026-08-17 08:45:28` and the Android credential-data
inode stayed `267655`; no uninstall, reset or downgrade occurred. A cold launch
returned focus to `MainActivity` with the device unlocked.

No Store, backend, Firebase Console, payment, production, OnePlus or real-money
state changed. The machine-readable evidence is
`docs/evidence/release-readiness/wp164-current-candidate-pixel-update-20260916.json`.

The next bounded step is a read-only reconciliation of the currently served
Staging runtime and its readiness/FCM prerequisites. The live readiness endpoint
currently reports HTTP 503 solely because one noncritical Support follow-up is
overdue; database, mail, notification and payment checks are healthy. This is
an operational blocker to claiming a fully ready two-role run, not evidence of
a client install failure.
