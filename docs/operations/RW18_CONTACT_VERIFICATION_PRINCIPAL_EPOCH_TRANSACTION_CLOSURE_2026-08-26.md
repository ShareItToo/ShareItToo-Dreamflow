# RW18 contact and verification principal/epoch transaction closure

## Scope

RW18 closes the four remaining repository-owned security-action inventory
entries: `contact.email-change`, `contact.phone-verification`,
`contact.email-verification` and `login.email-verification`. Its verified
predecessor is RW17 closure
`3f1f6aae4e66356712230ecd6b2a560bf6d72680`.

## Red-first proof

The focused RW18 test initially failed to compile because the repository had no
principal-bound contact coordinator, no owner-bound phone challenge and
attempt epoch, no exact modal-sheet route helper, no login email/action owner
and no identity-bound Firebase cleanup predicate. This pinned the missing
contract before implementation.

The deterministic matrix now proves:

- email change rejects only exact structured server contracts;
- `408`, intermediary and unstructured email outcomes remain unknown;
- email-verification request has its own narrower rejection allowlist;
- Account A is rechecked immediately before email-change mutation;
- accepted A truth remains accepted after an A-to-B transition;
- automatic A phone confirmation retains confirmed truth after an A-to-B transition;
- every phone challenge carries its exact owner and attempt epoch;
- temporary Firebase cleanup cannot sign out a newer same-UID attempt;
- phone backend rejection uses the exact checked-in server contracts;
- `408`, intermediary and unstructured phone outcomes remain unknown;
- confirmed and unconfirmed local Firebase cleanup failures stay distinct;
- changed login email or action epoch invalidates resend ownership;
- exact removal of an A modal sheet preserves a newer B dialog;
- delayed A email request cannot open a result sheet under B;
- A phone consent closes before any provider request can run under B;
- closing A phone consent preserves a separately owned B dialog.

The legacy bool/generic `AuthService.requestEmailChange` and
`AuthService.requestEmailVerification` entry points are removed, leaving no
unguarded call site that can reintroduce result collapse.

## Verification state

Implementation head `83706e0e22a1b3fe1a8c876d0515d3eb41740a39`
passes the full local technical regression in the documented CI metadata-only
mode:

- 1,934 Node tool tests pass with zero skips at standard parallelism;
- the full Flutter suite passes 602 tests with three documented profile skips;
- all 17 focused RW18 tests and the retained adjacent matrices pass;
- analyzer reports zero issues;
- Web debug/Wasm dry-run and loopback-only web smoke pass;
- Android debug passes 448 tasks and the built APK retains minSdk 24.

The ordinary local invocation stopped only at the known private-release-archive
gate because its bound AAB is intentionally unavailable on this Mac mini. The
successful `CI=true` invocation exercises the repository's checked-in
metadata-only validation for that one gate and does not claim a private AAB,
release candidate, upload, Store, Play or device result.

Exact-head GitHub verification for the same implementation commit is complete:

- Regression run `32956904701`: `success`;
- CodeQL run `32956904593`: `success`;
- open code-scanning alerts: zero;
- PR #7 remains open, Draft, clean and unmerged.

No retry, timing relaxation, exclusion, test-order dependency or parallelism
reduction is an accepted release prerequisite.

## Ratchet cause

RW18 changes client action ownership, result semantics, phone-provider cleanup
and the durable security-action inventory. It does not change legal wording,
retention periods, provider selection, external gate state or any predecessor
verified implementation/closure head. Historical source hashes and call-site
inventories are refreshed mechanically where current protected sources moved
behind the new coordinator.

## Residual boundary

No live email, SMS, Firebase, backend, device or process-termination proof is
claimed. Provider enablement, deliverability, release candidate creation and
owner/live gates remain separate later work.
