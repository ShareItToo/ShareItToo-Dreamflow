# 48H R10 technical-debt register

Status: **TD-R10-001 AND TD-R10-002 CLOSED — EXACT CI VERIFIED**

This R10-specific register records clean-checkout, toolchain and reproducibility
findings discovered after the historical PF18 release-readiness checkpoint. It
is deliberately separate from the immutable 21-item PF18 snapshot so that new
work cannot silently rewrite a completed historical audit.

| ID | Finding and current evidence | Deterministic exit contract |
|---|---|---|
| `TD-R10-001` | **CLOSED 24.08.2026.** A clean direct Gradle debug build silently used fallback identity `1.0+1` when generated Flutter version metadata was absent. The technical gate now derives `1.0.0+2026082302` from checked-in `pubspec.yaml` before its unchanged single direct build. Two equivalent APKs also exposed byte drift limited exactly to DEX header checksum/SHA-1 bytes and the D8 synthetic-class checksum map; normalization is restricted to those fields and no raw binary identity is claimed. Project output and intentionally fresh package caches are measured separately at 3,208,463 KiB and 6,119,769 KiB and cleaned. Exact Regression `32767155545` passed the independent clean R10 job `97559117227`, normal Backend/PostgreSQL/Flutter jobs and kept publication and signed-candidate steps skipped. | Permanently retain locked restores, standard parallelism, exact build identity, unknown-drift failure and separate fixed 5-GiB project/8-GiB temporary-cache bounds. No stale local properties, undocumented cache, manual cleanup, retry, reduced suite or false byte-identity claim may replace them. |
| `TD-R10-002` | **CLOSED 24.08.2026.** The first exact R10 CI run passed the CodeQL workflow but its separate Advanced Security result rejected one APK time-of-check/time-of-use hash pattern and two URL-substring diagnostics. APK size and SHA-256 now come from the same immutable in-memory read. Compiled origins are inspected as conservative raw byte markers: any embedded occurrence counts as present, and this probe is explicitly not URL parsing or host authorization. Exact replacement CodeQL workflow `32767155548` and Advanced Security check `97559603226` passed with zero annotations and zero open alerts; no finding was dismissed. | Retain single-read artifact identity and conservative byte-marker semantics; no race suppression, CodeQL dismissal, substring allowlist or weakened negative OpenAI-origin check may replace them. |

## Observation log

- 24.08.2026, R10: six bounded clean-clone runs successively exposed the stale
  direct-Gradle version fallback, exact D8 synthetic-checksum metadata drift,
  debug `kernel_blob.bin` versus release `libapp.so` payload selection and an
  initially combined cache/output bound. The retained implementation fixes or
  exactly classifies each issue without retry, timing or parallelism changes.
  The full local run at `322e97e` is green and cleans 9,328,232 KiB of measured
  temporary project/cache state. Exact Regression `32767155545` closes
  `TD-R10-001` with the independent clean job and standard jobs green.

- 24.08.2026, R10 security follow-up: exact run `32765161224` passed all four
  Regression jobs and the CodeQL workflow, but the separate Advanced Security
  check failed on three high-confidence diagnostics in the new runner. The
  underlying race shape and ambiguous string API were removed rather than
  dismissed. Replacement CodeQL `32767155548` and Advanced Security check
  `97559603226` close `TD-R10-002` with zero annotations and open alerts.
