# D8-P2b — admission implementation and isolated PostgreSQL acceptance

**PASS — bounded source/local-PG package; not staging or release approval.**
Accepted contract: `SIT_MISSION_D8_P2A_DISABLE_REENABLE_CONTRACT_2026-10-03.md`.
Branch `codex/master-workflow-20260808`; final readback HEAD
`54b635adbfb72b3fd64c99501c9c22896bd0d284` plus the uncommitted paths below.
No commit/push, migration/schema, provider/payment, live runtime or deployment
change. No foreign capsule, Apple/password/notification file edited.

## Implemented boundary

- `PLANNER_NEW_ENTRIES_ENABLED` is independent, default OFF, strict boolean;
  enabled only with C=true in development/test/staging. Existing C/I/D/P gates
  and prohibited capabilities are unchanged. No runtime-mutating switch.
- Need/Fit/Inventory create/revision, demand creation/release, participation
  activation/item confirmation, shelf create/upload require admission. Disabled
  expansion and unknown actions return non-disclosing 404 before workflow work;
  old expansion replays are also closed. Complete workflow validation still runs
  for recognized reduction payloads.
- Reads, recipient rejection/revocation and existing owner withdrawal/delete keep
  their original guards. Revoke remains account-scope, response booking-scope.
  Disabled first root/item withdrawal cannot bootstrap rows; predicates run under
  the existing owner lock/transaction. Enabled-mode first withdrawal behavior is
  explicitly retained. Command digests/idempotency/schema are unchanged.
- Ordinary booking/history/quote/contract workflows receive no Mission dependency.
  No Mission→Booking relation, backfill, same-owner relaxation or v0 bypass.
- Six existing Mission/shelf PG fixtures now explicitly opt in to admission;
  those files otherwise retain their original assertions. The shared runner adds
  only `missionAdmission` / `SIT_POSTGRES_FOCUSED_MISSION_ADMISSION`, retaining
  every existing standard/focused group, including enrollment and notifications.

## Decisive proof

Test-first source test failed on missing admission module, then passed. The final
focused backend set is **74/74 PASS, zero skipped**. Separate helper-discovery
invocation is **5/5 PASS** (four admission tests plus inert support-file discovery).
The final PG16.15 (Homebrew, aarch64) run is **1/1 PASS, zero skipped**:

- Three distinct real app processes, admission on→off→on with unchanged C/I/D/P;
  memory mail/push/payment transports asserted inside each process, sanitized
  explicit child environment, loopback-only HTTP and PG.
- Owner/renter/foreign principals; populated Need, Fit, Resolution, demand/release,
  participation/items, shelf/media. Authorized reads persist; foreign reads,
  forged recipient actions, stale revisions and malformed reductions reject.
- Fifteen expansion/unknown cases plus prior activation/item/release replays and
  actual multipart upload reject. Blocked commands leave the complete Mission/
  shelf logical graph and effect counts unchanged; resolver calls stay zero.
- Existing rejection, revocation, item/root withdrawal and deletion work; exact
  reduction replay writes no new graph rows. Existing booking suspension blocks
  response but not account-scope revoke or owner withdrawal. Suspension fixture
  uses the real moderation workflow, not a disabled database guard.
- Completed v1/no-due-hold booking has contradictory legacy payload and an ended
  listing. Relational authority wins; renter sees platform contract, owner does
  not; foreign sees no history. Canonical `to_jsonb(row)::text` arrays for actual
  `bookings`, `rental_requests`, `booking_quotes`, `platform_contracts` and history
  payloads remain exact across disable/re-enable. This is logical equality, not
  PostgreSQL physical-byte equality or legal validity of synthetic contract text.
- Separate v0 stays hidden until the existing authorized B6 PATCH revalidation;
  foreign PATCH fails. Its legitimate mutation is excluded from the protected-v1
  snapshot. Reduced Mission state and full/thumbnail media hashes survive restart;
  re-enable never automatically restores revoked releases/withdrawn participation.

Final sanitized process readback: three distinct PIDs, exits `[0,0,0]`, all app
ports closed. Guarded synthetic upload directory removed and absence asserted.
Runner result: `status=passed-and-cleaned`, `postgresMajor=16`,
`host=127.0.0.1`, only `mission_admission_postgres.integration.test.js` selected.
Earlier fixture-only failures (catalog required fields, short provenance version,
legacy suspension insert) were corrected by satisfying existing constraints;
no production constraint or assertion was weakened.

