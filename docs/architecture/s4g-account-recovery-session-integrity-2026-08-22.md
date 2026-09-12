# S4G account-recovery session integrity - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`8e982a3dfb9032e69e61c78a0a6bbc25b023a842`. This package implements the
non-live technical portion of Drive scenarios `SUP-097` and `SUP-098`. It does
not authorize live recovery operations, external support action, production,
Payment, Store, Cloud, VPS, DNS, signing or pilot activation.

## Source basis

- Drive Support Test Matrix (file `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`,
  reviewed read-only at revision time `2026-08-20T22:29:02.738Z`), scenarios
  `SUP-097` and `SUP-098`.
- Drive Support Master Handbook (file
  `1hIUnlz0k0mIxpesUnxoVKvoMpQmD6TM1`) and Playbooks (file
  `1p_CpVD5czaJh0LkO_yt6F1JIoHV5BqmW`).
- Drive Tech/Audit package (file
  `19rXQidltzp3jvEWqnz4zgppTnTgL0iCl`) and Source of Truth (file
  `1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN`).
- Drive Message Library (Google Doc
  `1mwKUsnJ_3hSzPbnWTz8STnMReb1fQ4LpCugKnYfDeY8`).
- Existing authenticated account, support-case, audit, Privacy and Retention
  contracts in the repository.

No Drive document was modified.

## Recovery-token boundary

Account-action issuance locks the exact active target account before replacing
an existing live token. Reset-password issuance then checks for an active exact
P0 `trust_safety/account_takeover` case while holding that account lock. The
matching support intake acquires the same lock before recording the case and
invalidating all still-live email reset tokens. This closes the interleaving in
which a reset token could otherwise be issued immediately after a compromised
channel was reported.

The public reset-request response remains enumeration-safe. When the channel is
blocked, it returns the same accepted response, issues no token, sends no
external message and writes a bounded audit record without the email address.

Token creation binds `created_at` and `expires_at` to one issuance timestamp.
This removes dependence on the database transaction-start clock and keeps the
30-minute upper bound exact. Consumption succeeds only on the first transition
from live to consumed.

Migration `057` enforces a 64-character lowercase SHA-256 token hash, positive
lifetime, at most 30 minutes for reset tokens, valid consumption time and at
most one live token per account and action kind. Reset-token identity, payload,
hash and lifetime are immutable; consumed reset evidence cannot be reopened or
retimed. Rollback refuses while reset-token evidence remains.

## Session containment boundary

A successful password reset or authenticated password change revokes only
currently active sessions and refresh tokens for the exact target account and
deletes only that account's push-device registrations. The helper accepts only
the server-owned reasons `password_reset` and `password_changed`. It reports
newly revoked row counts, not historical already-revoked rows.

The audit record binds target-only scope, action-token identifier where
applicable, session/refresh/device counts and the fact that no replacement
session was issued. A peer account remains unaffected. Any later sign-in
creates a fresh session identifier.

Authenticated password change verifies the current password while holding the
same locked account row that is updated, preventing two concurrent changes from
both relying on stale credential truth.

## Privacy, retention and scaling

No raw action token, password, recovery code or reported email address is added
to audit metadata. `auth_action_tokens` is explicitly inventoried as security
audit evidence. Privacy and Retention manifests hash-bind the account, session,
support and migration sources while remaining draft and non-destructive.

The target-bound reason allowlist and append-only audit contract can be reused
by future SIT Business or Global operators without granting Support a generic
session-revocation primitive. Any additional recovery channel, identity proof,
staff override or live containment action requires a separate reviewed package.

## Local verification

- 120 focused S4G, Privacy, Retention and P0B protection tests passed.
- A fresh isolated PostgreSQL 16 run applied every migration through `057` and
  passed target/peer session isolation, push cleanup, takeover-token blocking,
  token reuse, expiry, immutability and guarded rollback.
- Complete Backend result: 546 pass, one expected no-database skip, zero fail.
- Complete technical regression accepted the 220-issue analyzer baseline,
  passed 370 Flutter tests with one documented skip, separate Google-only
  coverage, Web build/loopback smoke and Android debug APK.
- The repository/history secret scanner reported no new high-confidence secret.
- P0B remained PSP `0/8 HOLD` and invited pilot `0/4 HOLD` / `NO-GO`.

The first final-regression attempt exposed full temporary storage rather than a
product failure. Only reproducible SIT temp fixtures were removed; the rerun
then passed. The non-release test-environment accommodations and their mandatory
exit evidence are tracked in
`docs/operations/TECHNICAL_DEBT_RELEASE_READINESS.md`.

GitHub push and CI are not claimed because the stored GitHub CLI credential is
expired. Draft PR #7 remains unmerged.
