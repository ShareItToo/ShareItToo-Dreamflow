# WP02 — shared provider SDK ownership correction

Status: **IMPLEMENTATION LOCAL FULL PASS / TEST-ISOLATION FOLLOW-UP / DEVICE OPEN**.
Base HEAD: `239c5aa1f74e55cb2991f97832a1d855a7ae7e94`.
Branch: `codex/master-workflow-20260808`.
Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.

Latest source checkpoint, 2026-09-04: test-isolation follow-up
`d7575368b3ca1671ab2898d4f3cb02f603dd0fbd` passes exact Regression
`33810785195` (including clean checkout) and CodeQL `33810785212`. A separate
local clean APFS build clone also passes the complete unconfigured-Firebase CI
profile, with 2,151 tools, 665 default Flutter passes/33 skips, three provider
profiles, analyzer, Web/Wasm dry run, loopback and Android. The original
configured checkout also passes its full gate with the new cache selector
(2,156 tools). Exact host-tool CI and signed/device proof remain pending; see
`WP02_BUILD_WORKSPACE_2026-09-04.md`. Earlier pending statuses
below are historical checkpoints, not current CI failures or completion claims.

## Decision and scope

The read-only preparation in `WP02_PROVIDER_READINESS_2026-09-03.md`
reproduced cleanup from obsolete social calls that acquired no identity.
Additional offline probes established the same effect for disabled providers
and an interleaving where late A cancellation cleared an already acquired B
SDK identity. This is an authentication ownership defect, not proof of backend
data disclosure or the cause of the earlier physical SMS dialog observation.

Use one independent serialized SDK-operation queue for social acquisition and
phone credential confirmation through awaited cleanup. It reuses the existing
queue implementation but not the persisted-SIT-session queue instance. A mere
entry guard or UID check before an awaited global sign-out cannot protect the
interleaving. No observation timeout releases the queue while native work is
still running. Backend identity/session transactions retain their own owner
checks and targeted cleanup.

The owner received the bounded decision overview before implementation.
Source CI for the preceding SMS correction finished during this local work:
Regression `33806616812`, including clean checkout, and CodeQL `33806616843`
pass on the base HEAD. Those checks do not certify this new correction.

## Behavior

- Social entry captures the session epoch synchronously even if omitted by the
  caller. Obsolete/disabled entry acquires and cleans nothing. Queued actions
  recheck currency when admitted. Provider initialization/acquisition is also
  followed by a current-action check before the next SDK step.
- Only successful resource acquisition is tracked for Firebase, Google and
  Facebook cleanup. Failed/cancelled acquisition does not sign out an existing
  unrelated Firebase identity. Firebase cleanup requires the acquired UID and
  exact shared SDK-operation epoch, and is awaited before admitting a successor.
- Social and manual/automatic phone credential confirmation share this queue.
  A new SMS challenge does not transfer an already acquired SDK identity to
  another attempt. Cleanup uses the SDK-operation epoch, not the current SMS
  challenge generation. The existing `shouldCleanUpPhoneIdentity` predicate
  therefore receives SDK-operation epochs on its real call sites.
- Superseded SMS challenges are checked again before remote confirmation.
  Known remote acceptance is retained if the response arrives after an owner
  or challenge change. Confirmed cleanup failure remains different from an
  unconfirmed or unknown outcome. No UI navigation or dialog ownership changes.

## Verification and permanent inventory

Maintained offline integration tests use real AuthService with mock Firebase,
Google and Facebook interfaces and an in-memory HTTP client. A network-forbidding
override prevents accidental real traffic. The implementation commit added two
explicit profiles to `technical_regression_check.sh`; default skipped cases are not
counted as executed tests. The profiles cover preflight, disabled providers,
same-UID succession, queued stale owners, delayed cleanup, social/phone order,
native provider cancellation/acquisition/backend failures, and confirmed versus
unconfirmed phone cleanup outcomes. The original five obsolete/disabled
reproductions pass after the fix.

A permanent inventory confines SDK imports/mutations to the reviewed facade,
checks queue/ownership wiring and requires both mock profiles in the full gate.
Focused analyzer is clean after explicitly declaring the four already locked
mock-interface packages as dev dependencies. Only dependency classification
changes in the lockfile; versions, source hashes and runtime packages do not.

Focused profiles: 17 shared-SDK/phone cases and 11 native-provider cases PASS;
the nonselected profile's skips are not passes. Complete Node tool inventory:
2,151 PASS. Backend: 795 PASS with two expected skips, syntax checks PASS.
The first full local gate stopped at the unchanged host-capacity floor before
executing tests. Following the precisely recorded generated-cache recovery in
`N29_BUILD_HOST_DEBT_2026-09-03.md`, the full gate completed with exit 0:
2,151 tool tests; 665 default Flutter passes plus 33 profile skips (five
pre-existing and 28 separately executed below); analyzer zero issues; the
17-case and 11-case mock profiles; other configured profiles; Web debug;
Wasm dry run; loopback smoke; Android debug and binary audit all PASS.
Android audit reports minSdk 24, 14 permissions and eight exported components.
This is not standalone Wasm runtime, a signed candidate, or device acceptance.
Historical artifact/device validators used the documented local metadata-only
mode (`CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1`). Exact new-HEAD GitHub
Regression/CodeQL/clean-checkout and physical candidate proof remain pending.
The recovery does not close the recurring host debt: end free space was
1,106,232 KiB and the normal build-to-archive lifecycle still needs proof
without manual cache recovery.

