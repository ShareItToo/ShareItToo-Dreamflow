# S4Q test temporary fixture boundedness

Status: locally verified, non-live.

## Canonical check

From the repository root:

```sh
bash scripts/test_temp_fixture_boundedness.sh
```

The command runs the twelve historically leaking tool suites plus the shared
cleanup contract twice at standard Node test parallelism. Success requires the
tracked directory count and KiB usage after both runs to equal the initial
snapshot. A clean checkout should report:

```text
Temp-fixture boundedness passed: 0/0 KiB -> 0/0 KiB.
```

The same command is part of `scripts/technical_regression_check.sh` and must
remain green in two consecutive complete regressions before release readiness.

## Failure handling

- Do not replace a failure with manual deletion and a green rerun.
- Do not serialize Node or Flutter tests to avoid lifecycle races.
- Do not reduce the suite list, add a sleep, move `TMPDIR` or expand disk as an
  acceptance condition.
- Identify the new or growing `sit-*` namespace, route its creation through the
  shared tracker and retain a failing-then-passing regression.
- Cleanup refuses paths outside a direct `sit-*` child of the OS temp root and
  makes removal errors visible as test failures.

Historical pre-fix fixtures from this Mac mini are recoverably stored at
`/Users/walidchraibi/.Trash/sit-s4q-historical-fixtures-20260822T155300`.
They are not an input to the test or release process.

## Boundaries

This check uses synthetic local files only. It does not contact staging or
production, deploy, upload, sign, pay/refund, contact users/providers or change
Payment, Store, Cloud/VPS/DNS or pilot state. `TD-RR-005` remains formally open
until green exact-commit CI retains the same zero-growth proof.
