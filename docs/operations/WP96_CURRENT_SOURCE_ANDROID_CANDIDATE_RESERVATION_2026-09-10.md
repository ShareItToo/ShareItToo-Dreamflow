# WP96 — Current-Source Android Candidate Reservation

## Decision

Reserve `com.shareittoo.app` version `1.0.0+2026091001` for the next signed
Internal/Staging Android candidate. The version is strictly greater than the
last physically evidenced Pixel APK, `1.0.0+2026090905`, and is not reused.

## Preconditions verified

- WP95 source commit `e001612212d526bb036aa037e8a1d06e03a88439` has a clean,
  fully pushed worktree before this reservation.
- Its GitHub Regression `34459661430` passed Backend, Flutter, PostgreSQL and
  the independent R10 clean-checkout reproducibility proof.
- Its GitHub CodeQL run `34459661424` passed.
- Local release preflight confirms Android Firebase configuration and the
  canonical signing relationship without disclosing configuration values.

## Version-bound privacy inventory

The reservation changes only the Android build identity and its matching
client-build fallback. The reviewed privacy inventory therefore refreshes the
two corresponding source hashes. Its content, `draft` state,
`approvalAllowed: false` and every external/legal gate are unchanged. The
complete privacy test suite verifies both the refreshed baseline and its
negative cases.

## Boundaries

This reservation does not create an artifact or make any external change. In
particular, it does not deploy Staging, upload to Google Play, alter testers,
install on Pixel or OnePlus, enable a provider, use payment, merge a pull
request, or change production.

The next package must build, verify and privately archive the exact source
commit that contains this reservation. Historical Pixel evidence remains bound
to its own source, version and APK hash.

## Private build result

The exact source commit is now
`f30dfb281e8a0e84bb4c041218b8872fc8a45670`. Its owner-only archive contains
only the AAB, APK, manifest and privacy report. Independent verification
confirms:

- package `com.shareittoo.app`, version `1.0.0+2026091001`;
- Internal channel and `https://staging.shareittoo.com/api/v1`;
- min SDK 24, target SDK 36 and compile SDK 36;
- canonical upload certificate
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`;
- AAB SHA-256
  `d70f5b5f794b663d880b07cc2eeb12671df4b7a4452b653ffc9864f558386dd5`;
- APK SHA-256
  `e62c43ba1a0c49c370b4bbfeaf0c45ea1ba0007093f5a8d192e38e9d669ffe4a`;
- passed binary privacy scan, JAR/APK signature checks and AAB/APK ZIP checks.

The local bundletool executable was unavailable, so no bundletool result is
claimed. This does not bypass any check: the archive script and independent
JAR/APK/ZIP verification above passed. The candidate remains owner-only,
unuploaded, uninstalled and unproven on-device pending exact-head GitHub gates.
