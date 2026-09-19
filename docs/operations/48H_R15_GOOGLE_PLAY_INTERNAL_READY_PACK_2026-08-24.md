# 48H R15 Google Play Internal Testing ready pack

Status: **PREPARED — NO AAB BUILT — NO PLAY CHANGE — NO PILOT ACTIVATION**

This pack turns the N10 plan and R14 tester materials into one exact later
owner sequence. It neither grants a gate nor accesses Google Play Console.
The machine-readable candidate truth is
`store/google-play/r15-stage-a-feature-flag-matrix.json`.

## Three independent gates

| Gate | What it may authorize later | What it never authorizes |
| --- | --- | --- |
| `BUILD_READY` | One local, clean-source, Internal/Staging Android candidate build with canonical signing and owner-only archive | Play upload, tester change, external provider, human data or pilot activity |
| `PLAY_UPLOAD_APPROVED` | One exact SHA-256-bound AAB upload to Google Play **Internal testing** after owner login | Release activation, opt-in sharing, tester enrollment, human testing, Closed/Open/Production track |
| `HUMAN_PILOT_ACTIVATED` | The exact owner-approved three-adult `heilbronn_wave0` flow after Play install and every R14 gate is green | Public signup, real money, broader testers, Production, public Store release or provider billing |

`GOOGLE_PLAY_INTERNAL_RELEASE_GO` remains a separate owner action between
upload and human activation. A successful build, upload or Internal release is
not evidence for either later gate.

Current state: all three gates are **not granted**.

## Exact candidate build sequence

1. Owner reads the highest version code already accepted by Google Play. Use
   reserved `2026082401` only if it is still unused and higher; otherwise pick
   a new higher ten-digit code. Never relabel old bytes.
2. On PR #7, set `pubspec.yaml` to the chosen code and create the R16
   pilot-freeze commit. The exact full commit must be recorded before build.
3. Require a clean worktree, matching upstream, Draft PR and no unpushed
   candidate changes.
4. Run the complete deterministic technical regression at that commit.
5. Run the same build path in preflight-only mode with these fixed controls:
   Internal channel, Staging API, Android Firebase required, canonical signing
   required, Blue Ocean listing assistant enabled, no Store-submission mode.
6. Stop unless the preflight reports pass without showing values or creating
   artifacts and the owner grants `BUILD_READY` for that exact commit/code.
7. Run `scripts/build_android_release_candidate.sh` once with the identical
   controls and without `SIT_BUILD_PREFLIGHT_ONLY`. No automatic retry is
   allowed.
8. The builder must verify AAB/APK signatures, package/version/commit,
   permissions/privacy, the enabled Blue Ocean build flag and the Staging
   origin before creating the non-overwriting owner-only archive.
9. Read the sanitized archive manifest and independently recompute SHA-256 for
   the exact AAB. Bind commit, version, code, certificate relationship and hash
   in the candidate evidence. A mismatch destroys readiness; it does not
   permit another label.
10. Re-run Android permission/privacy/product-truth and exact-candidate checks
    against those bytes. Only then may Walid decide `PLAY_UPLOAD_APPROVED`.

The prepared preflight command uses the same script but sets
`SIT_BUILD_PREFLIGHT_ONLY=1`, `SIT_REQUIRE_CANONICAL_SIGNING=1`,
`SIT_REQUIRE_FIREBASE=1`, `SIT_BLUE_OCEAN_LISTING_ASSISTANT=1`,
`SIT_RELEASE_CHANNEL=internal`,
`SIT_API_BASE_URL=https://staging.shareittoo.com/api/v1` and
`SIT_ALLOW_CANDIDATE_ROLLOVER=1`. The build command differs only by removing
preflight-only mode after `BUILD_READY`.

## Signing and AAB hash binding

- `android/key.properties` and the keystore must remain owner-only, ignored,
  outside Git and never printed. `tool/validate_android_signing_config.mjs
  --require-canonical` reports only pass/fail.
