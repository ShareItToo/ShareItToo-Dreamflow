# WP04 prerequisite — R10 package-manager context

Subsequent verification: the full cold R10 on exact clean
`c4c576d3e26166591130ca1e4744048069afbbc3` now passes, including actual pinned
pnpm capture and byte-identical debug APKs. The intervening storage failure,
bounded capacity correction and full evidence are recorded separately in
`WP04_R10_COLD_STORAGE_2026-09-04.md`. Exact GitHub CI remains pending. The
original reproduction and checks below retain their historical scope.

Base: `bd1199211476dbc093dd00ba2865762592cee97f`, clean main worktree before
the failed isolated run. This is a bounded verification-tool correction, not
a payment, mobile or environment-version change.

## Reproduced cause

Full local R10 session84501 terminated with
`r10_toolchain_identity_unexpected` during toolchain capture, before restoring
Backend dependencies or running the clean-checkout suites. Its generated
clone/cache child was cleaned up. It is not running and did not pass.

The runner measured `pnpm --version` from the Flutter repository root, which
has no Backend package-manager pin. On this host that selects the global
fallback 11.25.0. Running the same command in `backend/` selects the committed
`packageManager` 11.16.0. All R10 restore/test/audit commands already run in
that Backend context. Requiring the global version to match was therefore
an accidental host prerequisite.

`captureR10Toolchain` now measures pnpm from the same Backend directory.
The strict 11.16.0 check, locked restore, Flutter/Dart/Java/Gradle checks,
capacity floors, timeouts, cache isolation and reproduction rules are unchanged.
No global package-manager version/configuration, PATH shim or cache purge.

## Deterministic and actual-host proof

- Injectable command runner reproduces a differing global/default version:
  the original implementation fails the new test; the corrected one passes.
- A wrong Backend version still fails closed; no version check was relaxed.
- The R10 helper suite passes **12/12** with no external dependency.
- The corrected helper also passes against the actual host through the
  established dedicated build-cache wrapper: Flutter3.41.7, Dart3.11.5,
  Node22.23.2, pnpm11.16.0, Java17, Gradle8.13.
- Syntax, secret scan and diff check pass. Full normal regression passes:
  2,168 tools, Flutter/default and explicit profiles, analyzer zero, Web
  debug/Wasm dry run, loopback, Android13s and R11 (14 permissions/8 exports).
  Exact clean-head R10 must be rerun after committing the correction.

The original failure log and red/green/actual-host selector logs are retained
privately in `SIT_WP04_WEBHOOK_EVIDENCE.IQxzop`. This closes the selector
defect locally, not the full clean-checkout requirement. No R10 output JSON
or GitHub pass is claimed from the failed attempt. The paid-provider and
owner-authentication dependencies in the WP04 handover remain unchanged.

| Retained proof | SHA-256 |
| --- | --- |
| Original full R10 failure | `0fcf24061a95917aa9f2355b0999fb30f3ff68fdf73e2f12065cb9f3539c58f5` |
| Selector red test | `c1134567a4aa46a2e75785b661d9ab8001f43ba4c574809957a62f0cf7258986` |
| Selector green tests | `d8a5ac9e32fae245639325e02b0814552c7329355f623eae3eb0f275f298d02c` |
| Actual-host selector pass | `4f0e034d1bf0066042db1d5f4d81a6be2628102d3136929b27b280243c7e7ec4` |
