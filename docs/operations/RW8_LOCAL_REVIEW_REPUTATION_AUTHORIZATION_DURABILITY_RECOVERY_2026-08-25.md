# RW8 local review/reputation authorization, durability and recovery

Date: 2026-08-25
Run mode: synthetic local implementation and verification only

## Supported checks

```bash
flutter analyze \
  lib/screens/own_profile_screen.dart \
  lib/screens/privacy_info_screen.dart \
  lib/screens/public_profile_screen.dart \
  lib/services/data_service.dart \
  lib/services/shared_persistence_sync.dart \
  lib/widgets/review_prompt_sheet.dart \
  test/review_metrics_service_test.dart \
  test/review_prompt_sheet_logic_test.dart \
  test/rw8_local_review_reputation_authorization_durability_test.dart
flutter test --reporter expanded \
  test/rw8_local_review_reputation_authorization_durability_test.dart \
  test/review_metrics_service_test.dart \
  test/review_prompt_sheet_logic_test.dart
node --test \
  test/tool/validate_g2_data_lifecycle.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs \
  test/tool/validate_retention_deletion_readiness.test.mjs \
  test/tool/validate_active_infrastructure_mail_provider_readiness.test.mjs \
  test/tool/rw8_local_review_reputation_authorization_durability_wiring.test.mjs \
  test/tool/validate_rw8_local_review_reputation_authorization_durability.test.mjs
node tool/validate_g2_data_lifecycle.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_active_infrastructure_mail_provider_readiness.mjs
node tool/validate_rw8_local_review_reputation_authorization_durability.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

## Current evidence

- Focused RW8 Flutter matrix: passed.
- Changed-file analyzer: zero issues.
- G2 lifecycle, privacy, retention and provider-readiness validators: passed;
  provider result remains `prepared-hold`, 0/10 decisions and not externally
  ready.
- Frozen implementation candidate:
  `9d4780f0d7ebd88bc2521ae38d77203e181ecda6`.
- Complete technical regression: passed with standard parallelism and no timing
  workaround; 496 default-profile Flutter tests passed with three documented
  profile skips, analyzer reported zero issues, Web debug plus loopback smoke
  passed, and Android debug completed 448 tasks with binary `minSdk 24`.
- Exact-head GitHub Regression `32830068534` passed on attempt 2 and CodeQL
  `32830068632` passed on the same candidate; open code-scanning alerts: zero.
  Regression attempt 1 was canceled only by the branch concurrency policy and
  is not counted as success evidence.

## Ratchet audit

RW8 changed the privacy and retention manifests because local reviews are now
explicitly bound to export, deletion/anonymization and shared-public-record
truth. Active provider evidence changed only to bind those reviewed manifest
hashes; provider state remains `prepared-hold`, 0/10 owner decisions and not
externally ready. No provider decision or gate changed.

The full regression caught every dependent source hash rather than bypassing
it. RW3, RW4 and RW6 were mechanically refreshed after the shared compliance
section changed. The public-profile fixture was then made explicit so it no
longer depended on forbidden read-time review seeding, and RW0's bound hash was
mechanically refreshed. Package validators and the final full regression passed
after those changes.

## Operational behavior

- Public reputation reads remain available without an owner session.
- Local writes require the matching current booking participant and context.
- Missing classic review storage remains empty and never triggers read seeding.
- Corrupt or duplicate entries preserve exact raw documents and fail closed.
- Each review document accepts at most 1,000 entries; overflow never prunes.
- Storage failure preserves prior bytes and does not poison the queue.
- Local privacy export includes current-account authored and received reviews.
- Shared public reviews remain retained with account anonymization; no period is
  invented.
- Submission and profile review surfaces expose deterministic retry.

## Recovery and rollback

Do not normalize, clear or partially salvage a malformed review document. Keep
the affected read/write surface closed, preserve exact bytes and perform a
separately reviewed recovery. Capacity exhaustion requires explicit lifecycle
or storage remediation; dropping older reviews is forbidden.

Rollback is a normal Git revert of the bounded RW8 implementation before a
successor depends on it. Revert code, lifecycle, privacy, retention, ratchet,
validator and evidence changes together. Do not reset, rebase or rewrite
history.

## Open gates

The GitGuardian owner-history review remains open and its finding contents were
not inspected. BUILD_READY, Play upload, human pilot activation, PR #7 merge,
production/provider/AI, real money and every VPS/DNS/Cloud/Store/legal-owner
gate remain ungranted.
