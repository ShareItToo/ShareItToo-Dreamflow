# D8-P2 — current disable-seam gap

**FIX / D8 PostgreSQL acceptance remains open.** Source base:
`2a30535270636dbecfcc06da0e7f1ba3d297268d`, branch
`codex/master-workflow-20260808`. Inspection only plus focused source tests;
no production/migration/flag/runtime/provider changes and no database started.

## Existing mechanisms, not missing flags

| Source | Actual mechanism | D8 limit |
| --- | --- | --- |
| `backend/src/config.js:83–112,471–480` | Default-off `PLANNER_CORE_ENABLED`, `PLANNER_INVENTORY_ENABLED`, `PLANNER_DEMAND_ENABLED`, `PLANNER_SUPPLY_PARTICIPATION_ENABLED`; frozen startup config, dependency checks, production refusal. | An all-off process profile is available, but has not been designated as the D8 new-entry rollback contract. No runtime mutable switch should be invented. |
| `mission_need_workflow.js:127–135`, `mission_fit_check_workflow.js:292–300`, `mission_inventory_resolution_workflow.js:370–379`, `mission_supply_demand_workflow.js:188–209`, `mission_supply_participation_workflow.js:32–40` (under `backend/src/`) | Existing 404 technical-access gates. | They gate reads and mutations together. They do not specify which ongoing Mission reads/corrections/responses/withdrawals/revocations survive a D8 new-entry disable. |
| `backend/src/app.js:5750–5793` and adjacent Mission routes | Need GET/list/create/revision all use the same technical gate before opening their transaction. | A flag-off HTTP test would prove that existing gate, not a newly assumed “close new entries but preserve ongoing components” contract. |
| `lib/config/mission_web_entry_config.dart:3–14` | `SIT_MISSION_WEB_PREVIEW_ENABLED`, explicitly presentation-only. | Hiding the Web entry grants/revokes no domain capability and is not a backend rollback adapter. |
| `backend/test/mission_supply_participation_postgres.integration.test.js:340–410` | Existing separate-process participation-off test covers read/activate/withdraw/item-confirm/item-withdraw 404 and unchanged aggregate effect counts. | Read as source, not executed here. It uses initially empty participation rows; does not prove on→off→on byte equality of populated booking/quote/contract/history. |
| `backend/src/mission_quorum_projection_workflow.js:48–56,123–132` | Test-only synthetic adapter, Repeatable Read / Read Only. | Not a production disable consumer or a Mission→Booking relation. |
| `backend/sql/migrations/099_mission_need_revisions.down.sql:1–16`, `104_mission_supply_participation.down.sql:1–24` | Refuse destructive downmigration while protected rows exist. | These guards are not feature-disable/re-enable procedures; do not execute downs to manufacture a rollback test. |

The missing seam is **the explicit D8 surface/compatibility mapping**, not a
missing technical off-switch. The masterplan `:112` requires closing new entries
while protecting ongoing components. The existing technical gates alone do not
settle that mapping. No designated D8 disable/re-enable adapter or caller was
found in the inspected backend, Flutter or tooling sources. Selecting a broader
all-off profile and calling it that contract would be a new interpretation.

## PostgreSQL prerequisites already available

`tool/run_local_postgres_integration.mjs:17–18,24–140,310–449` pins PostgreSQL 16,
creates a temporary loopback-only cluster/database, runs sequential focused
groups and cleans owned resources. No dedicated D8 group exists. No shared
runner edit is warranted until the seam is specified.

`backend/test/postgres_foundation.integration.test.js:4584–4647` already contains
real version-0 quarantine then existing B6 PATCH revalidation; `:5871–5912`
contains legitimate hold-expiry mutation during history reads. These were read,
not rerun. D8 must keep expired-hold behavior separate from a protected completed
version-1 fixture, and must not treat v0 revalidation as a mutation of that v1
baseline. `GET /v1/rental-requests` (`app.js:6496–6499`) still uses the ordinary
transactional participant history consumer; booking workflow/domain/group sources
have no Mission dependency. D8-P1 is an executed projection test, not DB isolation.

## Verification

From `backend/`:

```sh
node --import ./test_setup.js --test test/mission_need_workflow.test.js test/mission_fit_check_workflow.test.js test/mission_inventory_resolution_workflow.test.js test/mission_supply_demand_workflow.test.js test/mission_supply_participation_workflow.test.js test/local_postgres_integration_runner.test.js
```

**44/44 PASS, 0 skipped.** These are source/domain/runner-contract tests, not a
PostgreSQL execution claim. Consumer search, document secret-pattern check and
`git diff --check` clean. Apple/password/notification files and foreign capsule
were not edited.

Key current full-file SHA-256 bindings:

- PG runner: `ded7cfe1cc8be48b3dfdbdfcc300dcad07a66e9a263bd0f6f0bb8b214b28cb8d`
- Backend config: `9759813ec5af32956a2485beaf7aeeb39420eec33c19c382a0c2c937f0bc82d8`
- Need gate/workflow: `53ff315bb63cacac114b757bd73839633288c57775498bdbf018d13c4242df4b`
- Participation gate/workflow: `5b7c8f93757e964f0e1669513e8bc3bd5f8823801e2db91a61f20f3735b254a1`
- Booking authority: `1787b0613e37efad99174142f4b34367659966b6b6f64cb3611383abd3ee82f2`

## Exact next task

**D8-P2a: source-bound disable/re-enable contract map, no implementation.** Name
the exact existing flag vector/startup boundary and, for every Mission surface,
the disabled-mode disposition of create/list/read/correct/respond/withdraw/revoke.
State explicitly which ordinary booking/history operations remain available and
whether the existing broad technical off-profile is intended to meet D8. Do not
add a Mission→Booking relation. If the mapping needs narrower gates than current
source provides, identify only that minimal separately authorized source change.

Then **D8-P2b**, against the designated seam: one isolated PG16 test with owner,
renter and foreign principal; separate quarantined-v0/revalidation control;
completed v1/no-due-hold fixture; canonical stored-row and history-payload snapshots
across separately booted on→off→on app processes. Compare exact serialized values
of `bookings`, `rental_requests`, `booking_quotes`, `platform_contracts` and history
payloads, without conflating PostgreSQL physical storage bytes with logical row
equality. No provider use, migrations down, new Mission field or same-owner change.
