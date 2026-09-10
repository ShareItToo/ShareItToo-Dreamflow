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

## Boundaries

This reservation does not create an artifact or make any external change. In
particular, it does not deploy Staging, upload to Google Play, alter testers,
install on Pixel or OnePlus, enable a provider, use payment, merge a pull
request, or change production.

The next package must build, verify and privately archive the exact source
commit that contains this reservation. Historical Pixel evidence remains bound
to its own source, version and APK hash.
