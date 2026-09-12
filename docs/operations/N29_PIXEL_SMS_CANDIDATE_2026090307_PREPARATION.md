# N29 Pixel SMS candidate 2026090307 — preparation

Original preparation status: **PREPARATION / NOT BUILT / NOT INSTALLED**.
This historical preparation record is superseded by
`N29_PIXEL_CANDIDATE_2026090307_UPDATE_HANDOVER.md`: exact source
`77d5103cb3c89af3ca5187a6c2642e28fa0703dd` passed GitHub Regression/clean
checkout and CodeQL, and the verified signed candidate is now installed on
Pixel. The original preparation observations below retain their original
scope and timing. Real SMS completion still remains OPEN.

## Candidate contract

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Includes SMS correction `a2e31b4ae5d087174775ad40be5b573dc3c73e28`.
- Intended package/version: `com.shareittoo.app`, `1.0.0+2026090307`.
- Build source: must be the clean final preparation commit, recorded by the
  existing signed-release builder and private artifact manifest. Not yet built.
- API: `https://staging.shareittoo.com/api/v1`.
- Firebase: existing protected Android `shareittoo-staging` configuration;
  configured preflight passed. No configuration or provider-console mutation.
- Signing: existing canonical certificate
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`;
  local signing preflight passed. Actual new-binary signature remains pending.
- Google enabled; Apple/Facebook remain disabled in this bounded replacement.
  Their remaining supported paths belong to WP02, not this artifact correction.
- Internal-channel, non-public Staging envelope `heilbronn_wave0`, non-binding
  Pilot-Simulation; existing technical listing/group/planner surfaces retained.
- No live PSP, real money, public release, Store upload or tester-list change.

Version uniqueness was checked against all local Git refs' version history and
the existing private signed-release archive: both maxima were `2026090306`, and
`2026090307` appeared in neither. This is a direct-APK preparation, not a claim
of current Play Console inspection or a Play upload authorization.

Only the pubspec version, matching client-build fallback and dependent hash
bindings change in preparation.
No dependency, legal/privacy semantics, validator rule or provider decision is
changed. A 26-file audit normalizing only the exact version increment and
SHA-256 values found no other semantic difference before this documentation.

## Execution sequence

1. Complete candidate-metadata regression and commit/push normally. Record
   exact GitHub Regression, clean-checkout proof and CodeQL for the final source.
2. Run `scripts/build_android_release_candidate.sh` on that clean HEAD with
   canonical signing, configured Android Firebase, candidate rollover, internal
   channel, Google enabled, Blue Ocean assistant and the closed pilot envelope.
   Do not use the separate `.qa` builder, which disables Firebase/Google/FCM.
3. Verify private archive readback: AAB/APK integrity, package, version, source,
   canonical certificate, Android SDK/permission surface, privacy scan and
   embedded Staging identity. Keep the previous signed archive intact.
4. Only then update the authorized Pixel; no uninstall/data-clear, no OnePlus.
   Verify the installed artifact and restore/protect the existing test owner.
5. Run bounded current-candidate smoke and phone preflight. Request no SMS until
   an owner-assisted code window is available. Never reuse an old code or read
   SMS/notification contents. Record the precise owner action via Maximus if
   needed, then continue independent work under the package queue.
6. Complete physical invalid-code rejection, valid confirmation UI, verified
   cold restart and exact test-phone cleanup. Preserve unknown vs rejected vs
   confirmed-with-local-failure distinctions and principal ownership throughout.

## Current evidence and remaining limits

Release preflight passed for `1.0.0+2026090307`, including configured Android
Firebase and canonical local signing. The first candidate-metadata full gate
correctly detected the client-build fallback still at `2026090306` (2,143 tool
passes, one failure). The fallback was synchronized with pubspec; all five
focused contract-wiring checks pass. The synchronized full gate passed:
2,144 repository tool tests; 662 Flutter passes with five expected skips at
standard parallelism; analyzer zero; profile-specific suites; Web build and
successful Wasm dry run; loopback smoke; Android debug build, minSdk 24 and
permission/exported-component surface checks. The capacity guard passed with
60 KiB generated growth and 2,636,836 KiB free at completion. Local `CI=true`
was used only for metadata-only handoff checks, not a Store or device claim.
No assertion, parallelism setting or release-readiness rule was weakened.
The original SMS correction's CodeQL `33795801476` passed; Regression
`33795801527` was still running at preparation time (Backend and PostgreSQL
fresh/recovery jobs passed). Prior/source-parent results do not replace exact
candidate-source verification.

Installed Pixel candidate remains `1.0.0+2026090306`, source
`9d7e2601dc477cf3ae3d469b65448ce2065375e0`, APK SHA-256
`37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194`.
Its previous delivery/Backend-acceptance/cleanup results remain historical.
No new artifact, installation, new SMS, phone-state mutation or device closure
is claimed by this preparation. WP01 and the overall Staging Goal remain open.
