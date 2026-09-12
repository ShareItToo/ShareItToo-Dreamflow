# WP46 — current-candidate Android permission lifecycle

Status: **COMPLETE ON THE PHYSICAL PIXEL, LOCALLY AND ON GITHUB**.

## Frozen target

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Technical HEAD: `9f5f7761e0ae01cedf282d9ad7cc4eddc8ceff69`.
- Candidate source: `2fd793bac970866aa94a2940f28d6bbc3e04e377`.
- Candidate: `com.shareittoo.app` `1.0.0+2026090610`, Internal Staging.
- APK SHA-256:
  `07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`.
- Signing-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The installed Pixel 7 Pro remained on the exact candidate. Package version,
first-install identity and application-data inode were equal before and after
the run. No reinstall or data clearing occurred, and no post-candidate mobile
runtime source drift exists.

## Manifest inventory

The installed artifact declares exactly fourteen permissions. Four are active
runtime permissions on Android API 37, grouped into three user decisions:

- camera;
- coarse and fine location;
- notifications.

Legacy read/write storage declarations are bounded to API 32 and API 28 and
are inactive on the tested device. The exact artifact declares no microphone,
contacts, SMS, background-location, broad-media or advertising-ID permission.

## Physical lifecycle result

For camera, location and notifications, the diagnostic applied a denied state,
verified it, restarted the real app and proved the authenticated principal;
then it applied an allowed state, verified it, restarted again and proved the
same authenticated truth. Android's ShareItToo app-permission settings surface
was opened read-only and identified by the application and permission labels.

The run then restored the original grant flags and effective AppOps modes in a
guaranteed cleanup path, performed one final authenticated restart and returned
the app to Explore. The owner-only recovery journal is mode `0600`, reports
`completed-restored` and `recoveryRequired=false`. It remains outside Git and
contains no credential, account identity or raw device identifier.

The first physical attempt reached the complete lifecycle but stopped at the
final restoration assertion because Android can retain an equivalent AppOps
source representation (`default` versus an explicit package line) after a
grant/revoke round trip. Runtime grants and permission flags were already
restored exactly. The diagnostic was corrected to require exact runtime grant
and flag restoration plus the exact effective AppOps mode, rather than a
nondurable internal representation. The final run passed every check. This did
not weaken the effective permission-state requirement.

No photo was captured or selected, no location was read or stored, no message
was sent, and no notification preference, push registration, account, Store,
Production or Backend state was changed.

## Reproducibility and security

- Six focused WP46 tests pass, including the fail-path restoration contract.
- All 2,415 repository tool tests pass.
- The complete local technical regression passes through Backend, Flutter,
  analyzer, Web/Wasm, loopback, PostgreSQL, Android minSdk 24 and capacity.
- GitHub Regression run `34120973447` passes all required jobs at the exact
  technical HEAD, including independent clean-checkout reproducibility.
- GitHub CodeQL run `34120973588` passes at the exact technical HEAD.
- Open code-scanning alerts remain zero.
- PR #7 remains Draft, open, mergeable and unmerged.

## Remaining boundaries

WP46 closes only the consolidated current-candidate Android permission gap.
Exact-candidate SMS still requires a fresh owner-visible OTP. Manual TalkBack
remains blocked by the Pixel runtime. Positive address reveal, current support
staff follow-up, social providers, real external Listing AI, binding V5.2/legal/
payment, Backend deployment parity and Play/OnePlus remain separate gates.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp46-current-candidate-android-permission-lifecycle-20260907.json`.
