# S3N separate DSA notice intake - technical compliance record

Status: technically verified at exact implementation commit
`c7b74ea0af919362a9706ebf23371a555b3986f5` with CI-isolation evidence at
`a5e33c3f2a6eb61b739018ef5d4ca15777602bba` and successful GitHub Actions
run `32536618516` on 22.08.2026.

## Implemented controls

- Illegal-content reporting is a separate authenticated route rather than a
  free-text booking-support case.
- Versioned fields cover content type, exact locator, reasoned illegality
  statement, optional jurisdiction/legal basis and good-faith confirmation.
- Reporter name and email are server-authoritative and the submission fails
  closed when the authenticated identity record is incomplete.
- An opaque Notice ID and the full server-timestamped evidence snapshot are
  stored immutably under PostgreSQL migration `042`.
- User responses, case projections, events and audit metadata minimize the
  evidence; reporter-only privacy export preserves access without leaking the
  reporter identity or allegation to another affected user.
- Every illegality determination or content measure stays behind an explicit
  human red-decision boundary.

## Local verification

- Focused Backend/domain/workflow/migration and cross-layer checks: 46 tests
  passed after the final red-decision-boundary change.
- Privacy and retention validators passed with migration `042`, backend and
  Flutter sources hash-bound in their inventories.
- The complete local CI-mode technical regression passed: 444 Backend tests
  passed and the PostgreSQL-only integration was skipped because no local
  PostgreSQL service is installed; the 352-test Flutter suite passed with one
  documented skip, as did targeted Dart analysis, Web build, loopback smoke
  and Android debug build.
- P0B PSP and invited-pilot evidence hashes were updated without changing
  their fail-closed `hold` states or zero-of-four prerequisite result.
- Exact GitHub run `32536618516`: all 445 Backend tests including PostgreSQL
  16, dependency/secret checks, Compose validation and the commit-labelled API
  image build passed. The complete 352-test Flutter suite with one documented
  skip, separate Google-only test, Web build, loopback smoke and Android debug
  build passed.
- Draft PR #7 remained open and unmerged. No signed candidate, publication,
  live provider, production or real-money path was used.

## Residual gates

- Public/guest accessibility, legal/operator approval, final statutory copy
  and production service operation remain external gates.
- Statement of Reasons, affected-party notification, redress and appeal
  adjudication require their own source-bound workflows and do not follow
  automatically from intake.
- Production, provider, payment, Store submission, public pilot and real-money
  paths remain disabled.
