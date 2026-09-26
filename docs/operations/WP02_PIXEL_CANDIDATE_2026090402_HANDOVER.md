# WP02 / WP01 — signed Pixel candidate 2026090402

Status: **LOCAL RELEASE VERIFIED / EXACT CI UNCLEARED / NOT INSTALLED**.
Latest execution: unchanged full local dependency audit recovered and passed.
The one bounded exact-CI retry is now terminal: Backend FAILED again at the
advisory timeout; clean checkout PASSED. No further retry started.
Observed 2026-09-04. This is a candidate checkpoint, not closure of WP01,
WP02 or the encompassing Android-Staging Goal. It supersedes the preparation
status without changing any older candidate's source-bound evidence.

## Frozen source and artifacts

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Clean build source: `bfd3e9e4422a6a6e6bf3c09bd825c6a089909d04`, previously
  pushed. Subsequent documentation commits do not become its build source.
- `com.shareittoo.app`, `1.0.0+2026090402`, Internal Staging, API
  `https://staging.shareittoo.com/api/v1`.
- Original protected Firebase Staging configuration and canonical signing;
  no credential, Firebase input or signing material copied or disclosed.
- Google enabled; Facebook/Apple disabled. Existing non-binding closed-pilot
  `heilbronn_wave0`, Blue Ocean and G3/G4/G5 technical profiles retained.
  These flags are not proof of provider activation or runtime acceptance.
- APK: **136,008,005 bytes**, SHA-256
  `77fa3f881ff5a1f91c9995373ded4e3bd270f9ae6c787446c36e5f07b487211b`.
- AAB: **109,292,089 bytes**, SHA-256
  `417517290a78752b7bba2d4a40071d73c5e0f3ddbd609121178507c44f397dfe`.
- Both signatures independently match certificate SHA-256
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Immutable owner-only four-file archive:
  `/Users/walidchraibi/Library/Application Support/ShareItToo/release/android/2026090402-bfd3e9e4422a6a6e6bf3c09bd825c6a089909d04`.

No archive overwrite, version reuse, upload, installation or device mutation
occurred. The prior 2026090401 archive and installed 2026090307 remain distinct.

## Local verification actually completed

The complete clean-source gate and the normal signed AAB/APK builder ran
sequentially with the same isolated SDK, Flutter configuration and guarded
cache. No manual cache purge, source edit, test-scope reduction, retry loop
or security-threshold change occurred between this final pair of commands.

- 2,166 tool tests pass; 665 default Flutter tests pass with 33 explicit-profile
  skips; all configured additional profiles pass.
- Analyzer: zero issues. Web debug build, Wasm dry run and loopback smoke pass.
  A separate standalone Wasm runtime is not claimed.
- Android debug: 36 seconds, 471 tasks / 466 executed; debug R11 passes with
  14 permissions, eight exported components and minSdk 24.
- Signed release: normal builder and guarded archive creation pass.
- Independent archive identity/hashes, ZIP integrity, APK and AAB certificates,
  bundletool 1.18.1 structural validation and native-symbol metadata pass.
- Signed APK: minSdk 24, compile/target SDK 36, not debuggable; backups and
  cleartext traffic disabled. Fourteen permissions match the existing contract.
- Complete release application and query trees match the hash-verified prior
  signed 2026090401 archive. Forty components, eight exports, no exported
  provider. Component-tree SHA-256:
  `9177f1287ce73cdc047fb8f1caaa34058a0beb1cc9d54df801177ac86b9ccc8b`.
- Optimized XML paths were resolved from the actual resource table. Exact
  backup exclusions and file-provider cache scopes, including their manifest
  resource references, pass. Firebase auto-init/analytics/Crashlytics default
  collection remains disabled. Candidate binary privacy scan has zero findings.
- Replaying the committed diagnostic scanner in 257-character chunks finds
  neither SDK XML nor Kotlin metadata incompatibility in either final log.

An initial independent inspection incorrectly called the DEBUG-only R11 CLI
on the release. It failed on the absent unminified `res/xml/backup_rules.xml`;
that CLI also deliberately requires `debuggable=true`. It remains unchanged.
The corrected local inspector checks the release's actual optimized resources
and requires non-debuggable policy. The failed invocation and empty initial
JSON are not passes; no binary or validator requirement was weakened.

