# S4BK PDF, WebAssembly and offline-font hardening

Status: technically verified, non-live.

## Retained checks

Run from the repository root:

```sh
node --test test/tool/pdf_wasm_dependency_upgrade.test.mjs
node tool/validate_privacy_disclosures.mjs
flutter test \
  test/invoice_pdf_dependency_compatibility_test.dart \
  test/invoice_server_snapshot_model_test.dart \
  test/invoices_service_rules_test.dart
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The dependency contract must retain direct floors `pdf: ^3.12.0` and
`printing: ^5.14.3`, exact locks `pdf` 3.12.0, `printing` 5.14.3 and `image`
4.9.2, and the unchanged active WebAssembly dry run. Do not add
`--no-wasm-dry-run`, filter warnings out of the displayed build log, patch the
Pub cache or substitute a partial Web build.

Financial PDFs must load both versioned local font assets through
`rootBundle`. Do not replace them with runtime Google Fonts, an HTTP fetch, a
machine-specific system font or an unlicensed binary. A font update requires
new reviewed upstream provenance, asset SHA-256 values, license evidence, the
real PDF test and the complete gate.

Retained evidence:

- implementation head:
  `52aa41f8807c5a36f251e4bad1a32c2120fa4454`;
- focused contracts: dependency/runner/font 3/3 plus real PDF generation;
- Flutter: analyzer zero, 385 passes and one documented skip;
- Web: positive WebAssembly dry-run success, no prior finding signature and
  loopback P0A smoke pass;
- Android: one direct 448-task debug build;
- local complete gate: 4,230,920 KiB effective at start, 878,200 KiB free,
  3,307,728 KiB generated and 100,968 KiB growth at completion; and
- exact CI `32613968872`: PostgreSQL 39 seconds, Backend 1:19,
  Flutter/Web/Android 6:39, signing/publication skipped.

Before the local full gate, the exact unused package caches `analyzer-10.1.0`,
`analyzer-9.0.0`, `vm_service-15.2.0` and `archive-3.6.1` were moved
recoverably to
`/Volumes/Crucial X9/SIT-regenerable-cache-20260823-s4bk`. This is not a
release prerequisite or acceptance evidence and must not replace clean-host
CI or justify a lower capacity threshold.

Remaining Android vendor warnings are not suppressed or declared closed by
this package. No external login, provider setup, paid service, production,
Payment, Store, Cloud/VPS/DNS, signing, merge, pilot or activation action was
performed. P0B remains `HOLD` / `NO-GO`.
