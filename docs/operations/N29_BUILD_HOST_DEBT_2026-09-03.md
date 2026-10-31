# N29 build-host and toolchain debt

Latest: **LOCAL LIFECYCLE VERIFIED / EXACT CI PENDING — overall debt PARTIAL**.
Candidate 2026090402 from clean bfd3e9e4 passes the complete normal local gate
followed by signing/archive verification, without an intervening manual purge.
Neither Kotlin metadata nor SDK XML diagnostics occur in the final logs.
Flutter required a process-local XDG configuration because its global SDK
setting overrides Android environment variables, plus SDK-local official CLI19
and pre-existing public license receipts. Global settings were not changed.
Exact candidate Regression/clean checkout attempt 1 failed at advisory timeouts;
the unchanged full local audit has since passed. The one exact CI retry has
Backend FAILED again at its advisory timeout; exact clean checkout has now
PASSED, including its separate audit and byte-identical debug reproduction.
All jobs are terminal; the missing Backend job still prevents full CI closure.
GitHub CLI requires owner reauthentication; the separate connector still works.
No release-readiness debt
closure is claimed. Full measurements, failed attempts and reproduction recipe:
`WP02_PIXEL_CANDIDATE_2026090402_HANDOVER.md`. Below are historical checkpoints.

Current follow-up: 8e0 exact Regression/clean checkout/CodeQL pass. Official
CLI-19 fresh SDK metadata resolves the XML reader mismatch in isolated debug
execution without XML edits or suppressions. Owner-authorized host cleanup
restored approximately 12 GB free; normal candidate 2026090402 preparation
regression passes without either diagnostic. Debt remains OPEN until the new exact clean-head gate and signed
archive sequence pass without another purge, with full diagnostic and binary
verification. See `WP02_ANDROID_SDK_COMPATIBILITY_2026-09-04.md`. Earlier
failures and manual-recovery observations below remain historical evidence.

New bounded 2026-09-04 checkpoint: the Kotlin diagnostic is isolated to Firebase
Auth release lint and disappears with coordinated AGP/Kotlin/Gradle pins.
SDK XML mismatch remains; full original-host regression now stops before tests
at 3,407,300 KiB effective capacity. No repeated purge. A clean signed release
and exact CI are still required; earlier capacity passes do not prove current
host readiness. See `WP02_ANDROID_TOOLCHAIN_ALIGNMENT_2026-09-04.md`.

Latest 2026-09-04: candidate `2026090401`, source `c0c4a0d1`, completed the
clean full gate followed by signed archive verification using the dedicated
cache without intervening manual purge or retry. Local capacity lifecycle is
proven; final exact-CI verification is still blocked by npm audit timeouts.
Both retired global engine caches remain absent with their recoverable copies
retained. The Kotlin metadata 2.3.0/2.1.0 diagnostic recurred and remains OPEN.
See `WP02_PIXEL_CANDIDATE_2026090401_HANDOVER.md` for exact measurements.

2026-09-04 progress: a dedicated APFS build area on the existing SSD passes
filesystem checks and an exact-source cold full regression on `d7575368`.
Two old global engine-transform entries were migrated only after complete
verified copies, no-open-handle checks and source-JAR validation; all seven
files remain recoverable. Future SIT commands use an explicitly guarded private
Gradle cache, not repeated global cache purges. The original-checkout full
gate also passes with that selector, and neither retired global entry was
recreated. Exact new host-tool CI and the candidate-bound full-gate-to-signed-
archive sequence are still pending, so debt remains OPEN. See
`WP02_BUILD_WORKSPACE_2026-09-04.md` for exact paths and evidence.

Status: **OPEN — not a release-readiness closure**. Observed 2026-09-03 on
candidate source `77d5103cb3c89af3ca5187a6c2642e28fa0703dd`.
Historical closed registers are not rewritten by this new observation.

## TD-N29-HOST-CAPACITY — OPEN

