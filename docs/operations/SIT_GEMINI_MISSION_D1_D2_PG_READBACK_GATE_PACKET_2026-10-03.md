# Gemini gate packet — Mission D1/D2 dormant PG provenance reader

Gate ID: `SIT-MISSION-D1D2-PG-READBACK-01`.
Prepared 2026-10-03; **NOT SENT; no Gemini answer or approval exists here**.
Project: ShareItToo, repository root `.`, branch
`codex/master-workflow-20260808`. Only target source:
`0bc84d47cffc9fe6a04a540b04e2f6d81e11c481`.
D1/D2/D3/D4 remain **OPEN**.

## Sending boundary — operator instructions, not authorization to send now

Later use only the correct ShareItToo Gemini conversation/account with visible
**Pro + Extended**. If either model/mode or the exact source delivery cannot be
verified, do not send or accept a substitute. Existing project authorization is
not expanded by this packet. No browser/account/provider action belongs to its
preparation.

Send these exact packet bytes and the exact source bytes in R01–R29 below, or
provide each exact source as an accessible attachment with its SHA-256. Do not
send only summaries, snippets or hashes. V1-S/V1-T and V2-S/V2-T paths resolve
uniquely from the source/test declarations in their bound documents R06/R09;
this indirection preserves their unchanged exact three-file consumer guards.
Do not rename/modify source bytes or weaken those guards to attach the packet.

Before sending: recheck the target commit, all hashes, visible mode and attachment
availability; reopen O1–O3 and record actual access date. If the target moves,
do not silently use another HEAD: scope and rebind a successor packet. The packet
itself is not part of target HEAD and has no self-referential hash. Record its
actual delivered-byte hash separately in the later gate receipt. Record exact
question/answer bytes and received attachments; no claim of local filesystem
access by Gemini. The current capsule's older source-head line is historical
relative to this target, not permission to substitute it.

## Exact question to Gemini — choose A, B or C

May we build **only** a test-only, no-route, no-flag, read-only PostgreSQL
common-snapshot provenance reader against the exact source above, under every
boundary below?

- **A — PASS:** only that dormant synthetic reader may be implemented and tested.
  The absent real Mission-slot→Command/Booking relation must always remain
  `unavailable` / `unmapped`. No positive effect, accepted/not-started/no-effect
  outcome, legal/contract validity, payment, replay guarantee or retry safety may
  be inferred from database presence/absence or supplied fixtures.
- **B — FIX:** identify exact missing source/test clauses or contradictory
  assumptions; give the smallest necessary correction without widening scope.
- **C — BLOCK:** even this dormant scope cannot proceed; name the precise prior
  gate or evidence that is indispensable.

A never authorizes matching/contact, real data, a production association, new
tables, writers, routes, flags, deployment, legal acceptance timing, provider
actions, payment, retry, cancellation or refund. It is neither professional
legal approval nor D1/D2 closure, even if the reviewer finds the technical scope
acceptable. It may not be restated as permission for a positive-effect adapter.

## Reviewer evidence discipline

Classify every decisive statement as **REPOSITORY FACT**, **OFFICIAL DOCS**,
**INFERENCE**, **PROPOSAL** or **OPEN**. Do not convert one class into another.
Fresh-open every decisive supplied primary source and O1–O3. Complete a source
register with exact locator/URL, authority, version/document date (or explicitly
undated), actual access date/status, and precise supported proposition.

If an attachment, complete source, source date/version or official page is
unavailable, mark **NOT VERIFIED** (or **STALE** for old evidence). Neither may
support PASS. Do not rely on model memory, earlier conversation, snippets,
search results, hashes without bytes, reported test passes, or an asserted
current clock instead of actual access. Do not claim you opened local files,
executed tests, queried PostgreSQL or accessed accounts unless the evidence
actually demonstrates that action. No fabricated paths, tables, relationships,
columns, commands, algorithm, isolation guarantee, threshold, TTL, legal basis
or professional approval. No new law is asked for or asserted.

## Concise technical capsule

**REPOSITORY FACT — root and missing association:** R03 maps exact clauses.
R11/R12 and R25–R29 bind P2 need/revision, P5 resolution/revision/slot, authoritative
listing owner, fit and supply sources. R27:87–108 defines assignments, not a
Mission-slot→Booking/command relation. A client list, equal row counts, same
listing/owner/period, or a hypothetical fixture association does not fill that
gap. R12:48–132 already owns a repeatable-read read-only transaction, but its
fixture callback receives only a detached projection and does not establish
actual acceptance effects. R13:120–156 proves source-parent rejection, unchanged
table bytes and a concurrent owner correction for that existing P7 reader only.

