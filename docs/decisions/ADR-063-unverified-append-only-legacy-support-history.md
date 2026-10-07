# ADR-063: Unverified append-only legacy support history

Status: accepted as a disabled non-live technical control on 22.08.2026. It
does not authorize production import, live support, Store work, Payment or a
public pilot. Implementation commit
`c73cf25065c2c2ad568613e1b89cfee504969381` and GitHub Actions run
`32564821610` are green; the run tested PR merge snapshot
`c812fe5c53c326e8a3c1e5f81d55de68d71f88df` without building a signed
candidate or publishing an API image.

## Context

Drive scenarios `SUP-153` through `SUP-157` require old open/paused local
support threads to be preserved without duplicate cases, active generic
templates or history loss. The source is Flutter SharedPreferences on a user
device. Its bytes and sender labels cannot establish staff authorship or the
truth of an earlier support decision.

## Decision

- Treat every imported thread/message as
  `unverified_user_device_source` and prohibit decision-evidence use.
- Create a canonical simulation case only after aggregate preview and a
  separate explicit import; keep the feature default-off and
  production-rejected.
- Map `open` to `acknowledged`; require a reason and explicit canonical mapping
  for `paused`.
- Block archived threads and histories already carrying a canonical case
  reference rather than silently merging them.
- Bind idempotency to user/source/thread plus deterministic content fingerprint
  and serialize concurrency in PostgreSQL.
- Preserve ordered exact text, hash, original timestamp and timezone
  uncertainty in an append-only archive visible only to the reporter and their
  privacy export.
- Keep legacy UI read-only and route every new issue/update through a new
  canonical support case.
- Make rollback a feature disable plus retained archive; refuse destructive
  schema rollback after data exists.

## Consequences

Historical content is not lost or silently rewritten, while a user-controlled
device record cannot masquerade as verified SIT staff evidence. Duplicate and
concurrent retries converge on one canonical case. Exact content increases the
controlled personal-data surface, so Privacy export and Retention inventory
must remain source-bound and the still-open communication retention decision
continues to block purge execution. Any future production migration requires a
separate approved gate, source-authenticity review, real-data dry run and
operator/legal decision.
