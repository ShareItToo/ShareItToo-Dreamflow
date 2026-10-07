# WP02 — read-only provider prerequisites and local cleanup finding

Status: **PREPARATION ONLY / OWNER ACTIONS OPEN / LOCAL DEFECT REPRODUCED**.
Observed on 2026-09-03; this does not create or close a WP02 Goal.
Checkout: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
Branch: `codex/master-workflow-20260808`; inspected clean HEAD
`56d9c027e1741a0f17752882e3691cedb804caef`, remote divergence 0/0.
Installed frozen Pixel candidate remains 2026090307, source
`77d5103cb3c89af3ca5187a6c2642e28fa0703dd`. No mobile source changed.

Exact CI for the inspected evidence HEAD `56d9c027...`: Regression
`33801745149` completed successfully with all four test jobs, including clean
checkout; API image publication skipped. CodeQL `33801745011` also completed
successfully. These checks precede the new documentation below; they do not
override the separately discovered failing local reproduction.

## Read-only configuration results

- Correct ShareItToo Chrome profile and exact `shareittoo-staging` Firebase
  Authentication project were checked. Provider table lists Phone and Google
  enabled. Facebook and Apple are not enabled. Their optional configuration
  forms were inspected, then cancelled without saving or toggling activation.
- Facebook form has no App ID/secret populated; only presence/absence was
  inspected. Apple offers its Services ID / OAuth code-flow configuration.
  Callback is the expected Staging Firebase auth handler. No secret extracted.
- SIT email registration uses its own backend; absence of Firebase Email in
  that table does not invalidate existing SIT email registration evidence.
- Meta reaches developer-account onboarding with terms acceptance outstanding.
  No Continue/accept action was performed. Walid must confirm the appropriate
  account and accept the terms himself before further authorized configuration.
- Apple Developer reaches an unsigned-in account page. Walid must sign in and
  complete any 2FA. Existing membership, Services ID and usable key availability
  remain unverified. No membership purchase, credential retrieval or account
  configuration was performed. iOS/TestFlight work is not added to this scope.
- Exactly the two owner-action Meta/Apple tabs were retained. No production,
  Firebase, provider, Store, payment, billing or public-registration change.

No external social login was attempted by this inspection. Historical N20,
N21 and N23 evidence retains its own candidate binding, not an automatic pass
for every intended sign-in provider on the current candidate.

### Subsequent owner-ready checkpoint

Walid reported that his personal Facebook account is signed in and authorized
necessary account preparation. Readback now reaches Meta's My Apps page with
no apps, rather than the previous developer-onboarding screen. This does not
establish membership/terms acceptance beyond the visible progression. The
Create App introductory dialog was opened, but advancing its creation control
was rejected by the browser safety review pending explicit confirmation of
the exact privileged developer-resource action. That rejection was not bypassed.
Walid was asked specifically whether to create the `ShareItToo Staging` Meta
developer app under his signed-in personal account. No App ID/resource creation
or Firebase provider enablement has been confirmed.

Walid also reported no Apple account for the intended SIT contact mailbox.
Apple sign-in is not a prerequisite for Android email/Google/SMS testing; no
new Apple account, membership purchase or invented identity data was supplied.

## Owner notification correction

The preceding Enter-and-close SMS message was visibly still a Telegram draft
on readback. It was replaced by one combined request for a fresh SMS window,
Meta account/terms confirmation and Apple sign-in, explicitly without buying a
membership. The actual enabled Send button was clicked, then the Telegram tab
was immediately closed. No bot reply was read. Relay and watch delivery remain
unverified; do not send duplicates merely because an owner has not answered.

## Confirmed narrow defect — shared provider cleanup before acquisition

`AuthService.signInWithSocialProvider` in `lib/services/auth_service.dart`
has unconditional Firebase and selected-provider sign-out in `finally`.
`RemoteAuthAttemptTransaction.run` correctly rejects an obsolete UI action or
session epoch before acquiring a provider result, but that rejection still
enters the outer cleanup. The rejected call therefore acquired nothing it owns
and nevertheless invokes the shared Firebase sign-out method.

Two local Flutter cases reproduce this at the inspected HEAD: both expect zero
SDK sign-out calls and observe one, while the returned typed result correctly
remains `principalChanged`. They use real AuthService with a mock SDK delegate,
mock Firebase initialization and a network-forbidding HTTP override. There is
no live login, SMS, token, account, device or backend traffic in the test.

Local reproduction is retained outside Git at the workspace-root file
`sit_wp02_obsolete_social_cleanup_probe_test.dart` in the active Codex workspace.
Probe SHA-256: `9911eccc445ff918a5ad3a7a266c251cb5c3470f29d23cf18513394eca71b5e8`.
Inspected AuthService SHA-256:
`2d4c0e2f1291c4d57d63f83088cbded707c775e96206ab9232a1da192d6a89df`.
Run from the SIT checkout with `flutter test <probe-path>
--dart-define=SIT_BACKEND_ENABLED=true
--dart-define=SIT_API_BASE_URL=http://127.0.0.1:1/api/v1 --reporter expanded`.
Both cases fail the ownership assertion, not compilation/setup. This is a
reproduction, not passing regression or closure evidence.

Proven impact: an obsolete call can invoke shared SDK cleanup without having
acquired that state. Cross-account backend data disclosure and an observed
physical-device failure are NOT established. Mid-flight social/social or
social/phone overlap remains to be tested; phone cleanup currently uses its
own attempt and UID checks, not a shared social/phone SDK ownership guard.

## Bounded correction and completion criteria

Before treating social/provider isolation as complete, ensure cleanup belongs
only to the attempt that acquired the corresponding provider state. Rejected
preflight and disabled-provider paths must not mutate another attempt. Test
overlapping acquisition and cleanup deterministically across social and phone
paths, including errors/cancellation and a later B identity. A guard only at
initial entry is insufficient evidence for in-flight ownership. Preserve
typed results, backend session ownership and targeted remote-session cleanup.

Promote the reproductions into maintained offline regressions with the fix;
update exact source inventories and run the applicable full release checks.
Any mobile fix requires a new separately bound signed candidate and affected
Pixel tests. Do not silently replace frozen 2026090307 or reuse its evidence
as proof of corrected SDK lifecycle behavior. This finding is currently OPEN;
no fix, new build, installation, provider activation or Goal closure is claimed.

Subsequent local correction work is tracked separately in
`WP02_SHARED_PROVIDER_SDK_OWNERSHIP_2026-09-03.md`. This initial reproduction
and the external owner-action status above remain historical observations;
local test progress does not activate any provider or close WP02.
