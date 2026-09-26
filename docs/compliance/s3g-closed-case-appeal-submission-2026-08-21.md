# S3G closed-case appeal submission - technical compliance record

Status: technically verified, non-live and fail-closed. Exact GitHub Actions
run `32515722756` passed for commit
`966e374fe44af13bbbbfb92202e58b328e80a905`.

## Bound source and scope

This package was derived from the current Drive Support Packet rechecked on
2026-08-21:

- `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, Drive ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, modified
  `2026-08-20T22:29:02.738Z`: `SUP-151` and `SUP-014`;
- `12_SIT_SUPPORT_MESSAGE_TEMPLATES_V1.json`, Drive ID
  `108FRzn-xaCS8UEKrVn8DFGIE8K7R1gab`, modified
  `2026-08-20T22:28:46.549Z`: receipt `T-042`;
- `10_SIT_SUPPORT_STATUS_MACHINE_V1.json`, Drive ID
  `1qj0md6DoHt7lDAfIvFtmMiT0vQ48KbYG`, modified
  `2026-08-20T22:28:17.857Z`: closed/reopened guards;
- `09_SIT_SUPPORT_SOURCE_OF_TRUTH_V1.md`, Drive ID
  `1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN`, modified
  `2026-08-20T22:27:16.931Z`.

The packet supplies no universal appeal period. S3G therefore accepts only an
explicit staff-configured exact deadline and never derives a legal deadline.

## Implemented controls

- Reversible migration `036` adds explicit closure configuration, a separate
  review number and next-update checkpoint, uniqueness and immutable-submission
  guards, exact publication checks and a guarded rollback.
- Closing requires an explicit yes/no electronic-review choice. Availability
  requires an exact published decision and future server deadline.
- Only the reporter may submit, once per exact published decision, with current
  optimistic case version and idempotency binding.
- Server code derives the next-update checkpoint from the existing priority
  policy and never accepts it from the client.
- The stored grounds are absent from event/audit payloads. New evidence IDs are
  rejected until evidence ownership and upload safety are implemented.
- User receipt truth includes original case number, separate review number,
  received-material summary, no-automatic-change statement and next update.
- The Backend repository preserves the appeal object and submits the exact case
  version. Flutter validates every identifier, timestamp, state relation and
  the `externalMessageSent=false` marker before rendering.
- Reopen remains staff-only and requires an assigned owner, reason, next action
  and next update. Appeal submission itself leaves the original case closed.
- Appeal configuration and receipt data join the personal-data export. Privacy
  and retention source inventories remain honest drafts and bind exact sources.

## Verification

- Complete Backend suite: 403 passed, zero failed and one expected PostgreSQL
  skip; JavaScript and operations-shell syntax checks passed.
- Complete CI-equivalent technical regression passed, including 343 Flutter
  tests, one expected Flutter skip, the separate Google-only profile test, the
  Web build and the Android debug build.
- Focused appeal/support domain and workflow: 42 passed, zero failed.
- Flutter support case surface: 11 passed, zero failed.
- Privacy, retention and client-wiring suites: 62 passed, zero failed.
- Focused Flutter analyzer passed with no findings.
- PostgreSQL 16 execution of migration `036` remains delegated to exact-commit
  GitHub CI because the Mac mini has no local Docker runtime.
- Exact GitHub Actions run `32515722756` passed at
  `966e374fe44af13bbbbfb92202e58b328e80a905`: all 404 Backend tests passed,
  including PostgreSQL 16 migration/integration coverage; all 343 Flutter tests
  passed with one documented skip plus the separate Google-only profile test;
  Web build, loopback smoke, Android debug build, secret scan, dependency
  audit, Compose validation and the commit-labelled API image build passed.
- The signed-candidate step and `publish-api-image` job remained skipped. Draft
  PR #7 remained open and unmerged.

## Persistent boundaries

- No appeal is adjudicated and no outcome, deadline policy or legal conclusion
  is invented.
- No automatic reopen, message template, email, push, SMS or notification is
  produced. `T-042` is not rendered or sent.
- No evidence file or client-supplied evidence ID is accepted in this package.
- No refund, payout, payment, account measure, provider call, production,
  Cloud, VPS, Store, DNS, public pilot or real-money state is changed.
- PR #7 remains draft and unmerged. Signed release candidate and publication
  remain separate explicit gates.
