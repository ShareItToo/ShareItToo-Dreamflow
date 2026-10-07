# S4BJ file-picker security floor

Status: technically verified, non-live.

## Retained checks

Run from the repository root:

```sh
node --test \
  test/tool/file_picker_security_upgrade.test.mjs \
  test/tool/validate_android_photo_picker_policy.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The dependency contract must continue to require `file_picker: ^11.0.3`, the
exact locked 11.0.3 artifact and the static API in all three SIT consumers.
Do not relax the floor, restore `FilePicker.platform`, patch the Pub cache,
vendor the package, suppress compiler warnings or introduce broad Android
media-library permission.

Retained evidence:

- implementation head:
  `95b0ead45c6a7706b4a65a1f054cd2a87403b289`;
- focused contracts: 4/4;
- Flutter: analyzer zero, 384 passes and one documented skip;
- Privacy remains draft and valid; Retention remains draft with ten open
  decisions and 21 execution blockers;
- local complete gate: 4,211,432 KiB effective at start, 1,011,156 KiB free
  and 3,193,032 KiB generated at completion;
- exact CI `32613104943`: PostgreSQL 35 seconds, Backend 1:22,
  Flutter/Web/Android 6:24, signing/publication skipped.

The earlier 4,161,440-KiB capacity refusal remains failed evidence. One unused
old package-cache entry was moved recoverably off the data volume after the
diagnostic builds; that cleanup is not acceptance evidence and is not a
release prerequisite. Clean-host exact CI closes the deterministic exit.

Known third-party Wasm, Kotlin, Gradle and manifest warnings remain visible and
require separate bounded packages. This package performs no provider setup,
Store submission, production, Payment, Cloud/VPS/DNS, signing, merge, pilot or
paid-service action. P0B remains `HOLD` / `NO-GO`.
