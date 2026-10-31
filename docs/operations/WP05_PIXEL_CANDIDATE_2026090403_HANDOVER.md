# WP05 — verified Pixel successor and provisional smoke

Status: **SIGNED LOCAL CANDIDATE VERIFIED / PIXEL UPDATE AND SMOKE PASS /
REAL EXPORT, FULL ACCEPTANCE AND GITHUB STILL OPEN**.

## Exact source and archive

Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
Branch: `codex/master-workflow-20260808`.
Frozen build source: `f6a9a41471058c9f80ffd01283c42b9d74a8845c`.
Later evidence-only commits are not its build source. No push or GitHub
authentication/CI action was performed; the owner explicitly deferred that lane.

- Package `com.shareittoo.app`, version `1.0.0+2026090403`.
- Internal channel and `https://staging.shareittoo.com/api/v1` only.
- APK: 136,040,789 bytes, SHA-256
  `3fa32413f2555047751b160bbe80bbf8f4a8cde127500abc5291872e79caba16`.
- AAB: 109,300,879 bytes, SHA-256
  `2b043f20786d8bd38bf952b1f7fa4f61069dec78064617e071b18cc274a4148d`.
- Both signatures independently match canonical certificate SHA-256
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Original protected Android/Staging Firebase inputs; Google enabled,
  Facebook/Apple disabled. Existing non-binding `heilbronn_wave0` envelope and
  G3/G4/G5 technical flags remain unchanged; no provider activation is inferred.
- minSdk 24, target/compileSdk 36, non-debuggable release. Fourteen permissions,
  forty components/eight exports and the complete application/query trees match
  the independently hash-verified 0402 archive. Backup exclusions, FileProvider
  scopes, Firebase default collection policy, binary privacy, ZIP/bundle
  structure and native-symbol metadata pass.

Immutable owner-only four-file archive:
`/Users/walidchraibi/Library/Application Support/ShareItToo/release/android/2026090403-f6a9a41471058c9f80ffd01283c42b9d74a8845c`.
No prior archive was overwritten. 0402 retains its own source and evidence.

## Local checks and the rejected first signed attempt

The preparation passes 213 focused tests and the complete normal regression.
Exact detached clean R10 then passes on f6a9a414: locked fresh dependency caches,
backend/syntax/audit/secrets/PostgreSQL, full technical gate 663s and second
Android build 46s. Both debug APKs are byte-identical, 231,274,083 bytes, SHA-256
`f67232bce3d182f5f431d49fc325eeb30bbaa82d0819bfd4cba4ea3d78f151fc`.
All 794 entries match without a normalization exception. All 116 migrations,
84 assets and other source inventories remain unchanged; bounded generated
output and automatic temporary-checkout/cache/APK cleanup pass.

The first signed attempt is **FAILED**, exit 1. The invocation omitted the
already documented process-local `XDG_CONFIG_HOME`; Flutter's global
`android-sdk` setting overrode both Android environment variables and selected
the old SDK. Its SDK-XML warning was correctly rejected by the unchanged
diagnostic scanner after the temporary AAB build. No accepted 0403 archive or
Pixel action came from that attempt. The generated output was cleaned by the
normal builder; its failed log is retained, not overwritten:
SHA-256 `e4d95fdbad9cb86fcb3308f18d7559ab554f6c0d1e607dc2dbf73558acf7af3a`.

The correction used the complete existing 0402 recipe: both SDK variables plus
the existing owner-only Flutter configuration directory, with no global setting,
HOME, SDK XML/JAR, license, credential or source edit. Actual
`flutter config --machine` confirms that the unscoped control selects the old
SDK and the scoped control selects the intended CLI 19 SDK. The global settings
hash remains `3f9a5de0ddf4a5ca7a8d85558cf1f2acff332a72e2119696e78dee4270c594c7`.

A guarded private runner verifies Flutter's effective SDK before running the
complete normal gate and signed builder sequentially with the same scoped
configuration. Both pass, without an intervening manual cache purge or source
change. Final normal results: 2,174 tool tests, 687 default Flutter tests and all
mandatory profiles (33 default explicit-profile skips), analyzer zero, Web debug
and Wasm dry run, loopback, Android 40s / 466 of 471 tasks and R11. The signed archive
then passes independent verification from a separate clean public-input-only
clone at f6a9a414. Both final logs contain no SDK/Kotlin-analysis incompatibility.
No standalone Wasm runtime or signed-release byte-reproduction claim is made.

Final normal log SHA-256:
`d2a785e81bbaf7df3e576f8e87a7e714015a472be25edf038e60ba763034941e`.
Signed log SHA-256:
`e2ee4e4500d2c4d525fae349589ba61145450a1d764343bfaed1b1eef31c89ea`.
Independent artifact-inspection JSON SHA-256:
`28202f0e2ac5158448bc5ca781572a438d9fbf0b587794c248f1ea4f5ec69eaa`.

Technical debt **TD-WP05-SCOPED-SDK-INVOCATION — PARTIAL**: the supported scoped
recipe and actual positive/negative SDK-selection controls are verified; the
private invocation now fails before building on a wrong effective SDK. Before
release readiness, make this effective-selection check part of the maintained
release entrypoint with deterministic tests and exact CI. Do not depend on an
operator remembering an extra environment variable or weaken the scanner.

## Actual Pixel result

At 10:09 UTC, the read-only preflight verifies the already-unlocked physical
Pixel 7 Pro / API 37, installed 0402, matching certificate and strictly-higher 0403.
The normal replace-only update succeeds. Installed APK bytes match exactly;
first-install time and credential-encrypted data-directory identity are retained.
No uninstall, downgrade, reset, fresh login or account deletion occurred.

Current 0403 smoke then passes: existing authenticated profile survives two
cold starts, all five main navigation destinations are reachable, process
termination/relaunch works and package/data identity remains unchanged.
This proves neither fresh registration/login, backend-owned account identity,
all destination functionality, privacy export nor the full two-role matrix.

Fresh read-only Staging health before the update confirms deployed
`5d88295fa7fe313b83936783a0582a505b2ba486`, environment Staging, payment transport
memory and live mode false. It does not establish AI selection or provider
delivery. No backend deployment, real money, provider/Firebase activation,
fresh SMS, Store/Production/OnePlus action or PR merge occurred.

## Evidence and next bounded work

- `docs/evidence/release-readiness/wp05-pixel-0403-clean-reproducibility-20260904.json`,
  SHA-256 `1a652e7dc0a4a47d3c4fd0e261530eefed9454313052ad6c9103170d3d0a435b`.
- `docs/evidence/release-readiness/wp05-pixel-0403-provisional-acceptance-20260904.json`:
  reconciled artifact, preflight, update, smoke and failed-attempt evidence.
- Private proof directory:
  `/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_WP05_0403_EVIDENCE.ikyE6L`.
- Separate artifact-reinspection clone, no protected inputs:
  `/Volumes/SIT-Build-20260904/wp05-0403-release-proof-source.KWhsui`.

Continue real privacy/support acceptance with existing disposable Staging roles,
then the outstanding current-candidate functional matrix. Never delete the
owner's account or inspect unrelated native-share contacts/targets. Preserve
the original 0402 wrappers; current 0403 wrappers bind source, artifact proof,
fresh runtime hold and the single Pixel. Do not rerun the strictly-newer updater
now that 0403 is installed. GitHub remains deferred, not waived; final exact
Regression/CodeQL, provider/legal/owner prerequisites and full Pixel closure
remain required. OnePlus stays untouched.
