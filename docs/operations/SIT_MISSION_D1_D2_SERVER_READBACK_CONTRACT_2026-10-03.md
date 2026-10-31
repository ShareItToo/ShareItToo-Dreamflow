# Mission D1/D2 — synthetic server-readback envelope v2

Status: dormant, synthetic source contract only, 2026-10-03. Project: ShareItToo,
repository root `.`, branch `codex/master-workflow-20260808`. Inspection base:
`73887e3ca5f619bb0089d88cb6daef6f507d25f3`. D1/D2 and D3/D4 remain **OPEN**.

## Exact scope

New source: `backend/src/mission_acceptance_readback_contract.js`.
New test: `backend/test/mission_acceptance_readback_contract.test.js`.
The only export is synchronous `evaluateSyntheticAcceptanceReadback`.
`mission_acceptance_readback_v2` is a separate contract, not a mutation of the
accepted v1 diagnostic, existing P7 projection or PostgreSQL schema.

FACT: this helper compares one explicitly supplied synthetic component/attempt.
It does not query PostgreSQL, run commands, import a provider, claim a common
snapshot, authenticate a principal, discover associations or aggregate a Mission.
No app/route/job/flag/config/runner/table/migration is added. It has no imports,
clock, randomness, storage, network, async work or monetary computation.

Authority: `docs/product/SIT_MISSION_MASTERPLAN_2026-09-30.md:65–84,205–206,218`;
[current PG source map](SIT_MISSION_D1_D2_PG_ADAPTER_SOURCE_MAP_2026-10-03.md);
[unchanged v1 boundary](SIT_MISSION_D1_D2_SYNTHETIC_ACCEPTANCE_OUTCOME_CONTRACT_2026-10-03.md).
The ShareItToo guardrails keep existing 10%, refund/ledger and payout-after-return
plus holds unchanged; this helper grants no cancellation, refund or retry right.

## Three separate shapes, two explicit phases

| Shape | Exact role and contents | Never means |
| --- | --- | --- |
| `plannedRequest` | Null before attempt; otherwise explicit command type/requested state, actor role/ID, idempotency key, supplied request digest and exact native quote/hash | Executed command, future Booking/Contract allocation, persisted replay |
| `preExistingContext` | Only for an attempted owner acceptance: complete `pre_existing_booking_contract_v2`, exact association, existing Booking/Contract and quote IDs/hash, requested Booking revision, renter Contract user, renter creation actor and `booking.create` lifecycle origin | A new effect of owner acceptance or proof the owner accepted |
| `observedEffect` | Only with completed effect readback; a typed renter-created request or owner-acceptance transition with complete identities, exact association, actor/type/key/digest, state and revision; independently repeated exactly in `readback.effect` | Legal validity, provider/payment success, whole-Mission success |

Supported commands are deliberately narrow:

- `booking.create`, role `renter`, actor = Mission owner/component renter,
  requested state `requested`; pre-existing context is forbidden. An observed
  creation has Booking revision 1/state requested and a renter-bound Contract.
- `booking.transition`, role `owner`, actor = component listing owner,
  requested state `accepted`; started phases require the separate complete
  requested-Booking/Contract context. A positive observed transition has the
  same existing identities, accepted state and exactly next Booking revision.
  Its type denotes a transition, never newly created Booking/Contract rows.

This follows `backend/src/booking_workflow.js:842–863,953–1003,1365–1397,1462–1540`
and `backend/src/booking_domain.js:29–35`: renter creation can already persist a
Platform-Contract while the Booking is requested; owner acceptance is separate.
Admin/system actions, counteroffers, G3 groups, amendments, cancellations,
provider actions and private Shelf conversion are unsupported and fail closed.
The current component is a listing; a released Shelf cannot become one by
changing its label. Required and optional slot labels are supported without
inferring any aggregate quorum or recovery policy.

## Native synthetic identities and supplied association

Mission and resolution IDs retain schema-native `mission_need_<uuid>` and
`mission_inventory_<uuid>` bytes; quote IDs retain `quote_<uuid>`; Contract IDs
remain bare UUIDs. Listing/Booking/user/command text identities use the explicit
synthetic fixture namespace with their role prefix. No prefix is added to an
existing native ID and no digest is relabelled after transformation.

