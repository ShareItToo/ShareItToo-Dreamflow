# Mission D4 — dormant source threat/abort contract

Date: 2026-10-03. Base inspected: `08636b6ce5cd1011fb3faf8458e5ae4daae0d460`.
Scope: `mission_supply_safety_v1`, a pure, unrouteable internal recheck of one
already released request-bound demand. **D1–D4 remain open.** This is neither
real matching nor an implementation of the final pilot. No deployment claim.

Authority: [Mission masterplan D3/D4](../product/SIT_MISSION_MASTERPLAN_2026-09-30.md),
[current capsule](SIT_PILOT_PHASE_CAPSULE_2026-09-23.md), and the still-**FIX**
[P6-C privacy/legal gate](SIT_GEMINI_MISSION_P6C_D3_D4_GATE_2026-10-02.md).
The older gate's supplied source is not this package's source; its historical
legal register is not a fresh legal approval.

## Exact boundary and input contract

`backend/src/mission_supply_safety_contract.js` exports only
`evaluateMissionSupplySafety`. It has no dependencies, clock, randomness,
selection/ranking, contact, reservation, action authorization, persistence,
provider or cleanup activity. No app, route, job, flag or package runner consumes
it. Normal app/Staging/Production/Play behavior is unchanged.

The plain-data envelope has exactly `schemaVersion`, `expected`, `observations`.
Expected server values contain requester/recipient/actor IDs, Mission ID with
revision/digest, P5 ID with revision/digest/slot/need key, participation ID with
revision, owned Shelf item ID with item revision, demand ID/revision/purpose,
release ID/released revision, and an opaque support-context reference. Only
`plant_container_equipment` and `mission_gap_supply_v1` are supported. Revisions
are positive safe integers, digests are lowercase SHA-256 syntax, and IDs are
bounded opaque strings. Digests are compared, not recomputed from absent source
bytes. Requester is the evaluating actor; recipient must differ. Resource IDs
must neither alias each other nor a principal. Released revision equals current
demand revision and is exactly 2 under migration 103's current transition graph.

Each named source is an array with **exactly one** own-data observation containing
exactly `binding`, `freshness`, `state`. Arrays permit detection, not acceptance,
of duplicate/conflicting evidence; no candidate list is selected from. The
binding matrix in the source/test is explicit:

| Source | Required binding | Only positive verdict |
| --- | --- | --- |
| principal | actor, requester, recipient | confirmed |
| mission | requester, Mission ID/revision/digest | current |
| resolution | Mission binding plus P5 ID/revision/digest/slot/need | current |
| participation | recipient, participation ID/revision | active |
| item | participation binding plus Shelf ID/item revision/need | confirmed_available |
| demand | all principal/Mission/P5/participation/item bindings plus demand ID/revision/purpose | released |
| release, expiry | demand binding plus release ID/released revision | active |
| blocks | complete demand binding, bilateral result | clear |
| rateLimit | complete demand binding, supplied permit result | permitted |
| support | complete demand binding plus support-context reference | authorized |

Every observation must additionally say `freshness: current`. This consumes only
server-supplied verdicts; it does **not** prove their origin, currentness, account
eligibility, expiry calculation, support ACL or common transactional snapshot.
There is deliberately no client adapter, fake authority flag, token, signature,
cached approval or persisted replay claim. The context bindings are a diagnostic
join contract, not new columns or a claim that P6 rows already carry participation
or support links. A future adapter needs its own authorization and real-PG proof;
it must never copy client assertions into these verdicts.

## Fail-closed result and disclosure

Internal result: exact version, `bindingStatus: non_binding`, `evaluation` equal
to `allow_to_evaluate` or `abort`, and ordered constant `abortReasons`. Allow is
only permission to continue an internal recheck, **never** to resolve, contact,
release, reserve, bind, pay, or skip a later gate. Pending/rejected demands and
unconfirmed items cannot become an implicit allow.

Only `publicOutcome` is public-safe; it is **always** `{status: unavailable}`,
including for allow. Do not return the internal result/reasons from an API.
No output echoes IDs, slot keys, need/purpose details, private Shelf/media,
location, support references, source digests or recipient facts. No output digest
is needed: no displayed payload or replay claim is being authenticated.

Reason ordering is fixed: envelope/expected/observation-schema failures, then
principal, mission, resolution, participation, item, demand, release, expiry,
blocks, rateLimit, support. Within a source: invalid, missing, duplicate,
conflicting, not_current, binding_mismatch, state_unproven. Every inspectable
independent failure is retained, even revoked plus expired plus blocked. A
malformed container stops only checks requiring that container; malformed root
data yields `envelope_invalid`. Invalid untrusted JavaScript executable objects
are not a supported transport; plain data/accessor rejection is defense in depth.
Unknown states, extra fields (including non-enumerable fields), missing bindings,
stale revisions/digests, and ambiguous observations never pass. No thresholds,
retention periods, location assumptions or legal basis are introduced.

