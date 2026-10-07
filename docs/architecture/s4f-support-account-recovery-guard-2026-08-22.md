# S4F support account-recovery guard - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`67861699bfe2ee068130786ce3eadbfbc2445fa9`. This is the non-live technical
implementation of Drive scenarios `SUP-022` and `SUP-023`. It prepares a
reviewed authenticated in-app guidance record only; it performs no account
recovery, password change, session revocation, external delivery, production,
Payment, Store, Cloud, VPS, DNS or pilot activity.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md` (file
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`), scenarios `SUP-022` and `SUP-023`.
- Drive Support Master Handbook (file
  `1hIUnlz0k0mIxpesUnxoVKvoMpQmD6TM1`) and Playbooks (file
  `1p_CpVD5czaJh0LkO_yt6F1JIoHV5BqmW`).
- Drive Tech/Audit package (file
  `19rXQidltzp3jvEWqnz4zgppTnTgL0iCl`) and Source of Truth (file
  `1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN`).
- Drive Message Library (Google Doc
  `1mwKUsnJ_3hSzPbnWTz8STnMReb1fQ4LpCugKnYfDeY8`), template `T-035`.
- Existing canonical case, message, session, audit, Privacy and Retention
  boundaries in the repository.

The sources were reviewed read-only on 22.08.2026. No Drive document was
modified by this package.

## Dedicated guidance contract

The ordinary message route cannot draft `T-035`. A separate elevated staff
route accepts only the case and reporter identifiers; client-supplied recovery
instructions or template variables are ignored. The server requires the exact
P0 `trust_safety/account_takeover` case, the reporter as recipient, an active
account, at least one active refresh-backed authenticated session and an
available password reauthentication path.

The server binds the neutral member salutation, the authenticated in-app
`Konto > Sicherheit` route and the explicit temporary non-action. It also
records exact false values for compromised-channel use, credential requests,
recovery execution, session revocation and external delivery. Any unexpected
structured key fails publication.

The message remains yellow human-review guidance even though the underlying
safety case requires a red explicit decision. It communicates a safe route and
does not make or execute that decision.

## Review, publication and database enforcement

An independent Administrator reviews the immutable `T-035` content through the
existing message review workflow. Publication rechecks the current case scope,
reporter, active account, password capability, authenticated session and every
server-bound recovery value. The result is an authenticated in-app support
record only; the canonical message workflow has no external delivery adapter.

Migration `056` repeats the exact case, account/session, template, locale,
approval, variable-count, rendered-content and non-action checks for direct
database inserts and publication transitions. Existing support-message payload
immutability prevents later content drift. The down migration refuses to remove
the guard while retained `T-035` evidence exists.

Free support variables are additionally rejected when they solicit a password,
PIN, OTP, TAN, recovery code, card access data or account credentials. Protective
wording such as never sharing those credentials remains allowed.

## Privacy, retention and scaling

No new credential, secret, recovery token, email content or external provider
dataset is stored. The existing immutable message record contains only bounded
guidance and minimized control metadata. Privacy and Retention source
inventories bind the new domain and migration, while their approval and
destructive-execution gates remain closed.

The versioned guidance metadata and database-level scope check can later be
reused by SIT Business or Global support tooling without weakening the
authenticated-channel, human-review or non-action boundaries. A future real
recovery operation requires its own verified identity, security, legal,
operations and live-release package.

## Local verification

- Focused account-recovery domain, workflow, HTTP, direct-SQL, credential-copy,
  manifest, rollback and permanent-wiring coverage passed.
- 71 final S4F/Privacy/Retention/P0B protection tests passed; Privacy remained
  draft and Retention execution remained blocked.
- A fresh isolated PostgreSQL 16 integration applied migration `056` and passed
  the dedicated draft/review/publication path, generic bypass rejection,
  forged-binding rejection and guarded rollback.
- The complete Backend run passed 540 tests with one expected no-database skip.
- Complete technical regression accepted the 220-issue analyzer baseline,
  passed 370 Flutter tests with one documented skip, the separate Google-only
  test, Web build/loopback smoke and Android debug APK.
- P0B remained PSP `0/8 HOLD` and invited pilot `0/4 HOLD` / `NO-GO`.

GitHub push and CI are not claimed because the stored GitHub CLI credential is
expired. Draft PR #7 remains unmerged. No live account action, support message,
production, Payment, Store, Cloud/VPS/DNS, signed candidate or public activation
occurred.