**REPOSITORY FACT — diagnostic limits:** R04–R06 (v1) and R07–R09 (v2) are pure,
unrouteable synthetic contracts. V2 separates request, pre-existing context and
new effect, with explicit command type/role/actor and native IDs; its association,
origin/current marker, fixture inventory and snapshot digest are supplied claims,
not authenticated database provenance. Its supported positive fixture outcomes
are **not** permission to emit positive outcomes from the proposed reader.
Reported focused counts 43/43 and 76/76 are package evidence only, not fresh PG,
server-origin, real-user or provider proof.

**REPOSITORY FACT — actors/lifecycle:** R15:842–863,953–1003 creates a renter
Booking/request and can persist a Platform-Contract while Booking is requested.
R16:29–35 and R15:1365–1397,1462–1540 separate owner acceptance. R21:28–45 and
R22:4–25 bind Contract/Booking/user/quote and quote/renter/listing/period. Existing
Contract presence is not a newly observed acceptance effect. R15:605–636 stores
and locks command actor/type/request hash/key/completion; no Mission command
association or fabricated extra command ID follows. Actor roles must not be
relabelled to make fixtures fit.

**REPOSITORY FACT — transactions and effects:** R14:31–48 uses a plain BEGIN;
that alone is not proof of the proposed snapshot isolation. R15's mutation
helpers write commands/events/audit/notifications and must not be called by a
reader. R17/R24 keep G3 same-owner constraints. R19:6764–6780 tests a single-listing
acceptance race, not all-component atomicity. R18:1847–1908,2043–2085 separates
payment preparation from later provider work; it is reference evidence only,
never an allowed reader dependency. No distributed PostgreSQL/provider atomicity
is asserted. R10:205–206 keeps legal and technical acceptance questions open.

## Proposed implementation envelope for this gate only

**PROPOSAL — positive proof is provenance, never effects:**

1. An isolated test-only entrypoint takes fixture-owned identifiers, not a
   client-supplied result, owner, table/column name, SQL string or executable
   resolver. Normal app/testless use fails closed. No real-user read surface.
2. Acquire exactly one PG client. Start explicit
   `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` before source reads; verify
   transaction characteristics in focused PG proof. Read the complete relevant
   P2/P5/component source graph through closed parameterized SELECTs on that
   same client. Never compose a previously committed P7 read with a later
   command read and call them one snapshot; no snapshot export/import is needed.
3. The whitelist contains only necessary existing sources, no arbitrary function
   execution or writer helpers, DML/DDL, temp tables, sequence allocation,
   advisory/writer row locks, external effects or session-setting changes.
   PostgreSQL read-only mode is an additional boundary, not the whole policy.
4. Validate actual parent/owner/revision/digest relationships from those
   server-read rows. Missing/foreign/drifted evidence fails closed. Preserve
   schema-native IDs internally; no namespaced aliasing of native root/quote/
   Contract IDs. Do not expose raw rows, principal/private Shelf/media/location
   details or snapshot internals publicly.
5. Because the current real Mission association is absent, the only mapped-
   outcome result remains `unavailable` / `unmapped`; legal/Mission/payment/
   retry statuses remain `not_determined`, remediation `none`, public result
   exactly `{ status: unavailable }`. No scans to guess a Booking or command.
   A separate source-provenance proof may bind the exact internal source graph,
   but cannot be labelled an effect or public-visible digest of hidden bytes.
6. Return only after successful transaction completion. Failure, timeout,
   query/commit/rollback error or cancellation releases/destroys the owned
   client as appropriate and exposes no partial data. No automatic retry.
   Guarantee zero application-row/command/outbox/provider/file creation by the
   reader, not a physically write-free PostgreSQL engine.
7. Future focused tests use isolated run-unique synthetic fixtures only; fixture
   setup/teardown is separate from the read-only reader. Account cleanup,
   retention contracts and all current consumers remain unchanged. No test
   setup mutation may be relabelled as reader behavior or live evidence.

**PROPOSAL — decisive test clauses:** literal default-off/unrouteable/no-consumer
boundary; one client and exact transaction mode/order; second connection changes
owner/parent/revision with equal counts after the first read; old snapshot stays
internally consistent and next read detects drift; swapped Mission/slot/principal/
Booking/Contract remains unmapped; missing association despite plausible
Booking/command rows never implies effect/no-effect/not-started/retry; native IDs
remain byte-exact; no raw identifiers or private details in public output;
query/begin/commit/rollback/cancellation failures release the client; before/
after exact application tables, commands/outbox, owned files and provider-call
counters unchanged. Do not mutate or relax v1/v2 schemas/tests for convenience.

