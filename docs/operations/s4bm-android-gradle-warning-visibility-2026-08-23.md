# S4BM Android Gradle warning visibility

Status: technically verified, non-live.

## Retained checks

Run from the repository root:

```sh
node --test \
  test/tool/android_gradle_warning_visibility.test.mjs \
  test/tool/android_debug_single_attempt_wiring.test.mjs \
  test/tool/release_host_capacity_guard_wiring.test.mjs \
  test/tool/android_lifecycle_gradle_floor.test.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The complete gate must retain exactly one direct Android debug build with
`--no-daemon --warning-mode all`. It must print the captured output on success
or failure and fail after a successful compile if Gradle reports a Build-file
or Settings-file warning under the current checkout's `android/` path. Do not
add a second diagnostic build, `--warning-mode none`, summary-only output,
warning filtering, an accepted-warning fingerprint, retry, sleep or Pub-cache
patch.

Retained evidence:

- implementation head:
  `1ad3410bd144be6fe5c5af65f1dd6a586573ad3d`;
- focused warning/one-attempt/capacity/lifecycle contracts: 11/11;
- complete local gate: analyzer zero, 385 passes plus one documented skip,
  Google-only, Web/Wasm, loopback smoke and Android 448 tasks;
- local capacity: 4,638,936 KiB effective at start, 1,333,388 KiB free,
  3,308,856 KiB generated and 8 KiB growth at completion; and
- exact CI `32615539334`: PostgreSQL 40 seconds, Backend 1:23 and
  Flutter/Web/Android 6:27, with publication/signing skipped.

Current clean-host Gradle warning locations are resolved third-party
Pub-cache/plugin paths. They remain visible technical input for separate
compatible dependency work; S4BM does not declare them fixed. A future
SIT-owned Android Gradle-script warning is a release-gate failure even if the
APK compiles. No external login, provider setup, paid service, production,
Payment, Store, Cloud/VPS/DNS, merge, pilot or activation action was performed.
External readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