## Reproduce from repository root

```sh
node --import ./backend/test_setup.js --test backend/test/mission_admission.test.js backend/test/mission_need_workflow.test.js backend/test/mission_fit_check_workflow.test.js backend/test/mission_inventory_resolution_workflow.test.js backend/test/mission_supply_demand_workflow.test.js backend/test/mission_supply_participation_workflow.test.js backend/test/private_shelf_workflow.test.js backend/test/local_postgres_integration_runner.test.js backend/test/booking_history_authority.test.js backend/test/booking_workflow_sql.test.js backend/test/booking_domain.test.js backend/test/booking_group_domain.test.js
node --import ./backend/test_setup.js --test backend/test/mission_admission.test.js backend/test/support/mission_admission_app_process.js
SIT_POSTGRES_FOCUSED_MISSION_ADMISSION=1 node tool/run_local_postgres_integration.mjs
node backend/ops/scan_git_secrets.mjs --working-tree-only
git diff --check
```

Changed-source syntax checks, working-tree secret scan and whitespace checks pass.
Consumer search in booking workflow/domain/group and v51/v52 contract workflows
finds no Mission/planner dependency. No broad/full PG or external acceptance claim.

## Exact changed-file SHA-256 binding

```text
d9a76fd02dd681ca087df17493c32378da4fe60ea3f2c89d75067bc5fb2c4785 backend/src/mission_admission.js
cc925cfd35ab2a59b4725358958cbe60a6156a4e7437d95ea617a9ef27ef33d6 backend/src/app.js
0877f2ecdf5157fedb6906b0adfa1a8ade3a730fe7929c395e1f10ac8cb9bd77 backend/src/config.js
3a9ad4c0a2fac6039fedf99a11ce615b5dbf67c9630828ead09b4926f0c636b2 backend/src/mission_supply_participation_workflow.js
0c10255531db368c6e0da3e0e41459b5d23d28f20ff7058a035d1270c24ced6d backend/test/mission_admission.test.js
15d1a11423dd30ddc07c09c4db7d30aecf1a6c2313ef5d945414f9bde30fbb12 backend/test/mission_admission_postgres.integration.test.js
4a2b5b2b00fcc8fd028549f8d69728e7501a74fac939f6e38acd84f01133d6f4 backend/test/support/mission_admission_app_process.js
2764868d416431aa8dcabb4b1dbab12507bf5b82da11ae5c77b265f7fa4ac58c backend/test/local_postgres_integration_runner.test.js
46b70027ff6038a0e26590d106998c227a19d6dd10105c06bf8f014347f49d65 tool/run_local_postgres_integration.mjs
b870b7b2ef29fd8c4abf336269db38d22c8296acfbb3b6176ab5650da3f300cb backend/test/mission_need_postgres.integration.test.js
755256aba7654e313cd4d5776bd397c43ac427fc2617c9b12dd81d56e3303cf2 backend/test/mission_fit_check_postgres.integration.test.js
1ccacc97b1630975db49417ac8951397a79f319bd49cb953c3180876e8199acd backend/test/mission_inventory_resolution_postgres.integration.test.js
fe5e971d1a65b41467aa76d2dceb44e90aacc37fa0aefc0b28fd8b986fdcf4bd backend/test/mission_supply_demand_postgres.integration.test.js
5bdbebb96a726601f410708631ad31a48497f22c6e785f6a0bbc6ed0f7798c7b backend/test/mission_supply_participation_postgres.integration.test.js
d022221aea74c9f263412bdbe335d18caaab37afc12ab522034a9aa555cf7563 backend/test/private_shelf_postgres.integration.test.js
```

## Next gate

Independent source/contract review, then coordinator-owned broader regression
closure before any separate rollout authorization. Existing older Mission PG
suites still pin terminal migration `104` although current migration history has
`105`; that pre-existing terminal-assertion debt is not corrected or claimed green
here. This package's new PG suite executes the complete current migration set.
Project-context and ShareItToo guardrails kept this local source/PG proof separate
from staging, provider, legal-contract and release approval.