## Reproduction inputs and failed attempts

AGP 8.13.2 / Kotlin 2.3.10 / Gradle 8.13, Flutter 3.41.7, Java 17.0.20.1.
See `WP02_ANDROID_SDK_COMPATIBILITY_2026-09-04.md` for the verified official
CLI-19 archive, package versions and matching API-36 platform bytes.

Two additional host integration requirements were established against the
installed Flutter source and actual executions:

1. Flutter's global `android-sdk` setting takes precedence over both Android
   environment variables. Use a process-local, owner-only `XDG_CONFIG_HOME`
   as well as both SDK variables. Verify no legacy `~/.flutter_settings`
   supersedes that path; do not edit global settings or override HOME.
2. The verified official CLI must be inside the SDK at
   `cmdline-tools/19.0`, not adjacent to it. Flutter uses its `apkanalyzer`
   to inspect release native-symbol metadata. The relocation preserved all
   108 files / 165,092,222 bytes byte-for-byte. Six missing public acceptance
   receipts were copied from the existing SDK after hash-only format checks;
   all seven now match. No new agreement or credential was accepted/copied.

Final scoped environment:

```text
ANDROID_HOME=/Volumes/SIT-Build-20260904/wp02-sdk19-compat.0bEpOq/sdk
ANDROID_SDK_ROOT=/Volumes/SIT-Build-20260904/wp02-sdk19-compat.0bEpOq/sdk
XDG_CONFIG_HOME=/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_FLUTTER_CONFIG_20260904.JGGxKy
```

Use the existing `run_with_local_build_cache.mjs` wrapper and private profile
`SIT_BUILD_CACHE_20260904.json` in the task directory for both full gate and
signed builder. Actual scoped `flutter config --machine` selects this SDK;
`flutter doctor -v` confirms the Android toolchain and existing license receipts.
The original global configuration is unchanged, SHA-256
`3f9a5de0ddf4a5ca7a8d85558cf1f2acff332a72e2119696e78dee4270c594c7`.
The existing five-case SDK-selector unit test covers that helper, not Flutter's
global precedence; the actual Flutter control and complete lifecycle provide
the latter evidence. Missing licenses on another host require owner action.

Earlier signed attempts remain FAILED: first rejected an SDK XML diagnostic
after Flutter selected the old global SDK; second could not inspect symbols
because the SDK-local command-line tools were missing. Neither created a
retained candidate archive. Only after those concrete configuration corrections
did the final full-gate-to-signing lifecycle pass. This is not an exit-zero
reinterpretation or suppression of either failure.

Normal source-capacity measurements, KiB:

| Phase | Free before / after | Generated before / after |
| --- | --- | --- |
| Final full gate | 11,549,564 / 8,346,984 | 67,876 / 3,228,264 |
| Final signed builder | 8,346,900 / 11,244,780 | 3,228,264 / 76,888 |

Fixed effective/max-generated budget 5,242,880 KiB and minimum end reserve
524,288 KiB remain intact; cache-wrapper before/after checks pass. The local
capacity/toolchain lifecycle is proven. Debt remains PARTIAL pending exact
candidate CI/clean-checkout acceptance; no claim of permanent free disk space.

## Exact CI and new owner-auth dependency

Exact Regression `33820054882`, attempt 1, finished FAILED on bfd3e9e4:
Flutter and PostgreSQL passed; Backend and clean checkout failed at npm
advisory POST timeouts after their existing retries. API image publication was
skipped. Exact CodeQL `33820054683`, attempt 1, passed. Earlier green 8e0 CI
does not replace these results. No audit waiver, retry-loop addition,
timeout expansion or dependency downgrade was made. Attempt 1 stays failed.

Local Backend tests: 795 pass / two expected skips; syntax passes. Its normal
dependency audit also timed out. At 00:40:53 UTC on September 4, a separate
20-second advisory POST for one public package still timed out. That is only
availability evidence, not a full audit or proof of a worldwide service outage.

