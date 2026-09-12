# S4E reviewed support progress updates - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`018b39dd44dc25e2503982b8bec801282ceac770`. This is the non-live technical
implementation of Drive scenarios `SUP-042` and `SUP-043`. It prepares and
records an authenticated in-app progress update; it enables no external
delivery, production, Payment, Store, Cloud, VPS, DNS or pilot activity.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenarios `SUP-042` and `SUP-043`.
- Current Support Master Handbook and Playbooks: every active case has a real
  next-update checkpoint, and updates name progress, open work, any user action,
  provisional impact and the next update.
- Drive Message Library templates `T-008` and `T-010`, both requiring human
  review and prohibiting an invented outcome.
- Existing canonical case, message, audit, Privacy and Retention boundaries.

## Proposal contract

An assigned support owner or Administrator proposes one update against the
exact current case version and existing `next_update_at`. The proposal requires
bounded text for progress since the last update, the open check, user action or
explicit no-action statement, provisional impact, next internal action and a
new future checkpoint. The new checkpoint must be later than the prior one and
no more than 31 days ahead.

The server selects `T-008` while the prior checkpoint is still current and
`T-010` after it is overdue. The latter therefore uses the source-bound apology
copy. A client cannot choose or bypass the template. Direct use of either
template through the generic message route is rejected.

## Independent review and atomic publication

The proposal creates one yellow human-review message and one durable progress
record. The message author cannot approve it. An elevated Administrator binds
approval to the exact immutable message hash; rejection terminates the proposal.

The dedicated publication path rechecks the case version, prior checkpoint,
approved progress/message versions, immutable hash, recipient account and the
new future time. In one PostgreSQL transaction it updates `next_action` and
`next_update_at`, records the in-app message, closes the proposal and appends
internal event/audit evidence. Any failure rolls the whole operation back.
Generic direct publication remains blocked. No email, push body, webhook or
external support-system adapter is present.

## Durable evidence, Privacy and rollback

Migration `055` stores one live proposal per case and enforces its
pending-review, approved/rejected and published lifecycle. Payload identity is
immutable, review must match the message reviewer, and publication must match
the committed case and message. History is append-only.

The reporter privacy export includes only published, user-relevant progress
metadata and omits internal next action and staff identifiers. Retention
inventory counts the append-only dataset without inventing a period or enabling
deletion. The down migration refuses to remove retained update evidence.

## Local verification

- 35 focused domain, message, Retention and permanent-wiring tests passed.
- Privacy/Retention validators and their 93 protection tests passed with both
  approval and deletion-execution gates still closed.
- A fresh isolated PostgreSQL 16 integration applied migration `055` and
  passed due/overdue proposal, independent review, bypass rejection, atomic
  publication, replay, export and guarded rollback coverage.
- Backend syntax checks passed; the complete Backend run passed 533 tests plus
  one expected no-database skip.
- Complete technical regression accepted the 220-issue analyzer baseline,
  passed 370 Flutter tests with one documented skip, the separate Google-only
  test, Web build/loopback smoke and Android debug APK.
- P0B PSP and invited-pilot validators remained `HOLD` and `0/4` / `NO-GO`.

GitHub push and CI are not claimed because the stored GitHub CLI credential is
expired. Draft PR #7 remains unmerged. No live support message, production,
Payment, Store, Cloud/VPS/DNS, signed candidate or public activation occurred.
