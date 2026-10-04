# S3T privacy-incident and account-export guard - architecture

Status: locally and CI-verified non-live package on 22.08.2026 at exact
implementation commit `cb8d378acf6cc2617386ed945e128aab41de5bff` and
successful GitHub Actions run `32553740248`. No authority or affected-person
notification, production operation, public pilot, Store action or real-money
flow is enabled.

## Source basis

- Drive Support Packet `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenarios `SUP-128`
  through `SUP-131`.
- Drive `09_SIT_SUPPORT_SOURCE_OF_TRUTH_V1.md`: exact location only behind the
  established reveal rule, no sensitive push content, human red decisions and
  no live operation without a separate gate.
- Current Drive Trust/Safety/Datenschutz and Technik/API/Audit records:
  containment, awareness time, internal deadline control, logged sensitive
  access and no automatic external send.
- Article 33 of Regulation (EU) 2016/679 as the primary legal source for the
  awareness-bound 72-hour decision timer, not as an implementation-side legal
  conclusion: https://eur-lex.europa.eu/eli/reg/2016/679/oj/

## Incident creation and immutable awareness time

The canonical support intake creates a one-to-one privacy-incident record only
for the exact non-live Privacy subtypes `unauthorized_data_exposure`,
`suspected_personal_data_breach` and `wrong_recipient_or_wrong_account`.
PostgreSQL independently checks the Privacy taxonomy, red decision boundary,
Privacy flag, simulation/internal-testing mode and equality between case
receipt, incident creation and `breach_awareness_at`.

Migration `048` fixes the technical notification-decision deadline to exactly
72 hours after awareness and the internal reminder to 12 hours before that
deadline. Awareness time, deadline, reminder, policy version, assessment and
notification states cannot be rewritten. The initial states remain
`pending_human_assessment` and `not_decided`; the schema permanently rejects an
external-notification-sent value in this package.

## Internal deadline and containment controls

The existing support watchdog now selects due incident decisions, records one
idempotent internal near/overdue event for the exact deadline and exposes
count-only degraded health and an elevated Administrator queue. It calls no
email, push, webhook, authority endpoint or affected-person transport.

Containment recording requires an active Administrator, the exact current
session, Staff Step-up, optimistic incident version and a bounded idempotency
key. Input accepts only five explicitly non-live test-action codes, a
successful/unsuccessful outcome, `partial` or `contained`, and a restricted
identifier-shaped action reference. It cannot accept narrative content,
credentials, recipient details or a live provider command.

The append-only containment row records authorization evidence, and a database
trigger advances only the guarded containment status and version. It cannot
change the awareness time, deadline, human assessment or notification
decision. A contained incident cannot be reopened through this path, and
rollback is blocked after any incident or containment truth exists.

## Account-export authorization

`GET /v1/account/export` is removed. The exact route is now an authenticated
`POST` that accepts only `currentPassword`, verifies it at the HTTP boundary
and derives the export subject exclusively from `req.auth.userId`. A client-
supplied user selector, extra field, missing password, wrong password or
passwordless account fails closed before export construction. Password
material is never included in the transaction, export, audit metadata or
privacy workflow.

The Flutter surface asks for the current password in an obscured field with
suggestions and autocorrection disabled. Cancellation creates no request. The
dialog remains usable with large text and keyboard focus.

## Export minimization and inventory

The subject's own structured `LOCATION_SHARE|...` message remains in that
subject's export. An inbound third-party structured location is replaced by a
stable omission marker; normal message text is not reinterpreted or removed.
The export reports only the omission count, policy version and that own
structured locations remain included.

Incident export contains safe case-bound status and deadline metadata only.
Containment actions, internal action references, staff/session/Step-up
identifiers, restricted events and internal audit rows are not added to the
self-service projection. The retention inventory counts incident and
containment truth under the existing open `privacyRights` policy boundary;
this package adds no deletion or purge route.

## Residual scope

S3T supplies the technical core of `SUP-128` through `SUP-131`; it does not
claim legal or operational completion. Actual breach classification, risk
assessment, controller decision, authority competence/contact data,
notification content, notification dispatch, affected-person communication,
legal review, named staffing, production deployment and response runbooks
remain separate gates. A timer becoming overdue degrades health but never
turns into an automatic legal conclusion or send.

No production, VPS, Cloud, DNS, payment, payout, Store, signed-candidate,
public-pilot, external-message, notification or live-data action is part of
S3T.

## Local verification

- The combined incident, privacy-rights and watchdog wiring run passed all 14
  tests; the focused account-export and store-review diagnostics passed 4
  further tests.
- The deadline-watchdog unit suite passed all 5 tests after its scripted query
  sequence was extended for the new incident queue.
- Privacy and retention validator protection suites passed all 58 tests; both
  fail-closed manifests validate in draft state.
- The PostgreSQL foundation integration passed with every migration through
  `048`, including immutable awareness, exact 72-hour alarm, append-only
  containment, active-session/Step-up enforcement, export subject binding and
  structured-location minimization.
- A CI-equivalent Backend run passed all 473 tests without skips against
  isolated PostgreSQL 16.15. Backend syntax and secret/history checks passed.
- The complete technical regression passed the accepted 220-issue analyzer
  baseline, all 359 Flutter tests with one documented skip, the separate
  Google-only test, Web debug build and loopback smoke, and Android debug build.
- The prior uploaded internal AAB `2026081509` is not present in this Mac
  mini's private archive, so local byte re-verification of that historical
  artifact remains unavailable. CI-metadata validation passed and no artifact
  was generated, signed, uploaded or replaced for S3T.
- GitHub regression `32553740248` is green for exact head
  `cb8d378acf6cc2617386ed945e128aab41de5bff`; Actions tested PR merge snapshot
  `990015e391d38a26fe8e1f6682db3d219d4d0ae5`. Backend regression passed all
  473 tests, migrations through `048`, syntax, dependency/history audit,
  Compose validation and the commit-labelled API image build. Flutter
  regression passed the full technical script, including all 359 Flutter tests
  with one documented skip, the separate Google-only test, Web smoke/build and
  Android debug build. Signed-candidate construction and API-image publication
  remained skipped; Draft PR #7 remained open and unmerged.
