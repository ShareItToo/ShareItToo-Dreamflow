# D8-P2a — disable/re-enable decision contract

**Decision map PASS; implementation/PG gate FIX (not implemented).** Source base
`8f5c57570d4a5ee2597ecd4cbb8fc125ad77d69f`, branch
`codex/master-workflow-20260808`. Source inspection only; no PG execution,
production edits, migrations, runtime/flag changes, provider use or deployment.
This is a proposed compatibility contract, not evidence of implemented behavior.

Authority: `docs/product/SIT_MISSION_MASTERPLAN_2026-09-30.md:108–112` requires
historical bookings without Mission IDs to remain readable/workable, forbids a
parallel booking/quote/contract engine, and requires rollback to close new entries
first while protecting ongoing components and historical evidence.

## Present startup vector and explicit decision

`backend/src/config.js:83–112,471–480` freezes the following startup values:

| Symbol | Existing flag | Default and dependency |
| --- | --- | --- |
| C | `PLANNER_CORE_ENABLED` | false; production enable prohibited |
| I | `PLANNER_INVENTORY_ENABLED` | false; requires C; production enable prohibited |
| D | `PLANNER_DEMAND_ENABLED` | false; requires C+I; production enable prohibited |
| P | `PLANNER_SUPPLY_PARTICIPATION_ENABLED` | false; strict boolean; true requires C+I+D and development/test/staging |
| W | `SIT_MISSION_WEB_PREVIEW_ENABLED` | false; compile-time Web presentation only, not backend authority |

C/I/D accept only the normalized string `true` as enabled; unlike P, other input
is not a configuration error. The planner's `demandActivationAllowed`,
`publicReleaseAllowed`, `externalGenerativeAiAllowed` and
`inventoryResolutionAllowed` remain hard-coded false. Technical I does not enable
the separately prohibited `inventoryResolutionAllowed` capability.

**The existing all-off vector cannot meet D8's ongoing-component rollback
contract.** C=I=D=P=false closes every gated read and every reduction/revocation
route together with new entry. It is a technical emergency kill, not a compatible
new-entry rollback. W=false alone merely hides a fixed synthetic Web preview.
Neither setting undoes existing rows, contracts or provider effects.

**Minimal proposed seam:** one independent startup admission bit, provisionally
`PLANNER_NEW_ENTRIES_ENABLED` → `config.planner.newEntriesEnabled`, default false,
strict boolean, with the same non-production restriction and C prerequisite.
This name/bit does **not** exist today. Keep existing technical gates unchanged;
add the admission check to expansion actions below. Disabled rollback preserves
the previously authorized C/I/D/P vector and turns admission off. It must not
enable a capability that was already off. W may independently be compiled off.
Re-enable restores admission only through an explicit eligible process restart;
it does not restore withdrawn participation or revoked releases. No hot switch,
schema, Mission→Booking relation, historical backfill or forced downmigration.

## Complete current surface/action map

Paths below are under `/v1/`; route bindings are in `backend/src/app.js`.
“Keep” means only under the unchanged technical gate, authenticated active
account and existing owner/participant, suspension, revision, expiry and privacy
checks. It is not anonymous access or a waiver of current restrictions.

