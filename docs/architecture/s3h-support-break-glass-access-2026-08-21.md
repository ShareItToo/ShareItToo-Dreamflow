# S3H support break-glass access - architecture decision

Status: accepted for non-live implementation on 21.08.2026. This decision does
not activate a pilot, production support operation or external incident system.

## Decision

SIT may issue a case-specific emergency access grant only to an active support
account for an active `p0` support case in `simulation` or `internal_testing`.
The grant is bound to the support actor, authenticated session, exact current
Staff-Step-up elevation and case. It lasts at most five minutes, never outlives
the elevation, stores only a SHA-256 token digest and creates an automatic
post-access review queue entry due at expiry.

The first implementation is deliberately P0-case-bound. It does not pretend
that SIT already has a canonical incident entity or an approved incident-to-
case relation. A later incident scope requires its own immutable incident
record, eligibility rules, privacy/retention classification and review evidence.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, modified
  `2026-08-20T22:29:02.738Z`: `SUP-024` blocks break-glass without a reason;
  `SUP-025` requires reasoned, time-limited access and complete audit truth.
- Drive `06_SIT_SUPPORT_TECHNIK_DATENMODELL_API_AUDITLOG_V1.pdf`, ID
  `19rXQidltzp3jvEWqnz4zgppTnTgL0iCl`: break-glass is reserved for a real P0
  or incident, requires an explicit reason, strong reauthentication, time
  limitation, complete audit and automatic post-review.
- Drive native Support Master Policy, ID
  `15Ep_utCHp3B_b7z3_dLoVydvlTNYv8bHTRGvxMLDtts`.

## Grant boundary

1. The normal assigned-owner route remains the default. An assigned support
   owner cannot obtain break-glass for the same case.
2. Only three bounded reason codes are accepted. A 12-500 character
   justification is mandatory; control characters, markup and recognizable
   credential assignments are rejected.
3. The opaque HMAC token is returned once or on an exact idempotent replay. The
   database stores only its digest. A token for one case, actor, session or
   elevation cannot open another.
4. Every use rechecks the active user, session, elevation and non-live P0 case.
   No queue-wide access or assignment mutation is added.
5. Grant creation, denial and successful case access write sanitized audit
   events. Justification and token material are never copied into denial or
   access event metadata.
6. Grant creation and independent review each have a separate strict
   five-attempts-per-15-minutes HTTP limit. They do not share the generic
   account-action budget, so an exact idempotent replay remains available
   during a P0 response. The case-bound token header is explicitly allowed by
   CORS for the approved staff client.

## Independent review

- Every grant enters `pending` review with `review_due_at = expires_at`.
- Review cannot complete before the access window ends.
- Only an active administrator with a current Admin Staff-Step-up may review.
  The review records the exact reviewer, session and elevation; the original
  support actor cannot self-review.
- Outcomes are `appropriate` or `concern_escalated`. Completion is immutable,
  and deletion is blocked. Concern escalation records truth only; S3H does not
  invent an investigation, employment measure or external report.

## Database and concurrency truth

Migration `037` independently enforces the P0/non-live case, actor/session/
elevation binding, near-current creation time, five-minute maximum, monotonic
use timestamp, irreversible revocation, independent elevated admin review and
append-only deletion boundary. Core grant values cannot be rewritten. The
rollback refuses to erase any grant or review truth.

Session and elevation UUIDs are retained as immutable audit references, not as
foreign keys. The insert/use/review guards require the referenced active rows
at the relevant event time, while historical grants do not break the existing
expiry cleanup for authentication sessions and Staff-Step-up credentials.

Idempotency is unique per actor, session and operation key. Exact replay returns
the same logical grant; changed case, reason or justification conflicts.

## Privacy and retention

The authenticated account export tells an affected user that bounded emergency
case access existed, whether it was used, its time window and review state. It
excludes staff identities, sessions, elevations, the internal justification,
review notes and token digest. The full grant remains classified as immutable
`securityAudit` data in the read-only retention inventory. No retention period
or deletion authority is invented; both manifests stay draft and fail closed.

## Alternatives rejected

- Queue-wide emergency access: disproportionate and not case-bound.
- Reassigning the case silently: destroys the distinction between normal work
  ownership and emergency access.
- A reusable global staff token: cannot provide case-specific necessity or
  post-review truth.
- Incident-wide access now: no canonical incident binding is implemented or
  approved, so expanding scope would invent missing authority.

## Non-live boundary

S3H sends no email, push, SMS or support template, calls no provider, and makes
no payment, refund, payout, account, Store, Cloud, VPS, DNS or production
change. It authorizes no public or invited pilot and no real support operation.
