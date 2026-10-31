# SIT pilot function gap matrix — 2026-10-26

## Scope and source boundary

Bounded source package on `codex/master-workflow-20260808`, inspected base
`b802fa6519a0185a49c795ba51326196607fab59`. Authority:
the task-supplied execution capsule
`docs/operations/SIT_PILOT_EXECUTION_CAPSULE_2026-10-25.md`, current source
and repository guidance. The separately maintained capsule is an input to this
package; its runtime observations are not re-attested by this commit. Capsule runtime observations are retained evidence;
this package did not refresh them. The older capability matrix and phase
capsule do not override the execution capsule's newer runtime observations.

Exactly one source gap is selected: asynchronous condition-photo selection in
the existing handover/return stepper. The other rows distinguish missing
runtime evidence from demonstrated implementation failures. No browser, device,
account, provider, database, Docker or deployment action is part of this proof.

## Remaining gap matrix

| Priority / capability | Current evidence | Remaining gap | Locally solvable in this package? |
| --- | --- | --- | --- |
| **P1: handover/return photo selection lifecycle** | Both real booking routes call `ReturnHandoverStepperSheet.push` in `lib/screens/booking_detail_screen.dart`. In the inspected base, gallery results call `setState` after an unguarded await; camera results read bytes, mutate the draft and start optional local storage without rechecking the originating session. A synthetic delayed gallery result reproduces `setState() called after dispose()`. | **Selected and corrected:** reject late selection/bytes after disposal, session or epoch change, or step change; prevent concurrent selections; surface gallery failures and preserve the ability to select again. | **Yes — source PASS**, with the local tests below. Live permission/camera/browser behavior remains separate. |
| Profile save and global/public avatar persistence | [Fresh served-Web UI readback](SIT_STAGING_PROFILE_AVATAR_READBACK_2026-10-26.md): existing account login, non-personal test-logo selection, one save, navigation, full reload and public-profile avatar all observed on exact served `20657fc1…` at approximately 07:57–07:59 UTC. | **Closed for this UI persistence flow.** Raw `/auth/me`/upload/PATCH responses were not separately captured; this is not native or complete provider evidence. No source defect reproduced. | Completed by the subsequent explicitly scoped browser package; no code change required. |
| Two-role served-Web lifecycle, handover and return | Capsule records non-binding request/acceptance/chat/in-app notifications and a complete isolated loopback lifecycle. `test/return_handover_challenge_test.dart` proves source challenge, 3/4-photo and stale-owner boundaries. | Bind current two-role journey to the actual served Web UI; real photo/QR permission evidence is distinct from synthetic slot or API proof. | No: runtime journey and its authorized fixture scope are required. |
| Google Web login | Capsule records enabled configuration and current served button, but no new login click; real E2E remains older evidence. `lib/services/web_google_auth.dart` and `test/web_google_auth_test.dart` contain the owner/configuration contracts. | Fresh real login/cancel/logout and session readback on the exact served build. | No: requires the provider/account flow. |
| Apple and Facebook | Capsule keeps both disabled. `lib/services/apple_web_v2_client.dart`, `lib/services/web_facebook_auth.dart` and their tests contain separately gated source paths. | Real provider credentials, callback/origin/account readbacks, then separately authorized E2E. | No: changing source flags cannot supply provider evidence. |
| External Web Listing-AI | Capsule records no key mount/activation receipt and retains the manual editor. `lib/screens/create_listing_screen.dart` explicitly preserves photos/inputs on AI failure and offers manual completion; the lifetime/smoke accounting correction is already recorded in the capsule. | Protected credential/runtime/independent activation decision and provider proof, or the explicitly functional manual editor boundary. | No: no provider action or activation is authorized here; no new source defect established. |
| Native camera/scanner, push, restart and update | Capsule keeps exact native/Play gates open. `docs/operations/SIT_NOTIFICATIONS_PUSH_PILOT_GAP_MAP_2026-10-03.md` distinguishes authenticated inbox from native push; source coverage cannot substitute for physical delivery. | Exact artifact/device permission, lifecycle, scanner, push and update acceptance. | No: physical/native or provider proof is required. |
| Current API successor | Capsule binds prepared immutable successor and read-only preflight while the prior API remains served. | Narrow rehearsal decision, isolated rehearsal and separate promotion review. | No: this source package excludes deployment, Docker and database changes. |

## Implemented correction

`lib/widgets/return_handover_stepper_sheet.dart` retains the route's original
session owner before selection. Picker invocation stays inside the user gesture;
no new awaited prerequisite is inserted before opening a Web picker. After
selection, and again after camera bytes are read, the helper checks mounted
state, current step/attempt and exact session/epoch before using media. A
selection remains single-flight until its own `finally`; no other path clears
that flag, so an old completion cannot clear a newer active selection.

Both success and failure feedback are scoped to the current selection. Gallery
failure now yields visible feedback instead of an uncaught asynchronous error.
The existing optional local-save call remains reachable for a current camera
result; rejected late results never enter that call. This does not claim a new
transactional guarantee for session changes after an already-started local save.

Only the current privacy source hash for the stepper is refreshed. No policy,
approval, retention, provider, fee or contract field changes.

## Guardrail matrix

| Rule | Status / evidence |
| --- | --- |
| One authentic publication photo | Not affected: listing publication is unchanged. |
| Four presenter photos per handover/return; counterphoto for deviation | Pass for unchanged source boundary: existing challenge suite checks 3 rejected / 4 accepted for both segments. Selection fixtures are explicitly synthetic, never authenticity evidence. |
| QR standard and exactly six-digit fallback | Pass for unchanged source boundary: challenge suite retains QR/phase/role/booking and invalid-code rejection. No protocol changes. |
| No paid delivery, shipping, express, deposit, insurance or vehicles | Not affected: no domain, pricing, category or payment change. |
| 24-hour refund boundary, 10% contribution, payment at acceptance, payout after return | Not affected: no financial calculation or transition change. |

## Decisive verification

- Red reproduction on the inspected implementation: delayed gallery completion
  after disposal throws `setState() called after dispose()` from
  `_pickPhotosGallery`.
- `flutter test --no-pub test/return_handover_photo_lifecycle_test.dart test/return_handover_challenge_test.dart`:
  41 passed, including 27 photo-lifecycle cases. Both phases and picker sources
  cover valid selection, cancellation, disposal, foreign session, same-principal
  new epoch and failure. Camera-byte tests additionally cover disposal,
  foreign session and leave/return to a step.
- The mocked `gal` transport is reached by the positive camera selection and
  receives zero calls for every rejected late result; no local artifact registry
  is created. All tapped controls must be hit-testable and missed taps are fatal.
- Targeted Flutter analysis: zero issues. Privacy and retention validators pass;
  their draft/open approval states remain unchanged.
- Current consumer closure with `--base HEAD --run-consumers`: 452 passed,
  zero skipped/failed; 106 migrations. `git diff --check` passes.

These are local synthetic source checks, not full repository regression,
exact-commit CI, browser permission, live persistence, release or pilot approval.
The next package is Sol's focused review, then the separately authorized current
served-Web lifecycle readback. External gates in the matrix remain open.
