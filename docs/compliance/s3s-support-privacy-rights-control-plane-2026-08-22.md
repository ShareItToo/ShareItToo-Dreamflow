# S3S privacy-rights control plane - technical compliance record

Status: locally verified non-live candidate on 22.08.2026. This is technical
evidence, not legal advice, legal approval, an approved response, or authority
to disclose or erase personal data.

## Scenario coverage

- `SUP-123`: an access/copy request has an exact versioned kind, immutable
  receipt time, conservative one-month deadline, secure account-password
  re-authentication, user-safe status and append-only audit. Actual export
  review and delivery remain disabled.
- `SUP-124`: rectification and erasure are distinct choices. The response
  explicitly separates case tracking from erasure execution, retention policy
  and Legal Hold review; no deletion is performed.
- `SUP-125`: active Legal Hold count is visible only in the elevated review
  queue and for an erasure subject's review flag. Because no purge route exists,
  a hold cannot be used to trigger deletion or silently authorize blanket
  retention. Dataset-level scope resolution remains open.
- `SUP-126`: the recurring watchdog creates one internal, idempotent reminder
  per exact response deadline and marks health degraded near or after expiry.
  No external reminder is sent.
- `SUP-127`: one reasoned extension may be recorded before the original
  deadline by an active Administrator with session-bound Staff Step-up. The
  prior and extended deadline plus the user-facing reason are immutable and
  visible; a second or late extension fails closed.

## Enforced controls

- Intake accepts exactly one of six rights and rejects subtype mismatch,
  unknown versions and extra fields.
- The initial deadline begins at case receipt and never moves when identity is
  verified.
- Password material stays at the authentication boundary and is never stored
  in the privacy workflow, event, audit or export.
- Identity evidence is subject- and active-session-bound. Deadline extension
  evidence is Administrator-, session- and active-Step-up-bound.
- Requests, verification evidence and extensions are idempotent, optimistic-
  lock protected and guarded again in PostgreSQL.
- User and staff projections state that disclosure, erasure execution and
  external delivery are disabled.
- Privacy export omits session and staff identifiers. Retention remains a
  count-only inventory under an explicitly open tenth policy decision.
- Rollback cannot discard recorded request, identity or extension truth.

## Legal and operational boundary

The deadline model is based on the official text of Regulation (EU) 2016/679,
especially Article 12, together with the reviewed calendar-period rules in
Regulation No 1182/71. The Europe/Berlin implementation deliberately chooses
an earlier fail-closed end-of-day result rather than relying on an unverified
holiday calendar. Professional review must still confirm the final policy,
wording, exception handling and evidence standard before any live operation.

The following remain open: named Privacy owner and staffing, actual response
and data-package review, secure recipient/channel verification, lawful
rectification/restriction/objection/portability/erasure execution,
dataset-scoped Legal Hold handling, retention period, completion semantics,
external delivery, and the incident/breach controls in `SUP-128` through
`SUP-131`.

## Verification observed so far

- 56 focused domain/workflow/migration/wiring tests passed.
- 5 deadline-watchdog unit tests passed.
- 63 Privacy/Retention validator and protection tests passed.
- 15 focused pinned-Flutter support-flow tests passed.
- 470 Backend unit tests passed with one expected database-only skip; the full
  PostgreSQL foundation integration then passed separately on an isolated
  PostgreSQL 16.15 instance with migration `047`.
- A CI-equivalent Backend run passed all 471 tests without skips against the
  isolated PostgreSQL 16.15 instance.
- Backend syntax checks and the complete local technical regression passed:
  359 Flutter tests with one documented skip, the separate Google-only test,
  Web smoke/build and Android debug build.
- GitHub regression `32551835411` is green for head
  `60b8017c00a63d18dd3d6887cfab3baee1f0fafb`; Actions tested PR merge
  snapshot `57e987471a770e222b91d47ea8e1e141bf3ceb23`. CI passed 471 Backend
  tests, audit/secret checks, Compose validation, the commit-labelled API
  image, 359 Flutter tests with one documented skip, the separate Google-only
  test, Web smoke/build and Android debug build. Signed-candidate construction
  and API-image publication remained skipped.

No production, external notification, public pilot, real payment, payout,
Store, Cloud/VPS/DNS, signed release, publication, PR merge or live data action
is included.
