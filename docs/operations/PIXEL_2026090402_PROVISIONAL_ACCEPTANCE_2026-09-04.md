# Pixel 2026090402 — provisional Staging acceptance

Status: **UPDATE, INITIAL DEVICE SMOKE AND FOUR BACKGROUND PERSISTENCE CHECKS PASS / GITHUB DEFERRED**.

## Current owner direction and limits

On 2026-09-04 Walid explicitly directed continuation while postponing GitHub.
This allows the already locally verified signed candidate to be used for
provisional Pixel-only Staging work. It does not turn the failed exact GitHub
Regression into a pass, waive its final acceptance requirement, authorize a
public/Store release, or remove provider/legal/owner boundaries. No further
GitHub auth request, push attempt or CI retry is part of this provisional lane.
OnePlus remains untouched. The complete encompassing Goal is still incomplete.

Historical pre-install holds and unsuccessful CI attempts in
`WP02_PIXEL_CANDIDATE_2026090402_HANDOVER.md` retain their original time binding.
The latest owner direction changes the ordering of device testing, not those
results or the identity of the frozen artifact.

## Exact identity and safe update

- Source: `bfd3e9e4422a6a6e6bf3c09bd825c6a089909d04`.
- Orchestrating worktree HEAD: `d2d86dd928cd823dbadfb781e4ccd94341e27e69`,
  branch `codex/master-workflow-20260808`, clean before installation.
- The retained public-source proof checkout is clean at exact artifact source.
  Ancestry and no drift in `lib`, `android`, `assets`, `pubspec.yaml` or
  `pubspec.lock` between that source and the orchestrating checkout were checked.
- Package `com.shareittoo.app`, version `1.0.0+2026090402`, Internal/Staging,
  `https://staging.shareittoo.com/api/v1`; original protected Firebase inputs.
- APK SHA-256: `77fa3f881ff5a1f91c9995373ded4e3bd270f9ae6c787446c36e5f07b487211b`.
- Certificate SHA-256: `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The read-only preflight at 08:29 UTC passed on the single authorized,
already-unlocked Pixel 7 Pro (Android17/API37). Fifteen unchanged archive/update
regressions also passed. The normal data-preserving update then completed from
`2026090307` to `2026090402`: candidate and installed signatures match, the
installed APK bytes have the exact expected digest, first-install timestamp
and credential-encrypted data-directory identity are preserved, and the
updated application successfully starts in the foreground. No uninstall,
reset, downgrade, new signing, APK rebuild or archive overwrite occurred.

Private sanitized update-proof SHA-256:
`89a6b86c792af5f7db39913fe38171fc804a52878c49483475be5422789c4164`.

## Device checks completed on the installed candidate

| Check | Result and limits |
| --- | --- |
| Existing authenticated profile after cold starts | PASS: authenticated actions reappear through the existing bounded diagnostic. No new login, registration or identity-value extraction; not new A-to-B isolation evidence. |
| Five main destinations | PASS: Entdecken, Mietkorb, Buchungen, Nachrichten and Mein SIT expose their expected authenticated surfaces. No cart, listing, booking or message mutation inferred. |
| Process termination and restart | PASS: process disappears after force-stop and runs after a launcher event; installed APK, original install identity and data-directory identity remain unchanged. No push-delivery pass inferred. |

Sanitized private evidence SHA-256 values:

- Authenticated cold start: `68cd4c1c7404e3acf8551b29ff4daf29010d7882864bedc998a3f158cdfd2a30`.
- Main navigation: `4db4187e0a61dab58b64d4db9751615ed40ece909d67f9e0fdf49d549a64f15e`.
- Process restart: `5dcb51857b2efe3aed2a685ec2505048c76a6960f6fad4ad803a00dd5d01b41c`.

The unchanged authenticated-session, navigation and restart diagnostic tests
also pass: 20 tests, zero failures. This is focused diagnostic verification,
not another complete application regression or external CI result.

## Four background selections: completed device observations

Each option was selected through the actual UI, followed by force-stop,
launcher restart, navigation back to the settings screen and visual review of
the selected card. All four retain the correct blue border/check after restart.

| Selection | Selection persistence | Private post-restart PNG SHA-256 |
| --- | --- | --- |
| Dark 2 | PASS | `8496bc45e83c8f780523c9b0edd7c3d74a0224604ace28f0d64330ae07c18e7b` |
| Light 1 | PASS | `ed1d26f89b27f9a63b3bd723cb1aa491f622972b69a7f425c1960dc73e27ab70` |
| Light 2 | PASS | `e0a3ab4d7a784db4ceaf89af13cd5e2d7717f3c1d3f9f3a0fe42e4aeba181872` |
| Dark 1 | PASS | `edc84fb12f14c78c941b14fc3604c6016f27a17fdfe2ecfefcc834fc5c755efb` |

The initial screen showed no explicit selected-card mark. Final preference is
explicit **Dark 1**, matching the initial dark appearance but not restoring an
unset/automatic choice. The current UI exposes no reset-to-system action; no
private preference storage was edited. Android system theme was not changed.

Concrete presentation gaps remain OPEN: white preview labels are difficult to
read against the light images, and explanatory text is weak against the light
page background. This is a visual finding, not a measured contrast ratio or
accessibility pass. Source `lib/screens/background_settings_screen.dart`
hardcodes those white labels; its card has no explicit selected semantics.
No TalkBack result is inferred from visual selection. Any correction must
receive new tests and a successor candidate; the frozen APK stays immutable.

The private execution wrapper is provisional orchestration, not a replacement
for the older candidate-bound N28 validator. No old source guard was weakened.
Technical debt before final closure: promote the four-choice selection/restore
checks into a deterministic, tested current-candidate diagnostic and verify
the affected UI on the eventual final candidate. Private screenshots remain
outside Git; a minimized execution-only summary is in
`docs/evidence/release-readiness/pixel-2026090402-provisional-acceptance-20260904.json`.

At 08:38:48.765 UTC, a credential-free Staging readiness GET returned 200/ok,
deployed `5d88295fa7fe313b83936783a0582a505b2ba486`, database/mail ok, memory
payment/live=false and zero pending/dead notifications. This is health-only
evidence, not fresh AI/provider/push acceptance or a rollout.

## Remaining acceptance

Continue the actual current-candidate theme, disposable-account support/privacy,
registration/auth/isolation, listing/two-role and FCM/offline tests. Keep
the complete matrix in `SIT_STAGING_ACCEPTANCE_CHECKPOINT_2026-09-04.md`.
No actual Stripe sandbox, external image AI, binding V5.2 transaction, full
Pixel closure, OnePlus or final release acceptance is claimed here. GitHub
returns to the execution order when the owner is ready; until then keep the
local commits and exact CI requirement intact without repeating auth attempts.
