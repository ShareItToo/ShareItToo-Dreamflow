# S4AC Gradle single-attempt cache contract

Status: closed; cold GitHub cache write and later exact restore passed.

## Canonical checks

```sh
node --test \
  test/tool/android_debug_single_attempt_wiring.test.mjs \
  test/tool/ci_candidate_rollover_wiring.test.mjs
./android/gradlew -p android :app:assembleDebug --no-daemon
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The first command reports ten passes. Both Android commands execute one direct
Gradle build path without the Flutter CLI APK retry. The final command is local
CI-metadata-only evidence because the historical candidate AAB is absent; it is
not actual CI, Store or device evidence.

## GitHub acceptance

Failed run `32592388940` remains failed. New exact run `32593274378` passed
without rerun, reported `0 restored, 1 saved`, and executed exactly one direct
`:app:assembleDebug`; the log contained neither `flutter build apk` nor
`Retrying Gradle Build`.

Exact later run `32594060058` passed on head `e715af5` without rerun, restored
the same entry (`1 restored, 0 saved`) and again executed exactly one direct
`:app:assembleDebug`; the log contained neither `flutter build apk` nor
`Retrying Gradle Build`.

This closes `TD-RR-011`. Keep the permanent contract: no sleep, loop, automatic
retry, alternate Maven mirror, manual cache injection or paid cache provider.
P0B remains `HOLD` / `NO-GO`.
