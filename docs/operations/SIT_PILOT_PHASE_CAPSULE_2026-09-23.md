# SIT Pilot Phase Capsule — 2026-09-23

## P4 closure addendum — 2026-09-25

P4 Green Staging promotion/readback is **CLOSED — technical PASS only** for
runtime `c2da8585b1f822e123307d7c763530dc0f598893` and image digest
`sha256:cb7f92814225044a677106d9979b95bc7d019a549ca223228c17bd281a2b97d8`.
The older `2026092205` P3 paragraph below is superseded for this P4 closure by
this exact c2da-bound runtime evidence.
Ops commit is `928861bd4cfd080f90463d0445d59810c3280ad2`; the target digest is
`585422e5880147459571a1ca8bbae7a586987b9c08f745334fdb7d491f8d6b84`.
Schema `97`→`98` and the exact migration/ledger readbacks are recorded in the
closure evidence. Attempts 01 and 02 failed before mutation with verified
cleanup; attempt 03 succeeded. Four seals are stopped, no transient resources
remain, and the payment-safe baseline is `memory`/off/`on_device`. P5 is
active and available; P6 is blocked on successor/source truth. No
provider/payment, legal, pilot or production claim follows.
See `docs/operations/P4_GREEN_STAGING_CLOSURE_2026-09-25.md` and
`docs/evidence/release-readiness/p4-green-staging-closure-20260925.json`.

The currently healthy exact-c2da runtime is `e08a420f…`; FCM is the sole
environment delta (`memory` → `fcm`). Controlled activation evidence is the
private remote artifact
`/docker/shareittoo/evidence/green-fcm-activation-c2da-20260925T214445Z.json`
with SHA-256 `7c2f18da3fdd1c618c7788a3634b518ed51995693dbe4cc0a78ac2613cd26e2e`;
the retained pgdump begins `9b0b8201…`. Schema `98` and ledger `796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196`
are unchanged; payments, mail and identity remain `memory`, with zero real
money, and a stopped rollback seal exists. A transient `502` from an erroneous
preflight deletion was recovered by reconstructing the same c2da Memory
runtime; controlled FCM activation then passed with no data, schema or ledger
change.

This file is the compact entry point before large status histories. It records
the current source-bound runway and the next bounded gate; it does not replace
historical evidence or grant any external, legal, provider or release approval.

## Fixed phases and exit criteria

1. **P1 — Source convergence**
   - Close known source packages first, in dependency order.
   - Exit only when the owning focused clusters are green, current source
     bindings and manifests are refreshed, and exactly one final full gate is
     ready to run.

2. **P2 — Exact-HEAD push, Regression and CodeQL**
   - Push only the accepted clean exact HEAD.
   - Exit only with exact-HEAD GitHub Regression and CodeQL evidence; local
     green tests alone do not close this phase.

3. **P3 — Fresh higher Android candidate**
   - Read the highest current Play versionCode freshly, then choose a strictly
     higher candidate from the accepted source state and bind its artifact and
     manifest hashes. The existing `2026092203` candidate is expected
     deferred P3 evidence, not a P1 source blocker; never assume it is an
     exact-HEAD candidate.
   - Exit only when the candidate identity is fresh, reproducible and the
     prior-candidate manifest is no longer stale.

4. **P4 — Green Staging, readback and sandbox/provider E2E**
   - Verify Green Staging against the exact candidate, then perform bounded
     readback and the approved sandbox/provider E2E checks.
   - Exit only with exact runtime/source readback and separately labeled
     deterministic, sandbox and provider evidence; no live claim is inferred.

5. **P5 — Play Internal**
   - Use the exact candidate in the Internal track with the required account,
     artifact and rollout evidence.
   - Exit only after the external Play state is freshly read back; repository
     evidence cannot substitute for Play evidence.

6. **P6 — Pixel/OnePlus two roles**
   - Run the bound renter and owner role matrix on Pixel and OnePlus against the
     exact candidate.
   - Exit only when both device/role cells have their required evidence and all
     unresolved cells remain explicitly fail-closed.

