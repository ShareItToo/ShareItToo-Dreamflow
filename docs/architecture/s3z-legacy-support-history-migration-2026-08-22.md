# S3Z legacy support history migration - architecture

Status: locally and CI-verified on 22.08.2026 at exact implementation commit
`c73cf25065c2c2ad568613e1b89cfee504969381`. This is a disabled, non-live
implementation for Drive scenarios `SUP-153` through `SUP-157`. It changes no
production, payment, Store, Firebase Console, Cloud/VPS/DNS, signed candidate
or public rollout state.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenarios `SUP-153` through
  `SUP-157`.
- Drive Support Packet technical requirements for old open/paused support
  threads, disabled generic templates, idempotent import and lossless rollback.
- The existing canonical simulation-only support-case lifecycle, privacy
  export and open Retention policy.

## Trust boundary

The only accepted source identifier is
`local_shared_preferences_message_threads_v1`. Data from this source is
controlled by the user's device and is therefore always stored and returned as
`unverified_user_device_source`. A sender label of `support` is historical
display data, not proof that SIT staff authored the text. Imported content is
explicitly `usableAsDecisionEvidence=false` and cannot approve a decision,
change money, send a message or trigger an external action.

The authenticated user must be exactly one participant and `support` the
other. Unknown participants/senders, archived threads, malformed or duplicate
message IDs, more than 500 messages, messages over 4,000 characters or more
than 256 KiB total history fail closed. A recognizable canonical `SIT-*` case
reference blocks import rather than risking a duplicate representation.

## Preview and explicit import

Preview is aggregate-only, has no mutation and omits message text and the
normalized source object. It returns eligibility, blocker codes, message and
unresolved-time counts, proposed canonical type/status, simulation mode and
the unverified trust label. Import requires a separate authenticated POST and
an idempotency key. It is disabled by default; process startup rejects enabling
it in production.

An `open` legacy thread maps to canonical `acknowledged`. A `paused` thread has
no implicit meaning: it requires one explicit reason and one supported mapping
to `waiting_for_user`, `waiting_for_other_party`, `under_review` or
`escalated`. The canonical state machine performs every transition and retains
its normal audit/version guards.

Source identity is user, source system and thread ID. A deterministic content
fingerprint detects changed replay. A transaction-scoped PostgreSQL advisory
lock serializes concurrent imports; a same-source replay returns the one
existing case/import, while changed bytes return conflict. No silent merge is
performed.

## Preservation and presentation

Migration `050` stores one import record and an ordered append-only history.
The exact trimmed rendered text, its SHA-256, original timestamp string,
sender class and read state are retained. Timestamps with `Z` or an explicit
offset also receive a normalized instant. A timezone-naive local timestamp is
not guessed: its instant remains null and its interpretation is
`unresolved_local_time`.

An origin event and sanitized audit entry bind the canonical case to the
import fingerprint and counts. Only the reporter can read the history. The
account privacy export includes the user's import/history rows and repeats the
unverified/non-evidence boundary. Both new tables are included in the
count-only Retention inventory under `communications`; no retention period or
purge is invented.

The old Flutter support thread is now a read-only historical surface. It has
no generic welcome template, online presence or composer. A local presentation
may be created only after a server-confirmed canonical `SIT-*` receipt. New
issues and additions continue through a new canonical support case.

## Rollback

Feature rollback is configuration-only: keep the importer disabled and retain
the archive. The elevated Administrator rollback endpoint is dry-run only and
reports downstream counts without changing data. Migration rollback succeeds
only while both new tables are empty; after an import it refuses to drop the
append-only history.

## Local verification

- Focused S3Z Backend, Retention and wiring checks: 15 passed.
- Exact PostgreSQL 16 integration: preview/import/replay, changed-source
  conflict, paused mapping, owner-only history, append-only rejection,
  concurrent `201` plus `200` replay, export and dry-run rollback passed.
- Complete Backend/PostgreSQL suite: 504 passed, zero failed, zero skipped.
- Privacy and Retention validators and all 58 protection tests passed while
  both manifests remained draft and fail-closed.
- Complete CI-equivalent technical regression: accepted 220-issue analyzer
  baseline, 369 Flutter passes plus one documented skip, separate Google-only
  pass, Web build/loopback smoke and Android debug APK.

The historical private AAB was checked only in CI metadata mode because the
owner-only archive is not present in this checkout. No signed candidate was
built, relabelled or published.

GitHub Actions run `32564821610` repeated the complete Backend and Flutter
regression for exact head
`c73cf25065c2c2ad568613e1b89cfee504969381` and PR merge snapshot
`c812fe5c53c326e8a3c1e5f81d55de68d71f88df`; both jobs completed
successfully. Signed-candidate construction and API-image publication were
skipped. Draft PR #7 remained open, mergeable and unmerged.