- Android Firebase client configuration is derived only in process and is not
  copied into repository evidence. Analytics remains absent/off.
- The archive directory is non-overwriting and owner-only. Repository evidence
  stores hashes and public build identity only, never paths or credentials.
- Upload only the archived AAB whose recomputed SHA-256 equals the manifest.
  Do not use an email attachment, Downloads copy or similarly named file.

## Internal Testing owner checklist

1. Owner logs in with passkey/2FA; no credential enters chat, Git or logs.
2. Open package `com.shareittoo.app`, **Internal testing** only.
3. Create a draft release and select the exact hash-bound AAB.
4. Stop on any unexplained signing, permission, SDK, policy or version warning.
5. Paste the prepared German notes from
   `store/google-play/de-DE/blue_ocean_internal_release_notes.txt`.
6. Recheck version, code, AAB hash record and release name; save draft.
7. Upload requires `PLAY_UPLOAD_APPROVED`; activation requires the later
   `GOOGLE_PLAY_INTERNAL_RELEASE_GO`.
8. Never switch to Closed, Open or Production and never send a public release
   for review under this pack.

## Tester opt-in and data-preserving update

- Add only the three private adult Google accounts outside Git after the
  Internal release gate. Store no email or opt-in URL in repository evidence.
- Share the opt-in path privately. The tester follows
  `docs/templates/BLUE_OCEAN_INTERNAL_TESTER_INSTRUCTIONS.md`.
- On Pixel, join while signed into the intended Google account and install or
  update from Play without uninstalling or clearing data.
- Before a flow, verify Play installer, `com.shareittoo.app`, exact version/code
  and canonical signing relationship. Verify that existing app data remains
  nonzero; a downgrade, wrong installer, signature mismatch or empty identity
  is a stop.
- Opt-in/install success still does not grant `HUMAN_PILOT_ACTIVATED`.

## Exact Stage-A feature truth

The R15 candidate may build V5.2 single-item/G2 core plus the Blue Ocean
assistant for Internal Staging. External Listing AI remains disabled, so only
the honest manual fallback is available until a separate provider gate.
Payment, delivery, telemetry, FCM, support evidence upload, public signup and
public release remain off.

G3 booking groups, G4 technical Planner and both G5 technical UIs are currently
hard-disabled in release mode. They must be recorded `not-run`, not silently
claimed as covered. This does not block a reduced Blue Ocean `BUILD_READY`, but
it blocks `HUMAN_PILOT_ACTIVATED` for the full N9 G3/G4/G5 envelope until a
separate legal/internal-release decision and exact candidate proof exist.

## Privacy copy checklist and feedback route

- Show the Stage-A non-binding/no-money notice before any task.
- Show the exact image-analysis disclosure before explicit user initiation;
  the manual fallback must not imply an external call.
- Keep faces, documents, addresses, location metadata, credentials and
  sensitive backgrounds out of selected photos.
- Confirm export, erasure and retention behavior for the exact candidate before
  human activation. Removing tester access is not an erasure action.
- Feedback travels only through the private owner-supplied route and the blank
  structured template. Git may receive reviewed anonymous aggregates only;
  never names, emails, links, raw photos, model output or raw narratives.

## Rollback, tester removal and pilot shutdown

Before upload, stop and retain only sanitized failure evidence. After a draft
upload, leave it inactive until the owner safely discards/replaces it. After an
Internal release, Play version codes prevent pretending an old lower build is
a rollback: create a higher canonical replacement with Blue Ocean off, verify
it, and update in place without clearing participant data.

For shutdown: stop new tasks, disable the test backend/provider route through a
separately approved non-production change, publish/install the verified
higher-version off-candidate if needed, pause private invitations, and have the
owner remove the tester list/opt-in access in Console. Removal does not delete
already installed binaries or human data. Preserve minimized incident/audit
evidence and process access/export/erasure/retention separately before account
or app deletion. Resume only under a new exact candidate and all three gates.

No step in this document performs a Console, Firebase, Cloud, Production,
Payment, provider, tester or device mutation.