Finalized private logs, outside Git (SHA-256):

- `/tmp/sit-wp02-sdk-full-regression-capacity-recovered.log`:
  `4cd9a21abcf42e3df8131da7b0ff0593250fe4b78ea7776055dc6d3096420a8b`.
- `/tmp/sit-wp02-sdk-backend-regression.log`:
  `534389034080f98127a34dbe733b4e50d0fda02b2dba29c99b7e33f5c45a96d7`.
- `/tmp/sit-wp02-sdk-full-secret-scan.log`:
  `cda1386c67777788667e7087b58983d034d2f4b8b373c22ec91352197064bc09`.

Full-history and working-tree secret scan PASS: zero new unexpected findings;
21 exact historical findings matched the reviewed baseline. `git diff --check`
passes. Private logs do not contain or substitute for real-provider acceptance.

## Test-order follow-up on implementation 70edafa2

Implementation HEAD `70edafa2002951b02fd786bead136c8881651daa` was committed
and normally pushed, with a clean worktree and 0/0 remote divergence. Exact
CodeQL `33809975135` passed. Regression `33809975120` was still running when
this follow-up was prepared; Backend and PostgreSQL jobs had passed. PR #7
remains Draft, open and unmerged. No signed release job was requested.

A further deterministic seed-7 run exposed a test-fixture order dependency:
the cold Google-initialization test waited for initialization even if another
Google case had already populated AuthService's process-wide initialization
cache. It timed out (10 other cases passed). The network-forbidding test
override rejected an unintended mock-path fallback; no real request occurred.
This is test isolation, not a newly proven application/session defect.
Reproduction log `/tmp/sit-wp02-sdk-native-seed7-before.log` SHA-256:
`8a21019ad47076c1a75abebcb5a5ba9c50d0e369adb7c578e09e4169fce4b174`.

The cold-initialization case now runs as a dedicated opt-in in a fresh test
process. Three explicit full-gate profiles cover 17 shared/phone, one cold
initialization and ten native-provider cases. Seed 7 is permanently required
for every profile; all three also passed independently with seed 29 (56
executions total). No timeout increase, retry, forced test-first ordering,
global reduction in parallelism or production test-reset hook was introduced.
AuthService is byte-identical to implementation 70edafa2, SHA-256
`1607dfd6d0b7907aa9040d7ec10f649fcaab12b6fef872accc66b4b4602b2687`.
Focused analyzer has zero issues and all 2,151 tool tests pass again.
Tool log `/tmp/sit-wp02-sdk-test-isolation-tools.log` SHA-256:
`541c0227bebe65cd0d770bd9cc805e3ab31ed825c0f537604c88f9cd93f8876c`.

The repeated full local gate for this test-only follow-up stopped before tests
at 4,729,044 KiB effective capacity, below the unchanged 5,242,880-KiB floor.
No further cache purge, floor change or build attempt followed. Log
`/tmp/sit-wp02-sdk-test-isolation-full-regression.log` SHA-256:
`17c9bccc5e1a7d308ddaa4b03912fa74ed6b1b8f30f3102ac04e7d454c28964d`.
Therefore full local follow-up acceptance is pending normal host capacity;
the earlier full pass is not relabelled as a new run. The 21 refreshed JSONs
change current-source hashes only; no source/approval/evidence claim changes.
Exact follow-up CI and a new separately bound signed Pixel candidate remain
pending. This package and the broader WP01/WP02 goals are not closed.

## Source-binding audit

AuthService, the full-gate script and dev-dependency manifests change current
source inventories. The 23 affected JSON manifests change only reviewed hash
fields; five validators change only corresponding literal hashes. Structural
comparison excludes only `sha256`, `privacyManifestSha256` and
`activeProviderEvidenceSha256`; every other claim remains identical to base.
No approval, retention, provider decision, historical verified HEAD, frozen
artifact hash or external readiness is promoted by the binding refresh.
Ratchets that deliberately reference older historical manifests retain their
original hashes; only ratchets bound to the current base are advanced.

## Remaining risk, rollback and next step

An unresolved native SDK future keeps later SDK operations waiting until it
terminates; a non-cancelling timeout must not manufacture safe ownership release.
Native platform behavior still needs a separately bound candidate and affected
Pixel acceptance. Existing best-effort social cleanup semantics are preserved;
no stronger claim of external-provider session revocation is made.

No migration or backend deployment. Rollback is a normal reviewed forward
revert of the eventual bounded commit, with source bindings refreshed; no
history rewrite. Frozen Pixel candidate 2026090307 is unchanged. No extra SMS,
Meta app, Apple account, provider activation, Store change, OnePlus access,
real-money action or PR merge occurred. WP01/WP02 and the encompassing Goal
remain incomplete until their original runtime requirements are evidenced.