**INFERENCE:** a common PostgreSQL snapshot can prove a bounded read-source view;
it cannot manufacture the missing relationship, establish legal acceptance,
freeze future availability, prove business serializability, or cover a provider.
Any proposal claiming those stronger results must be FIX/BLOCK.

## Fresh official primary-source register

Access date for O1–O3: **2026-10-03**, direct page opened successfully. No secondary
sources or snippets were relied on. All three pages omit a page-specific
publication/revision date; access time is not publication time. PostgreSQL's
site news banner is not the manual section's document date. Version 16 is selected
because this package's existing PG proof targets PG16, not because it is the
newest major version.

| ID / direct URL | Authority / document status | Exact supported proposition / access result |
| --- | --- | --- |
| O1 — [PG16 §13.2](https://www.postgresql.org/docs/16/transaction-iso.html) | PostgreSQL Global Development Group; versioned supported PG16 manual; page date not stated | OPENED/VERIFIED §13.2.2: the first non-transaction-control statement fixes the snapshot; later SELECTs in that transaction do not see later concurrent commits. Repeatable Read can still have serialization anomalies; stable view is not proof of business serializability. |
| O2 — [PG16 SET TRANSACTION](https://www.postgresql.org/docs/16/sql-set-transaction.html) | PostgreSQL Global Development Group; PG16 SQL reference; page date not stated | OPENED/VERIFIED: transaction modes may be specified at BEGIN; isolation cannot be changed after first query. READ ONLY prohibits the listed mutations but permits the documented temporary-table exception for certain DML and does not prevent every disk write. DEFERRABLE matters only with SERIALIZABLE READ ONLY; it is not claimed here. |
| O3 — [node-postgres Transactions](https://node-postgres.com/features/transactions) | Official node-postgres project documentation; live unversioned page; page date not stated | OPENED/VERIFIED: application issues transaction control itself; all transaction statements must use the same client, not pool.query; example uses rollback and finally release. This page does not prove this repository's implementation. |

**OFFICIAL DOCS** statements above are bounded to O1–O3; no claim about a live
database configuration, exact installed version or production execution follows.
If these pages change or cannot be freshly accessed at gate time, record the
actual access result and do not support A with stale recollection.

## Exact repository source register

All 29 entries were read from the exact target Git commit and compared byte-for-
byte with the local checkout on 2026-10-03. Authority is the target repository,
not public web availability. The reviewer must receive/read the exact bytes;
private repository access is not assumed. R06/R09 uniquely resolve their two
source/test locator aliases. SHA-256 binds whole file bytes, not excerpts.

| ID | Repository-relative locator | SHA-256 |
| --- | --- | --- |
| R01 | `AGENTS.md` | `124729bf8cf1a12eca02f769e3090fa13ba2f7fe17a6b859510795e4ecb028da` |
| R02 | `docs/operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md` | `17377ad10af3d05ce338a048a711832503426733dd63254e5d47fa30ffd6f265` |
| R03 | `docs/operations/SIT_MISSION_D1_D2_PG_ADAPTER_SOURCE_MAP_2026-10-03.md` | `e300e4c6a5ec5a699050f642d07b5382f5a9ec66f6c2272905de1127534db597` |
| R04 | V1-S (source locator in R06) | `2cd7b94d9f32b082007a5e0d222ccb9b94b998fa6a565a97ee5175435ae4ce19` |
| R05 | V1-T (test locator in R06) | `d632d1b2d9bfae573fcde93cea7cd56275eb60f9ffe4e253bb5a2d7e66373fde` |
| R06 | `docs/operations/SIT_MISSION_D1_D2_SYNTHETIC_ACCEPTANCE_OUTCOME_CONTRACT_2026-10-03.md` | `9338e24de39b4b055dd90201e2daf80218d7284e0d427ab94fa246a689ebdaea` |
| R07 | V2-S (source locator in R09) | `bf45128e8aade794e2d142f841217cd4be1807bc67de45ea1463883f404c7369` |
| R08 | V2-T (test locator in R09) | `88173e9c79202781116503b865a7575bfea239eba17f11b5e3f713d2bd6120d9` |
| R09 | `docs/operations/SIT_MISSION_D1_D2_SERVER_READBACK_CONTRACT_2026-10-03.md` | `42ff6760b1774af8d77e956260dba8b155b15574539b877d35d8575dcff9c768` |
| R10 | `docs/product/SIT_MISSION_MASTERPLAN_2026-09-30.md` | `22375f1c7847a76e55fcb362e476067086fb3a5c5d6c378592bc20635847001d` |
| R11 | `backend/src/mission_quorum_projection.js` | `bd7fdcd277d06a7748e26099accab7416f8ca901f08997012744a752c56f1523` |
| R12 | `backend/src/mission_quorum_projection_workflow.js` | `abe3ecfc292cfb85cffc469972f0fddb66852e17230c016ef37b7bc19e4fc5c1` |
| R13 | `backend/test/mission_quorum_projection_postgres.integration.test.js` | `c522973f86f32b3c3787ee6c4a3bb91d29f57c4ee347b2a28f7c7e048ef41382` |
| R14 | `backend/src/db.js` | `c2f2fb197053056ea9d6fd891b04370fbb6cca1af7af3426011fb9c09bbd6740` |
| R15 | `backend/src/booking_workflow.js` | `1787b0613e37efad99174142f4b34367659966b6b6f64cb3611383abd3ee82f2` |
| R16 | `backend/src/booking_domain.js` | `614b13e753f32423f9f32a7355bebf3fb0157e06ca094d58b23cf13235b96919` |
| R17 | `backend/src/booking_group_workflow.js` | `c5f7c5dcdc3ae35e87a6724791a2e6cf996f7f2590b016f8a8b3937b2eaed83e` |
| R18 | `backend/src/payment_workflow.js` | `23ff2d2c751b251277a90173a7e923159ac6a5772e18d9580bfd5dfb097dc60c` |
| R19 | `backend/test/postgres_foundation.integration.test.js` | `fc8e3e47b5c0655d2e5ceef7ef884c640d3d4f5472814b74d3609365a46ec2b4` |
| R20 | `backend/sql/migrations/005_b6_booking_workflow.up.sql` | `55996e71b9a9144852dd872dd5ccbdf6578518c6ce1e370458ee12976cff0053` |
| R21 | `backend/sql/migrations/015_v51_contract_persistence.up.sql` | `c2ccc1d20248672cfe164f4cf5bf093dca855aa4794f71a6f9dfe3a8c8253657` |
| R22 | `backend/sql/migrations/016_v51_booking_quotes.up.sql` | `70ab8fbfa5ab8d134775532a8122f429e1c77391bbba926ae13fb233ba8a6d89` |
| R23 | `backend/sql/migrations/023_v52_contract_binding.up.sql` | `ad22ad9dd1f07d7b2a4ec7ad45baba50bb24c4b8bf3c6511a7f451d788dd102c` |
| R24 | `backend/sql/migrations/028_g3b_booking_group_foundation.up.sql` | `b9469e3a4a3f46cad6f793ec7bc88964cac9e941b7656ee5743e27383c5db7e7` |
| R25 | `backend/sql/migrations/099_mission_need_revisions.up.sql` | `97715ff0f381615ec148799d15dcc71b4eab302e9ad7fec946a3c5b534e249c0` |
| R26 | `backend/sql/migrations/101_mission_fit_checks.up.sql` | `a5abc16a7adc597ef34ca957330e6e85f365a46110b897222052179000488905` |
| R27 | `backend/sql/migrations/102_mission_inventory_resolutions.up.sql` | `b71a009ad50729d6f423759fb74bee1cafbc8a900e0555f62b4e89f31281c22a` |
| R28 | `backend/sql/migrations/103_mission_supply_demands.up.sql` | `1fad168a69b20199685675a609dad6dc234fc34a1a940312e0dc5c834e3752d9` |
| R29 | `backend/sql/migrations/104_mission_supply_participation.up.sql` | `8bb5cf10cf0e8f9db8d812e07b7d80a6e4945ebf122e1c8a3e0fd82445b95ffb` |

Current source assertions are limited to the pinned target. Older source-map
inspection heads, capsule checkpoint counts, prior AI answers and historical
legal drafts remain historical; they cannot substitute for this register.

## Required reviewer return

Return exactly:
`DECISION: A | B | C`
`SCOPE: dormant synthetic read-only provenance only`
`FACTS: exact source ID + line/section + bounded proposition`
`GAPS: exact missing proof, or none within this narrow scope`
`REQUIRED TESTS: smallest decisive matrix`
`EXCLUSIONS: confirmed or precise conflict`
`SOURCE REGISTER: every decisive source, date/status/access/proposition`
`OPEN: D1/D2/D3/D4; no effect/legal/payment/retry/activation approval`.

A reasoned B/C is preferable to a PASS supported by NOT VERIFIED material.
No implementation, gate send, DB access, test execution, provider action,
commit/push or deployment is part of preparing this packet.
