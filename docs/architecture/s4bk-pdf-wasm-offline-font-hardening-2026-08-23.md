# S4BK PDF, WebAssembly and offline-font hardening - architecture

Status: technically verified on 23.08.2026 at implementation head
`52aa41f8807c5a36f251e4bad1a32c2120fa4454`. This package is bounded to
financial-document PDF compatibility, deterministic offline typography and
the retained WebAssembly build gate. It changes no amount, quote, contract,
Payment/refund/payout, Store, production, Cloud/VPS/DNS, pilot or activation
state.

## Dependency and WebAssembly boundary

SIT now declares `pdf: ^3.12.0` and `printing: ^5.14.3`, locks those exact
versions and locks transitive `image` 4.9.2. The previous `image` 4.5.4 emitted
two `avoid_double_and_int_checks` findings during Flutter's WebAssembly dry
run. The bounded dependency update removes those findings without disabling
the dry run or performing a broad dependency upgrade.

The complete regression runner captures the Web build output, fails on a
failed build and independently rejects `Wasm dry run findings` or
`avoid_double_and_int_checks`. A source contract pins the reviewed floors and
locks and rejects `--no-wasm-dry-run`. Flutter's positive `Wasm dry run
succeeded` message remains visible.

## Deterministic financial-document typography

The first real `InvoicePdfService.buildPdf()` compatibility test exposed a
separate output defect: the PDF package's built-in Helvetica faces did not
support the en dash used throughout the German financial document. The
renderer now loads bundled Roboto Regular and Bold assets, creates fresh PDF
font objects per document and requires no network request, system font or
provider API.

The two static fonts come from the official Roboto v3.015 release at upstream
commit `91d5d3e5b81efa04a77925cc609fdcdd7ee663d1`. Their SHA-256 fingerprints,
the normalized SIL Open Font License 1.1 text and the offline loading path are
permanently guarded. The license is included in the Flutter asset bundle. The
compatibility test constructs an immutable test-mode financial snapshot and
requires a non-empty `%PDF-...EOF` document without recalculating amounts.

## Verification

Focused dependency, runner, font-supply-chain, Privacy and PDF-generation
checks pass. Analyzer reports zero issues. The complete unchanged local gate
passes 385 Flutter tests plus one documented skip, the separate Google-only
profile, Web build/smoke and one direct 448-task Android debug build. It starts
with 4,230,920 KiB effective capacity and ends with 878,200 KiB free,
3,307,728 KiB generated and 100,968 KiB generated growth.

Exact clean-host CI run `32613968872` passes at the implementation head:

- repository-owned PostgreSQL-16 fresh-cluster proof: 39 seconds;
- Backend, dependency/history audit and Compose validation: 1:19;
- Flutter/Web/Android: 6:39;
- CI log: analyzer zero, 385 passes plus one documented skip, `Wasm dry run
  succeeded` and Android `BUILD SUCCESSFUL`; and
- signed candidate and publication: skipped.

The constrained Mac required four unused, regenerable Pub-cache versions to
be moved recoverably to the Crucial X9 before the local full gate could start.
No threshold changed. The move is operational hygiene, not acceptance
evidence; the fixed capacity guard and exact clean-host CI are the
deterministic proof.

S4BK closes `TD-RR-014`; all 14/14 deterministic exit contracts are retained.
Remaining Android SDK/vendor Gradle, manifest, deprecated-API and unchecked-
cast warnings remain visible for separate bounded assessment. External
readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
