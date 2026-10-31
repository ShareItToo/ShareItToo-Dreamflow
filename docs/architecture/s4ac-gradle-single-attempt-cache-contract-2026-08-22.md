# S4AC Gradle single-attempt cache contract - architecture

Status: closed on 22.08.2026; locally verified at implementation commit
`1d9816e`, first clean GitHub cache write verified at run `32593274378`, and
exact cache restore verified at run `32594060058`.
This is a non-live CI reliability package for `TD-RR-011`; it changes no app
behavior, production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Observed failure, not accepted rerun

Exact GitHub Actions run `32592388940` for commit `abd5e37` passed the Backend
job but failed the Flutter job during Android debug assembly. The Gradle action
reported `0 restored, 0 saved`, because Basic Caching was read-only for the PR.
The cold Flutter plugin build then received HTTP `403 Forbidden` while resolving
Kotlin artifacts from Maven Central. `flutter build apk` automatically retried
the Gradle build once after 100 milliseconds and failed again.

That run remains failed. It was not rerun and is not acceptance evidence. The
automatic retry also cannot remain part of SIT's release-readiness path.

## Deterministic path

The PR workflow continues to use the open-source Basic Caching provider and now
sets `cache-read-only: false`. GitHub scopes a pull-request cache to that PR's
merge ref; it is not a shared main-branch cache. This permits a successful
single-attempt build to persist its downloaded dependencies without adding a
paid service.

The complete technical regression now invokes the checksum-bound repository
wrapper directly and exactly once for Android debug assembly:

```sh
./android/gradlew -p android :app:assembleDebug --no-daemon
```

This produces the same debug APK through the Flutter Gradle plugin without the
Flutter CLI's hidden retry branch. A committed contract rejects `flutter build
apk`, sleeps, attempt loops and retry wording in the build segment.

Primary references:

- <https://github.com/gradle/actions/blob/main/docs/setup-gradle.md>
- <https://docs.gradle.org/current/userguide/wrapper_plugin.html>

## Evidence and remaining boundary

Ten focused cache/wrapper/build contracts passed. The direct Gradle command
completed 448 tasks successfully, and the complete clean implementation-head
local metadata gate passed at
`1d9816e41304fd4f3d5ba3b95a8a14f3200312ee` with exact analyzer baseline 207,
384 Flutter tests plus one documented skip, Google-only, Web build/smoke and a
single direct Android debug build. SIT temp roots remained zero.

Exact post-remediation GitHub run `32593274378` passed on head `5f58368` without
a rerun. Its cold Basic Cache reported `0 restored, 1 saved`, uploaded its full
PR-scoped Gradle entry, and its log contained exactly one
`> Task :app:assembleDebug`, zero `flutter build apk` and zero
`Retrying Gradle Build` lines.

Exact later run `32594060058` passed on head `e715af5` without rerun. Basic
Caching reported `1 restored, 0 saved` for the same PR-scoped entry. Its log
again contained exactly one direct `> Task :app:assembleDebug`, zero
`flutter build apk` and zero `Retrying Gradle Build` lines. No sleep, retry
loop, alternate mirror, manual cache injection or paid provider was used.

That reproducible cold-write/restore sequence closes `TD-RR-011`. The
single-attempt contract remains permanently enforced. P0B remains `HOLD` /
`NO-GO`.
