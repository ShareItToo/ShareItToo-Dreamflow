# WP50 — Staging Backend parity deployment preflight

Status: **COMPLETE AND VALIDATED; STAGING DEPLOYMENT REMAINS HOLD/NO-GO**.

## Frozen scope

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Preflight base: `265e39d9c773eb265002c84db498b14931702a81`.
- Technical package HEAD:
  `64b1a2ffa1dceca7021bce773c38e692f4a7df39`.
- Proposed Backend deployment target:
  `9de283ab0d5386f054606ac615a52ff05059f4db`.
- Observed Staging release:
  `68c97a437969dc98f17eb151da3e006259ffbafa`.

WP50 is a read-only preflight. It changes no application or Backend runtime,
deployment, Staging data, provider, payment, Firebase Console, Store, device or
PR state.

## Current Staging truth

The public read-only version endpoint returns HTTP 200 and binds Staging to
`0.1.0-68c97a437969`, built at `2026-09-06T05:48:02.000Z`. Readiness returns
HTTP 503 solely because one noncritical support case has an overdue next update.
Database and mail are healthy; notification pending/dead counts are zero;
support P0-without-owner, critical deadline, privacy deadline and watchdog
checks are healthy.

The protected runtime remains fail-closed in the last sanitized readback:
payment uses memory transport with live mode false, and Listing AI uses the mock
provider with zero budget, no external execution and no automatic publication.
Because that protected readback is from 4 September, it must be repeated
immediately before any deployment.

## Exact Backend delta

The deployed-to-target Backend delta contains exactly eight files and no SQL
file. The only functional runtime addition is the tested 100-active-session
limit per user. Before issuing a new session it locks the account row, revokes
only the oldest excess active sessions, revokes their refresh tokens and removes
their session-bound push devices. Refresh rotation reuses the existing session.

No schema migration is required. The deployment harness and base Staging Compose
file are byte-identical between deployed and target commits. The only permitted
overlay order for a later rollout is base Staging, pilot, FCM and SMTP. Listing
AI and Stripe overlays remain forbidden.

Rollback is runtime-only before any post-deployment login. After a login, image
rollback must never reactivate sessions legitimately revoked by the security
limit.

## Bound deployment runway

1. Re-read the authenticated VPS commit, running image, non-secret runtime
   shape, release record, container health, restart count and resource headroom.
2. After a separate deployment gate, build the exact target from a clean
   detached checkout and verify its OCI revision, version and build-time labels.
3. Capture the current image ID and rollback release, prove that image is still
   available and run the read-only foreign-key check.
4. Use only the current deployment harness and required protected overlays.
5. Verify exact version, health, runtime shape, database integrity and the
   100-session bound with an isolated disposable Staging identity.
6. Automatically restore and verify the exact prior image if a gate fails,
   without reversing legitimate session revocations.

The external gate `STAGING_BACKEND_PARITY_DEPLOYMENT_GO` remains closed because
the current authenticated VPS state, rollback image identity, release record and
resource headroom have not been re-read, and no deployable exact target image is
proven available. A successful CI image build is not treated as a published or
server-available image.

## Verification

- Seven focused fail-closed validator tests pass.
- All 2,436 repository tool tests pass.
- The complete local regression passes with 904 Flutter passes and 33
  intentional skips, Backend, PostgreSQL, analyzer, Web/Wasm, loopback smoke,
  Android minSdk 24/build and capacity checks.
- Exact-head GitHub Regression `34137175855` passes all required jobs,
  including independent clean-checkout reproducibility.
- Exact-head GitHub CodeQL `34137175853` passes; open code-scanning alerts are
  zero.
- PR #7 remains Draft, open, mergeable and unmerged.

No credential contents, credential paths, account identity, phone number,
device identifier or token are recorded. Machine-readable evidence:
`docs/evidence/release-readiness/wp50-staging-backend-parity-deployment-preflight-20260907.json`.
