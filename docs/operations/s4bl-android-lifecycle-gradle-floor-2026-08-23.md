# S4BL Android lifecycle Gradle floor

Status: technically verified, non-live.

## Retained checks

Run from the repository root:

```sh
node --test \
  test/tool/file_picker_security_upgrade.test.mjs \
  test/tool/pdf_wasm_dependency_upgrade.test.mjs \
  test/tool/android_lifecycle_gradle_floor.test.mjs \
  test/tool/validate_android_photo_picker_policy.test.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

For a focused Android warning inventory, run exactly one non-parallel build:

```sh
cd android
./gradlew :app:assembleDebug --no-daemon --warning-mode all
```

The lifecycle contract must retain exact lock 2.0.35 and its reviewed SHA-256,
plus Flutter 3.41.7 in both local bootstrap and CI. The full regression must
keep all three file-picker, PDF/WebAssembly and lifecycle dependency contracts
registered. Do not patch the Pub cache, filter warnings, disable Wasm dry-run,
raise an acceptance threshold or replace the complete gate with this focused
build.

Retained evidence:

- implementation head:
  `fcd2a0d761c6b1e70011c29b1561eac4f47a09e1`;
- dependency change: only transitive
  `flutter_plugin_android_lifecycle` 2.0.30 to 2.0.35;
- focused contracts: 11/11 including Android photo policy;
- direct local all-warning Android build: 448 tasks, successful, former
  lifecycle Groovy syntax warning absent;
- complete local gate: analyzer zero, 385 passes plus one documented skip,
  Google-only pass, Web/Wasm, loopback smoke and Android 448 tasks;
- local capacity: 4,646,844 KiB effective at start, 1,330,284 KiB free,
  3,308,848 KiB generated and 12 KiB growth at completion; and
- exact CI `32614834455`: PostgreSQL 39 seconds, Backend 1:22,
  Flutter/Web/Android 6:48, publication/signing skipped.

The lifecycle manifest `package=` warning, local SDK XML version warning and
other vendor manifest, Java/Kotlin or Gradle warnings remain visible. They must
be assessed through separate bounded compatible updates; their presence must
not be hidden or treated as an SIT-source warning. No external login, provider
setup, paid service, production, Payment, Store, Cloud/VPS/DNS, merge, pilot or
activation action was performed. External readiness remains 0/10 and P0B
remains `HOLD` / `NO-GO`.
