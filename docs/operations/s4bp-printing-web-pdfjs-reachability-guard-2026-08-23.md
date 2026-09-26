# S4BP Printing Web PDF.js reachability guard

Status: technically verified, non-live.

## Retained checks

Run from the repository root:

```sh
node --test \
  test/tool/printing_web_pdfjs_reachability.test.mjs \
  test/tool/pdf_wasm_dependency_upgrade.test.mjs \
  test/tool/financial_pdf_generation.test.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

Retain the exact `printing` 5.14.3 lock checksum and the reviewed
`lib/src/printing.dart` and `lib/printing_web.dart` source hashes until a
separately reviewed compatible PDF-stack migration replaces them. Application
code may use only the guarded three `layoutPdf` and one `sharePdf` calls. Do
not add `PdfPreview`, direct `PrintingPlatform` access, `info`, `raster`,
`convertHtml`, direct printing or printer-discovery APIs while this boundary is
active.

The contract deliberately proves only that current Web application paths do
not initialize the embedded PDF.js loader. It does not certify PDF.js 3.2.146
as patched. A later dependency migration must review both Mozilla advisories,
the actual embedded PDF.js version and the required Dart/Flutter floors before
removing this guard. Version-number movement alone is not acceptance evidence.

Retained local evidence:

- implementation head:
  `0ec4d0a37e633d9759d3120c3b26b36bfbabbbf7`;
- exact package checksum plus two resolved-source SHA-256 bindings;
- recursively scanned application use: three `layoutPdf`, one `sharePdf`,
  three Printing imports and no other Printing surface;
- focused reachability/dependency contracts: 18/18 after one retained red
  fixture-boundary correction;
- complete gate: analyzer zero, 385 passes plus one documented skip,
  Google-only, Web/Wasm, loopback smoke, Android 448 tasks and binary
  minSdk 24; and
- local capacity: 4,539,324 KiB effective at start, 1,217,596 KiB free,
  3,309,028 KiB generated and 4 KiB growth at completion; and
- exact CI `32617626521`: PostgreSQL 54 seconds, Backend 1:18 and
  Flutter/Web/Android 6:32, with all four reachability subtests, analyzer zero,
  385 passes plus one documented skip, Web/Wasm, Android 445 tasks, binary
  minSdk 24, and signing/publication skipped.

No advisory filter, Web feature flag, runtime patch, Pub-cache edit, dependency
override, retry, timing workaround or reduced test command is permitted as
replacement evidence. No external login, paid service, production, Payment,
Store, Cloud/VPS/DNS, merge, pilot or activation action was performed.
External readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
