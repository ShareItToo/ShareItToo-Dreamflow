# D1/D2 PostgreSQL adapter — current source map and narrow gate

Date: 2026-10-03. Project: ShareItToo (repository root `.`), branch
`codex/master-workflow-20260808`, source-map verification HEAD
`73887e3ca5f619bb0089d88cb6daef6f507d25f3`.
Inspection began at `d1f12132b0be20878cff1d69fea7264c25ca0995`;
Sol committed the reviewed outcome package and gate documents during this map.
The inspected PG/product sources are unchanged; outcome source/test hashes below
were rechecked after that commit. No CI result is inferred for this final HEAD.

**Map PASS; direct positive-outcome adapter NOT READY.** D1/D2 remain OPEN.
This package creates only this document. No DB connection, runtime/provider call,
test fixture insertion, gate activation, code change, commit or deployment.
This source-map artifact adds no executable code or runtime configuration.

## Source register and exact scope

FACT: Product authority is
`docs/product/SIT_MISSION_MASTERPLAN_2026-09-30.md:65–84,191–199,205–206,218`;
the current capsule is
`docs/operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md:3–34,202–232,258–300`.
Synthetic/local P7 closure does not close legal, Staging or pilot acceptance.

The accepted synthetic outcome package is specified in
[its boundary document](SIT_MISSION_D1_D2_SYNTHETIC_ACCEPTANCE_OUTCOME_CONTRACT_2026-10-03.md).
Its source/test paths are listed there, not repeated here: the existing exact
three-file consumer guard intentionally forbids additional textual consumers.
For unambiguous readback, source SHA-256 is
`2cd7b94d9f32b082007a5e0d222ccb9b94b998fa6a565a97ee5175435ae4ce19`;
test SHA-256 is
`d632d1b2d9bfae573fcde93cea7cd56275eb60f9ffe4e253bb5a2d7e66373fde`.
Below, **Outcome source** means that exact source: lines 71–96 validate identity
and owner actor; 107–143 compare observations; 150–234 validate sets and aggregate.
Its reviewed 43/43 result is prior focused evidence, not a new PG proof.

## Requirement → present source/test → exact missing proof

| Requirement | FACT: existing authoritative evidence | OPEN / implication |
| --- | --- | --- |
| Server-owned Mission and complete components | `backend/src/mission_quorum_projection_workflow.js:48–82,104–126` reads P2/P5/assignments/listing owners/P4; `backend/sql/migrations/102_mission_inventory_resolutions.up.sql:87–108` binds assignment to exact revision and unique slot/item. | A client list/count or fixture callback is not a persisted Mission attempt/effect relation. P6 released Shelf is not a Booking or accepted component. |
| One common snapshot | P7 workflow `:54–56,119–132` owns `REPEATABLE READ READ ONLY`, commit/rollback/release. `backend/test/mission_quorum_projection_postgres.integration.test.js:136–156` changes owner on another connection and checks old consistent snapshot then drift. | Calling P7 reader and then reading commands opens separate snapshots. A successor must own one connection/transaction and read root, assignments, commands and effects inside it; never imply a lock/hold or future freshness. |
| Actor roles | `backend/src/booking_workflow.js:842–863,953–1003`: renter creates request/Booking and possibly Platform-Contract. `backend/src/booking_domain.js:29–35`: owner accepts/declines; renter cancels requested. `booking_workflow.js:1365–1397,1523–1531` binds transition actor and checks role. | Outcome source `:88–91` models owner actor only, with no command-type field. It cannot represent renter create, renter counter-consent, admin/system or provider observations by replacing their actor with owner. Reader principal (Mission owner) and command actor (component owner) are different roles. |
| Exact component → Booking → Contract | `102...up.sql:87–108` has slot/listing/snapshot, no booking/command relation. `backend/sql/migrations/015_v51_contract_persistence.up.sql:28–45` binds unique Booking to contract user/quote/hash/key. `016_v51_booking_quotes.up.sql:4–25` binds renter/listing/period/revisions/hash. | No authoritative Mission component/revision/slot → Booking/command association exists in these source families. Equal listing/owner/count/time or a caller-supplied Booking ID is not that association. Missing relation must stop positive projection. |
| Contract presence versus owner acceptance | `booking_workflow.js:989–1033` persists Platform-Contract and event while Booking is `requested`; owner transition occurs later `:1462–1540`. | Booking + Contract rows alone prove neither owner acceptance nor that this attempt created the contract. A readback must distinguish existing context from newly observed effects and bind exact command/event/revision; contract validity remains undetermined. |
| Durable replay | `backend/sql/migrations/005_b6_booking_workflow.up.sql:174–185` has key/actor/type/request hash/Booking/response/completion. `booking_workflow.js:605–636` inserts, locks, compares actor/type/hash, rejects in-progress and returns completed replay. | There is no Mission attempt ledger or separate command ID in this table. Synthetic command ID and request digest cannot be guessed from a Booking ID or status. A supplied replay-consistent marker is not a persisted replay claim. |
| Readback and no-effect | `backend/src/db.js:31–48` wraps callback in BEGIN/COMMIT/ROLLBACK; Booking command and writes complete together (`booking_workflow.js:1078–1084`). | An absent row may mean not started, rolled back, invisible in-flight work, or a later attempt. It is not proof of no effect, no request or retry safety. A terminal no-effect observation needs an explicit authoritative attempt/completion basis that does not currently exist for Mission. |
| Concurrency and partial effects | `booking_workflow.js:1087–1094` locks Booking/request; `:1476–1521` locks listing and checks period. `backend/test/postgres_foundation.integration.test.js:6764–6780` races two owner accepts and expects 200/409. | This proves an individual listing conflict path, not all Mission components atomicity. Independently committed components can diverge; read them separately, never roll their success back logically or issue remediation. |
| G3 cannot fill the Mission gap | `backend/src/booking_group_workflow.js:548–590` owner-only decision/current quote/all-position count; `:684–725` renter-only counter-consent. `028_g3b_booking_group_foundation.up.sql:113–195` binds same-owner group/listing/quote/Booking. PG tests `:4890–4917,4938,5105–5112` cover concurrency/replay/forbidden owner and unchanged Booking/contract/payment counts. | Existing G3 relation is not a multi-owner Mission relation; do not relax its guard or convert technical group consent into legal acceptance. |
| Payment remains separate | `backend/src/payment_workflow.js:1847–1908` owns its transaction, principal/advisory/row locks, renter-only checkout and simulation rejection. `:2043–2085` leaves preparation transaction before provider checkout with provider key. | No distributed transaction across PostgreSQL and provider. Do not import/call payment workflow or interpret local rows as provider success. Separate provider-bound replay/sandbox approval is outside this adapter. |
| No writes or cleanup debt | P7 PG test `:134,162–184` asserts byte-equivalent public tables and fixture-owned graph cleanup. | New focused adapter tests must prove listener/process/file/row/command/outbox/provider non-creation and release on every error; no new retention interval or cleanup namespace. Existing P7 proof does not automatically cover a new adapter. |