The first signed-build attempt stopped before compilation: only 4,617,064 KiB
free plus replaceable project output, below the unchanged 5,242,880-KiB floor.
A later check found 4,597,884 KiB. No artifact was created by those guard checks.

Two exact Gradle 8.12 transforms were identified as expanded Flutter debug
engine libraries, arm64-v8a and x86_64. Their source JARs passed ZIP integrity
checks. With no Java process running, only generated cache entries
`26f86134965bdab933c5a4d386b1b1ad` and
`02ab5dee75c42f372ba049a2bbf02775` were removed. Source packages were retained
and permit regeneration. Signed archives, quarantine, private handoffs,
personal files and credentials were untouched.

After this explicit host-state change, the signed build started with
2,091,436 KiB free plus 3,449,432 KiB generated (5,540,868 KiB effective).
It succeeded, archived both verified artifacts and cleaned its generated
output. End state: 5,936,252 KiB free, 34,524 KiB generated, fixed limits intact.

This is temporary recovery, not a permanent cache-purge prerequisite. A future
debug build can recreate the removed entries. Before release readiness,
provide normal host capacity and prove the unchanged full gate followed by
the signed archive lifecycle without intervening manual cache removal,
retry loops, reduced parallelism or relaxed bounds. Retain exact CI and
before/after measurements. The original failed attempt remains failed evidence.

### Recurrence during WP02 SDK ownership correction

On base HEAD `239c5aa1f74e55cb2991f97832a1d855a7ae7e94` plus the local WP02
correction, the full local gate again stopped before tests: 4,770,824 KiB
effective capacity versus the unchanged 5,242,880-KiB floor. This is a recurring
host constraint, not a failed test or closed debt. The original log is
`/tmp/sit-wp02-sdk-full-regression.log`.

The same two exact engine-transform entries above had been regenerated. Both
retained source JARs passed ZIP verification. The only Gradle 8.12 daemon was
IDLE and stopped normally; no Gradle build was active and neither target had
an open file handle. Only those two generated entries were removed again.
The resumed gate started with 2,067,244 KiB free and 3,643,156 KiB generated,
5,710,400 KiB effective. Log:
`/tmp/sit-wp02-sdk-full-regression-capacity-recovered.log`.

This manual recovery is NOT a supported permanent build prerequisite. Normal
host capacity and a complete uninterrupted gate-to-signed-archive lifecycle
without manual cache purges are still required before release-readiness closure.

The later WP02 test-order isolation full-gate attempt stopped again at
4,729,044 KiB effective capacity; it did not run tests or produce an artifact.
No further manual purge was made. Read-only inventory found roughly 3.6 GiB
of replaceable SIT output and 6.6 GiB of shared Gradle caches. Protected release
archives were preserved. The connected Crucial X9 has substantial free space,
but is exFAT: its availability is not proof of suitable build-cache filesystem
semantics, private-file permissions, or a validated multi-volume capacity
plan. No files were moved, volume reformatted or host configuration changed.

## TD-N29-KOTLIN-METADATA — OPEN

The signed bundle build emitted an incompatible Kotlin metadata diagnostic
from Firebase Auth 24.2.0: metadata 2.3.0 with compiler expectation 2.1.0.
Both the AAB and APK subsequently built successfully and the builder exited 0;
artifact verification and real Pixel update/navigation passed. This diagnostic
also appears in earlier retained successful release-build logs, so it is not
established as a regression introduced by the SMS correction.

No warning suppression, dependency override or compiler-check bypass was used.
The exact affected task and safe compatible toolchain alignment still need
bounded investigation. Before claiming toolchain-clean release readiness,
resolve the diagnostic with pinned supported dependencies, deterministic
regression and a clean signed build. An exit-0 build alone does not close it.
The SDK XML-version warning also remains visible; no broad upgrade is implied.

Local logs (not secret evidence or repository prerequisites):
`/tmp/sit-n29-build07-signed-release.log` and
`/tmp/sit-n29-build07-signed-release-after-capacity-recovery.log`.
