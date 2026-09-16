# WP54 — Pixel listing-report candidate 2026090711 preparation

Status: **PREPARED FOR SOURCE FREEZE; NOT BUILT OR INSTALLED**.

## Candidate reservation

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Preparation base: `e30cb30349f19e44e16013fc1951693285cbe8ec`.
- Reserved identity: `1.0.0+2026090711`, `com.shareittoo.app`.
- Previous installed Pixel version: `1.0.0+2026090610`.
- API/channel: `https://staging.shareittoo.com/api/v1`, Internal.
- Closed non-binding pilot: `heilbronn_wave0`.

The version code is absent from all local Git refs and private ShareItToo
candidate archives and is strictly higher than the installed Pixel build. This
is a private direct-APK candidate reservation only; it is not a Google Play
version claim and causes no Store action.

## Purpose and boundaries

The candidate carries WP53's exact listing-report runtime closure so the
physical Pixel can verify that `Melden` opens the real flow and submits against
the selected listing ID without cross-account result leakage. It retains the
existing Firebase-configured Staging envelope, canonical upload-signing
relationship, Google authentication and explicitly non-binding pilot surfaces.

No Production, Play track, tester list, payment, provider, Firebase Console,
Cloud/VPS/DNS, public-registration, OnePlus or PR-merge change is authorized or
performed by this preparation. Apple and Facebook remain disabled; Listing AI
and real money remain subject to their existing holds.

## Required closure sequence

1. Validate the version-only source and cryptographic evidence refresh, then
   freeze, commit and push the exact source.
2. Pass the complete profiled regression and exact clean-checkout/GitHub gates.
3. Build the signed APK/AAB once through the maintained Internal Staging build
   path and archive it owner-only without overwriting any older candidate.
4. Recompute artifact hashes and verify package, version, source commit,
   certificate, Firebase/Staging envelope and binary privacy.
5. Replace-update only the connected Pixel without uninstalling or clearing
   application data, then verify installed bytes, certificate and preserved
   data identity.
6. Run a bounded physical exact-listing report acceptance with isolated test
   principals and sanitized evidence, then restore and clean the test state.

Any mismatch stops the affected step without relabelling bytes, weakening a
validator or changing an external gate.
