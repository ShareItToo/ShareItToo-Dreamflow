# Mission D1/D2 — synthetic acceptance-outcome contract

Status: source-only synthetic diagnostic, 2026-10-03. Base HEAD:
`d1f12132b0be20878cff1d69fea7264c25ca0995`. D1/D2 remain **OPEN**;
D3/D4 are not changed. This is not an acceptance coordinator or legal gate.

## Exact package and authority

- `backend/src/mission_acceptance_outcome_contract.js` exports only the synchronous,
  import-free `evaluateSyntheticMissionAcceptanceOutcome` function.
- `backend/test/mission_acceptance_outcome_contract.test.js` is its only consumer.
- This document defines the diagnostic boundary, not a new product contract.

Current primary product authority is
`docs/product/SIT_MISSION_MASTERPLAN_2026-09-30.md:65–84,191–199,205–206,218`:
separate component consequences, honest partial outcomes, readback after timeout,
no automatic cancellation/refund/retry, and D1/D2 prerequisites for real binding.
Existing P7 fields come from `backend/src/mission_quorum_projection.js`;
the synthetic namespace follows `backend/src/mission_quorum_projection_workflow.js`.
Neither module imports this diagnostic. P7 projection bytes are not rewritten.

Existing `backend/src/booking_group_workflow.js:548–590,684–728` and
`backend/src/booking_workflow.js:609–631,1345–1396,1462–1540` remain separate
same-owner/individual command, lock and replay mechanisms. This pure function
does not inherit their database guarantees. Payment, refund and payout mechanisms
in `backend/src/payment_workflow.js`, `backend/src/payment_domain.js`,
`backend/src/v51_termination_policy.js` and the current legal manifests remain
untouched. Existing 10% contribution, refund/ledger rules and payout after return
plus holds are preserved; no new monetary calculation or approval is made.

## Input: stable binding is not an effect

Version `mission_acceptance_outcome_v1` requires literal `synthetic: true`,
`authentic: false`, and one `p7a1-synthetic-<UUIDv4>` namespace. Every identifier
must be explicitly namespaced. No real IDs, private text, location or media are
accepted. The currently bounded need is `plant_container_equipment`.

The supplied P7 root pins version, Mission ID/owner/revision/payload digest,
resolution ID/revision/digest, fit-source digest and projection digest. Explicit
`componentSlots` must exactly match the nonempty component set. Each stable
component binds slot, need, necessity, ordinal, item/type, owner, renter,
source digest and `non_binding`. The renter matches the Mission owner; each
component owner is different from that renter. Different components may share
an owner, but not item/request/effect resource identities.

`requests` contains exactly one entry per component. Before an attempt its
binding is **null**. After an attempt it supplies the owner actor, quote/hash,
command, idempotency key and request digest. Each observation repeats the exact
root, stable component and phase-appropriate request binding. These are supplied
comparison anchors, not generated commands or reservation rights.

**No future-effect IDs:** not-started, unknown/readback-required and proven
no-effect records carry no booking, contract, payment or provider identifiers.
Only `readback.status = effect_observed` and `effect.status = observed` may carry
`identifiers: { bookingId, contractId }`. Both must be complete, synthetic and
exactly equal for the same root/component/request. Missing, partial, mismatched,
aliased or reused effect identities fail closed. Payment/provider fields are
never accepted, even in a positive observation. A quote or request is not
prefilled in the not-started fixture.

## Deterministic outcomes

| Supplied observation | Internal classification |
| --- | --- |
| Not started, no request, no readback or effect | `not_started` |
| In flight / response unknown, unknown readback, no observed effect | `readback_required` |
| Completed, explicit no-effect readback and effect-none | `no_effect_observed` |
| Completed, exact matching positive readback and effect IDs | `effects_observed_only` |
| Some components with observed effects, remaining valid components unresolved/no-effect | `partial_effects_need_recovery` |
| Mixed not-started/no-effect without observed effects | `readback_required` |
| Invalid envelope/expected bindings or identity collision | `unavailable` |
| Missing, duplicated, stale, conflicting or mismatched observations | `needs_clarification` |

The five valid per-component triples are exhaustive; incompatible combinations
fail closed. Optional components are retained, including effects and conflicts.
Invalid observations never erase another component's valid observation. Fixed
reason order and lexical slot ordering make input collection/property order
irrelevant. Output contains only detached, frozen classifications, reason codes
and component indices; it does not echo IDs, slots, digests or caller details.

Every result has `bindingStatus: non_binding`, `legalBindingStatus`,
`missionBindingStatus` and `paymentStatus` equal to `not_determined`, and
`remediation: none`. Public output is always exactly `{ status: unavailable }`.
An internal component count/status must not be used as a public response.
No status proves contract validity, payment/provider success, overall Mission
success, cancellation/refund/retry permission or legal non-occurrence.

Replay may be `supplied_consistent_only` only for a completed, fully matching
request observation. A reused key with a different request digest collides.
This is not durable replay, exactly-once execution, or concurrency proof.

## Proof limits and verification

FACT: The helper compares explicitly supplied synthetic plain-data records. It
does not authenticate their server origin, recompute P7 digests, discover omitted
source slots, establish currentness, or prove a common database snapshot. A
coherently fabricated input cannot become authoritative by passing validation.
The `current` marker is only supplied evidence. Executable accessors, inherited
records, symbol/hidden fields and sparse/custom-prototype arrays are rejected
without invoking their payloads. The input contract is inert data, not arbitrary
hostile JavaScript Proxy objects.

FACT: No imports, clock/randomness, asynchronous operations, network, storage,
providers or side effects exist. No app/route/job/config/flag/runner/migration
was added. The focused test scans tracked and untracked source/document files
and rejects consumers outside these exact three package paths.

Focused command (from `backend`):
`node --import ./test_setup.js --test test/mission_acceptance_outcome_contract.test.js`.
Red-first coverage includes the 25 two-component outcome combinations; every
root/component/request field; explicit effect-ID missing/partial/mismatch and
collision cases; no preallocated future IDs; phase-sensitive request absence;
unknown/stale/duplicate/conflicting observations; replay collisions; optional
component isolation; deterministic ordering; detached non-identifying outputs;
executable/hidden/inherited shapes; no consumer or effectful primitive.

OPEN: Real acceptance timing/contract validity (D1), PostgreSQL common-snapshot,
concurrency and durable replay, component recovery/support semantics and
provider-bound idempotency (D2) need separately authorized source, database and
legal/provider gates. Historical draft/legal/AI evidence is not current approval.
No Staging, pilot, real-data, real-contract or real-payment completion is claimed.

Smallest next package: independent source review of this isolated contract and
its phase-specific fixtures; only then separately specify a dormant read-only
server-origin/common-snapshot adapter. Do not wire this evaluator into runtime.
