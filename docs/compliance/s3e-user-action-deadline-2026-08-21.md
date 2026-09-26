# S3E user-action deadline - technical compliance record

Status: verified at exact commit
`2d01bebb24c884cf1358bd0e1cc606d8ad8ec536`, non-live and fail-closed.

## Bound source and scope

This package addresses Drive Support Test Matrix scenario `SUP-144` by adding a
separate server-confirmed response deadline when a support case enters
`waiting_for_user`. It does not reinterpret the existing support checkpoint
`nextUpdateAt`, invent a deadline, send a reminder or close a case.

## Implemented controls

- The transition domain requires a future `userActionDueAt` only for
  `waiting_for_user`; every other status clears it.
- The workflow persists the value in the existing `evidence_due_at` field and
  binds it to append-only event plus audit metadata.
- Reversible migration `034` enforces the lifecycle-state/nullability invariant
  in PostgreSQL and fails on inconsistent existing rows instead of rewriting
  them.
- The authenticated user projection returns an ISO deadline and a
  server-rendered Europe/Berlin display value only while user action is needed.
- Flutter requires the complete pair and labels `Antwort bis` separately from
  `Nächstes Update`. Unknown, missing or stale-state combinations fail closed.
- Privacy and retention source-hash inventories bind the domain, workflow,
  migration and Flutter display changes while remaining draft and blocked.

## Verification so far

- Support domain and workflow: 33 passed, zero failed.
- User support case Flutter surface: 7 passed, zero failed.
- Privacy and retention validator suites: 58 passed, zero failed; both current
  manifests remain honestly draft/fail-closed.
- Complete local technical regression passed: all repository validators passed,
  Flutter reported 339 passed, zero failed and one expected skip, the separate
  Google-profile test passed, the analyzer gate passed, Web release build plus
  loopback smoke passed, and Android debug assembly passed with the existing
  OpenJDK 17 installation.
- Complete Backend tests passed with 392 passed, zero failed and one expected
  PostgreSQL skip. Syntax checks and the repository secret scan passed; the
  production dependency audit found zero high or critical vulnerabilities and
  one moderate vulnerability.
- Exact-commit GitHub Actions run `32508816204` completed successfully. Backend
  regression applied migration `034` on PostgreSQL 16; Flutter, analyzer, Web,
  Android debug, secret, dependency and Compose/API-image checks passed. The
  signed-candidate step and API-image publication remained skipped.

## Persistent boundaries

- No automatic timeout, reminder, closure, refund, payout or account measure is
  introduced.
- No external message, provider call, production, Cloud, VPS, Store, DNS,
  payment, public pilot or real-money state changes.
- `SUP-145` remains open until a separately approved user-safe final decision,
  implementation outcome and redress route exist.
