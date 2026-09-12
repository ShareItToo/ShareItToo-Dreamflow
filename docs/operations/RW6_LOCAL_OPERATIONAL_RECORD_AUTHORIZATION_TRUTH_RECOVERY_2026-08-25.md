# RW6 local operational-record authorization and truth recovery

Date: 2026-08-25
Run mode: synthetic local implementation and verification only

## Supported checks

```bash
flutter analyze <RW6 changed Dart and test paths>
flutter test --reporter compact \
  test/rw6_local_operational_authorization_truth_recovery_test.dart \
  test/notification_cta_resolver_test.dart \
  test/data_service_booking_rules_test.dart \
  test/qa_seed_smoke_test.dart
flutter test --reporter compact \
  test/invoices_service_rules_test.dart \
  test/review_prompt_sheet_logic_test.dart \
  test/qa_bootstrap_service_test.dart \
  test/shared_message_thread_sync_test.dart \
  test/secure_booking_confirmation_test.dart \
  test/rw5_local_safety_privacy_principal_isolation_test.dart \
  test/reduced_wave0_local_principal_isolation_test.dart \
  test/b10_release_truthfulness_test.dart
node --test \
  test/tool/validate_g2_data_lifecycle.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs \
  test/tool/validate_retention_deletion_readiness.test.mjs \
  test/tool/rw6_local_operational_authorization_truth_recovery_wiring.test.mjs \
  test/tool/validate_rw6_local_operational_authorization_truth_recovery.test.mjs
node tool/validate_g2_data_lifecycle.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_rw6_local_operational_authorization_truth_recovery.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

Focused RW6 result: 19 passed. The combined RW6 booking, notification and QA
matrix passes 99 checks. Changed-file analysis passes with zero issues. The
adjacent account, shared-thread, secure-confirmation and predecessor matrix
passes 64 checks. Lifecycle, privacy, retention and RW0-RW6 evidence wiring
pass 101 Node checks. The two newly exposed auth-boundary integrations pass 9
checks. The full technical regression passes in the supported candidate-
rollover CI metadata mode: analyzer zero issues, default Flutter 471 passed
with three documented profile skips, every exact RW profile, Web/Wasm, Android
debug assembly with 448 tasks, minSdk 24 and the resource guard. The ordinary
local Store-handoff path stops before that matrix because the older bound
private AAB is absent; RW6 neither recreates nor relabels that candidate.
Exact implementation head `bb0d651b133b048084758dd558d52ae5d09242ee`
passes GitHub Regression `32818242417` and CodeQL `32818242414`, with zero open
code-scanning alerts. PR #7 remains open, Draft, unmerged and `CLEAN`.

RW6 changes the privacy and retention manifests, whose exact hashes are also
ratcheted by the active infrastructure/provider readiness validator. Its two
source bindings were advanced to the newly validated manifest bytes only; the
provider decision remains `prepared-hold`, all ten owner decisions remain open,
and its seven mutation/negative tests plus direct validator pass.

## Operational behavior

- A cached profile is accepted only with a matching auth session; QA uses its
  explicit runtime persona.
- Request, timeline, handover and helper records require owner or renter
  participation; message and notification APIs cannot select a foreign user.
- Thread deletion is a current-user tombstone and never erases the counterparty.
- Unattributed legacy notifications remain preserved, unassigned and excluded.
- Corrupt stores retain their exact raw bytes and fail closed.
- Full stores reject new writes without pruning any accepted history.
- Serialized writes recheck the captured session and verify persisted values.
- Open communication surfaces clear previous-account state before reload.
- Privacy export and both account-deletion paths apply the documented scoped
  operational-record policy.

## Recovery and rollback

Do not delete or normalize a malformed operational document. Preserve it for a
separately reviewed recovery and keep the affected UI closed. Capacity failure
requires an explicit lifecycle decision; silent pruning is forbidden.

Rollback is a normal Git revert of the bounded RW6 implementation before a
successor depends on it. Do not reset, rebase or rewrite history. Revert the
architecture, lifecycle, privacy, retention and evidence claims together, and
never restore two-party thread deletion or corrupt-to-empty behavior.

## Open gates

RW6 does not inspect historical GitGuardian finding contents and does not close
that owner gate. BUILD_READY, Play upload, human pilot activation, PR #7 merge,
real provider/AI, real money and every production/VPS/DNS/Cloud gate remain
ungranted.
