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
     manifest hashes; never assume local availability of `2026092203`.
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
- Base HEAD at capsule capture: `a3b747aeed36725a25487ff15839db233949927a`
- Worktree: clean at capsule capture
- Candidate: no exact-HEAD candidate yet
- Focused proof: listing viewport cluster green, Product Journey 3/3,
  Accessibility Resilience 7/7, cluster 10/10
- Full gate: not green; the last rerun stopped on a stale Accessibility
  viewport test, now repaired in the focused cluster
- Known next source blockers:
  - Green-promotion runner/schema mismatch: expected 92→95 while current
    migrations are 096/097
  - Gemini listing-confirmation correction required before UX implementation
  - stale candidate manifest

## Exact next sequence

Audit and fix Green-promotion migration currentness; obtain the required
Gemini listing-confirmation correction; refresh the source-binding closure; then
run one full gate on the resulting exact HEAD. Do not rewrite historical status
files or repeat full gates after serial failures in one owning test/validator
class; close that cluster focused-first.
