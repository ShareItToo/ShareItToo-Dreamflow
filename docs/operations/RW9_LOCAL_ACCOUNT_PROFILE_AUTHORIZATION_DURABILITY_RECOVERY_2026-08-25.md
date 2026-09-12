# RW9 local account/profile authorization, durability and recovery

Date: 2026-08-25
Run mode: synthetic local implementation and verification only

## Supported checks

```bash
flutter analyze \
  lib/models/user.dart \
  lib/services/account_deletion_service.dart \
  lib/services/data_service.dart \
  lib/screens/change_address_screen.dart \
  lib/screens/contact_data_screen.dart \
  lib/screens/edit_profile_screen.dart \
  lib/screens/edit_social_media_screen.dart \
  lib/screens/explore_screen.dart \
  lib/screens/own_profile_screen.dart \
  lib/screens/privacy_info_screen.dart \
  lib/screens/profile_info_screen.dart \
  test/rw9_local_account_profile_authorization_durability_test.dart
flutter test --reporter expanded \
  test/rw9_local_account_profile_authorization_durability_test.dart
node --test \
  test/tool/validate_g2_data_lifecycle.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs \
  test/tool/validate_retention_deletion_readiness.test.mjs \
  test/tool/validate_active_infrastructure_mail_provider_readiness.test.mjs \
  test/tool/rw9_local_account_profile_authorization_durability_wiring.test.mjs \
  test/tool/validate_rw9_local_account_profile_authorization_durability.test.mjs
node tool/validate_g2_data_lifecycle.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_active_infrastructure_mail_provider_readiness.mjs
node tool/validate_rw9_local_account_profile_authorization_durability.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

## Current evidence

- Focused RW9 Flutter matrix: 13 passed.
- Changed-file analyzer: zero issues.
- G2 lifecycle, privacy, retention and provider-readiness validators: passed;
  provider result remains `prepared-hold`, 0/10 decisions and not externally
  ready.
- Full local technical regression on
  `0bfc57fca09dc8586e5eeb64c46a0af1ba6bc606`: passed with normal
  parallelism, 510 Flutter tests, three documented skips, analyzer zero, Web
  loopback smoke passed and Android debug 448 tasks/minSdk 24 passed.
- Exact-head GitHub Regression `32838824110`: passed.
- Exact-head GitHub CodeQL `32838824163`: passed; open code-scanning alerts: 0.

## Operational behavior

- User-facing profile writes require the matching current auth session.
- Caller-mutable fields exclude identity, verification, moderation, payout,
  reputation and deletion state.
- Optional profile values can be explicitly cleared without rebuilding a
  partial `User` snapshot.
- Both local profile documents fail closed on corruption or duplicate identity.
- A divergent current-account pair fails closed for mutation, privacy export
  and anonymization without changing either document.
- Each account document is bounded; overflow never prunes another profile.
- Observed paired-write failure restores both exact prior byte strings and does
  not poison the queue.
- Privacy export and deactivation are exact-current-account scoped.
- Local email change and local verification simulation remain forbidden.

## Ratchet cause and verification

RW9 changed the lifecycle, privacy and retention manifests because local
account/profile mutation, export and deletion behavior became explicitly
validated and source-bound. The active-provider evidence changed only to bind
those new hashes; its decision remains `prepared-hold`, 0/10 and externally
not ready. RW0 through RW8 source inventories were refreshed only for actual
shared-source drift and every predecessor validator passed again.

The first candidate was correctly rejected by the existing profile
async-lifecycle wiring test because it still named the superseded whole-profile
`setCurrentUser` call. The ratchet now requires the result of
`updateCurrentUserProfile`, refreshes local UI state, preserves both `mounted`
checks before toast/navigation and forbids `setCurrentUser` on that surface.
The focused ratchet test and the complete regression both passed afterward.

## Recovery and rollback

Do not normalize, clear or partially salvage malformed `currentUser` or `users`
documents. Preserve exact bytes and perform a separately reviewed recovery.
Capacity exhaustion requires an explicit lifecycle or storage decision;
dropping cached profiles is forbidden.

Rollback is a normal Git revert of the bounded RW9 implementation before a
successor depends on it. Revert code, lifecycle, privacy, retention, provider
ratchet, validator and evidence changes together. Do not reset, rebase or
rewrite history.

## Open gates

The GitGuardian owner-history review remains open and its finding contents were
not inspected. BUILD_READY, Play upload, human pilot activation, PR #7 merge,
production/provider/AI, real money and every VPS/DNS/Cloud/Store/legal-owner
gate remain ungranted.
