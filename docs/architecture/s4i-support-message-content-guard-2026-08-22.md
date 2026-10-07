# S4I support-message content guard - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`0f4ae3842b37945b31341ac1ae7d6c5265d185eb`. This package implements the
non-live technical portion of Drive scenarios `SUP-044` and `SUP-045`. It does
not send a message, perform a live support action or authorize production,
Payment, Store, Cloud, VPS, DNS, signing or pilot activation.

## Source basis

- Drive Support Test Matrix (file `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`,
  reviewed read-only at revision time `2026-08-20T22:29:02.738Z`), scenarios
  `SUP-044` and `SUP-045`.
- Drive Support Master Handbook (file
  `1hIUnlz0k0mIxpesUnxoVKvoMpQmD6TM1`, revision time
  `2026-08-20T22:24:39.816Z`), including the prohibition on counterparty
  personal data in user-facing case content.
- Drive Playbooks (file `1p_CpVD5czaJh0LkO_yt6F1JIoHV5BqmW`, revision time
  `2026-08-20T22:25:05.383Z`).
- Drive Tech/Audit package (file
  `19rXQidltzp3jvEWqnz4zgppTnTgL0iCl`, revision time
  `2026-08-20T22:26:16.992Z`), which requires DLP/Secret checks for
  `SafeFreeText`, no secrets in case text or logs and minimized structured
  audit metadata.
- Drive Source of Truth (file `1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN`, revision
  time `2026-08-20T22:27:16.931Z`).

No Drive document was modified.

## Detection and rejection boundary

Every caller-supplied support-template variable is still normalized before
rendering. The guard now distinguishes two bounded classes without retaining
the matched value:

- `secret`: private-key material, provider-style secret tokens and explicit
  credential assignments;
- `personal_data`: email, phone, IBAN, payment-card-like and postal-address
  patterns that must not be copied into user-facing free text.

Either class returns the existing fail-closed
`support_message_sensitive_content_blocked` response. No support message,
case event, rendered content or external delivery is created. Unsafe decision
claims and credential solicitation remain separate policy errors.

The normal message route and reviewed progress-update draft route use the same
guard. They retain their existing active-account, staff elevation, assignment,
non-live, recipient and rate-limit checks.

## Durable minimized audit

The rejected message transaction is allowed to roll back completely. Only
after that rollback, the authenticated route records one append-only audit row
with the request correlation ID and exactly these metadata fields:

- reason code, content class, blocked placeholder name and template ID;
- detector version;
- `inputStored=false`, `messageCreated=false` and
  `externalMessageSent=false`.

The blocked input, a hash of that input, a snippet, recipient data and rendered
content are not copied into the audit. Migration `059` independently restricts
the action to a Support or Administrator actor, a support-case resource, a
request ID and the exact eight-key metadata shape. A forged row with an extra
raw value or a true effect flag fails at the database. Existing append-only
audit protection prevents later mutation; rollback refuses while S4I evidence
exists.

## Privacy, retention and scaling

The account privacy export exposes only audit action/resource/request metadata
for the actor and never exports audit metadata. The existing `audit_log`
security-audit dataset remains in Retention; no new content dataset or deletion
execution path is introduced.

Future SIT Business or Global message engines can reuse the versioned detector
and exact minimized audit contract. New jurisdictions, identifier types,
languages, redaction instead of rejection or external DLP providers require a
separate reviewed package and must not transmit blocked content by default.

## Local verification

- 12 focused support-message domain tests passed.
- 60 Privacy/Retention validator and protection tests passed.
- Two fresh isolated PostgreSQL 16 runs applied every migration through `059`
  and passed real HTTP rejection for a synthetic API key and counterparty email,
  safe audit persistence, forged-audit rejection and guarded rollback.
- Complete Backend result: 551 pass, one expected no-database skip, zero fail.
- Complete technical regression accepted the 220-issue analyzer baseline,
  passed 370 Flutter tests with one documented skip, separate Google-only
  coverage, Web build/loopback smoke and Android debug APK.
- The repository/history secret scanner reported no new high-confidence secret.
- P0B remained PSP `0/8 HOLD` and invited pilot `0/4 HOLD` / `NO-GO`.

No new limiter exemption or request-source rotation was added. The existing
suite-level HTTP isolation debt remains open as `TD-RR-002`, and the manually
started test database remains open as `TD-RR-004`. GitHub push and CI are not
claimed because the stored GitHub CLI credential is expired. Draft PR #7
remains unmerged.
