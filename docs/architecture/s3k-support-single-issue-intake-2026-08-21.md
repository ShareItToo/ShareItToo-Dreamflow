# S3K single-issue support intake - architecture

Status: technically verified for non-live operation on 22.08.2026. Production,
external delivery and public or invited pilot operation remain closed.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, modified
  `2026-08-20T22:29:02.738Z`.
- Scenario `SUP-026`: two independent problems in one intake must be separated
  or represented as separate linked cases.
- Existing safety-first and canonical support intake controls in S3A through
  S3C, plus append-only case and audit truth from migration `032`.

## Client flow

1. The immediate-danger question remains first. Its emergency guidance must be
   acknowledged before intake continues.
2. The scope page asks whether the current case contains exactly one problem.
3. A direct confirmation opens the existing category flow.
4. A multiple-problem answer opens separation guidance and no category. The
   user must choose one problem for this case before categories become
   available.
5. Submission carries `issueScope.version`, `singleIssueConfirmed=true` and
   the boolean `separationGuidanceShown` together with safety evidence.

Back navigation can revise the scope answer before submission. Retry keeps the
existing intake idempotency key and exact evidence.

## Server and database boundary

`normalizeSupportCaseInput` requires version
`sit_support_single_issue_scope_v1`, exact booleans and a true single-issue
confirmation. No text classifier, model or heuristic participates.

Migration `040` adds nullable JSONB solely for backward compatibility with
pre-migration cases. A database trigger requires exact evidence for every new
case, the shape constraint rejects extra or invalid fields, and an update
trigger makes recorded evidence immutable. The workflow stores the same object
in the append-only creation event and only minimized version/guidance metadata
in the general audit log.

Privacy and retention source inventories bind the changed domain, workflow and
migration while remaining draft and fail-closed. Existing P0B PSP and invited
pilot evidence hashes are refreshed without changing their zero-pass HOLD
state.

## Explicit exclusions

- no automatic issue extraction, split, merge or duplicate decision;
- no automatic creation or linking of a second case;
- no support assignment, response, notification or case-state mutation;
- no production, Cloud, VPS, DNS, payment, Store or real-money mutation.