## Three source incompatibilities to resolve before positive adaptation

1. **Identity:** current P7 PG fixtures use schema-native `mission_need_<uuid>` /
   `mission_inventory_<uuid>` / `shelf_item_<uuid>` (P7 PG test `:16–23`);
   contracts use UUID PKs (`015...up.sql:28–32`) and quotes require
   `quote_<uuid>` (`016...up.sql:5`). Outcome source requires every ID in its
   synthetic namespace. Prefixing a DB ID changes the identity and root digest;
   it is not exact source binding. Preserve current v1, and review a separate
   versioned test-only identity/transport contract before any positive adapter.
2. **Phase/actor:** keep observation identity distinct from planned request
   identity. No future booking/contract/payment/provider IDs in not-started,
   unknown or no-effect records. A pre-existing contract may be internal context
   for an owner transition, not a newly created effect. Missing/partial/mismatched
   identities must still fail closed, never be silently synthesized or stripped.
3. **Association/origin:** namespacing, a supplied snapshot marker or a test
   callback cannot create a production parent relation. If a future isolated PG
   fixture explicitly models an association, label it fixture-only and test
   server-derived joins; never call it proof of a current production relation.

## Smallest safe next package and adapter boundary

**PROPOSAL:** first specify a versioned, phase-specific server-readback envelope
and red tests for the three incompatibilities above. Keep v1 and its exact
consumer guard unchanged. This is a prerequisite, not a request to invent new
Mission tables or reinterpret a legal acceptance moment.

After that contract is reviewed, the smallest meaningful dormant PG package is
a test-only, no-route/no-flag read-only reader: one acquired connection, explicit
`REPEATABLE READ READ ONLY`, schema-native synthetic fixture identities, complete
P2/P5/P7 sources, and whitelist-only reads. It may prove common-snapshot root and
component provenance. With the current missing association it must report an
unavailable/unmapped internal result; **never** `no_effect`, `not_started`,
replay-consistent, accepted or Mission success from absence. It must not return
raw source records to a caller or add an HTTP surface. A trivial wrapper that
only returns unavailable is not a substitute for the source-provenance proof.

Positive command/effect readback is a separate successor, blocked until the
exact phase, actor, command request-hash algorithm, expected command type,
component association and effect-event tuple have authoritative definitions.
No new association table, command, event, outbox, mutation, retry, expiry sweep,
reservation, contract or payment belongs to the dormant reader. Existing writer
helpers (`startCommand`, `expireBookingHolds`, transition/create workflows) must
not be reused as read helpers. No sequential-query parallelism on one PG client.

Required negative tests for the eventual authorized reader: same counts with
foreign Mission/owner/renter/slot/Booking/Contract; same key different actor/type/
request digest; native-vs-aliased IDs; pre-existing contract before owner accept;
uncommitted and rolled-back attempt versus true missing row; completed command
with missing/mismatched effect; concurrent source/command correction across the
first read; independent component commits/partial effects; unknown/timeout;
optional conflicts; error/rollback/client release; zero writes/provider calls;
no consumers outside the explicitly authorized test cluster. Tests insert only
run-unique synthetic fixtures in isolated local PG and clean only owned state.

## Compact gate template — no gate sent

Question: **A / B / C** for the precisely bounded dormant source/readback work,
not for activation?

- **A — PASS:** approve only the versioned phase/identity contract and subsequent
  test-only common-snapshot reader described above, with absent relation always
  unavailable and positive effect projection still separately gated.
- **B — FIX:** name the exact missing source clause, actor/phase mapping,
  association, schema or deterministic test; do not suggest real-data work as a
  shortcut.
- **C — BLOCK:** explain why even this dormant read-only synthetic scope cannot
  proceed without another prior gate.

For any later Gemini/legal gate, reopen current primary sources and label
FACT/INFERENCE/PROPOSAL/OPEN. No historical draft, prior AI PASS, stale legal
record or local test becomes D1 legal approval. This map makes no current legal
claim. D1 acceptance timing and D2 concurrency/recovery/provider guarantees stay
OPEN; privacy/security D3/D4, support/incident ownership and activation gates
also remain intact. Preserve 10%, refund/ledger and payout-after-return plus
holds; no automatic cancellation/refund/retry or distributed-atomicity claim.

Verification for this map: directed source inspection, source hashes, existing
consumer-boundary check only, local path/line existence, diff and secret scan.
No unchanged full suite or PostgreSQL execution is required or claimed.
