# S4L server-owned handover exception intake - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`27b29e93ef02a987f6414eb780556137de03efcf`. The deterministic local runner
improvement is commit `487c34a862676607af47eaf767afcca3e174bf38`.
This package implements the non-live technical gap in Drive scenarios
`SUP-052` through `SUP-054`; existing controls already cover `SUP-049` through
`SUP-051`. It does not authorize production, Payment, Store, Cloud/VPS/DNS,
signing, deployment, pilot activation or a support decision.

## Source basis

- Drive Support Test Matrix, file `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`,
  reviewed read-only at revision time `2026-08-20T22:29:02.738Z`, scenarios
  `SUP-049` through `SUP-054`.
- Drive Support Playbooks, file `1p_CpVD5czaJh0LkO_yt6F1JIoHV5BqmW`,
  reviewed read-only at revision time `2026-08-20T22:25:05.383Z`.

No Drive document was modified. `SUP-049` QR fallback, `SUP-050` blocked
self-confirmation and `SUP-051` four-photo minimum were already enforced by
the booking confirmation and condition-evidence paths. S4L adds the missing
server-owned paths for materially different items, off-platform deposits and
handover no-shows.

## One specialized authority

`POST /v1/bookings/:id/handover-exceptions` is authenticated, active-account
only, participant-bound, `private, no-store` and uses the existing bounded
safety-intake limiter. It accepts only:

- `item_mismatch`, routed to P1 `active_handover/item_not_as_listed` after an
  explicit safe-abort acknowledgement;
- `offplatform_deposit_request`, routed to P1
  `trust_safety/offplatform_deposit_request` after an explicit do-not-pay
  acknowledgement; or
- `party_no_show`, routed to P1
  `cancellation_no_show/handover_no_show` after the user confirms a SIT-chat
  contact attempt.

The client cannot submit a case route, owner, priority, workflow effect,
payment effect, guilt result or account/listing measure. Generic support
intake rejects these three exact routes, so it cannot bypass the specialized
authority. Acute danger is rejected into the established emergency/safety
path instead of being downgraded to this neutral review lane.

## No-show truth and neutral effects

A no-show report requires a V5.2 booking in `accepted` or `confirmed`, a
counterparty-confirmed appointment on the booking-local start date, a reached
server time and at least one server-visible actor-authored in-app message at or
after the appointment. No arbitrary wait, client clock, fixed percentage or
client acknowledgement can replace that database truth.

All three outcomes create only a simulation-mode support case. They do not
complete handover, change booking state, decide cancellation or money, issue a
refund, determine guilt, or apply an account/listing measure. Item mismatch
guides a safe abort without assigning blame. A deposit request says not to pay
outside the SIT flow and requests neutral Trust review without declaring
fraud. A no-show receipt does not create a rigid 100-percent consequence.

## Database, audit, privacy and retention

Migration `062` adds the deposit subtype, one request/action uniqueness key and
an exact audit trigger. The trigger independently checks participant booking
truth, workflow state, route, owner role, P1 severity, acknowledgement shape,
confirmed appointment and the exact database contact-attempt count. Its audit
metadata has exactly 19 allowlisted keys and forbids details, message content,
addresses, participant identifiers and payment/refund identifiers. Every
automatic effect flag is false. Existing append-only audit controls preserve
the receipt, and rollback refuses while specialized evidence exists.

The full report details remain in the existing support-case lifecycle, not in
the minimized audit receipt. No new table, retention duration or deletion
execution was introduced. Privacy and Retention source inventories bind the
new domain, workflow and migrations plus affected client sources by SHA-256;
both manifests remain fail-closed drafts.

## Deterministic test architecture

The first attempt to append another late HTTP scenario to the monolithic
PostgreSQL test reached the production safety limiter's shared test bucket and
returned `429`. S4L did not add a sleep, IP rotation, limiter reset/bypass or a
higher product limit. Route wiring separately proves authentication and use of
the real limiter; transactional PostgreSQL integration invokes the same
workflow and independently validates all database invariants. Dedicated
isolated threshold coverage for the real limiter remains open under
`TD-RR-002`.

The regression runner no longer defaults Flutter to concurrency one. Two
consecutive complete local runs passed at Flutter's standard parallelism. The
Backend package now supplies repository-owned non-secret module-load defaults
without overriding CI or explicit integration values. These improvements
remove two local accommodations from the default path, but `TD-RR-001` and
`TD-RR-003` remain open until exact-commit CI and their full exit evidence pass.

## Local verification

- focused S4L/support/privacy checks: 50 passed;
- Privacy/Retention validator tests: 58 passed and both real validators passed;
- P0B protection: all 37 tests and six real validators passed; PSP remains
  `0/8 HOLD`, invited pilot remains `0/4 HOLD` / `NO-GO`;
- fresh PostgreSQL 16 applied migrations through `062` and passed all three
  workflows, forged-audit rejection and rollback refusal;
- Backend package runner: 568 passed, one expected no-`TEST_DATABASE_URL` skip;
- Flutter: two complete standard-parallel runs, each 376 passed and one
  documented Google-profile skip; the separate Google-only profile passed;
- analyzer: accepted 220-issue baseline with no new forbidden issue class;
- Web debug build and loopback smoke, Android debug APK, syntax, diff and secret
  scan passed.

GitHub push and CI are not claimed because the stored CLI credential remains
expired. Draft PR #7 remains unmerged.
