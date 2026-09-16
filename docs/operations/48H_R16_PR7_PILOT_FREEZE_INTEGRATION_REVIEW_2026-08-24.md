# 48H R16 PR #7 pilot-freeze and integration review

Status: **AUDITED — DRAFT/UNMERGED — THREE R17 FINDINGS OPEN**

Audit base: `2fed8f02b0e333b445e2cc4540b7a32da0d48bc9` on
`codex/master-workflow-20260808`. At this snapshot PR #7 is open, Draft,
mergeable but `BLOCKED`, based on `main` commit
`6272264e985b1bc1d74a9891ddfd6074ce3caa61`. The branch is 1,038 commits
ahead and zero behind; the PR contains 2,249 changed files, 322,306 additions
and 19,987 deletions. R16 does not merge, rebase, squash, force-push or alter
GitHub settings.

The older `PR7_INTEGRATION_AND_PILOT_CANDIDATE_PLAN.md` remains historical.
Its 65-migration and 901-commit snapshot is not current evidence. This R16
review supersedes those numbers without rewriting the historical artifact.

## Integration decision

Decision: `HOLD_PR7_DRAFT_UNMERGED`.

The technical evidence is broad and current, but the PR is not a safe
one-click merge. It crosses authentication, contract, payment-ledger,
migrations, privacy, Support/DSA, Listing AI, pricing, Android and release
boundaries. Current `main` protection is strict/up-to-date but requires only
`backend-regression` and `flutter-regression`, requires zero approving reviews
and does not itself require CodeQL, PostgreSQL recovery or clean-checkout
reproducibility. The future procedure below therefore treats those checks and
reviewer attestations as explicit merge prerequisites rather than relying on
repository defaults.

## Domain audit

| Domain | Current verified truth | Integration result |
| --- | --- | --- |
| Migrations/data | 69 ordered up migrations, 42 paired down scripts; R9 clean install, idempotence, 027→069 upgrade, backup/restore and guarded rollback passed | Technical green; snapshot/restore remains mandatory before any non-local migration |
| Auth/security | Rate limits, ownership/session/recovery tests and current CodeQL are green with zero open PR code-scanning alerts | One separate GitGuardian history finding remains an owner-only P0 gate |
| Legal evidence | V5.2 hashes are immutable; P0B intake has 18 open professional decisions; G3L has 14 open decisions | `PROFESSIONAL_REVIEW_DEFERRED_BY_OWNER` and `UNREVIEWED_RISK_ACCEPTED`; no approval claim |
| Listing AI/image | Mock/local flow, privacy derivatives, unsupported-claim policy and explicit publication boundary are green | External provider remains disabled; manual fallback only |
| Price Engine | R6 property/stress, server authority and migration 069 are green | Synthetic evidence is not market validation |
| G3 | Technical group/quote/evidence path exists; G3L remains draft-blocked | Release-mode UI locked; not pilot-ready in the current signed-release envelope |
| G4 | Deterministic Planner technical path exists | Release-mode UI locked; no external AI or inventory-resolution activation |
| G5 | Supply enrichment and listing sets are technically covered | Both release-mode UIs locked; optional follow-up must remain fail-open |
| Support | 167/167 scenarios map technically; scanner transport is `none` and external decisions are 0/8 | Technical map valid, launch/pilot hold |
| Privacy | 18 data types and 11 services are mapped; binary check passed | Draft/fail-closed; final binary scan open, 10 retention decisions and 23 execution blockers remain |
| Build/release | R15 exact preflight, regression, clean rebuild and CodeQL are green | No AAB/APK candidate created; `BUILD_READY`, upload and human activation are ungranted |
| Device QA | Current-source canonical local-QA update and mock Blue-Ocean Pixel flow passed; 25 restart cycles passed | Not proof of the future signed R15 candidate or a human pilot |

## High-risk review groups

