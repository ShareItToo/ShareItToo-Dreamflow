# S4BF release-readiness determinism closeout

Status: technically verified, non-live.

## Canonical checks

Run sequentially from the repository root:

```sh
bash -n scripts/release_host_capacity_guard.sh \
  scripts/technical_regression_check.sh
node --test \
  test/tool/release_host_capacity_guard_wiring.test.mjs \
  test/tool/flutter_parallel_stress_wiring.test.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The complete gate must print one JSON capacity record after the Android build.
It must start with at least 4 GiB free plus existing replaceable generated
capacity, finish with at least 512 MiB free and keep the total generated
footprint at or below 5 GiB. Do not add an environment override, cleanup,
alternate temp root, smaller suite, reduced parallelism, sleep, retry or
pass-on-rerun path.

## Retained evidence

- Implementation head:
  `891ecdc414df1d1a6097608cb8dd05b8221361c3`.
- Local complete gate: 384 Flutter passes plus one documented skip, separate
  Google-only pass, analyzer zero, Web build/smoke and one direct 448-task
  Android debug build. Capacity was 1,161,296/3,196,468 KiB free/generated
  before and 1,159,284/3,196,476 KiB after.
- Exact automatic CI `32609567488`: Backend 1:39, Flutter 6:38, publication
  skipped; capacity record passed at 80,755,520/80 KiB before and
  77,378,572/3,166,880 KiB after.
- Exact manual stress CI `32609858706`: Backend 1:13 and Flutter 14:42. All five
  default-parallel complete suites passed at the implementation head; signed
  candidate and publication were skipped.
- Controlled S4W observation: dedicated temporary profile, loopback origin,
  guarded reload, `readyState: complete`, nine exact keys, no value-bearing
  output. See
  `docs/evidence/release-readiness/s4w-local-browser-observation-2026-08-23.json`.

Do not repeat the controlled browser seed in a normal profile. The observation
is already retained and its temporary artifacts were moved to Trash.

## Remaining boundary

Only `TD-RR-004` remains open in the technical-debt register. Close it only
when exact-package CI runs the repository-owned PostgreSQL-16 fresh-cluster
runner with no caller port, database or lifecycle commands. The existing
PostgreSQL service-container integration is positive product evidence but not
runner-contract acceptance evidence.

P0B remains `HOLD` / `NO-GO`. Do not activate production, Payment, Store,
Cloud/VPS/DNS, pilot, signed release, public rollout, merge or paid service.