Schema sources: `backend/sql/migrations/099_mission_need_revisions.up.sql:4–14`,
`102_mission_inventory_resolutions.up.sql:4–20,87–108`,
`016_v51_booking_quotes.up.sql:4–25`,
`015_v51_contract_persistence.up.sql:28–45`; Booking text identity validation is
`backend/src/booking_workflow.js:90–95`.

Every input requires literal synthetic/non-authentic markers and an exact
`fixtureIdentities` inventory of the native resources actually referenced in
that phase. Duplicates, unused future IDs, missing entries and kind collisions
fail closed. This inventory is explicit synthetic transport metadata, **not**
proof that a UUID is synthetic, that a row exists, or that a caller owns it.
A coherent fabricated inventory cannot authenticate itself.

Every mapped phase requires `synthetic_slot_command_association_v2`, binding the
entire supplied P7 root (Mission owner/revision/digest, resolution revision/
digest, fit digest and projection digest), entire component (slot/need/item/
owner/renter/source digest), request and readback snapshot digest. Context,
effect, no-effect proof and replay must repeat that exact association.
Missing association yields `unavailable` / `unmapped`, even when observations
claim completion. Parent/count/listing coincidence never creates an association.

FACT: no current production Mission-slot→Booking/command association is added or
proved. The association kind is a hypothetical synthetic fixture assertion,
not a new database column, command type, legal event or runtime capability.
`readback.origin = synthetic_server_fixture`, `freshness = current` and the
snapshot digest are compared claims only. The pure helper does not verify
origin, isolation, currentness, digest preimages or an actual command request
hash; that is a separately authorized future server adapter's obligation.

## Fail-closed readback and public boundary

| Supplied, exactly bound phase | Internal diagnostic |
| --- | --- |
| Not started, null request/context/effect | `not_started` |
| In flight or response unknown, unknown completion, no new effect | `readback_required` |
| Completed no effect, explicit `synthetic_terminal_no_effect_v2`, no new effect | `no_effect_observed` |
| Completed positive observation and exact repeated effect | `effects_observed_only` |
| Absent association | `unavailable`, `unmapped` |
| Invalid stable input or contradictory/incomplete observations | `unavailable` or `needs_clarification`, unmapped |

An absent database row, timeout, rolled-back marker, context-only Contract,
supplied no-effect proof or replay claim never makes a request retry-safe.
Owner unknown/no-effect phases may retain verified-shape pre-existing context;
they may not invent or emit new effects. Not-started fixtures have no Booking,
Contract, payment or provider IDs. Payment/provider fields are rejected in every
shape. `supplied_consistent_only` replay requires a completed phase and exact
request plus association; key/digest/actor/type mismatch fails closed. There is
no persistence, concurrency or exactly-once claim.

All outputs are detached/frozen, deterministically ordered and non-identifying.
They carry `bindingStatus: non_binding`, legal/Mission/payment/retry status
`not_determined`, `remediation: none`, and `provenanceStatus: supplied_synthetic_only`.
Public output is always exactly `{ status: unavailable }`; internal status must
not become a public distinguishable result. No raw identifiers, digests, slots,
media, locations or caller details are echoed.

Input must be inert plain transport data. Hidden/symbol/accessor/function fields,
inherited/exotic shapes, sparse arrays, cycles and excessive nesting fail closed
without executing their payloads. Hostile JavaScript Proxies are outside this
plain-data interface; this is not a sandbox for arbitrary executable objects.

## Focused proof and next gate

Red-first test initially failed because the source did not exist. Focused suite:
`node --import ./test_setup.js --test test/mission_acceptance_readback_contract.test.js`
(from `backend`), 76/76. Coverage includes both actors across all supported
phases; every association/context/effect field; missing/partial/mismatch; a
pre-existing requested Contract before owner acceptance; native-versus-aliased
IDs and exact fixture inventory; snapshot/parent drift; explicit no-effect proof;
replay collisions; constant public result; deterministic property/inventory
ordering; malformed/executable shapes; and exact three-file no-consumer boundary.
Only focused tests, syntax, path/diff/secret scans and unchanged-v1 byte readback
belong to this package. No database or unchanged full-suite execution is claimed.

OPEN: independently review these synthetic comparison semantics, then separately
authorize a dormant PG reader proving server-origin/common-snapshot reads and
fail-closed missing associations. Positive mapped states still require a real
authoritative relation and exact command/event/effect semantics. No distributed
atomicity, legal D1 approval, D2 concurrency/recovery closure, provider approval,
Staging activation or pilot completion follows from this source package.
