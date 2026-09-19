# S4H account-measure approval - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`a8fcbf8f395e6ee3a5ede67c704c2120596af3c1`. This package implements the
non-live technical portion of Drive scenarios `SUP-095` and `SUP-096`. It does
not authorize a live restriction, production action, Payment, Store, Cloud,
VPS, DNS, signing or pilot activation.

## Source basis

- Drive Support Test Matrix (file `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`,
  reviewed read-only at revision time `2026-08-20T22:29:02.738Z`), scenarios
  `SUP-095` and `SUP-096`.
- Drive Support Master Handbook (file
  `1hIUnlz0k0mIxpesUnxoVKvoMpQmD6TM1`) and Playbooks (file
  `1p_CpVD5czaJh0LkO_yt6F1JIoHV5BqmW`).
- Drive Tech/Audit package (file
  `19rXQidltzp3jvEWqnz4zgppTnTgL0iCl`) and Source of Truth (file
  `1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN`).
- Drive Message Library (Google Doc
  `1mwKUsnJ_3hSzPbnWTz8STnMReb1fQ4LpCugKnYfDeY8`).
- Existing authenticated moderation, decision, session, audit, Privacy and
  Retention contracts in the repository.

No Drive document was modified.

## Provisional measure boundary

An account-wide suspension can be created directly only as an explicitly
provisional, finite measure. The target must be an active account with no
active account-wide suspension. The server, not the caller, supplies the
canonical notice that the measure is provisional, is not a finding of guilt or
violation and that review is not complete.

The database records `measure_status=provisional`, `no_guilt=true` and the
structured moderation-decision linkage. New unbounded legacy account
suspensions are rejected independently of the HTTP route. Listing-scoped
moderation remains separate.

## Permanent measure approval boundary

An unbounded account restriction requires a dedicated proposal. The proposal
contains one immutable, database-hashed JSON payload and one lock version.
Approval or rejection must name that exact hash and version. The proposer
cannot review their own proposal; proposer and reviewer roles are verified by
the database as well as the workflow.

A rejection has no account effect. Approval rechecks the target account, open
proposal, payload hash, lock version, absence of a competing active suspension
and the current account state. One transaction then records the independent
review, creates the structured moderation decision and unbounded suspension,
changes the account state, revokes active sessions and refresh tokens and
appends audit evidence. A failure rolls the whole effect back.

Idempotency is bound to request body and actor. An exact replay returns the
prior result; drift in actor, payload, version or hash fails closed. Migration
`058` enforces one pending proposal per account, immutable proposal payloads,
truthful terminal states, four-eyes review, decision/proposal/actor linkage and
a guarded rollback. A deferred foreign key permits the proposal and future
suspension identifiers to be committed atomically.

## Privacy, retention and scaling

The user privacy export includes only approved or rejected proposal facts and
omits internal notes and staff identifiers. Structured moderation-decision
context is exported without granting a new action path. The proposal dataset
is inventoried for Retention while deletion execution remains blocked.

The immutable proposal, independent reviewer, exact-payload approval and
atomic-effect model can be reused for later SIT Business or Global moderation.
Any additional sanction type, automated decision, jurisdictional policy or
live operator authority requires a separate reviewed package.

## Local verification

- 19 focused domain, Privacy and Retention tests passed.
- 62 validator and protection tests passed.
- A fresh isolated PostgreSQL 16 run applied every migration through `058` and
  passed proposal, review, four-eyes, state-drift, session-revocation,
  immutability, privacy-export and guarded-rollback cases.
- Complete Backend result: 550 pass, one expected no-database skip, zero fail.
- Complete technical regression accepted the 220-issue analyzer baseline,
  passed 370 Flutter tests with one documented skip, separate Google-only
  coverage, Web build/loopback smoke and Android debug APK.
- The repository/history secret scanner reported no new high-confidence secret.
- P0B remained PSP `0/8 HOLD` and invited pilot `0/4 HOLD` / `NO-GO`.

An added HTTP-heavy integration path initially exhausted the suite-wide general
rate-limit bucket. No IP-rotation or limiter-bypass prerequisite was added.
The S4H state-machine cases were instead tested through their transactional
workflow against PostgreSQL, while the unchanged canonical HTTP integration
and the complete technical regression passed. This is not closure of the test
isolation issue; `TD-RR-002` remains open with deterministic exit evidence in
`docs/operations/TECHNICAL_DEBT_RELEASE_READINESS.md`.

GitHub push and CI are not claimed because the stored GitHub CLI credential is
expired. Draft PR #7 remains unmerged.
