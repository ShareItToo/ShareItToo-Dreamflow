# S4G account-recovery session integrity - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`8e982a3dfb9032e69e61c78a0a6bbc25b023a842`. This is technical non-live
evidence for Support Matrix scenarios `SUP-097` and `SUP-098`; it is not legal
advice, identity-proofing approval or authority for a live support intervention.

## Matrix result

- A credential change ends active sessions only for the affected account.
- The event is recorded with bounded counts and target-only scope.
- Reset tokens are hashed, expiring, single-use and immutable after issuance.
- An active P0 account-takeover report invalidates existing reset tokens and
  blocks new email-reset issuance without exposing account existence.
- Support gains no password, recovery code, token or generic revocation route.

## Enforced controls

- Issuance and takeover intake serialize on the exact account row.
- Reset lifetime uses one deterministic timestamp and is capped at 30 minutes
  by the database.
- Only one live token per account and action kind can exist.
- Consumption is a one-time conditional update.
- Reset-token identity, payload, hash, creation time and expiry cannot drift.
- A consumed reset token cannot be made live again.
- Password reset and change revoke only currently active target sessions and
  refresh tokens, remove target push registrations and issue no replacement
  session.
- Authenticated password change rechecks the current credential under row lock.
- Audit metadata contains no raw token, password, recovery code or email.
- Retained reset-token evidence prevents destructive migration rollback.

## Verification observed

- 120 focused wiring, behavior, Privacy, Retention and P0B protection tests.
- Fresh PostgreSQL 16 migration and HTTP integration: one pass, zero fail.
- Backend: 546 pass, one expected no-database skip, zero fail.
- Analyzer baseline accepted at 220 existing issues; 370 Flutter tests passed
  with one documented skip and the separate Google-only test passed.
- Web build/loopback smoke and Android debug APK passed.
- Secret scan found no new high-confidence secret.
- Privacy remained draft; Retention execution remained blocked.
- P0B remained PSP `0/8 HOLD` and pilot prerequisites `0/4 HOLD` / `NO-GO`.

No production, live recovery, external support message, Payment, Store,
Cloud/VPS/DNS, signed candidate, deployment, PR merge or public activation
occurred. GitHub push/CI is not claimed; Draft PR #7 remains unmerged.

## Residual gates and technical debt

Real identity proof, alternate recovery channel operations, staffed escalation,
legal review, provider contracts, retention approval and all release gates stay
separate. Local toolchain, rate-limit isolation, Flutter test concurrency,
temporary-database orchestration and fixture cleanup accommodations are not
release requirements. Their deterministic exit criteria are open in
`docs/operations/TECHNICAL_DEBT_RELEASE_READINESS.md` and must close before any
release-readiness claim.