Each group must record the exact proposed merge head and one of `accepted`,
`changes-required` or `not-applicable`. A later commit invalidates every stale
attestation.

1. **Security/auth/data integrity:** authentication, authorization,
   cross-account isolation, recovery, rate limiting, secret history,
   migrations, concurrency and backup/restore.
2. **V5.2 legal/privacy:** parts A–I, declarations, quote/contract formation,
   withdrawal, cancellation/refund, handover/return/damage, `needsReview`,
   audit, processors, retention/deletion and the G3 delta. Professional review
   remains externally deferred and is never inferred from this review.
3. **Listing AI and Price Engine:** image preflight, disclosure/consent,
   unsupported claims, owner confirmation, explicit publication, regional
   evidence, server-authoritative price and synthetic-learning exclusion.
4. **G3/G4/G5 product boundary:** same-owner groups, Planner, supply
   enrichment and listing sets, including the exact internal/non-public flags
   and the non-binding pilot boundary.
5. **Support/operations/privacy:** access control, DSA/safety, appeals,
   evidence retention, scanner/upload disablement, incident stop and data
   rights.
6. **Android/build/device/integration:** permissions, exported components,
   deep links, signing, Firebase collection state, candidate identity,
   reproducibility and current-source device evidence.

No reviewer group may approve Production, Payment, Store upload, tester
enrollment, public release or a human pilot through this PR review.

## Migration ordering and rollback map

Apply only `001_b3_foundation.up.sql` through
`069_regional_price_engine_r6_hardening.up.sql`, in lexical/numeric order,
through the checksum-bound runner. Migrations 001–027 are forward-only.
Migrations 028–069 have paired down scripts, but those scripts are conditional
tools, not a general data-preserving rollback promise. With retained truth,
Support 032, Listing-AI 066 and Price Engine 069 explicitly refuse destructive
down migration.

| State | Safe fallback |
| --- | --- |
| Before merge | Leave PR #7 Draft and unmerged; no runtime action exists to roll back |
| Merge conflict while preparing | Stop; keep Draft; make a normal additive conflict-resolution commit on the PR branch after scoped review; rerun every exact-head check; never rebase/force/squash |
| Future merge, before deployment | With separate owner approval, revert the merge using a new auditable commit; do not rewrite history |
| Migration rehearsal/activation | Stop intake; preserve evidence; restore the verified pre-migration snapshot or use a reviewed forward fix; never assume down scripts preserve data |
| Candidate/device defect | Stop the candidate lane; preserve app data; do not uninstall/wipe/downgrade blindly; issue a corrected, higher, exact signed candidate after its own gate |
| Pilot defect | Stop affected/all slots according to severity; retain minimized evidence; disable optional flags; do not add testers or switch to public/live paths |

## Feature-flag truth table at the audit base

| Surface | Current release truth | Pilot consequence |
| --- | --- | --- |
| V5.2 single-item core | On; `bindingCheckoutEnabled=true` | Conflicts with the binding goal “no binding rental in Stage A”; R17 P1 |
| G2 Discover/Saved/cart | On, non-reserving | Eligible within inherited gates |
| Blue-Ocean listing assistant | Default off; R15 builder permits on only for Internal + exact Staging | Reduced candidate buildable; no provider call |
| External Listing AI | Disabled | Manual/mock fallback only |
| G3/G4/G5 technical UIs | Individual default-off flags plus hard `!releaseMode` locks | Current signed release cannot execute the full Wave-0 task envelope; R17 P1 |
| Real Payment and delivery | Off | Must remain off |
| Analytics/Crashlytics collection, FCM | Off in the candidate envelope | Must remain off until separate gates |
| Support evidence scanner/upload | Off / transport `none` | Manual minimized feedback route only |
| Public registration / public Store | Off | Must remain off |
| `codex_local_dev` | Disabled, local developer-only | Never a SIT runtime/user provider |

## Direct R16 findings admitted to R17

