# Blue Ocean Google Play Internal Testing handoff

Version: `N10-INTERNAL-TESTING-2026-08-24.1`

Status: **PREPARED — NOT BUILT — NOT UPLOADED — NOT ACTIVATED**

This package prepares the future Android Internal Testing handoff for
`heilbronn_wave0`. It does not authorize a signed build, Google Play Console
mutation, tester-list change, invitation, opt-in link, installation or human
pilot. The existing B11 Internal Testing evidence remains historical and must
not be overwritten by this plan.

## Candidate plan

- Application ID: `com.shareittoo.app`
- Version name: `1.0.0`
- Current repository build number: `2026082302`
- Reserved next candidate build number: `2026082401`
- Planned release name: `1.0.0-internal-2026082401`
- Track: Google Play **Internal testing** only
- Source commit: pending the final N10–N13 candidate cut
- AAB SHA-256: pending the later approved local signed build
- Archive: pending the owner-only private local release archive

The number reservation is a plan, not an artifact claim. At candidate cut the
version code must still exceed every version already accepted by Google Play.
The exact source commit, AAB bytes, SHA-256, upload certificate and staging
configuration must be revalidated together. A mismatched or already-used
version code requires a new higher code and a regenerated evidence record; it
never permits relabeling old bytes.

## Release checklist before any Console action

1. Complete N10 through N13 and freeze the exact source commit.
2. Run the complete deterministic technical regression on that commit.
3. Verify release signing and Firebase configuration without printing secrets.
4. Verify the AAB is staging-only, Blue Ocean remains default-off and real
   money, public registration, telemetry and unapproved providers remain off.
5. Build once under an explicit owner build gate, hash immediately and archive
   the normal AAB file with owner-only permissions.
6. Re-run binary permission, privacy, product-truth, accessibility and
   candidate-identity checks against those exact bytes.
7. Record only sanitized hashes, version/build and commit evidence in Git.
8. Stop unless both `GOOGLE_PLAY_INTERNAL_UPLOAD_GO` and an owner-controlled
   Play Console session are present.

## Owner-only Google Play Console sequence

These steps are instructions for a later gated session, not actions performed
by N10:

1. Confirm the package is `com.shareittoo.app` and open only Internal testing.
2. Create a new release and select only the exact hash-bound AAB.
3. Review Play App Signing identity, permission changes, SDK warnings and every
   upload warning; stop on any unexplained difference.
4. Add the private three-person tester list outside Git, evidence and chat.
5. Add the prepared German release notes, save the draft and recheck version
   code, source/AAB binding and all warnings.
6. Activate only after `GOOGLE_PLAY_INTERNAL_RELEASE_GO`. Do not enter Closed,
   Open or Production testing and do not send a public release for review.
7. Share the private opt-in link privately; never store it in Git or publish it.
8. Install from Google Play, verify the Play installer and exact version, then
   record sanitized evidence before any participant flow.

Console login never widens this authority. Any identity, policy, export,
signing or declaration question not already evidenced is an owner gate.

## Tester and feedback packet

- Instructions:
  `docs/templates/BLUE_OCEAN_INTERNAL_TESTER_INSTRUCTIONS.md`
- Structured per-run feedback:
  `docs/templates/BLUE_OCEAN_INTERNAL_TESTING_FEEDBACK.md`
- Aggregate Wave-0 evaluation:
  `docs/templates/blue_ocean_heilbronn_wave0_evaluation_sheet.csv`

Real names, tester emails, Google account identifiers, opt-in links, raw chat,
photos, addresses and credentials stay outside Git. Only the opaque slots
`HW0-A`, `HW0-B` and `HW0-C` may appear in a sanitized operational worksheet.
Repository handover accepts aggregate and reviewed evidence only.

## Rollback and data preservation

For an artifact mismatch, unexplained Console warning or failed pre-install
check: do not upload or activate. Preserve the exact rejected bytes and
sanitized failure evidence, choose a higher version code and create a new
candidate after remediation.

For a failure after Internal activation:

1. pause new invitations and participant work;
2. switch the Blue Ocean flag off through the separately approved safe test
   configuration path;
3. keep the previous verified Internal release available until the replacement
   has been installed and verified; never silently substitute artifacts;
4. preserve candidate hashes, regression results and minimized incident
   evidence; do not rewrite or delete audit history;
5. preserve export, erasure and statutory retention handling for any existing
   human test data;
6. let the owner perform any Console deactivation or release replacement;
7. resume only after a new exact candidate and all failed gates are green.

P0/P1 events from the N9 runbook abort the wave. Rollback never authorizes
production changes, real money, expanded testers, data destruction or public
release.

## Completion boundary

N10 is complete when this plan, instructions, feedback path and deterministic
validator pass and GitHub verifies the exact implementation commit. It remains
preparation only. AAB creation, Console upload, tester enrollment and release
activation are later owner-gated actions.