| Current surface/action and route binding | Present gate | Proposed admission-off disposition |
| --- | --- | --- |
| Need: list/read `GET mission-needs[/ :id]` (5750,5758); create `POST mission-needs` (5767); correct `POST mission-needs/:id/revisions` (5779) | C, same gate for all | Keep list/read; block create and general correction/revision. No respond/withdraw/revoke endpoint exists. |
| Fit: list `GET mission-needs/:id/fit-checks` (5792); read `GET mission-fit-checks/:id` (5814); create nested POST (5801); correct `POST mission-fit-checks/:id/revisions` (5823) | C | Keep list/read; block create/correct. No respond/withdraw/revoke endpoint exists. |
| Inventory resolution: list `GET mission-needs/:id/inventory-resolutions` (5836); read `GET mission-inventory-resolutions/:id` (5862); create nested POST (5847); correct `POST mission-inventory-resolutions/:id/revisions` (5873) | C+I | Keep list/read; block create/correct. No respond/withdraw/revoke endpoint exists. |
| Supply demand: list/read `GET mission-supply-demands[/ :id]` (5888,5896); create `POST mission-inventory-resolutions/:id/supply-demands` (5905) | C+I+D; create additionally needs recipient resolver and rate limiter | Keep participant-only list/read; block create before recipient resolution. No generic correction or withdraw endpoint exists. |
| Demand response `POST mission-supply-demands/:id/respond` (5919), `decision=release` | C+I+D | Block: it creates a private supply release, hence expands access even for a pre-existing demand. |
| Same response, `decision=reject` | C+I+D | Keep for the existing addressed recipient and pending unexpired demand, with current expected revision and command/replay rules. |
| Release revoke `POST mission-supply-demands/:id/revoke` (5932) | C+I+D | Keep for existing recipient/released demand/release with current revision and command/replay rules. Preserve **account-scope** suspension guard, not booking-scope. |
| Participation: read `GET mission-supply-participation` (5950); set `POST mission-supply-participation` (5955) | C+I+D+P | Keep owner-only read; block `status=active`; keep `status=withdrawn` only for an existing participation, never bootstrap a root. No separate list/correct/respond/revoke route. |
| Participation item: `POST mission-supply-participation/items/:shelfItemId` (5962) | C+I+D+P | Block `availabilityStatus=confirmed_available`; keep `withdrawn` only for an existing participation **and existing item/need revision history**. No separate list/read/correct/respond/revoke route. |
| Shared private shelf: list/read `GET private-shelf[/ :id]` (5976,5984); create POST (5993); delete `DELETE private-shelf/:id` (6005) | C | Keep owner-only list/read and existing owner delete with existing cleanup behavior; block create. No correction/respond/withdraw/revoke endpoint exists. |
| Shared private-shelf media: upload `POST private-shelf/:id/media` (6021); read `GET private-shelf/:id/media/:mediaId/:variant` (6084) | C; upload also verified email | Keep existing owner-only media reads; block upload before sanitization, file/storage writes or cleanup-queue reservation. Do not reinterpret upload as harmless correction. |
| Web `/mission` preview | W + Web platform only | W=false hides preview; it currently has fixed synthetic in-memory data, no authoritative domain consumer. Backend admission remains necessary. |
| Quorum projection | test-only synthetic read-only adapter | No production route to disable, no new consumer or linkage proposed. |

All backend gates also require their existing forbidden-capability sentinels to
stay false. Need/Fit/Inventory/Demand read/create/correction/response routes retain
their existing booking-scope suspension checks; revoke retains account-scope.
Participation and shelf retain their current guards; do not add a blanket booking
suspension condition that could obstruct permitted withdrawal/deletion.

### Boundary details the implementation must prove

- General revisions remain blocked because current payloads have no proven
  reduction-only correction mode. This does not block ordinary booking execution.
  Do not invent new Mission cancellation or component semantics to fill N/A cells.
- `mission_supply_participation_workflow.js:192–223` currently creates a root even
  for first-command `withdrawn`; `:225–263` can create an initial withdrawn item
  revision with latest=0. Thus a route-only “withdraw is safe” exemption is
  insufficient. Add only the disabled-mode no-bootstrap predicate under the
  existing owner lock/transaction; no check-then-write race or new persistence.
  Existing behavior with admission enabled is outside this proposed restriction.
- Demand `respond` accepts only reject/release (`:164–169`); workflow `:590–682`
  already has recipient, status, expiry/revision and idempotency checks. Preserve
  those exact checks and purpose-limited release projection; never bypass them
  merely because a command is classified as reduction.
- Block expansion commands with a stable non-disclosing 404 even for a formerly
  successful command replay; existing reads recover their persisted results.
  Preserve exact-key/digest replay of permitted reduction commands without new
  revisions/effects. Validate action discriminants before selecting exemptions;
  malformed or unknown values must never enter a reduction path.
- Keep all-off as a separately labelled emergency profile. It cannot claim the
  ongoing availability guarantee above; a different approved recovery/access
  procedure would be required. Never silently turn C/I/D/P on to evade it.

## Ordinary booking/history boundary — unchanged and independent

`app.js:2239–2241,6496–6499`: participant `GET /v1/rental-requests` calls the
existing transactional `listBookings(client,userId)`. The new admission seam
must not reach this consumer, `booking_workflow.js`, booking domain/group rules,
quote authority or contract workflows. No Mission ID becomes required.

