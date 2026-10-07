# PR #7 integration and pilot-candidate plan

Status: `HOLD / NO-GO`; planning only. PR #7 remains draft, open and unmerged.

Snapshot date: 2026-08-23. The immutable code anchor for this plan is
`76a3129d8e88e9e428f66be7e382ace5567da3fc` on
`codex/master-workflow-20260808`. Its GitHub base is
`6272264e985b1bc1d74a9891ddfd6074ce3caa61` on `main`; the branch is 901
commits ahead and zero behind that base. The PR snapshot contains 1,948 changed
files, 266,599 additions and 19,863 deletions. A later documentation-only
commit does not silently become the code anchor; a candidate must bind its own
exact commit again.

## Scope freeze

The allowed PR scope is frozen to P0/P1 security, legal, privacy and data
integrity fixes; reproducible pilot, build, CI or release blockers; external
gate preparation; and findings from an explicitly authorized pilot or device
run. No new feature family may enter PR #7. G3-G5, SIT Business, global
expansion, external AI and live payments remain default-off unless a separate
gate explicitly changes their later candidate scope.

No force push, rebase, squash, history rewrite, branch deletion, merge,
publication, Store action, signing action, device installation, production
change or pilot activation was performed by this plan.

## Reviewable functional groups

Review the large diff as five bounded groups rather than one undifferentiated
change:

1. V5.2 domain and contract core: quote and contract snapshots, booking,
   handover, return, cancellation, refund obligations, `needsReview`, audit and
   PostgreSQL constraints.
2. Pilot product surfaces: Discover, direct search, Saved, Rental Cart and the
   default-off G2-G5 foundations. Confirm that the Stage A surface is limited
   to V5.2 single rentals and the approved Cat8/region envelope.
3. Support, moderation, safety and privacy: case workflow, DSA and product
   safety, evidence gate, access controls, retention, deletion and legal hold.
4. Flutter and platform client: Android-first navigation, authentication,
   accessibility, offline/recovery behaviour and inactive iOS/provider paths.
5. Release and operations: CI, dependency and secret gates, CodeQL, build
   determinism, candidate evidence, Store worksheets and rollback tooling.

Each review records an exact commit and one of `accepted`, `changes-required`
or `not-applicable`. Approval of one group never implies legal, Store,
payment, production or pilot approval.

## Required review areas

| Area | Minimum evidence before integration decision | Current result |
| --- | --- | --- |
| Security | CodeQL run, zero untriaged high/critical findings, secret scan, dependency audit, auth and rate-limit tests | CodeQL run `32630887885` passed; PR alert query returned zero open alerts after documented source remediation and false-positive classification |
| Backend and data integrity | locked dependencies, backend suite, fresh PostgreSQL 16 migrations and concurrency/append-only checks | run `32630887900` is the exact remote regression source; use its final conclusion, not an earlier run |
| Flutter and Android | analyzer, 385-test suite plus documented skip, Web/Wasm, Android Gradle and exact candidate build | current-source CI evidence required; historical device evidence is not sufficient |
| V5.2 legal | professional review of the exact active texts, declarations and G3 delta | externally open; no professional approval inferred |
| Privacy and providers | processor facts, retention/deletion/legal-hold decisions and approved public disclosures | externally open and fail-closed |
| Pilot operations | named roles, deputies, support envelope, incident path and Stage A activation decision | externally open |

## Migration and data rollback

PR #7 introduces migrations `001` through `065`: 65 forward migrations. Only
`028` through `065` have paired down scripts (38 pairs). Migrations `001`
through `027` are intentionally forward-only and therefore cannot use SQL
down-migration as a safe general rollback.

Before any later non-local application of migrations:

1. bind the exact candidate commit, application image digest and ordered
   migration checksums;
2. create and verify a restorable database snapshot in the target environment;
3. rehearse `001`-`065` on a restored, isolated copy and run the full
   PostgreSQL proof;
4. verify the previous application against the migrated schema before calling
   application-only rollback safe;
5. take a second pre-activation snapshot and record the restore command,
   operator and stop condition.

The default database fallback is restore of the verified pre-migration
snapshot or a reviewed forward fix. Down scripts `028`-`065` are not an
automatic production rollback and must not be used where they would discard
pilot data. There is no production migration authorization in this package.

## Source, CI and device evidence

The current code anchor is `76a3129d8e88e9e428f66be7e382ace5567da3fc`.
CodeQL workflow `32630887885` passed with the `security-extended` suite, and
the PR alert API returned zero open alerts after 30 original source findings
were fixed, seven scan-induced assertion findings were removed, 455 global
limiter false positives were classified individually, and two intentional
bounded gate flows were classified individually. Query coverage and workflow
failure behaviour remain enabled.

The device inventory is historical, not current-source evidence. The latest
recorded Play-internal Pixel 7 Pro evidence is Android 16, build `2026081509`,
commit `3fa045b98897f9551f91da932136c2b100b2d700`; it covers synthetic role
booking, authenticated links, logout and bounded offline recovery. The current
repository declares `1.0.0+2026081510` and has no signed, installed,
current-source Stage A candidate. None of the historical evidence may be
relabeled or reused as proof for the current head.

## Candidate branch and release-candidate sequence

No candidate branch or artifact is created now. After all required reviews and
an explicit Walid gate, use this sequence:

1. freeze an exact reviewed PR head and create a protected
   `pilot/stage-a-android-rc1` branch without rewriting PR history;
2. assign a fresh monotonically higher build number and generate one
   commit-bound signed Android artifact through the existing deterministic
   release path;
3. record source commit, build number, AAB/APK hashes, signing-certificate hash
   and CI run without exposing credentials;
4. after a separate installation gate, install only through the approved
   private channel on the authorized device and execute the Stage A matrix;
5. keep live money, public registration, public Store release, G3-G5 and all
   externally unapproved providers disabled.

Required later tokens are `PR7_REVIEW_SCOPE_ACCEPTED`,
`PILOT_STAGE_A_CANDIDATE_SIGNING_APPROVED` and
`PILOT_STAGE_A_INSTALL_APPROVED`. None is present now.

## Merge decision

Current decision: `HOLD_PR7_DRAFT_UNMERGED`.

Only Walid may later issue `PR7_MERGE_APPROVED`. Before that token, all five
review groups, the exact-head regression, the V5.2 professional review and the
minimum Stage A external gates must be explicitly accounted for. If approval
is eventually given, prefer a normal merge commit so the reviewed history and
group boundaries remain inspectable. Do not squash or rebase this branch.

## Fallback path

- Before merge: leave PR #7 draft and unmerged; no runtime fallback is needed.
- After a later merge but before deployment: revert the merge with a new
  auditable commit only after explicit authorization; never rewrite history.
- After a later staging deployment: stop intake, preserve evidence, roll the
  application back only if schema compatibility was proven, otherwise restore
  the verified pre-migration snapshot in the approved maintenance procedure.
- After any pilot finding: classify P0/P1, stop the affected pilot lane, retain
  audit evidence, fix on a bounded branch and issue a new exact candidate.
- Production, public Store, live payment and public pilot fallback procedures
  remain out of scope because none is authorized or active here.

## PF4 acceptance

PF4 is complete when this plan is committed, pushed, the exact documentation
head is green in regression and CodeQL, PR #7 remains draft/unmerged, and the
current decision still reads `HOLD_PR7_DRAFT_UNMERGED`.
