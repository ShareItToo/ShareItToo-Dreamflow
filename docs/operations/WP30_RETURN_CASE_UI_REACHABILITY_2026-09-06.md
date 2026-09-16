# WP30 return-case UI reachability closure

Status: **COMPLETE LOCALLY AND ON GITHUB; PHYSICAL JOURNEY NOT CLAIMED**

Implementation HEAD:
`ec8c85fce8b52b68286ca4adbf2ca91416069fce`

Branch: `codex/master-workflow-20260808`

## Cause and closure

Before WP30, `ReportIssueScreen` had no production caller. The visible
`Problem melden` actions in renter and owner booking details opened the
general `SupportFlowScreen`, which creates a support case rather than the
dedicated V5.2 return case. WP28 had secured the return-case transaction, but
that transaction was therefore unreachable from the normal booking UI.

WP30 adds a separate `Rückgabe-Prüffall eröffnen` action to both participant
surfaces. General support remains present and distinct. The action is exposed
only when server-projected booking truth satisfies every condition below:

- status is exactly completed;
- the booking is not a simulation and is not already in review;
- no return case is already recorded;
- the accepted platform contract is a V5.2 contract;
- return T0 and report deadline are both present; and
- the current instant is inside the inclusive T0-to-deadline window.

Missing or legacy contract data, missing timer data and all ineligible states
fail closed to the unchanged general-support path. The renter booking
projection now carries the return T0, report deadline and existing-case time
into its detail screen. A successful child transaction reloads shared booking
truth before the action can be offered again.

The initiating principal/session owner is captured synchronously before the
action's first await, rechecked before navigation and after the child result,
and owns the exact `ReportIssueScreen` route. An Account-A route is removed by
route identity on A-to-B replacement; no global pop can close a newer B route.
The child screen retains WP28's typed rejection, confirmed-plus-local-failure
and outcome-unknown semantics.

## Verification

- six dedicated policy tests pass, including both inclusive boundaries and
  all fail-closed states;
- four dedicated production-wiring checks pass for both participant roles,
  exact route ownership, projection and general-support separation;
- all 2,345 repository tool tests pass;
- all 900 active Flutter tests pass, with 33 declared skips;
- the analyzer reports no issue;
- the complete local technical regression passes through backend, isolated
  PostgreSQL, secret scan, Web/Wasm, loopback and Android minSdk 24;
- independent detached clean-checkout R10 passes exact implementation HEAD
  with fresh caches and two byte-identical 794-entry Android debug APKs;
- exact-head GitHub Regression `34042259106` passes Flutter, backend,
  PostgreSQL and R10 clean reproducibility;
- exact-head CodeQL `34042259112` passes and open code-scanning alerts are
  zero; and
- PR #7 remains Draft, open, mergeable and unmerged.

## Candidate and boundary separation

The signed Pixel candidate remains WP29 version `1.0.0+2026090607`, source
HEAD `0708609f66ecebee75e7d3786130c5231e578148`. WP30 changes source after that
candidate and therefore makes no physical-device, APK, AAB or installed-app
claim. A strictly newer signed candidate and a fresh Pixel journey are a
separate package.

WP30 made no Google Play, tester-list, Production, public-registration,
Firebase Console, provider, payment/KYC, Cloud/VPS/DNS, OnePlus, device or PR
merge change. It did not upload or activate a release and did not spend money.

## Remaining proof

The next physical package may create a strictly newer signed Internal Staging
candidate, update the Pixel without clearing data and exercise one isolated
V5.2 completed booking through the newly reachable action, including evidence,
server readback, participant isolation and exact cleanup. Until that succeeds,
the physical return-case journey remains open.
