# SIT Pilot Phase Capsule — 2026-09-23

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

- Branch: `codex/master-workflow-20260808`
- Source baseline HEAD: `37062669513b7ecd6a7ecc34bb0f5173f5e7f98a`
- Documentation-only history: `2ba9f15bf4ee675b320de4807d5fa32beb51fdeb`
  and the prior baseline `37062669513b7ecd6a7ecc34bb0f5173f5e7f98a` are
  docs-only successors of the Gemini gate source; neither contains the
  implementation.
- Accepted implementation successor: `f6a57a78f224047801594270c7565c7abea2ce2e`
  (`LISTING-CONFIRMATION-1`); this is the code/test successor, distinct from
  the documentation-only commits above.
- Candidate: `2026092203` is stale against later runtime source and remains
  expected/deferred P3 evidence; it is not a P1 source blocker.
- A first `2026092204` build attempt stopped before archive/evidence because
  the social flags were omitted. No archive and no
  `build/release-evidence/android-2026092204` were created; `1.0.0+2026092204`
  remains unconsumed and is not a candidate. Its numeric code may only be used
  by a new corrected build from the accepted source commit; the stopped old
  exact-head attempt is never reused. The corrected P3 profile requires
  explicit `SIT_SOCIAL_GOOGLE_ENABLED=true`,
  `SIT_SOCIAL_APPLE_ENABLED=false`, and
  `SIT_SOCIAL_FACEBOOK_ENABLED=false`; Apple/Facebook remain hard stops until
  separately proven provider configuration exists.
- A second signed `2026092204` archive was created locally but is rejected as
  a noncandidate because its manifest had `closedPilotEnvelope=false`, an empty
  pilot ID, and G3/G4/G5 technical surfaces disabled. Retain that private
  archive for audit only; it was never uploaded, activated, installed, or used
  for device/live evidence. The next unambiguous source version is
  `1.0.0+2026092205` and requires the complete full-pilot envelope.
- Focused proof: `GREEN-92-97-CURRENTNESS-01` PASS on source HEAD
  `1360628406736c61ecd26d99fe0b9663994ba47b`; the 370626 baseline and its
  documentation-only successors did not contain this implementation, while
  f6a57a78 is the accepted code/test successor. Green promotion/schema
  currentness remains closed through migration 097.
- Current read-only closure evidence: 3 manifests, 158 code consumers,
  370 owning tests and 97 migrations; candidate-focused/wiring checks 107/107
  PASS. No Full Gate has been run for this capsule update.
- Gemini listing-confirmation gate: **closed — Decision 1 / PASS** in
  `SIT_GEMINI_LISTING_CONFIRMATION_GATE_PACKET_2026-09-23.md`.
- Package `LISTING-CONFIRMATION-1`: one visible aggregate owner confirmation;
  the existing ten factual IDs remain mapped in `review.ownerConfirmations`;
  `final_publication` is false until the exact publish action.
- Package result: focused client/server wiring and domain checks are green;
  manual listing, photo truth, clarification, AI-consent, readiness,
  fingerprint/price and 4+4 boundaries remain unchanged.

## Exact next sequence

Green-promotion migration currentness is PASS. The Gemini
listing-confirmation gate is closed and the bounded package is implemented.
Next: run focused closure, then exactly one local Full Gate with the maintained
v2 Mac-mini profile:

```sh
node tool/run_with_local_build_cache.mjs \
  --profile /Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_ANDROID_BUILD_20260904.json \
  -- env CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 bash scripts/technical_regression_check.sh
```

`CI=true` selects the permitted metadata-only candidate paths; it cannot claim
Store upload, Store activation, candidate installation or any device pass.
After that local gate, execute P2: push the accepted exact HEAD and obtain
exact-HEAD GitHub Regression and CodeQL evidence. Only then execute P3 by
building a fresh strictly higher candidate from that accepted source state.
The P3 preflight/build commands must include the explicit Google-only profile
and rollover controls; omission fails closed before artifact work:

```sh
node tool/run_with_local_build_cache.mjs \
  --profile /Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_ANDROID_BUILD_20260904.json \
  -- env \
  SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  SIT_BUILD_PREFLIGHT_ONLY=1 \
  SIT_REQUIRE_CANONICAL_SIGNING=1 \
  SIT_REQUIRE_FIREBASE=1 \
  SIT_BLUE_OCEAN_LISTING_ASSISTANT=1 \
  SIT_CLOSED_PILOT_ENVELOPE=1 \
  SIT_STAGE_A_PILOT_ID=heilbronn_wave0 \
  SIT_REQUIRE_STORE_SUBMISSION=0 \
  SIT_RELEASE_CHANNEL=internal \
  SIT_API_BASE_URL=https://staging.shareittoo.com/api/v1 \
  SIT_SOCIAL_GOOGLE_ENABLED=true \
  SIT_SOCIAL_APPLE_ENABLED=false \
  SIT_SOCIAL_FACEBOOK_ENABLED=false \
  bash scripts/build_android_release_candidate.sh
```

After the preflight and `BUILD_READY`, repeat the same command without
`SIT_BUILD_PREFLIGHT_ONLY=1`. This remains a future 2205 command; do not reuse
either 2204 attempt or claim the reduced 2204 archive as a candidate.
Do not rewrite historical status files or repeat full gates after serial
failures in one owning test/validator class; close that cluster focused-first.
