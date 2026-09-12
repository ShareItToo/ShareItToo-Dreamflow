# WP29 Pixel candidate 2026090607 preparation

Status: **PREPARED FOR FREEZE**. Exact clean regression, signed archive and
physical Pixel acceptance remain open until the subsequent preparation commit
is frozen and verified.

## Why this candidate

WP28 changed the reachable booking issue and V5.2 return-case client path after
the currently installed Pixel candidate was built. The Pixel still contains
`1.0.0+2026090606`; that immutable archive and its physical evidence remain the
rollback. A separately versioned candidate is required before any WP28 device
claim can be made.

## Provenance and reservation

- Canonical branch: `codex/master-workflow-20260808`.
- Preparation base: `96096f4413d5c274764536495865003189ffeea8`.
- Reserved identity: `1.0.0+2026090607`.
- Package: `com.shareittoo.app`.
- Highest verified local signed archive and installed Pixel build before this
  preparation: `2026090606`.
- No local `2026090607` archive or checked-in reference existed before the
  reservation. This is local uniqueness, not a new Google Play upload or track
  assertion.

Only the checked-in version and existing client-build fallback change from
`2026090606` to `2026090607`. Dependent source bindings and validator constants
are refreshed mechanically. Parsed JSON comparison confirms that all affected
JSON leaves are SHA-256 fields; no status, approval, legal conclusion, provider
state, retention rule or live gate changes. All 2,341 repository tool tests
pass after the binding graph converges.

## Required unchanged envelope

- Internal, non-public Staging candidate using
  `https://staging.shareittoo.com/api/v1`.
- Existing validated Firebase Staging input; no Firebase Console mutation.
- Canonical ShareItToo upload certificate.
- Google social sign-in enabled; Apple and Facebook disabled.
- Closed non-binding `heilbronn_wave0` envelope with the existing technical
  G3-G5 surfaces.
- No real money, production provider, public registration or Store action.
- Android minSdk 24 and target/compile SDK 36; transactional FCM only,
  Analytics off and Crashlytics subject to its separate opt-in.

## Required continuation

1. Freeze the preparation commit and verify clean worktree and remote identity.
2. Run the complete technical regression through the maintained Mac-mini
   version-2 build profile with no reduced scope, retry or cache workaround.
3. Build the signed AAB and APK on that exact HEAD through the normal release
   lifecycle and retain them only in the owner-private archive.
4. Independently verify hashes, signature, package/version, bundle structure,
   compiled privacy surface, Firebase Staging and provider-hold envelope.
5. Only after those checks, apply a data-preserving replace update from
   `2026090606` to `2026090607` on the connected Pixel and read the installed
   identity back.

WP29 does not upload to Google Play, change a tester list, activate Production,
deploy backend or Firebase configuration, call payment/KYC, contact OnePlus or
merge PR #7. Physical return-case behavior remains a separate WP30 claim after
the exact candidate is installed.

Machine-readable sanitized preparation evidence:
`docs/evidence/release-readiness/wp29-pixel-candidate-2026090607-preparation.json`.
