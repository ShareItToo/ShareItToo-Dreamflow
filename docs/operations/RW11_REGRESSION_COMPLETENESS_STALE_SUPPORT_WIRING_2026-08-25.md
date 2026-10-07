# RW11 regression completeness and stale support wiring

Date: 2026-08-25
Run mode: local deterministic test-governance correction only

## Supported checks

```bash
node --test \
  test/tool/rw11_regression_completeness_wiring.test.mjs \
  test/tool/harassment_block_report_wiring.test.mjs \
  test/tool/support_case_ui_accessibility_wiring.test.mjs \
  test/tool/validate_rw11_regression_completeness_stale_support_wiring.test.mjs
node --test test/tool/*.test.mjs
node tool/validate_rw11_regression_completeness_stale_support_wiring.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

Do not add a retry, sleep, file exclusion, serial flag, reduced worker count or
alternate release command if one of these checks fails. Diagnose the exact
deterministic failure and either correct the current invariant or document a
separately reviewed reason before changing supported coverage.

## Audited cause

- `SUP-094`: S4J's static marker followed the original split local fallback.
  RW5 replaced that fallback with the account-isolated atomic
  `LocalSafetyPrivacyService` boundary. Backend transaction, neutral review and
  immutable audit stayed intact.
- `SUP-151/152`: the assertion followed the former one-line formatting of the
  conditional blocked pill. Current code still derives visibility from the
  non-empty blocked-user set and normalizes an invalid empty selection.
- Regression registration: 322 tool-test files existed at audit start, 273
  were named in the script and 49 were not. The full glob now executes all
  current and future conforming files automatically.

## Current verification

- Red-first completeness test: failed before the full-glob command existed.
- Corrected focused matrix: 7 passed.
- Complete tool inventory under normal Node test-runner settings: 1,867
  passed, zero failed, zero skipped.
- Full local technical regression on exact implementation candidate
  `7768651bf63d266fb8d98f75f2883536e77adde0`: passed with normal
  parallelism, all 1,867 tool tests and zero skips, 523 Flutter tests with
  three documented profile skips, analyzer zero, Web/Wasm checks, loopback
  smoke and Android debug 448 tasks/minSdk 24.
- The standard local release-artifact gate correctly stopped because the
  private bound AAB was unavailable. The repository-supported Mac-mini
  `CI=true` metadata path then passed; it proves metadata and debug reach only
  and does not claim the private AAB, Store upload or a device gate.
- Exact-head GitHub Regression `32849768221` and CodeQL `32849768459`:
  passed; zero open GitHub code-scanning alerts.

## Ratchet and rollback

No product, privacy, retention, provider or legal decision changed. RW0 through
RW10 source inventories are mechanically refreshed only for the supported
regression script hash. Their implementation heads, findings, status, gates and
residual risks remain unchanged.

Rollback is a normal Git revert of the RW11 tests, completeness invocation,
validator, documentation, evidence and mechanical predecessor hash refreshes.
Do not reset, rebase, force-push or rewrite history.

## Open boundaries

BUILD_READY, Play upload, human pilot, PR #7 merge, production/provider/AI,
real support traffic, real money, legal-owner decisions and the GitGuardian
owner-history review remain ungranted. The distinct RW10 success-popup epoch
window remains a separate product correction, not an RW11 closure claim.
