# S4T single-attempt Gradle wrapper verification - architecture

Status: locally verified on 22.08.2026 at implementation commit `84357c4`.
This is a non-live release-readiness package for `TD-RR-007`; it changes no
application behavior, production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Timing workaround removed

The Flutter CI job previously executed `./android/gradlew --version` up to
three times and slept for five then ten seconds after failures. That loop could
turn a transient cache, download or timing failure into a green build without
proving that the normal path was reliable. It therefore could not remain a
release prerequisite.

S4T replaces the loop with exactly one wrapper invocation. A committed wiring
contract proves that the setup action runs first, the single wrapper check runs
before the regression, there is exactly one `gradlew --version` occurrence and
the bounded workflow segment contains no attempt loop, sleep or retry.

## Integrity and cache contract

The job retains `gradle/actions/setup-gradle@v6` with the open-source `basic`
cache provider. The action documents wrapper validation and caching of wrapper
distributions. The tracked wrapper remains Gradle 8.12 with
`validateDistributionUrl=true` and exact
`distributionSha256Sum=7a00d51fb93147819aab76024feece20b6b84e420694101f276be952e08bef03`.
The wrapper therefore verifies downloaded distribution bytes; the removed loop
provided no integrity benefit.

Primary references:

- <https://github.com/gradle/actions/blob/main/docs/setup-gradle.md>
- <https://docs.gradle.org/current/userguide/wrapper_plugin.html>

## Local evidence and remaining boundary

The single local wrapper invocation passed with Gradle 8.12 and Java 17. The
eight-test CI wiring contract passed, including the new one-attempt negative
guard. A complete clean-head technical regression passed in the documented
CI-metadata-only mode: analyzer baseline 220, 379 Flutter tests plus one
documented skip, Google-only, Web/loopback smoke and Android debug all remained
green.

This implements the local source and test part of `TD-RR-007`. Formal closure
requires independent green exact-commit CI evidence with the same single
invocation; a green result produced by reintroducing automatic waits or retries
is invalid. Local metadata mode is not actual CI, Store or device evidence.