Keep current availability and guards for quote (5658), create/amend (6203,6221),
flow-time/read/write (6237,6322), address reveal (6245), contract receipt (6260),
confirmation challenge/verification and condition evidence (6336–6385), return
cases (6369), transitions (6405), platform/booking withdrawal and receipt
(6422–6448), actual-loss flows (6463–6471), handover exceptions (6824), reviews
(7082,7101), and existing rental-request sync (6501). “Keep” never activates an
otherwise disabled booking pilot or payment/provider lane. Preserve private-pilot,
auth/session, participant, owner, rate-limit and lifecycle restrictions, workflow
version-0 quarantine until existing revalidation, and same-owner group rules.

## Verification and exact source binding

Fresh source reads and SHA-256 binding only; no new executable behavior was tested
or claimed. Prior D8-P1/P2 focused test evidence remains in the preceding capsules;
no unchanged green suite was rerun for this documentation-only decision.
Consumer search of booking workflow/domain/group and contract workflows found no
Mission/planner dependency. Document whitespace and secret-pattern checks pass.
No foreign capsule, Apple/password/notification file was edited.

Full-file SHA-256 (paths under repository root):

```text
ed66b274d8d26ab142bf51d2b04440eb7c6d78e43a08e90f8215b301d18d0647 backend/src/app.js
9759813ec5af32956a2485beaf7aeeb39420eec33c19c382a0c2c937f0bc82d8 backend/src/config.js
53ff315bb63cacac114b757bd73839633288c57775498bdbf018d13c4242df4b backend/src/mission_need_workflow.js
3d24aca251aedf97b785dc93f3d585f32b02e65a85dd7b0f9fc59320ec65974b backend/src/mission_fit_check_workflow.js
4f5f75166513e842ddd162533c7bfa3dd9636a02e01b379640e84b310a21d26b backend/src/mission_inventory_resolution_workflow.js
95338c1a1e2073e899cb2f2b3bb57570c87f1230e55c372af4e474a782cf17aa backend/src/mission_supply_demand_workflow.js
5b7c8f93757e964f0e1669513e8bc3bd5f8823801e2db91a61f20f3735b254a1 backend/src/mission_supply_participation_workflow.js
1bd4979d7232d01658eaa511b408b8cf212f062063151f9020c18ab3af544be5 backend/src/private_shelf_workflow.js
1787b0613e37efad99174142f4b34367659966b6b6f64cb3611383abd3ee82f2 backend/src/booking_workflow.js
003fd0718958f33c4719b995a376a8fc2dafa829258df8621f69e97e1bf8abf3 lib/config/mission_web_entry_config.dart
11d00177112e2a3b1923d1f39af396bb496dc9da93c67cd1d3f2ffbe0093d6a7 lib/screens/mission_web_entry_screen.dart
22375f1c7847a76e55fcb362e476067086fb3a5c5d6c378592bc20635847001d docs/product/SIT_MISSION_MASTERPLAN_2026-09-30.md
```

## Exact next task / D8-P2b prerequisites

1. Accept this action contract, then separately authorize the minimal admission
   seam/config/route predicates and two transactional no-bootstrap checks, with
   focused source tests. No schema change or booking dependency. Until implemented,
   D8-P2b cannot prove this proposal by merely toggling the old broad flags.
2. Bind the accepted implementation hash; reserve one dedicated group in the
   existing isolated PG16 runner. Boot eligible technical-on/admission-on → same
   vector/admission-off → same vector/admission-on app processes against one
   isolated synthetic database. No provider calls or runtime rollout.
3. Use owner/renter/foreign principals, populated Mission fixtures, a completed v1
   booking with no due hold, and a separate quarantined-v0/revalidation control.
   Prove all table dispositions, fail-closed unknown actions/replays, no-bootstrap,
   authorization, allowed reduction replay and process-restart persistence.
4. Compare exact canonical serialized stored values of `bookings`,
   `rental_requests`, `booking_quotes`, `platform_contracts` and participant history
   through disable/re-enable (not PostgreSQL physical storage bytes). Test hold
   expiry separately; legitimate reduction appends may change Mission rows, so do
   not assert all Mission tables immutable. Re-enable must not undo revocation or
   withdrawal. Keep v0 quarantine and same-owner rules unchanged.

The project-context/product guardrails constrain this packet to source evidence
and pilot-compatible boundaries; it is not staging, provider or release approval.