## Current-source threat/abort map

Existing test references below are inspected source evidence, not fresh test runs
or runtime proof. The new focused suite covers the pure boundary only.

| Threat / required abort | Authoritative current source and existing evidence | Remaining gap |
| --- | --- | --- |
| Wrong principal/parent, stale Mission/P5/slot, self-recipient | `mission_supply_demand_workflow.js`: validateResolvedRecipient, assertResolvedRecipientEligible, assertDemandStillReleasable; migration `103_mission_supply_demands.up.sql`; `mission_supply_demand_postgres.integration.test.js` owner/foreign/stale/replay cases | Future server adapter and consistent-read proof; this helper cannot authenticate supplied facts. |
| Withdrawn participation, unconfirmed/foreign item | `mission_supply_participation_workflow.js`: ownedItem, snapshot, set/confirm guards; migration 104; participation contract and PostgreSQL tests | P6-C participation is intentionally **not** a real resolver input today; no wiring follows from this contract. |
| Duplicate/conflicting observations | Exact singleton and complete context comparison in new focused suite, including reversed evidence order | No new selection algorithm, random tie-breaker or candidate ranking. |
| Revoked/expired/missing release | Demand shape/revoke and migration 103; demand PG tests include expiry boundaries and safe revoke while booking-suspended | Expiry verdict must come from a future authoritative current read, never a client clock or retained allow. |
| Enumeration and bilateral blocking | Demand participant WHERE predicates/404 shaping and bilateral user_blocks check; demand PG foreign/block tests. `private_shelf_workflow.js`, private media helper and Shelf PG tests prove owner ACL/hash/symlink/public-path denial | Uniform pure public outcome is not an HTTP timing/traffic or deployed enumeration proof. No media becomes demand-visible. |
| Spam / uncertain permit | `app.js` missionSupplyDemandCreateLimiter (10/15 min); demand PG tests: 429 before new rows/resolver effect while read/respond/revoke stay available | No new budget. Actor/recipient/distributed abuse policy and runtime proof remain open. This contract must never gate the existing safe-revoke route. |
| False facts / dangerous Fit | `mission_fit_check_workflow.js` evaluatePlantContainerDimensionalFit; `mission_fit_check_workflow.test.js` missing/unconfirmed/contradictory facts and bounded units | Active participation is not truth or safety evidence. This contract accepts no Fit assertion and cannot authorize one; no safety guarantee or foreign-owner Fit reuse. |
| Support-context ACL mismatch | `support_case_domain.js`: privacy_security, trust_safety/dangerous_item_or_injury, repeated_abuse_or_evasion and deterministic supportRouteFor. `app.js`: POST/GET `/v1/support/cases`, GET `/v1/support/cases/:id`; intake remains simulation. `support_case_workflow.test.js`: linked-entity access, inaccessible booking, assignment recheck. `support_case_domain.test.js`: privacy routing, safety triage, Article-9 guards | No Mission/Shelf/demand-specific persisted support linkage is claimed. Supplied reference only proves equality here; future ACL adapter and negative tests are required. This creates no report and imposes no user requirement to open one. |
| Retention/export/delete expansion | Existing `privacy_export.js`, `retention_inventory.js`, account erasure and Shelf cleanup-outbox tests; current manifests keep approval false/purge off | No new stored data, files, logs or export namespace. Existing cleanup remains unchanged. D3 purpose/retention/Art.-13/channel classification need a fresh privacy/legal gate and any required professional review. |

## Verification and next boundary

Run from `backend/`:
`node --import ./test_setup.js --test test/mission_supply_safety_contract.test.js`.
The suite covers every binding field separately, missing/malformed records,
revision/digest/principal/resource collisions, adverse state matrix, ordered
multi-failure collection, data-property safety, immutable output and input
nonmutation, constant public disclosure, and absence of consumers in backend
source/Ops, Flutter/Web, tools/scripts and package metadata. It is not a PG or
deployed test. Syntax/diff and working-tree secret scans supplement it; no
unchanged full regression is repeated in this bounded package.

Next: Sol source review of this exact contract, then the named fresh-source D3/D4
gate for unresolved privacy/legal/policy choices. Any future runtime adapter,
support linkage, abuse budget or resolver is a separately authorized package
with real-PG/concurrency/privacy evidence. D1–D4 are not closed here.