7. **P7 — Completion/Pilot**
   - Reconcile all source, runtime, provider, device and owner gates.
   - Exit only with a current pilot decision and no hidden external, legal,
     security, payment or release blocker. No phase label is a professional or
     owner approval.

## Active capsule

- Branch: `codex/master-workflow-20260808`.
- P1 Source convergence: **CLOSED** for the accepted source package and its
  focused closure evidence.
- P2 Exact-HEAD CI: **CLOSED** at clean HEAD
  `c2da8585b1f822e123307d7c763530dc0f598893`; GitHub Regression run
  `36183779963` and CodeQL run `36179682061` both succeeded on that exact
  head.
- P3 candidate: **ACCEPTED and VERIFIED** as `1.0.0+2026092206`, source
  `c2da8585b1f822e123307d7c763530dc0f598893`, internal/Staging, full closed
  pilot envelope `heilbronn_wave0`, G3/G4/G5 technical surfaces enabled, and
  Google-only social auth (`Google=true`, `Apple=false`, `Facebook=false`).
  External Listing AI remains disabled.
- Candidate artifact evidence: archive basename
  `2026092206-c2da8585b1f822e123307d7c763530dc0f598893`; AAB
  `139603858` bytes / SHA-256
  `d6562effaade3e580e4e35b118252040d8080ea21742852e0f54a4736a01932e`;
  APK `201763203` bytes / SHA-256
  `9c3b5ca942471a634498af406c7958a98832a993428619e57c9afe9bcbf465b7`;
  privacy report SHA-256
  `860f33280d4a0aaa5cbc4ec990070e84c80a6f25ae22e7953e052b2f45533163`;
  upload certificate SHA-256
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- P5 Play Internal: **ACTIVE and VERIFIED** for release id `29`, VersionCode
  `2026092206`, status `Available to internal testers`, and the unchanged
  `SIT interner Test` list with 2 users. The temporary app name is
  `com.shareittoo.app (unreviewed)`; the internal-test join link is available.
  A sanitized Pixel readback verifies Play-installed package
  `com.shareittoo.app` `1.0.0+2026092206`, installer `com.android.vending`,
  and split delivery; no serial or raw device identity is retained. No tester
  change, provider, production, payment, DNS, Firebase or pull-request
  mutation is claimed.
- P6 Pixel/OnePlus and exact listing-AI truth: **BLOCKED; SUCCESSOR REQUIRED**.
  The exact-2206 physical listing-AI PASS was not achieved; the runner exposed
  a real app-route loss during same-session token rotation and photo-picker
  handling. The source fix is uncommitted and a strictly higher successor is
  required, so 2206 is not claimed fixed. Defer the core Pixel two-role rerun
  to that successor. OnePlus exact-current physical proof is pending and the
  user device is absent.
- Candidate `2026092203` remains stale/deferred P3 evidence and is not reused.
- The first `2026092204` build attempt stopped before archive/evidence because
  social flags were omitted. No archive and no
  `build/release-evidence/android-2026092204` were created;
  that stopped attempt did not consume an artifact and is not a candidate.
- A later reduced-profile signed `2026092204` archive was created and is
  rejected as a noncandidate because `closedPilotEnvelope=false`, the pilot ID
  was empty, and G3/G4/G5 technical surfaces were disabled. Retain it privately
  for audit only; it was never uploaded, activated, installed or used for
  device/live evidence.
- Gemini listing-confirmation gate: **closed — Decision 1 / PASS** in
  `SIT_GEMINI_LISTING_CONFIRMATION_GATE_PACKET_2026-09-23.md`. The
  `LISTING-CONFIRMATION-1` package remains bounded and `final_publication` is
  false until an exact publish action.

## Exact next sequence

P4 Green Staging promotion/readback is closed by the 2026-09-25 technical
closure addendum, and P5 Play Internal is active and available from the fresh
console readback. P6 remains the next bounded phase but is blocked until the
strictly higher successor is built and verified. Repository evidence does not
claim 2206 fixed, OnePlus completion, provider traffic, legal approval or pilot
completion.
