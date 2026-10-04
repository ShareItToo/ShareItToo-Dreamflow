# WP51 — Staging runtime read-only inventory preparation

Status: **TECHNICALLY COMPLETE; AUTHENTICATED VPS OBSERVATION STILL OPEN**.

## Frozen scope

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- WP50 closure HEAD:
  `f99ebefbe00429e677ce32294a93c56873c2b831`.
- WP51 technical HEAD:
  `590a5b443f951953fa85c0c2f4706934f4d30fe7`.
- Proposed Backend deployment target remains:
  `9de283ab0d5386f054606ac615a52ff05059f4db`.

WP51 changes no application or Backend runtime, deployable Backend source,
container, database, Staging data, provider, payment, Firebase Console, Store,
device, Production, DNS or PR state.

## What is now deterministic

`tool/inspect_staging_runtime_readonly.mjs` collects the exact pre-deployment
VPS facts required by WP50 in one fail-closed run. It uses fixed direct
process invocations and never invokes a shell. It inspects only:

- the running and healthy state, restart count, start time and image ID of the
  exact Staging API and PostgreSQL containers;
- OCI image ID, revision, version, creation time and size through individually
  allowlisted Docker format fields;
- an allowlisted non-secret runtime shape, boolean credential-variable
  declarations and fixed Firebase-file metadata inside the API container;
- the newest regular, non-symlinked, mode-0600 bounded Staging release record;
- disk and memory headroom.

The tool requires exact equality between runtime, image and release-record
commit/version/build-time. It also requires healthy containers, FCM, SMTP,
Firebase authentication and phone verification, the Heilbronn pilot features,
memory-only payment with live mode false, and mock-only Listing AI with zero
budget and no external execution. Unknown fields, malformed nested readiness,
unexpected runtime values, symlinks, unsafe release-record permissions and
identity drift all fail closed.

The output deliberately contains no credential value or credential path. It
does not dump Docker configuration or environment data and performs no pull,
build, start, stop, restart, deployment, database query or file write.

## Current observation boundary

At `2026-09-07T16:27:05Z`, the public read-only endpoints still bind Staging
to `68c97a437969dc98f17eb151da3e006259ffbafa`, version
`0.1.0-68c97a437969`, built at `2026-09-06T05:48:02.000Z`. Readiness remains
HTTP 503 solely for one overdue noncritical support update; database, mail,
notification queue, payment integrity and every critical/privacy support
deadline remain healthy. Payment stays memory-only and not live; Listing AI
stays mock-only with zero budget and external execution false.

This is not a substitute for the authenticated VPS inventory. The existing
browser session was not available to this local GUI context, and direct access
to the prior web-terminal endpoint returned HTTP 403. No login state or server
failure is inferred from that result. Docker is also not installed on this Mac,
so neither the current server image nor the exact target image can be inspected
locally.

## Exact continuation

When the already authorized Hostinger session is visibly available, run only:

```text
node tool/inspect_staging_runtime_readonly.mjs
```

Accept the output only if it returns `status=passed-read-only`; otherwise retain
the emitted generic error code and make no deployment. The authenticated output
must then be captured as sanitized private operational evidence and reviewed
against the WP50 target before any image publication or rollout.

Until that succeeds, `STAGING_BACKEND_PARITY_DEPLOYMENT_GO` remains closed.
The exact target image is not published or proven server-available, no rollback
identity is freshly captured, and no deployment has started.

## Verification

- Six focused tests cover the healthy exact shape, protected-runtime drift,
  unexpected output fields, release identity/readiness drift, symlink and
  permission rejection, and source-level no-secret/no-config-dump guardrails.
- All 2,442 repository tool tests pass.
- The complete local regression passes at the exact technical HEAD, including
  904 Flutter passes with 33 intentional skips, Backend, PostgreSQL, analyzer,
  Web/Wasm, loopback smoke, Android minSdk 24/build and capacity checks.
- Exact-head GitHub Regression `34143191343` passes every required job,
  including independent clean-checkout reproducibility. The image-publication
  job is correctly skipped.
- Exact-head GitHub CodeQL `34143191259` passes, and open code-scanning alerts
  are zero.
- PR #7 remains Draft, open, mergeable and unmerged.

No temporary test, timing, cache, rate-limit or parallelism workaround was
introduced. The established dedicated build cache remains the repository's
verified build environment, not a release-runtime prerequisite.