At 00:53:02 UTC the one-public-package availability probe returned HTTP 200
with an empty advisory object. The unchanged full `pnpm run security:audit`
then passed after one of its existing transport retries: no known vulnerabilities
found. The Backend tree is unchanged from bfd3e9e4. Full Git-history/worktree
secret scan also passes: zero unexpected findings, 21 exact reviewed historical
baseline matches. Only after that success, the authenticated GitHub connector
accepted one failed-jobs-only rerun of exact run `33820054882`. Latest live jobs:
Backend `100871852289`, clean checkout `100871852527`. Successful prior
Flutter/PostgreSQL jobs were retained. Backend subsequently FAILED: all 797
tests and syntax passed; advisory POST timed out at 01:05:55 UTC after the
existing 01:02:45 and 01:03:55 retry warnings. Clean checkout subsequently PASSED
at 01:14:05 UTC: exact bfd3e9e4, byte-identical debug APK, 116 migrations and
84 assets. Its full dependency audit passed at 00:58:55 UTC, before the later
Backend audit timeout. This narrows the evidence to an intermittent external
request failure; it does not justify declaring the complete workflow green.
All jobs are now terminal; publication was skipped. The Backend timeout did
not report a vulnerability, but cannot establish its audit result. R10's
separate successful audit is preserved without relabelling Backend. No third retry was
started. R10 completion lines are retained as `github-r10-attempt2-excerpt.json`,
SHA-256 `dd78333a736d93384d735572b1dd17fed39d69de07dc01f1140a960f2ccadad0`.
The byte-identical claim is R10's debug reproduction pair, not a reproducible
signed-release-byte claim or a physical-device acceptance result.

Selected exact backend log lines are retained as
`github-backend-attempt2-excerpt.json`, SHA-256
`975d211c9e7753ce1cd5aca372f102f645214fd81b54769b8005ac5d8c97a72a`.
This is a minimized excerpt, not a claimed full-log archive. The second failed
attempt is not overwritten by the local audit pass or later documentation.

Audit log SHA-256:
`4a5e830c3071669126c00b3d09de772db9110e197580304a5d113eb6fd840126`.
Secret-scan log SHA-256:
`cda1386c67777788667e7087b58983d034d2f4b8b373c22ec91352197064bc09`.
Both are copied with digest verification into the retained proof directory.

Subsequent CLI PR/code-scanning reads returned HTTP 401; `gh auth status`
confirmed the existing CLI token invalid. No logout, credential extraction or
account mutation occurred. Owner action: on the Mac mini (locally or through
the existing private remote connection), run `gh auth login -h github.com --web`
and complete the official flow. Browser sign-in alone does not establish CLI
access. The separately authenticated GitHub connector subsequently succeeded:
PR #7 is open, Draft, mergeable and unmerged, with exact head bfd3e9e4; both
exact workflow job lists still have the outcomes above. No PR body statement
about older candidates was treated as present build evidence. A later read-only
browser check explicitly filtered `is:open branch:codex/master-workflow-20260808`
and showed **0 Open / 489 Closed**, with no matching open alerts. The initial
default-branch view instead said that branch had not been scanned: its zero
was NOT used as evidence. No global/default-branch coverage claim or settings
change. The temporary GitHub tab was closed. Local tracking was 0/0 before this checkpoint;
the connector independently confirmed the same remote PR head.

A once-only Maximus notification was attempted but NOT sent: browser safety
review rejected the broad Telegram DOM read because it could reveal unrelated
private chats. The created Telegram tab was immediately closed, leaving the two
existing Cloud/Meta handoffs. Do not claim delivery, inspect replies or bypass
that restriction. Owner approval for narrowly targeted Telegram UI access is
needed before using that route again. Existing Meta/SMS notices were not repeated.

## Evidence retention and next bounded action

Owner-only retained local proof directory:
`/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_WP02_0402_EVIDENCE.KjB6pS`.
All four files were copied without overwrite and verified byte-for-byte:

