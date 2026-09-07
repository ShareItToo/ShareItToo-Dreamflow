# WP55 — Authenticated Staging parity deployment readiness

Status: **BUILD READY; RUNTIME ROLLOUT NOT YET PERFORMED**.

## Frozen scope

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Exact target/source HEAD:
  `d8d1df7f59052c202f824f759693a472b6b8afa1`.
- Reviewed WP50 Backend target:
  `9de283ab0d5386f054606ac615a52ff05059f4db`.
- Current deployed Staging Backend:
  `68c97a437969dc98f17eb151da3e006259ffbafa`.

WP55 prepares only a Staging Backend parity rollout. Production, payment,
external Listing AI, Store, Firebase Console, DNS, OnePlus and PR merge remain
unchanged.

## Authenticated read-only VPS inventory

At `2026-09-07T22:56:44.622Z`, the exact WP51 inventory tool, source SHA-256
`99a8b4144fedb4cb8df4b577dd868fbab14415e8b171f48d679aca153aabdd4a`,
returned `status=passed-read-only` through the authenticated Hostinger VPS
terminal.

The result proves:

- API and PostgreSQL are running and healthy with restart count `0`;
- runtime, OCI image and mode-`0600` release record bind exactly to
  `68c97a437969dc98f17eb151da3e006259ffbafa` and version
  `0.1.0-68c97a437969`;
- the exact rollback image is locally available;
- protected Staging keeps Firebase authentication, phone verification, FCM,
  SMTP and the Heilbronn pilot enabled while payment stays memory-only,
  Stripe live mode stays false and Listing AI stays mock-only with zero
  external budget/execution;
- disk use is `65%`, below the existing `85%` threshold, with `35,293,224`
  KiB available; memory has `4,205,608` of `8,131,484` KiB available;
- no credential contents or paths were emitted, no container configuration was
  dumped and no deployment, Staging-data or Production change occurred.

The complete sanitized inventory is retained owner-only outside Git with mode
`0600`. Repository evidence contains no account, credential, server address or
raw infrastructure identifier.

Fresh public readiness immediately afterward remained HTTP `503` solely for
the existing one noncritical overdue support update. Database and mail were
healthy, notification pending/dead counts were zero, critical/privacy support
deadlines were healthy, payment remained memory-only/not-live and Listing AI
remained mock-only. This operational deadline does not alter the authenticated
container-health or release-identity result.

## Exact target and GitHub proof

No Backend path changed between reviewed WP50 target `9de283ab…` and current
HEAD `d8d1df7f…`. Both resolve `backend/` to the identical Git tree
`d991765a159810b88e4e4db874ac6193ae3e804d`. The already reviewed deployed-to-
target delta therefore remains exactly eight files with no SQL migration; its
only functional runtime addition remains the bounded 100-active-session
security enforcement.

GitHub workflow-dispatch Regression `34168650985` passed at exact target HEAD,
including Backend, PostgreSQL recovery, Flutter/Android and independent clean-
checkout reproducibility. Its `publish-api-image` job passed and published the
exact commit-tagged image with registry manifest digest
`sha256:e4ae94d740ef83fa80d59762805e1f64cc76f80ecd46531f955ce27ab0289908`.
Anonymous read-only manifest resolution succeeds, so no GitHub credential must
be copied to the VPS. Existing exact-head CodeQL `34160161823` also passes.
PR #7 remains Draft, open, mergeable and unmerged.

## Remaining fail-closed continuation

The macOS session auto-locked after the exact versioned-checkout preparation
command was submitted to the authenticated web terminal. Its end state is not
visible and is therefore **not claimed**. Before any rollout, the continuation
must:

1. re-open the authenticated terminal and prove whether the exact target
   checkout exists, is detached at `d8d1df7f…`, is clean and has Backend tree
   `d991765a…`; quarantine any incomplete directory instead of overwriting it;
2. prove the protected Staging env file remains mode `0600`, without reading or
   printing values, and retain only pilot, FCM and SMTP overlays;
3. pull the exact registry tag and require both its manifest digest and OCI
   revision/version/build-time labels to match the frozen target;
4. run the current target deploy harness, including its pre-mutation foreign-
   key check and automatic exact-image rollback;
5. require exact post-deploy version, container health, protected runtime shape
   and release record, then execute the isolated 100-session bound smoke and
   clean its disposable identity;
6. preserve the existing noncritical support-deadline degradation as a
   separate truthful blocker rather than rewriting it as deployment failure.

The target image is now published, but no pull, rollout, database mutation,
session smoke or runtime change is claimed by this readiness package.
