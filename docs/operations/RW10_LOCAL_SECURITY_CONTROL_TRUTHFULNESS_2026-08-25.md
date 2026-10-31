# RW10 local security-control truthfulness

Date: 2026-08-25
Run mode: synthetic local implementation and verification only

## Supported checks

```bash
flutter analyze \
  lib/models/security.dart \
  lib/screens/security_screen.dart \
  lib/screens/two_factor_auth_screen.dart \
  lib/services/account_security_service.dart \
  lib/services/auth_service.dart \
  lib/services/backend_repository.dart \
  lib/services/data_service.dart \
  lib/services/shared_persistence_sync.dart \
  test/b10_release_truthfulness_test.dart \
  test/rw10_local_security_control_truthfulness_test.dart
flutter test --reporter expanded \
  test/rw10_local_security_control_truthfulness_test.dart \
  test/b10_release_truthfulness_test.dart
node --test \
  test/tool/validate_privacy_disclosures.test.mjs \
  test/tool/validate_retention_deletion_readiness.test.mjs \
  test/tool/validate_active_infrastructure_mail_provider_readiness.test.mjs \
  test/tool/rw10_local_security_control_truthfulness_wiring.test.mjs \
  test/tool/validate_rw10_local_security_control_truthfulness.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_active_infrastructure_mail_provider_readiness.mjs
node tool/validate_rw10_local_security_control_truthfulness.mjs
(cd backend && pnpm run security:secrets)
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

## Current evidence

- Focused RW10 Flutter matrix: 13 passed.
- RW10 plus B10 release-truthfulness matrix: 34 passed.
- Changed-file analyzer: zero issues.
- The first candidate passed full local regression, but exact-head GitHub
  Regression rejected its synthetic static-password fixture shape during the
  repository secret scan. The current test builds those inputs at runtime and
  the exact immutable historical rule/commit/file tuple is reviewed in the
  existing baseline.
- Full local technical regression on exact implementation candidate
  `d72e18eb607bb3f9ed7baf09ab7212f3ef695ee5`: passed with normal
  parallelism, 523 Flutter tests, three documented skips, analyzer zero, Web
  and Wasm build checks, loopback smoke, repository secret scan and Android
  debug 448 tasks/minSdk 24.
- Exact-head GitHub Regression 32846034530 and CodeQL 32846034621: passed;
  zero open code-scanning alerts.

## Operational behavior

- Offline/local fallback presents no account-security mutation or success.
- Two-factor and identity verification remain explicitly unavailable.
- Server session payloads are decoded completely, strictly and within bounds.
- Every server response is tied to the exact invoking account/session/email.
- Password change and logout-all conditionally remove only that exact local
  session; a successor session is preserved and suppresses the success path.
- Session-change events clear password input and stale device/error state.
- Legacy local security-preview bytes are ignored and preserved without
  read-time normalization or silent deletion.

## Ratchet cause and verification

RW10 changes privacy- and retention-bound authentication, repository and local
data sources because it retires local security simulation and introduces an
exact conditional auth-session clear. The privacy and retention declarations
change only where their source hashes require refresh. Active-provider evidence
changes only to bind those reviewed hashes; its decision must remain
`prepared-hold`, 0/10 owner decisions and externally not ready.

Predecessor source inventories were refreshed mechanically only where shared
`AuthService`, `BackendRepository`, `DataService`, persistence-sync or the
supported regression changed. B10 is tightened to require the server-bound
service and to forbid the old debug two-factor exception, local setter and
timed fake password success. No earlier safety condition was relaxed. All
predecessor and declaration validators and the standard local full technical
regression passed on the first candidate. The subsequent clean-checkout secret
scan finding was a synthetic RW10 test fixture, not a product or owner
credential: fixture literals were removed from the current tree, the immutable
historical tuple was reviewed narrowly, and working-tree findings remain
unconditionally forbidden. Exact-head replacement-candidate local full
regression, GitHub Regression and CodeQL all passed.

## Recovery and rollback

Do not parse, normalize or delete legacy security-preview bytes during a read.
Malformed server session lists remain behind the retry surface. A process kill
during conditional local session removal can leave the old session present; it
must be revalidated or cleared through the supported auth flow, never inferred
as a successful RW10 action.

Rollback is a normal Git revert of the bounded RW10 code, tests, declarations,
ratchets, validator and evidence together. Do not reset, rebase or rewrite
history.

## Open gates

The GitGuardian owner-history review remains open and finding contents are not
inspected. BUILD_READY, Play upload, human pilot activation, PR #7 merge,
production/provider/AI, real money and every VPS/DNS/Cloud/Store/legal-owner
gate remain ungranted.