| File | SHA-256 |
| --- | --- |
| sit-wp02-0402-complete-sdk-full-regression.log | `4c4132c6b10f23418f7935fe28721ce5d041d705fadcf542cae18433236c6c06` |
| sit-wp02-0402-complete-sdk-signed-release.log | `951ecd943b0da97936f758f34c3d1d9b8d34eeaf579e56e2c8c7f7cc4eb69440` |
| sit-wp02-0402-release-specific-verification.json | `d211996d8145163500ab9f8f5d7de9919adeab05c471f144286bad3dbb61ba4a` |
| sit_verify_pixel_0402.mjs | `89206ab3df2ace7b1c376b5d72debddbe2bf3edf9ad5b47905870102b81c75d4` |

The inspector is read-only, source-bound to clean bfd3e9e4 and uses retained
official local tools. A later evidence HEAD must not be substituted for that
source. A second inspection passed at 00:49:33 UTC using a fresh `git clone
--no-local` checkout at
`/Volumes/SIT-Build-20260904/wp02-release-proof-source.22wQs9`, detached at the
exact frozen source. No protected inputs were copied. The inspector now accepts
only an optional `--source-root <clean-checkout>` and imports all repository
inspection modules from that checkout. Unknown options and a dirty checkout
were independently confirmed to reject. Exact source/cleanliness, artifact
hashes and every release assertion remain mandatory. This is an independent
clean-source artifact inspection, not the still-missing complete CI clean build.

The following additional files are retained in the same proof directory:

| File | SHA-256 |
| --- | --- |
| sit_verify_pixel_0402_clean_source.mjs | `1fdf977dcf6009fdc17f56faf283ca85a13d8083364b06cc38a7636cf86e5fd7` |
| sit-wp02-0402-release-specific-clean-source-verification.json | `06928cb27eb45d4007423d9cdd10ce6c52864baa6ebb5274424874c39bf99432` |
| sit-wp02-0402-evidence-prepared-tool-tests.log | `1767b9fed4bf685bf978ee9c9cec7e5f9677b0bd74b716ccaa856802700f9558` |
| sit-wp02-0402-evidence-package-resolution.log | `20bcba36621d427f8b9dc6e7d49cb72913cfe65104a4f7cf3399144cfe20b59d` |
| sit-wp02-0402-evidence-tool-tests-UNPREPARED-FAILED.log | `6716b8da8f74e7b9a6798fcbbb8156bc8b56d5db96e76a7fca304c44d2eb46b2` |

Documentation follow-up: all 2,166 tool tests pass after the normal enforced
lockfile resolution already required by the complete regression script; P0B
dossier validation passes with its unchanged no-go disposition. An earlier
standalone tool-suite invocation omitted that required preparation after the
builder's normal clean; two files failed to load missing package metadata.
That invocation remains FAILED (2,158 passes / two failed files), not a flaky
test or a new permanent workaround. No test or lockfile changed.

The full local audit and exact R10 clean checkout passed. The one exact-CI retry
has Backend FAILED and is now terminal. Preserve that failure; do not introduce
an automatic retry loop or declare the workflow green from overlapping local
or R10 coverage. Require the remaining exact Backend job to pass before Pixel replacement.
Do not rebuild or reversion the already verified APK merely
because an external check is unavailable. Any later docs HEAD must use the
existing frozen-candidate ancestry/mobile-diff checks, not weaken current-head
installation guards. Then verify installed bytes/data identity, authenticated
Pixel smoke and no-SMS preflight. Fresh physical SMS completion still needs a
current owner-ready window; Meta remains a separate owner action.

Read-only Pixel update preflight at 00:57:49 UTC passed on the only selected
Pixel 7 Pro, Android 17/API 37, already unlocked. Installed build remains
2026090307. The new archive matches the installed signing certificate and is
strictly newer; no uninstall/reset is needed. No device write, launch, account
mutation or SMS occurred. This eligibility result does not grant installation
clearance while the exact Backend CI remains uncleared.
Preflight JSON SHA-256:
`ecd50ccc3de76f0048d3134e87a67e1153ea0298c0da4dda5322a4490ce2a332`.
It is retained as `sit-wp02-0402-pixel-read-only-preflight.json` beside the
other local proofs, not in the immutable four-file artifact archive.

No OnePlus, Store, production, public registration, provider activation, real
payment, history rewrite or PR merge. Actual social login, runtime image AI,
sandbox money and the complete two-role acceptance matrix remain governed by
the full queue, not deemed complete by this candidate checkpoint.
