# S4BP Printing Web PDF.js reachability guard - architecture

Status: technically verified on 23.08.2026 at implementation head
`0ec4d0a37e633d9759d3120c3b26b36bfbabbbf7`. This package changes only a permanent source and
resolved-adapter reachability contract. It changes no document content,
application permission, dependency lock, production, Payment, Store,
Cloud/VPS/DNS, pilot or activation state.

## Fail-closed reachability boundary

The reviewed `printing` 5.14.3 Web adapter contains PDF.js 3.2.146. That
embedded version is older than Mozilla's patched floor for CVE-2024-4367. A
direct update to `printing` 5.15.0 is not a compatible bounded correction:
that release requires Dart 3.12 while the pinned Flutter 3.41.7 toolchain
provides Dart 3.11.5, and its PDF.js 5.7.284 line is itself below Mozilla's
later CVE-2026-16633 patched floor. This package therefore does not claim that
the bundled legacy PDF.js implementation is patched.

The application uses only three `Printing.layoutPdf` calls and one
`Printing.sharePdf` call. Inspection of the exact resolved adapter proves that
those two Web delivery methods do not initialize the PDF.js loader; the
adapter's `info` and `raster` paths do. The retained contract recursively scans
all application Dart sources and rejects `PdfPreview`, direct
`PrintingPlatform` use, or any Printing preview, raster, conversion, direct
print or printer-discovery API. It also binds the exact package checksum and
SHA-256 hashes of the reviewed public API and Web adapter sources. Any
dependency drift, adapter drift, additional Printing import or call, or
removal from the complete runner fails closed.

## Verification

Eighteen focused dependency and reachability assertions pass. The first
focused run correctly failed on an inaccurate internal raster-method boundary;
the test fixture was corrected to the adapter's actual class boundary, without
changing product code, dependency state or the security rule. The identical
focused command then passed 18/18.

The complete local gate passes analyzer zero, 385 Flutter tests plus one
documented skip, Google-only, Web/Wasm, loopback smoke, one 448-task Android
build and the real APK minSdk-24 proof. Capacity starts at 4,539,324 KiB
effective and ends with 1,217,596 KiB free, 3,309,028 KiB generated and only
4 KiB generated growth.

Exact clean-host CI `32617626521` passes at the implementation head:

- repository-owned PostgreSQL-16 fresh-cluster proof: 54 seconds;
- Backend, audit, Compose and image build: 1:18;
- Flutter/Web/Android: 6:32;
- all four PDF.js reachability subtests, analyzer zero, 385 passes plus one
  documented skip, Google-only, positive Wasm result, loopback Web smoke,
  Android 445 tasks and `minSdk 24` binary proof; and
- signed-candidate construction and publication remain skipped.

S4BP closes `TD-RR-019` through reachability elimination and a deterministic
regression boundary, not by suppressing an advisory or declaring the embedded
library safe. A later compatible patched PDF stack requires its own reviewed
Dart/Flutter/dependency migration and must satisfy all applicable upstream
advisories. External readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
