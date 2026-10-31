# WP138 — Google sign-in on the current Pixel candidate

Status: **COMPLETE ON THE EXACT SIGNED PIXEL CANDIDATE, LOCALLY AND ON GITHUB**.

## Scope and result

WP138 closes the remaining exact-candidate Google sign-in replay. The prior
candidate had every social provider disabled, so it could not honestly prove
this requirement. A strictly higher signed Internal/Staging candidate was
built with Google enabled and Apple/Facebook disabled. The existing closed
Heilbronn Wave-0 non-binding envelope, on-device Listing AI and provider/live
holds were preserved.

On the physical Pixel 7 Pro, cancelling the Google account chooser left the app
signed out. A terminated-process restart remained Guest. The exact private
Google account then completed first sign-in, survived a terminated-process cold
start and completed a repeat sign-in after logout. All three authenticated UI
observations had the same private fingerprint; no duplicate profile was
observed. Whether the first successful server action created a new account or
linked an existing one is deliberately not asserted. The protected synthetic
owner was restored at the end.

## Exact candidate and update

The candidate is `com.shareittoo.app` `1.0.0+2026091312`, built from
`904c2b734160544aaeb1128cac15191a521739e7`. APK SHA-256 is
`e6d1df85e4e8973765c594b8fe9eb2654c876ee11cafe6d94cfe5c57ff8d7fb9`;
AAB SHA-256 is
`c0c0f27fb14d393b97c46b55bf81f201081dce1d9756f3468bfa442c4bdf9c6e`.
The upload certificate remains the canonical ShareItToo certificate and the
binary privacy scan has no findings.

The Pixel was replace-updated from `2026091311` to `2026091312` without
uninstall or data reset. Package, version, archive hash, installed hash and
certificate match. Android first-install time and credential-encrypted data
inode were preserved.

## Ratchet findings and verification

The first full regression correctly stopped because the `pubspec.yaml` version
bump invalidated its privacy source-inventory hash. After that mechanical
rebind, it correctly found the V5.2 client-build default still bound to
`2026091311`. The default and its dependent privacy hash were rebound to the
new exact candidate. No privacy meaning, V5.2 legal text or acceptance logic
changed, and no timing or toolchain workaround remains.

Five runner contract tests and all three Google-only Flutter profile tests
pass. The complete local technical regression, analyzer with zero issues,
Web/Wasm, loopback smoke, Android minSdk 24 build and signed archive validation
pass. Candidate-source GitHub Regression `34753100834`, including independent
clean checkout, and CodeQL `34753100820` pass; open code-scanning alerts are
zero.

This promotes only `google-signin` from PARTIAL to PASS. The conservative
portfolio is now **20 PASS, 4 PARTIAL and 8 OPEN**.

## Boundaries

No OnePlus, Google Play, Production, Firebase Console, Backend deployment,
payment endpoint, Stripe live mode, money, Apple/Facebook sign-in, public
registration or PR merge was touched. No account identity, credential, token,
raw device identifier or private path entered Git. Machine-readable evidence:
`docs/evidence/release-readiness/wp138-google-signin-current-candidate-pixel-closure-20260913.json`.
