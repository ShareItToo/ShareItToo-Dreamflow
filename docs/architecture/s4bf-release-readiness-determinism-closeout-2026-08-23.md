# S4BF release-readiness determinism closeout - architecture

Status: technically verified on 23.08.2026 at implementation commit
`891ecdc414df1d1a6097608cb8dd05b8221361c3`. This is a non-live test,
evidence and release-host package. It changes no application behavior,
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Release-host capacity contract

The complete technical gate now owns one fixed capacity contract from its
first operation through the final Android build. It counts free filesystem
capacity plus the existing replaceable `build`, `.dart_tool` and
`android/.gradle` footprints before running work. The gate fails closed below
4 GiB effective capacity. At completion it fails above a 5 GiB generated
footprint or below 512 MiB free.

The limits cannot be changed through environment variables. The guard contains
no cleanup, alternate temp root, sleep or retry path. This converts the S4AV
disk incident into an explicit deterministic precondition and bounded-growth
postcondition instead of making cache purging a release ritual.

## Retained cross-environment evidence

The unchanged complete local gate passed at the implementation head with:

- 1,161,296 KiB free and 3,196,468 KiB replaceable generated data before;
- 1,159,284 KiB free and 3,196,476 KiB generated data after; and
- 8 KiB net generated growth.

Exact pull-request CI run `32609567488` passed at the same head with Backend
1:39, Flutter 6:38 and publication skipped. Its release-host record shows
80,755,520 KiB free and 80 KiB generated before, then 77,378,572 KiB free and
3,166,880 KiB generated after, for 3,166,800 KiB growth. The same run retained
the pinned Node 22/pnpm 11.16 contract, limiter isolation, fixture boundedness,
reset-token boundary, one Gradle-wrapper preflight, one Android build, one-bind
Web smoke and CDP protocol contracts.

Manual workflow run `32609858706` then executed five complete Flutter suites
at default parallelism on the exact same implementation head. Every run passed
384 tests plus one documented skip without retry, sleep, reduced suite,
concurrency override, terminal intervention or pass-on-rerun. Backend passed in
1:13, Flutter including the standard gate and stress proof passed in 14:42,
signed-candidate construction stayed skipped and publication stayed skipped.

S4W also received its separately required controlled observation. A dedicated
temporary local Chrome profile loaded only the loopback Web build, applied the
synthetic booking-QA payload, followed the guarded main-frame reload and
reported `readyState: complete` with nine verified keys. No stored values,
credentials or profile path were retained. The normal Chrome profile was not
used and the temporary profile and backup were moved to Trash after the
observation. The sanitized machine-readable record is
`docs/evidence/release-readiness/s4w-local-browser-observation-2026-08-23.json`.

## Debt and safety boundary

This evidence closes `TD-RR-001`, `TD-RR-002`, `TD-RR-003`, `TD-RR-005`,
`TD-RR-006`, `TD-RR-007`, `TD-RR-008`, `TD-RR-009` and `TD-RR-012`.
`TD-RR-004` remains open: GitHub CI runs the canonical integration against a
PostgreSQL 16 service, but it does not execute the repository-owned
fresh-cluster runner itself. Service-container success cannot be substituted
for that exact runner lifecycle contract.

The analyzer-zero and cold Gradle-cache contracts remain closed and permanent.
P0B remains `HOLD` / `NO-GO`. No contract, quote, acceptance, Payment,
cancellation/refund, handover/return, damage, `needsReview`, audit or later
Business/Global behavior changes.
