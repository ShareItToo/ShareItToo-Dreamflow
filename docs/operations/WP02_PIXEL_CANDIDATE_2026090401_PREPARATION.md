# WP02 / WP01 — Pixel candidate 2026090401 preparation

Status: **PREPARATION / NOT BUILT / NOT INSTALLED**, 2026-09-04.
Historical preparation status; subsequently built and independently verified
from `c0c4a0d13761d995e2aba8fed13edf0be481f90d`, but NOT installed because
exact CI's dependency audit timed out. See
`WP02_PIXEL_CANDIDATE_2026090401_HANDOVER.md` for the newer checkpoint.
This is the bounded candidate for the already-tested SMS retry-display and
shared provider-SDK ownership corrections. It does not close the full Staging
Goal, WP01 physical SMS acceptance, or WP02 external-provider setup.

## Provenance and candidate contract

- Source worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Preparation base: `c259027dde5f99d5838ea48bc17e2067f85a3f36`, pushed 0/0.
- Includes SMS retry correction `239c5aa1`, shared SDK correction `70edafa2`,
  deterministic cold-initialization test isolation `d7575368`, and guarded
  dedicated build-cache runner `c259027d`.
- Package/version: `com.shareittoo.app`, `1.0.0+2026090401`.
- Actual build source must be the clean final preparation HEAD; the builder
  embeds it and records it in the private archive, not this base-HEAD field.
- Internal channel; API `https://staging.shareittoo.com/api/v1`; existing
  protected Android Firebase Staging configuration, unchanged.
- Existing canonical upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Google enabled; Apple and Facebook disabled until their own setup is done.
- Existing Blue Ocean assistant, non-binding closed-pilot `heilbronn_wave0`
  and technical booking-group/planner/supply/listing-set surfaces retained.
- No new crash diagnostic, provider activation, public registration, real
  payment, Store action, OnePlus access, production deployment or PR merge.

The highest archived build and highest version in all local Git refs were
both `2026090307`; `2026090401` is strictly higher and unused in both sources.
This is a direct signed-APK candidate, not a Play Console maximum or upload
claim. The installed Pixel remains `1.0.0+2026090307` until separately verified
data-preserving update evidence exists.

## Narrow source change and evidence boundary

The only functional preparation edits are pubspec's version and its matching
`PrivatePilotConfig.v52ClientBuild` fallback. A 26-file comparison against the
base, normalizing only the exact version increment and SHA-256 literals,
proves there are no other semantic changes. Dependent current-source hashes
were refreshed; historical ratchets, readiness decisions, legal/privacy claims,
validator rules, dependencies and provider flags were not relaxed.
The focused candidate-rollover, privacy and local-cache tests pass 36/36.

Source `d7575368` has exact passing Regression `33810785195` including clean
checkout and CodeQL `33810785212`. Host-tool source `c259027d` has passing
CodeQL `33813284353`. Regression `33813284416` finished FAILED:
Backend and clean-checkout jobs failed at the unchanged dependency
audit: npm's advisory POST timed out after its existing bounded retries.
The Backend job passed 797 tests and syntax checks first; PostgreSQL and
Flutter jobs passed, and API image publication was skipped.
No vulnerability-free or clean-checkout pass is inferred from this outage.
These are predecessor results, not substitute acceptance of the new candidate.
No frozen artifact or historical physical result is relabelled.

Configured release preflight passes without creating artifacts (explicit
preflight-only mode, dirty preparation allowed only for that mode). Android
Firebase and canonical signing gates pass; Apple remains unconfigured and
submission remains forbidden. Actual signed builds still require a clean tree.
Full-history/working-tree secret scan passes with 21 exact historical baseline
findings and zero new high-confidence findings.

The complete local candidate-metadata gate passed with the dedicated cache:
2,156 tool tests, 665 default Flutter passes/33 profile skips, explicit
shared-provider/cold-initialization/native-provider suites (17/1/10, seed 7),
all other configured profiles, analyzer zero, Web debug and Wasm dry run,
loopback smoke, Android debug and binary surface audit. Android completed in
19 seconds; minSdk 24, 14 permissions and eight exported components match.
Internal free space was 2,069,484 KiB before and 2,049,896 KiB after; generated
output went from 3,691,672 to 3,691,644 KiB. All fixed capacity guards and
image/backing reserves passed with no manual purge. This preparation run is
not yet the clean candidate-HEAD to signed-archive lifecycle.
Log `/tmp/sit-wp02-0401-metadata-full-regression.log`, SHA-256:
`3ee49e0e7c05a93803affceb4e361a07751709fb9f057ffd9129226f404aa409`.
Preflight log SHA-256:
`fb812066af8aa0b0cfca05c4b51c23db9adce456c58bbb0fe387b918849c9e75`.

### CI availability debt — OPEN

Observed 2026-09-03 22:34–22:38 UTC: both exact c259027d jobs failed at
`pnpm audit --prod --audit-level=moderate`, POST
`https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`.
The command's existing retries ended in `TimeoutError`, exit 1. The clean
runner propagated that failure; no tests or security thresholds were weakened.
Detailed job logs are retained privately outside Git. A local audit was
started as an independent availability check, not a substitute CI pass.
Record any later rerun explicitly. No retry loop, ignored exit, timeout
increase, audit suppression or permanent workaround is permitted. Closure
requires the unchanged security audit and exact candidate Regression including
clean checkout to succeed; any actual advisory remains a separate blocker.

## Execution and closure

1. Complete full candidate-metadata regression and reviewed explicit-path
   commit/push. Wait for the existing CI before pushing, avoiding needless
   cancellation. Require exact new-HEAD Regression, clean checkout and CodeQL.
2. On the clean candidate HEAD run the full local gate followed by the normal
   signed Android builder through the dedicated build-cache runner. Keep the
   same private cache profile and unchanged capacity/footprint guards. No
   intervening manual cache purge, retry workaround or global fallback.
3. Verify AAB and APK signatures, SHA-256, exact package/version/source/API,
   Firebase/provider profile, binary privacy, SDK/permission surface and bundle
   structure. Verify the four-file private archive, retaining all predecessors.
4. Only then update Pixel with the existing strictly-higher-version,
   same-certificate, data-preserving installer. No uninstall, data-clear,
   downgrade, OnePlus or Store action. Independently verify installed bytes.
5. Run bounded authenticated smoke and no-SMS phone preflight. A fresh SMS
   request requires a new owner-ready window; no old code, unattended resend
   or reading message/notification contents. Preserve the protected test owner.
6. Record real invalid-code rejection, valid-code UI completion, verified
   cold restart and exact test-phone cleanup separately when possible. Mock
   tests and Backend acceptance do not alone prove physical dialog completion.

The configured-host capacity debt closes only after the candidate-bound full
gate to signed-archive sequence succeeds without another manual purge. The
separate Kotlin metadata diagnostic remains OPEN, not suppressed by a passing
build. See `WP02_BUILD_WORKSPACE_2026-09-04.md` and
`N29_BUILD_HOST_DEBT_2026-09-03.md`.
