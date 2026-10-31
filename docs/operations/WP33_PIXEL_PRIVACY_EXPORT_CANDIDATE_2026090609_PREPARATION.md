# WP33 Pixel privacy-export candidate 2026090609 preparation

Status: **PREPARED FOR SOURCE FREEZE**. Exact clean regression, signed archive,
Pixel replacement and the physical export result remain open until this
reservation is committed, pushed and independently verified.

## Why a new candidate is required

Physical inspection of the Android `share_plus` 12.0.1 path established that
the previous in-memory export path materialized raw export bytes in app-private
temporary storage and left the native share copy to later cache management.
Source HEAD `f48ed611e851a7ea208bc2b0b13f5cd2ee6225e5` replaces that behavior with an
exact controlled source plus cold-start/resume cleanup for exact privacy-export
copies. Candidate `2026090608` predates the correction, so it cannot support a
truthful WP33 physical closure.

## Provenance and reservation

- Canonical branch: `codex/master-workflow-20260808`.
- Clean synchronized preparation base:
  `f48ed611e851a7ea208bc2b0b13f5cd2ee6225e5`.
- Reserved identity: `1.0.0+2026090609`.
- Package: `com.shareittoo.app`.
- Highest verified owner-private archive and installed Pixel build before
  reservation: `2026090608`.
- No local archive or repository reference for `2026090609` existed before
  reservation. This is a local uniqueness statement, not a Play Console claim.

Only the checked-in version and existing V5.2 client-build fallback advance
from `2026090608` to `2026090609`. Dependent exact-source hashes may be
refreshed mechanically without changing approval, legal, privacy, provider,
retention or live-gate conclusions.

## Required unchanged envelope

- Internal, non-public Staging at `https://staging.shareittoo.com/api/v1`.
- Existing validated Firebase Android Staging input; no Console mutation.
- Canonical ShareItToo upload certificate.
- Google sign-in enabled; Apple and Facebook disabled.
- Closed non-binding `heilbronn_wave0` envelope with technical G3-G5 surfaces.
- Provider hold, no real money, no public registration and no external
  generative-AI runtime.
- Android minSdk 24 and current target/compile SDK; transactional FCM only.

## Required continuation

1. Freeze and push the reservation source, then verify exact clean identity.
2. Run complete local regression and independent exact-head clean
   reproducibility through the maintained build profile.
3. Build signed AAB and APK through the normal release lifecycle and retain
   them only in the owner-private archive.
4. Verify archive contents, hashes, signature, package/version, Firebase
   Staging, privacy surface and provider-hold envelope.
5. Apply only a strictly newer replace update from `2026090608` to
   `2026090609` on the connected Pixel, preserving application data.
6. Run the bounded privacy-export diagnostic only after the endpoint's normal
   three-per-hour window has reset. Prove a safe rejection and one correct
   payload without recording raw export, identity, credentials or device ID.
7. Remove the temporary receiver and its raw output, restore the owner session,
   verify the protected vault is unchanged, and bind sanitized evidence to the
   exact candidate HEAD.

WP33 does not upload to Google Play, alter tester lists or tracks, deploy a
backend, mutate Firebase Console, invoke payment/KYC, enable Production or
public registration, change Cloud/VPS/DNS, contact OnePlus or merge PR #7.
