# RW19 profile and location mutation principal/epoch transaction closure

## Scope

RW19 closes the remaining repository-owned user profile and location mutation
surfaces after verified RW18 closure
`37c313a62daf79a34352fd3f34ba16b9db8dc4a4`. The protected surfaces are
address and coordinates, contact address, full and compact profile editing,
social links, biography, interests, photo/media selection, manual city and
permission-backed automatic location.

## Confirmed cause

The existing UI usually captured Account A's visible values, but after one or
more awaits it called `DataService.updateCurrentUserProfile`. That data-layer
path validated A and then `BackendRepository.updateCurrentProfile` acquired the
globally current token later. A precisely timed A-to-B transition could
therefore pair A's payload with B's credential. Several screens also surfaced
delayed success/error or navigation under B, and the contact map save reread a
mutable current user from widget state inside the sheet.

RW19 removes those paths from every repository-owned profile mutation screen.
The exact owner now flows through coordinator, data layer and backend
repository, while exact route identity and typed result truth protect every UI
boundary.

## Red-first and focused proof

The focused test was introduced before the coordinator/types and initially
failed to compile. It now proves:

- exact structured profile rejections and non-rejection of `408`,
  intermediary and unstructured failures;
- no remote call when Account A is stale immediately before mutation;
- accepted Account A truth remains accepted after a switch to B;
- local failure after server acceptance cannot become "not changed";
- exact context and action-epoch ownership;
- invalidating an A profile sheet preserves a newer B dialog;
- the A map sheet closes before a mutation can start under B; and
- a delayed accepted A address result cannot surface or navigate under B.

Permanent wiring tests additionally bind owner-only credential acquisition,
owner checks around remote and paired local commits, the exact rejection
allowlist, all seven screens, typed-before-generic result handling, exact route
identity, GPS/media await checks and supported-regression inclusion.

## Verification state

Implementation head `93b7a4cde7bbcb04f9f6c0c60b26dc5bb941e2ae`
passes the full local technical regression in the documented CI metadata-only
mode:

- 1,945 Node tool tests pass with zero skips at standard parallelism;
- the full Flutter suite passes 611 tests with three documented profile skips;
- all nine focused RW19 tests and the retained adjacent matrices pass;
- analyzer reports zero issues;
- Web debug/Wasm dry-run and loopback-only web smoke pass; and
- Android debug passes 448 tasks and the built APK retains minSdk 24.

The ordinary private release archive remains intentionally unavailable on this
Mac mini. `CI=true` exercises only the repository's checked-in metadata path
for that gate and does not claim a private AAB, candidate, upload, Store, Play
or device result.

Exact implementation head `93b7a4cde7bbcb04f9f6c0c60b26dc5bb941e2ae`
also passes GitHub Regression run `32963682095` and CodeQL run `32963682126`.
The regression includes the independent clean-checkout reproducibility job;
CodeQL completed successfully with zero open code-scanning alerts. PR #7
remains open, Draft, mergeable and unmerged.

No timing relaxation, retry accommodation, test exclusion, order dependency or
parallelism reduction is an accepted release prerequisite.

## Ratchet cause

RW19 adds exact-owner propagation for profile mutation, typed result semantics,
screen-local action epochs and identity-owned route cleanup. It does not change
legal text, privacy-disclosure meaning, retention periods, backend route/schema,
provider selection or any external gate decision. Predecessor evidence hashes
and call-site inventories are refreshed mechanically only where protected
sources changed; predecessor implementation and closure heads remain unchanged.

## Residual boundary

No live backend, location-provider, device, release artifact, Store, Play,
payment or process-termination reconciliation proof is claimed. Those remain
external or later bounded gates after repository-owned closure.
