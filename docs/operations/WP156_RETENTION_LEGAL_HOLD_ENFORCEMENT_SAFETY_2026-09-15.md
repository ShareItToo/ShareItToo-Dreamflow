# WP156 Retention and Legal-Hold Enforcement Safety

## Scope

WP156 closes only the demonstrated technical safety gap around legal holds and
isolated backup verification. Legal policy, retention periods, processor
contracts and professional legal approval remain open. Exactly 10 retention decisions remain open and the destructive executor stays disabled.

The technical legal-hold model is explicitly **record-scoped** and bounded by
operator-supplied review/end timestamps.

## Implemented controls

- A hold requires an explicit dataset key, record key, review timestamp and
  end timestamp supplied by an authorized administrator. No duration or scope
  is inferred or backfilled.
- Active uniqueness is per account, dataset and record. Support cannot create,
  release or list holds. Audit metadata records only the non-sensitive scope
  and time window; private notes are not exported in the shaped response.
- Account deletion is blocked only by an unreleased hold whose end timestamp
  has not passed. The hold lifecycle remains idempotent and step-up/admin
  controlled.
- The 078 migration adds columns before inspecting legacy rows. Existing rows
  without explicit scope/window values fail with the package-specific error;
  no legacy value is invented. Rollback is refusal-only.
- `verify_restore.sh` checks deleted-profile state only inside its temporary
  isolated restore database. It rejects revived, active or incompletely
  anonymized erased profiles and reports aggregate evidence only.
- Retention inventory remains read-only, aggregate-only, identifier-free and
  execution-disabled.

## Verification

Focused account legal-hold, retention-inventory and restore-wiring tests pass;
the retention validator remains a draft with all 10 decisions open. The full
CI-equivalent local regression completed with exit 0, including tool tests,
Flutter, analyzer, Web/Wasm, loopback smoke, Android debug build and
release-host capacity checks. GitHub Regression and CodeQL remain pending until
the closure commit is pushed.

No provider, payment, production, cloud/VPS, Store, Firebase, device,
credential or PR-merge action occurred. BUILD/production/provider gates are
unchanged. BUILD/production/provider gates unchanged.
