# S3T privacy-incident and account-export guard - technical compliance record

Status: locally and CI-verified non-live package on 22.08.2026 at exact
implementation commit `cb8d378acf6cc2617386ed945e128aab41de5bff` and
successful GitHub Actions run `32553740248`. This record is technical evidence,
not legal advice, a breach finding, a notification decision, legal approval or
authority to contact any person or authority.

## Scenario coverage

- `SUP-128`: an exact wrong-recipient/wrong-account Privacy case creates an
  immutable incident-awareness record. An elevated Administrator can record
  only allowlisted non-live containment evidence; no external command or
  notification is available.
- `SUP-129`: the decision deadline is database-constrained to awareness plus
  exactly 72 hours. The existing watchdog records idempotent internal near and
  overdue alarms and degraded health without making the underlying human/legal
  decision or sending anything.
- `SUP-130`: self-service export is bound to the authenticated active account,
  requires current-password re-authentication and rejects arbitrary subject
  selectors, extra fields, legacy GET access and passwordless ambiguity.
- `SUP-131`: inbound third-party structured exact locations are replaced by a
  disclosed omission marker; the subject's own structured location remains in
  their export and ordinary text is not altered.

## Enforced controls

- Only three exact Privacy subtypes in simulation/internal-testing mode can
  create an incident record.
- Receipt, awareness and creation time are identical and immutable. Deadline
  and reminder arithmetic is independently checked by PostgreSQL.
- Human assessment and authority/affected-person notification decisions remain
  pending and immutable in S3T. `external_notifications_sent` is constrained
  to false.
- Deadline alarms are internal, idempotent and condition-bound. Queue and
  health projections contain no report narrative or sensitive location.
- Containment evidence is Administrator-, active-session-, Staff-Step-up-,
  version- and idempotency-bound, append-only and restricted to non-live action
  codes plus identifier-shaped references.
- Export subject identity comes only from the authenticated session. Password
  material stays at the verification boundary and is never persisted or
  exported.
- Self-service incident projection omits containment details and internal
  actors. Retention remains count-only and governed by an explicitly open
  policy decision with no destructive execution path.
- Migration rollback is permitted only before any incident or containment
  truth exists.

## Legal and operational boundary

The 72-hour timer is a conservative technical control based on the official
text of Article 33 of Regulation (EU) 2016/679. It is not an automatic breach
finding and does not decide whether notification is required, which authority
is competent, what content is lawful, or whether affected people must be
contacted. Those questions require documented human ownership and professional
legal review before live use.

Named Privacy and security owners, operational coverage, authority/contact
verification, notification templates, secure delivery channels, evidence
review, risk assessment, production deployment, retention periods and
dataset-level Legal Hold handling remain open. The absence of any one of these
facts remains a blocker for its dependent live lane only.

## Verification observed so far

- 14 combined incident/rights/watchdog wiring tests, 4 focused
  export/diagnostic tests and 5 watchdog unit tests passed.
- 58 Privacy/Retention validator protection tests passed; current manifests
  remain draft, approval-disabled and destructive execution remains blocked.
- PostgreSQL 16.15 applied all migrations through `048` and passed the complete
  foundation integration.
- A CI-equivalent Backend run passed all 473 tests without skips.
- Backend syntax and secret/history checks passed. The complete local technical
  regression passed the accepted 220-issue analyzer baseline, 359 Flutter
  tests with one documented skip, the separate Google-only test, Web
  smoke/build and Android debug build.
- Historical internal AAB `2026081509` is absent from this Mac mini's private
  archive. Its repository metadata passed the CI-mode validator, but no local
  byte-level claim is made and no signed artifact action was taken.
- GitHub regression `32553740248` is green for exact implementation head
  `cb8d378acf6cc2617386ed945e128aab41de5bff` and PR merge snapshot
  `990015e391d38a26fe8e1f6682db3d219d4d0ae5`. Backend passed 473 tests,
  migrations through `048`, dependency/history audit, Compose and the
  commit-labelled API image build. Flutter passed the complete technical
  regression. Signed-candidate construction and API-image publication remained
  skipped; Draft PR #7 remained open and unmerged.

No production, external notification, public pilot, real payment, payout,
Store, Cloud/VPS/DNS, signed release, publication, PR merge or live data action
is included.
