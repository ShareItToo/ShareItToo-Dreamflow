# WP84 — Staging Compose override persistence

Status: **LOCAL RELEASE-HARNESS CORRECTION COMPLETE; STAGING ROLLOUT HELD.**

## Finding

A dedicated, non-interactive read-only Staging observation completed the WP82
contract without reading configuration or credential contents. Runtime and
release identity matched, the expected Staging containers and named data
volumes were present, and the checked-in release route remained an
immutable-image, no-build, health-readback and rollback route.

The active Compose metadata named five configuration files. Four were regular,
persistent files; the fifth was a now-absent temporary deployment override.
That transient override had supplied the exact image selection during the
prior successful rollout. This is not a running-service failure, but it means
the active configuration could not be reconstructed exactly from persistent
remote files alone. It is therefore a release reproducibility defect.

## Correction

The release harness now creates deployment and verified-rollback overrides
inside an owner-restricted, non-symlinked `.runtime-overrides` directory under
the authoritative Backend root. Both override files are owner-readable only
and are retained after a successful deployment or verified rollback. Failed or
unfinished attempts still remove their temporary artifacts during cleanup.

The correction retains the existing safeguards: exact commit-labelled image,
no local build fallback, health readback, rollback verification and named
Staging data-volume identity. It neither enables a provider nor changes runtime
feature holds.

## Boundaries and next safe action

No remote source, container, data volume, deployment, Firebase, provider,
payment, Store, device, DNS, Production or PR state changed in WP84. The
existing Staging deployment remains untouched.

The next action is a separately authorized, exact-commit Staging rollout
through the existing release harness, followed by the same read-only
observation. It must prove that every active Compose file is persistent,
regular, non-symlinked and contained in the authoritative working directory.
Until that readback passes, the remote reproducibility proof remains open.

## Verification

- targeted deployment-harness checks: **15 passed**;
- complete local technical regression, including Flutter tests, Analyzer,
  Web/Wasm loopback, Android debug build/minSdk 24 and R11 Android surface:
  **passed** at `ed8c973ad8dd70968a7797d40e2e3b68ec16cfe8`;
- exact GitHub Regression
  [`34438480359`](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/34438480359)
  and CodeQL
  [`34438480362`](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/34438480362)
  pass for that commit. The Regression's Backend, PostgreSQL, Flutter and
  clean-checkout jobs are all successful; publish-image is skipped. PR #7 is
  still Draft/open/clean/unmerged with zero open merge-reference Code Scanning
  alerts.

Machine-readable evidence:
`docs/evidence/release-readiness/wp84-staging-compose-override-persistence-20260910.json`.
