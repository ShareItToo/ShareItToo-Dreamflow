# S4T Gradle wrapper single-attempt verification

Status: locally verified, non-live.

## Canonical local checks

From the repository root:

```sh
node --test test/tool/ci_candidate_rollover_wiring.test.mjs
./android/gradlew --version
```

The static contract must report eight passes. The wrapper command must report
Gradle 8.12 from one invocation. The tracked wrapper properties must retain the
exact distribution URL, SHA-256, URL validation and 60-second network timeout.

## CI acceptance

The normal Flutter regression job must:

1. configure Java 17;
2. configure `gradle/actions/setup-gradle@v6` with `cache-provider: basic`;
3. run exactly one `./android/gradlew --version`; and
4. run the complete technical regression.

Retain independent green exact-commit CI runs before closing `TD-RR-007`. The
wrapper step must still contain no attempt loop, sleep, retry or pass-on-rerun
logic.

## Failure handling and boundaries

If the wrapper step fails, keep that run failed and diagnose cache restoration,
network availability, wrapper integrity or the pinned distribution. Do not add
a wait or automatic retry. The check does not deploy, upload, sign, pay/refund
or change production, Payment, Store, Cloud/VPS/DNS or pilot state.
