# S4C support duplicate-case linking - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`b0b5b77d4d793b82c71f40378eac7d0a9977753c`. This is technical non-live
evidence for Drive scenario `SUP-015`; it is not legal advice or authorization
to combine distinct claims, deadlines, Privacy/DSA matters or production data.

## Matrix result

`SUP-015` now has one canonical immutable relationship from a resolved
duplicate to an active leading case. It is admitted only after an elevated
Administrator confirms the same facts, people/objects and decision question,
the absence of a lost separate deadline and continued Privacy/DSA separation.

The duplicate's user-visible history contains the leading case number. The
leading case receives an internal reverse reference. No case, evidence,
message, decision or entity is automatically merged or moved.

## Enforced boundaries

- Both cases are non-live, current-version-bound and exact-scope compatible.
- Privacy, DSA/moderation and authority/legal cases and flags are excluded.
- Administrator role, active session and current Staff Step-up are checked in
  application code and PostgreSQL.
- The link is idempotent, SHA-bound and append-only.
- Automatic merge/action and external delivery are fixed false.
- `duplicate_merged` closure requires the stored link and user-visible leading
  reference; a linked duplicate cannot use a misleading other closure reason.
- The leading case remains active and unmodified.
- Privacy export and count-only Retention inventory include the durable record
  without creating a destructive purge route or approving a retention period.

## Verification observed

- 35 focused tests passed.
- Privacy/Retention validators, 58 protection tests and three permanent S4C
  wiring tests passed while approval and execution stayed false.
- Backend unit execution passed 521 tests with one environment-only PostgreSQL
  skip; a separate fresh PostgreSQL 16 route/schema integration passed through
  migration `053` without a skip.
- The complete technical regression passed the accepted analyzer baseline, 369
  Flutter tests with one documented skip, Google-only coverage, Web build/smoke
  and Android debug build.
- P0B PSP and invited-pilot evidence remained HOLD/NO-GO.

GitHub push/CI is not claimed in this local record. Draft PR #7 was not merged.
No production, Payment, Store, Firebase Console, Cloud/VPS/DNS, external
message, real support action, signed candidate or public activation occurred.

## Open decisions preserved

A qualified human must still decide whether two real cases satisfy the five
conditions and whether any legal, contractual, Privacy, DSA, appeal or other
deadline requires separate handling. Retention periods, operational staffing,
live messaging and every release gate remain outside this package.
