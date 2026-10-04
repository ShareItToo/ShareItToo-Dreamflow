# S4Q deterministic test temporary fixtures - architecture

Status: locally verified on 22.08.2026 at implementation commit `6b15aac`.
This is a non-live release-readiness package for `TD-RR-005`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Failure being removed

Twelve tool-test files created temporary `sit-*` directories without owning
their lifecycle. Repeated technical regressions accumulated complete copies of
device evidence and synthetic fixture vaults. Before S4Q, the current machine
still held 1,605 known orphan directories using 731,460 KiB. Earlier runs had
already accumulated 3,728 directories and reached `ENOSPC`.

Manual deletion, a larger disk, serial test execution or fewer test runs would
only hide that defect. None is an accepted release prerequisite.

## Repository-owned lifecycle

`test/tool/test_temp_fixtures.mjs` provides one test-only tracker. It accepts
only normalized `sit-[a-z0-9-]+-` prefixes, creates direct children of the
operating-system temporary directory and registers one `node:test` `after`
hook for each importing test file. Cleanup is recursive, idempotent and
fail-closed: removal failures fail the test process instead of being ignored.

All twelve leaking suites now allocate through that tracker. The product tools
remain unchanged. Tests continue to run with the normal Node and Flutter
parallelism; cleanup does not depend on process sleeps, rate-limit resets,
fixed timing, a special temp path or a serial runner.

## Deterministic boundedness guard

`scripts/test_temp_fixture_boundedness.sh` snapshots the count and KiB size of
the exact historical fixture namespaces, runs all affected suites together at
normal Node test parallelism twice and rejects any count or disk growth. The
complete technical regression invokes this guard on every run.

The committed helper contract separately proves recursive cleanup,
idempotency and rejection of unsafe prefixes/paths. The bounded guard then
proves the real suites use the contract under parallel execution rather than
only testing the helper in isolation.

## Local evidence and remaining boundary

After implementation, the guard first proved that the prior 1,605 directories
did not increase. They and an unused temporary Node runtime were then moved,
recoverably, to the macOS Trash. A clean guard passed `0/0 KiB -> 0/0 KiB`.
The full Backend suite passed 600 tests plus one expected skip, and two
consecutive complete technical regressions passed with the same zero-growth
result, standard Flutter parallelism, analyzer, Web smoke and Android debug.

The local deterministic requirement of `TD-RR-005` is implemented. The item
remains formally open under the register closure rule until the exact commit is
pushed and the same guard is green in CI. No release-readiness claim, Store
submission, deployment or signed-device claim follows from this local result.
