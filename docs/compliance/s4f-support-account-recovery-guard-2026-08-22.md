# S4F support account-recovery guard - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`67861699bfe2ee068130786ce3eadbfbc2445fa9`. This is technical non-live
evidence for Drive scenarios `SUP-022` and `SUP-023`; it is not legal advice,
an identity-verification approval or authority for live account recovery.

## Matrix result

An account-takeover reporter can receive reviewed `T-035` guidance only through
the authenticated in-app record while an independent password reauthentication
path is available. The reported email channel alone is explicitly rejected.
Support copy cannot ask for passwords, PINs, OTPs, TANs, recovery codes or
account/card access credentials.

## Enforced boundaries

- Only the exact P0 account-takeover case and its reporter qualify.
- The ordinary template route cannot draft `T-035`; client recovery variables
  cannot override server truth.
- Account state, active refresh-backed session and password capability are
  checked at draft time and again at publication.
- The exact safe channel, temporary non-action and five false effect flags are
  immutable and database-enforced.
- Human review binds the exact message hash before publication.
- The message does not recover an account, reset a password, revoke a session,
  contact an external channel or claim that identity has been verified.
- Direct SQL forgery of the channel or rendered content fails closed.
- Retained guidance evidence blocks destructive rollback.
- Privacy and Retention inventories contain no secret or account credential;
  approval, period and deletion-execution decisions remain open.

## Verification observed

- Focused account-recovery and credential-solicitation coverage passed.
- 71 final wiring, Privacy, Retention and P0B protection tests passed.
- Fresh PostgreSQL 16 migration/API integration passed the review path, generic
  bypass, direct-SQL forgery and rollback guards.
- Complete Backend result: 540 pass, one expected no-database skip, zero fail.
- Complete regression passed the accepted analyzer baseline, 370 Flutter tests
  with one documented skip, Google-only coverage, Web build/smoke and Android
  debug build.
- P0B remained PSP `0/8 HOLD` and pilot prerequisites `0/4 HOLD` / `NO-GO`.

GitHub push/CI is not claimed here; Draft PR #7 remains unmerged. No production,
live recovery, external message, Payment, Store, Cloud/VPS/DNS, signed candidate
or public activation occurred.

## Open decisions preserved

The real identity-proofing method, compromised-account containment actions,
session-revocation policy, recovery-channel operations, staffed escalation,
legal review, provider contracts, Retention approval and every release gate are
separate decisions. This package is safe guidance and evidence only.
