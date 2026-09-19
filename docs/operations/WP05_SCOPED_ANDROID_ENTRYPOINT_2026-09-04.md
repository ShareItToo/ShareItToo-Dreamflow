# WP05 — maintained scoped Android build entrypoint

Implementation committed locally as `c4923cf1db58dcaccc33597a8c4d534f7f7cbd3a`.
Final complete tool-inventory rerun passes2210 with the strengthened zero-call
assertions. Machine-readable proof:
`docs/evidence/release-readiness/wp05-scoped-android-entrypoint-local-20260904.json`.

Base: clean `87f4c1b2e15e6b15bc64de7753114aaf75a82932`, canonical worktree
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`, branch
`codex/master-workflow-20260808`. Local tracking refs show 19 ahead / 0 behind;
this is not a fresh remote check. Owner explicitly deferred GitHub: no auth,
push, remote query or CI request. Frozen signed/installed0403 remains unchanged.

## Cause and bounded implementation

0403's first signed invocation omitted isolated Flutter configuration despite
setting both SDK variables. Flutter selected the global SDK and the unchanged
scanner rejected the resulting diagnostic. The installed Flutter 3.41.7 source
(`base/config.dart` and `commands/config.dart`) confirms HOME legacy settings
take precedence over XDG, while `config --machine` includes resolved SDK choice.
The earlier private recipe prevented this, but was not a maintained prerequisite.

`tool/run_with_local_build_cache.mjs` now supports an explicit version-2 profile
with `androidSdkDirectory` and `flutterConfigDirectory` in addition to the five
version-1 fields. Version1 stays strictly cache-only and unchanged in meaning.
Version2 supplies ANDROID_HOME, ANDROID_SDK_ROOT and XDG_CONFIG_HOME together,
overriding stale inherited choices without mutating the parent environment or
HOME. It requires canonical owner-only SDK/config directories, rejects legacy
global Flutter settings (without reading/deleting them), and invokes read-only
`flutter config --machine` with bounded captured output. Missing/wrong/malformed
or timed-out effective selection cannot dispatch the child. Valid saved scoped
settings are fingerprinted; malformed JSON is rejected before Flutter's parser
could delete it. SDK selection and settings consistency are checked again after
the child; mismatch never produces a successful lifecycle result.

Existing exact APFS mount/backing checks, capacity floor, shell-free argument
execution, signal forwarding, child status and post-command storage verification
remain. No cache purge, SDK package/XML/JAR edit, global-settings write, signing
change, provider flag or source-inventory/approval change is introduced. This
is an explicit local-host profile, not a new requirement for standard CI hosts.
The process must not have its config/SDK/volume externally changed during work;
post-check rejection cannot undo an already completed child action.

## Maintained invocation

New owner-only profile, outside Git:
`/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_ANDROID_BUILD_20260904.json`.
The historical version-1 profile and old candidate-pinned scripts are preserved.

```sh
node tool/run_with_local_build_cache.mjs \
  --profile /Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_ANDROID_BUILD_20260904.json \
  -- env CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 bash scripts/technical_regression_check.sh
```

Use the same profile for the reviewed signed lifecycle, with its existing exact
source/version/signing/Staging/provider gates. This command does not authorize
release actions. CI=true remains a local historical-metadata check, not GitHub
or Store evidence. No extra SDK/XDG variables or private lifecycle helper needed.

## Verification and remaining debt

30 focused tests pass: original five cache guards plus 25 scoped-profile tests.
They cover complete environment, unchanged parent/v1, exact effective selection,
probe failure, absent/unsafe/linked/global configuration, malformed saved settings,
pre-dispatch rejection, changed settings, post-child selection and nonzero child
status. The complete normal tool glob automatically includes the new tests.
The old cache source-wiring assertion is adapted to the injectable observer name;
both before/after checks remain required. The initial contract run fails five
tests before implementation; negative-case throws at that point include missing
helpers and are NOT independent product regressions. The actual previous0403
failure remains the original evidence of the SDK omission defect.

Actual-host readback passes through the new profile with no manually supplied
SDK/XDG variables: all four scoped child variables match, effective Flutter SDK
checks pass before/after, and original storage guards pass. It created no build
or release. A second actual-Flutter synthetic wrong-SDK configuration is rejected
before any child dispatch with sanitized output; the valid profile preserves
child exit17. Both global Flutter settings snapshots are byte-identical before/
after those probes. Only synthetic negative-control files were removed normally.

The complete normal gate then passes through version2 without manually supplied
SDK/XDG: 2210 tool tests,724 default Flutter tests/33 explicit-profile skips, all
mandatory profiles, analyzer zero, Web build/Wasm dry run, loopback smoke and
Android debug13s (11 tasks executed/460 up-to-date). R11 retains minSdk24,
14 permissions/8 exported components. Capacity:10449992 to10430896KiB free;
generated3274336 to3274340KiB; unchanged limits pass. Runtime implementation
stayed unchanged throughout. Five negative tests' probe-dispatch assertions were
strengthened with explicit zero-call counters; final focused30 and combined45
guard/R10-helper reruns pass. No standalone Wasm runtime, signed artifact,
clean-checkout or actual-device acceptance is inferred from this normal gate.

Normal full log SHA256:
`d7b64671f003d86b94f0f97552c2a437030b9987d3236ef57f0c768c9ddcbe2e`.
Owner-only retained proof folder:
`/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_WP05_SCOPED_SDK_EVIDENCE.aaLAMU`.
Current working-tree secret scan and diff check pass. No existing sourceInventory
names this wrapper; no manifest hashes, legal claims, approval states or
ratchets were refreshed. The new tool tests enter the normal complete glob.

TD-WP05-SCOPED-SDK-INVOCATION remains **PARTIAL** until exact final cold proof,
matched signed lifecycle and exact CI. Broader SDK/Kotlin compatibility debt is
not closed by this selector. Next freeze one distinct successor with both local
support fixes and this prerequisite, then unchanged full cold R10 before signing.
The earlier npm advisory503/timeouts remain an OPEN verification dependency;
no waiver or immediate retry loop. Final GitHub is deferred, not waived. No
device, real support case, backend/provider, account, Store or production action.