### `R16-P0-SEC-HISTORY-001` — unresolved external secret-history signal

The current GitGuardian check reports one possible secret across 250 PR
commits. No value, token, cookie or credential was read or copied. The current
tracked-tree scan and CodeQL are green, but that does not prove the historical
credential is false or revoked. Because the repository is public and history
rewrite is forbidden, owner review and, if applicable, credential revocation
is a P0 gate. Independent work continues without inspecting the value.

### `R16-P1-STAGE-A-BINDING-001` — non-binding pilot contradicts checkout

The binding product state and Wave-0 copy say no binding rental and no money.
The current app still sets `PrivatePilotConfig.bindingCheckoutEnabled=true`
and presents a binding paid-request action. Real Payments being off does not
make the rental/contract wording non-binding. The exact Stage-A candidate must
fail closed before any participant can submit that action.

### `R16-P1-WAVE0-SURFACE-001` — signed release omits required G3/G4/G5 tasks

R14/N9 asks the full Wave-0 to exercise G3, G4 and G5, while all four technical
configs return unavailable in Flutter release mode. The current reduced R15
candidate is buildable, but the full Wave-0 task envelope is not. R17 may only
close this with an explicit Internal/Staging/non-public gate and retained
default-off/public-off behavior; otherwise the tasks must remain `not-run` and
human activation stays blocked.

## Exact future merge procedure

No step below is authorized now.

1. Resolve `R16-P0-SEC-HISTORY-001`; record only sanitized resolution evidence.
2. Resolve or explicitly exclude each P1 pilot finding from the intended
   candidate scope.
3. Obtain `PR7_REVIEW_SCOPE_ACCEPTED` and all six exact-head reviewer records.
4. Obtain any separately required legal/privacy/operator/candidate gates; the
   deferred-risk markers remain visible.
5. Fetch `origin/main` and verify the reviewed branch is zero commits behind.
6. If `main` advanced, merge `origin/main` into the PR branch with a normal
   merge commit. Resolve conflicts in bounded domain groups; do not rebase,
   force-push or squash.
7. Recount migrations and rerun the checksum-bound PostgreSQL 16 recovery,
   full regression, independent clean checkout, dependency/secret audit and
   CodeQL on the exact new head.
8. Require zero open CodeQL PR alerts and explicitly account for every external
   security check; repository-required checks alone are insufficient.
9. Freeze the exact head, candidate flags, migration checksums and rollback
   snapshot procedure. Any new commit restarts steps 3–8.
10. Walid may then issue `PR7_MERGE_APPROVED` for that exact head only.
11. Use GitHub's normal **merge commit** method. Do not select squash or rebase,
    even though the repository currently permits them.
12. Verify the resulting `main` merge commit and checks. Merge does not
    authorize deployment, migration, Store upload, Payment or pilot activation.

If any conflict changes contract, authorization, migration order, price,
publication, privacy or release truth, the safe fallback is to leave the PR
Draft, preserve both sides and route the changed domain back to its reviewer.

## R16 boundary

No Production, VPS, DNS, Cloud, Firebase/Play/Apple, Payment, provider,
tester, public release, merge or history mutation occurred. The pilot-freeze
commit is the exact R16 implementation commit after this report, machine
evidence, validator and tests are committed together. A later evidence-only
closure commit does not silently change the frozen product state.

## Exact verification closure

The exact pilot-freeze implementation commit
`7eac3d240b96e848addf3ee6df034bb742b0a9b9` passed GitHub Regression run
`32782075256`: Flutter job `97606168820`, Backend job `97606169194`,
PostgreSQL recovery job `97606169218` and independent R10 clean-checkout job
`97606169226` all succeeded; image publication stayed skipped. CodeQL workflow
`32782075298` and Advanced Security check `97606603148` succeeded with zero
open PR code-scanning alerts. R16 is closed and only its three direct findings
may enter R17.
