# Technical debt required before release readiness

Status: **closed, 21/21 deterministic exit contracts retained**. Non-live
register created on 22.08.2026 and last verified on 23.08.2026. This closure is
technical only and does not imply external-gate or release approval.

This register prevents local test accommodations from becoming permanent
product or release prerequisites. None of the entries changes production,
Payment, Store, Cloud/VPS/DNS or pilot state. Release readiness must not be
claimed until every item below has reproducible evidence and is closed.

- 11.09.2026, WP109: the first complete candidate-regression attempt passed
  the functional suites through Web/Wasm and then stopped at the single direct
  Android packaging step with `No space left on device`. Only regenerable
  checkout output plus Gradle, browser and package-manager caches were removed;
  no test, limit, parallelism, candidate artifact or product data changed. The
  identical isolated-cache command then passed 2,677/2,677 tool tests, Backend,
  Flutter, analyzer, Web/Wasm, loopback smoke and its one direct Android build.
  Its retained capacity result began with 10,261,176 KiB free, generated
  3,465,252 KiB and ended with 6,791,432 KiB free, inside the existing fixed
  bounds. The failed attempt and manual cleanup are incident evidence only and
  cannot become a release prerequisite. This is a recurrence observation under
  `TD-RR-012` and `TD-RR-021`; both deterministic guards remain unchanged.

- 11.09.2026, WP109: a physical rental-cart run exposed that a two-second
  acknowledgement could finish while Android's hierarchy dumper was taking its
  first snapshot. The application request itself returned `200` and cleanup
  passed, so the failure was in the timing-dependent measurement. The physical
  runner now performs each user tap once, waits only on a read-only exact server
  receipt for that tap, then requires the stable post-dialog detail and durable
  cart surface. The existing Flutter widget regression still proves the exact
  success and failure wording. No mutation retry, delay-to-pass, longer product
  timeout or transient UI dependency is accepted as release evidence.

| ID | Current observation / temporary accommodation | Required deterministic exit evidence |
| --- | --- | --- |
| `TD-RR-001` | **CLOSED 23.08.2026.** S4P installed repository-bound normal-shell Node 22 plus exact Corepack pnpm 11.16.0. Exact CI run `32609567488` used the pinned package contract, frozen install and normal commands at `891ecdc`; Backend, syntax, audit, secret scan and PostgreSQL passed without a copied runtime or Codex fallback. | Closed by exact-package CI. Permanently retain the pinned repository/package/workflow contract and normal-shell path. |
| `TD-RR-002` | **CLOSED 23.08.2026.** S4R removed historical request-source accommodations and isolated unrelated monolithic PostgreSQL scenarios with fresh application/limiter instances. Exact CI run `32609567488` passed the canonical integration and fixed-source 10/30/240 threshold contracts at `891ecdc`. | Closed by exact-commit PostgreSQL CI. No unrelated source rotation, limiter reset, wait, bypass or production-limit increase may reappear. |
| `TD-RR-003` | **CLOSED 23.08.2026.** Earlier local compiler/worker stalls remain recorded as failed evidence. Manual exact-head CI run `32609858706` executed the complete Flutter suite five times at default parallelism at `891ecdc`; all five passed 384 tests plus one documented skip without interruption or rerun. | Closed by retained exact-commit stress CI. Permanently retain five complete default-parallel runs; no concurrency override, reduced suite, sleep, retry, terminal intervention or pass-on-rerun may appear. |
| `TD-RR-004` | **CLOSED 23.08.2026.** S4BG adds an independent Ubuntu-24.04 CI job with no service, supplied database, port or lifecycle command. Failed run `32610811354` exposed a default Unix-socket permission dependency; source head `72adea2` disables sockets and retains loopback TCP only. Exact run `32610904963` returned `passed-and-cleaned` on PostgreSQL 16 in 32 seconds and the whole workflow passed. | Closed by exact-package CI executing the repository-owned fresh-cluster runner and canonical integration. Permanently retain isolated loopback selection, no caller lifecycle, guarded cleanup and fail-closed major 16. |
| `TD-RR-005` | **CLOSED 23.08.2026.** All twelve fixture-owning suites retain scoped fail-closed cleanup and the twice-repeated parallel boundedness guard. Exact CI run `32609567488` passed `0/0 KiB -> 0/0 KiB` with no orphaned `sit-*` directories. | Closed by exact-commit CI. Manual cleanup, larger disk, alternate temp root or serial execution cannot become acceptance evidence. |
| `TD-RR-006` | **CLOSED 23.08.2026.** The single persisted issuance clock, exact 30-minute derived expiry and independent database bound remain source- and migration-guarded. Exact PostgreSQL 16 CI run `32609567488` passed the unit, migration and API constraints at `891ecdc`. | Closed by exact-commit PostgreSQL CI. No sleep, retry, clock wait, relaxed bound, reused database or manual schema may reappear. |
| `TD-RR-007` | **CLOSED 23.08.2026.** S4T removed the Gradle retry loop and waits. Independent exact CI runs `32608792863` and `32609567488` passed after verified cache setup with one checksum-bound wrapper preflight and one direct Android build. | Closed by repeated exact-commit CI. Retain one attempt; no loop, sleep, retry or pass-on-rerun may reappear. |
| `TD-RR-008` | **CLOSED 23.08.2026.** The repository Web helper binds an OS-selected loopback port and requests each required artifact once. Exact CI run `32609567488` passed the source contract and real smoke at `891ecdc`. | Closed by exact-commit CI. No fixed default port, sleep, retry, readiness poll, pass-on-rerun or external server prerequisite may reappear. |
| `TD-RR-009` | **CLOSED 23.08.2026.** Exact CI run `32609567488` passed fragmented-frame, event-order and storage-negative CDP contracts. A dedicated temporary local Chrome profile then completed the guarded loopback reload with `readyState: complete` and nine verified keys; no stored values, credentials or path were retained. | Closed by exact-commit CI plus the sanitized controlled observation record. No sleep, timer, reconnect retry, uncorrelated event or value-bearing verification output may reappear. |
| `TD-RR-010` | **CLOSED 23.08.2026.** S4X replaced the Flutter analyzer's permissive ceiling with an exact normalized diagnostic fingerprint. S4Y through S4BE guard every repaired async lifetime and dead-code boundary across Wishlist, popup/navigation, gallery, item-card/details, listing options/photos, profiles, requests/bookings, Explore, DataService and message thread. The backlog ratcheted `220 -> 214 -> 212 -> 210 -> 207 -> 204 -> 203 -> 202 -> 200 -> 198 -> 196 -> 194 -> 191 -> 188 -> 182 -> 175 -> 171 -> 165 -> 155 -> 143 -> 132 -> 122 -> 86 -> 71 -> 59 -> 55 -> 48 -> 42 -> 33 -> 25 -> 20 -> 3 -> 0`; `use_build_context_synchronously` decreased `98 -> 0`, `deprecated_member_use` decreased `36 -> 0`, and all remaining unused-code buckets reached zero. S4AS also removed three 120-millisecond and one 80-millisecond reservation-navigation waits without replacement. The unchanged complete gate passed once locally at `2fd646b`; exact CI run `32608792863` passed at `4d914ed` with Backend 1:31, Flutter 6:36 and publishing skipped. | Closed by reviewed source fixes, an exact empty snapshot and green exact-commit CI. Permanently retain the zero snapshot and fail-closed parser; never raise it, replace findings, suppress lints, make warnings non-fatal or update evidence merely to pass. |
| `TD-RR-011` | **CLOSED 22.08.2026.** Failed run `32592388940` exposed a cold-cache Maven `403` and Flutter's hidden APK retry. S4AC replaced it with one direct wrapper `assembleDebug`. Run `32593274378` passed without rerun and wrote the cold PR-scoped Basic Cache (`0 restored, 1 saved`); later exact run `32594060058` restored it (`1 restored, 0 saved`) and passed with one direct build, zero Flutter APK commands and zero retries. | Closed by a reproducible open-source Basic Cache write/restore sequence. Permanently retain the single-attempt contract; no rerun-after-failure, sleep, retry loop, alternate mirror, manual cache injection or paid provider may reappear. |
| `TD-RR-012` | **CLOSED 23.08.2026.** S4BF adds fixed fail-closed 4 GiB effective-capacity, 5 GiB generated-footprint and 512 MiB end-free bounds around the unchanged complete gate. The local run at `891ecdc` passed with 8 KiB growth; exact CI `32609567488` passed with 3,166,800 KiB growth and adequate final free space. | Closed by deterministic local and exact-CI host measurements. Retain fixed bounds; manual cache purge, alternate temp root, smaller suite, serial execution, retry or pass-on-rerun cannot become release prerequisites. |
| `TD-RR-013` | **CLOSED 23.08.2026.** The PostgreSQL-16 integration emitted the `pg` warning that calling `client.query()` while the same client is already executing a query is deprecated and will be removed in `pg` 9. A diagnostic run with `NODE_OPTIONS=--throw-deprecation` failed at the first affected transactional workflow. S4BI serializes every formerly concurrent same-client query batch in six transactional source files; independent queries remain semantically unchanged. The repository runner now always invokes the canonical integration with `--throw-deprecation`, and a source contract rejects recurrence. The unchanged real runner and complete local gate pass. Exact CI `32612314131` passes the independent fresh-cluster proof at `76cb636`. | Closed by fail-on-deprecation execution plus a structural no-parallel-same-client contract. Permanently retain the canonical runner flag and source guard; warning suppression, pinning to an old client, retry, additional clients or a reduced integration suite may not replace the source fix. |
| `TD-RR-014` | **CLOSED 23.08.2026.** The locked `image` 4.5.4 dependency emitted two WebAssembly dry-run findings, while the first real financial-PDF test showed that built-in Helvetica omitted the German document's en dash. S4BK uses a bounded `pdf`/`printing` update that locks `image` 4.9.2, makes WebAssembly findings fatal without disabling the dry run, and renders financial PDFs with hash-bound offline Roboto Regular/Bold assets plus the shipped SIL OFL 1.1 license. The real PDF test, unchanged local gate and exact clean-host CI `32613968872` pass at `52aa41f`; its log contains positive Wasm success and no former finding signature. | Closed by reviewed dependency floors/locks, offline font supply-chain hashes/license, real PDF generation and fail-on-Wasm-finding full builds. Retain the active dry run, exact font contract and clean-host CI; no warning filter, `--no-wasm-dry-run`, runtime font download, system-font dependency, cache patch, retry or partial build may replace them. |
| `TD-RR-015` | **CLOSED 23.08.2026.** The transitive Android lifecycle bridge 2.0.30 retained an upstream Groovy Gradle-9/10 syntax deprecation, and the new S4BJ file-picker and S4BK PDF/WebAssembly contracts were not yet registered in the complete gate. S4BL changes only that transitive lock to 2.0.35, binds its exact checksum and the compatible Flutter 3.41.7 floor, and permanently registers all three dependency contracts. An all-warning local Android build no longer reports the lifecycle Groovy syntax warning; the complete local gate and exact clean-host CI `32614834455` pass at `fcd2a0d`. Remaining vendor/SDK warnings stay visible and separate. | Closed by one bounded lock update, exact checksum/toolchain/runner contracts, a direct 448-task all-warning Android build, the complete local gate and clean-host CI. Retain the three full-gate registrations; no Pub-cache patch, warning suppression, broad toolchain upgrade, retry, partial build or removal of remaining warnings may replace reviewed compatible updates. |
| `TD-RR-016` | **CLOSED 23.08.2026.** The complete Android gate used Gradle's default warning summary, so individual warning ownership was absent from its retained output and an SIT-owned Gradle deprecation could be obscured among vendor warnings. S4BM keeps exactly one direct build, captures and prints `--warning-mode all` output, preserves build failure and fails after a successful compile on any Build-file or Settings-file warning under the checkout's `android/` path. The unchanged local gate and exact clean-host CI `32615539334` pass at `1ad3410`; clean-host warning locations are visible under resolved Pub-cache plugin paths and no SIT-owned path was accepted. | Closed by full warning visibility, fail-closed repository ownership checks, one-attempt/capacity contracts and exact clean-host CI. Retain one build and unchanged output; no second diagnostic build, warning filtering, `none`/`summary` mode, accepted-warning fingerprint, Pub-cache patch, retry or timing workaround may replace compatible source/dependency fixes. |
| `TD-RR-017` | **CLOSED 23.08.2026.** S4BM exposed third-party Android bridge Gradle-9 warnings. The newest resolvable SharedPreferences, URL-Launcher and ImagePicker probe failed because its AndroidX artifacts require compile SDK 36 and AGP 8.9.1 or later; that broad migration was not accepted. S4BN locks only the earliest compatible upstream fixes (`image_picker_android` 0.8.13+4, `shared_preferences_android` 2.4.15 and `url_launcher_android` 6.3.24), binds exact checksums and permanently inspects the real debug APK for merged minSdk 24. Their former warning paths are absent; the direct build, complete local gate and exact CI `32616408339` pass at `09094df`. | Closed by bounded exact locks/checksums, retained Flutter/toolchain floors, one all-warning 448-task build, real APK `aapt` floor proof, complete local regression and exact clean-host CI. Do not replace this with a dependency override, Pub-cache patch, warning suppression, source-only minSdk assertion, extra build, retry or unreviewed compile/target-SDK migration. |
| `TD-RR-018` | **CLOSED 23.08.2026.** S4BM also exposed the resolved `path_provider_android` 2.2.17 Gradle-9/10 warning. S4BO locks only upstream 2.2.19, the first compatible line with the explicit Gradle-9 correction after its reviewed toolchain-floor update, and binds its exact checksum plus Flutter 3.41.7 local/CI floors. The later 2.3.x JNI migration remains excluded. The warning path is absent; the direct build, complete local gate and exact CI `32616929359` pass at `620b729`. | Closed by one bounded exact lock/checksum, retained toolchain and full-gate registration contracts, one all-warning Android build, real APK minSdk-24 proof, complete local regression and exact clean-host CI. Do not replace this with an override, cache patch, warning suppression, retry, unreviewed JNI migration or compile/target-SDK change. |
| `TD-RR-019` | **CLOSED 23.08.2026.** The reviewed Printing 5.14.3 Web adapter embeds PDF.js 3.2.146 below Mozilla's CVE-2024-4367 patched floor. Printing 5.15.0 is incompatible with pinned Dart 3.11.5 and embeds PDF.js 5.7.284 below the later CVE-2026-16633 patched floor. S4BP therefore binds the exact package checksum and resolved source hashes, proves the application's three `layoutPdf` and one `sharePdf` calls never initialize PDF.js, rejects all reachable preview/raster/conversion/direct-print/printer/platform paths, and permanently registers the contract. Focused checks, complete local regression and exact CI `32617626521` pass at `0ec4d0a`. | Closed by removing current application reachability and retaining an exact fail-closed source/adapter contract, not by claiming the embedded library is patched. Keep the guard until a separately reviewed compatible PDF stack satisfies all applicable advisories. No version-only update, advisory suppression, feature flag, runtime/cache patch, retry or reduced suite may replace it. |
| `TD-RR-020` | **CLOSED 23.08.2026.** MobileScanner 7.1.3 predates its bounded iPhone 17 scanner-start crash correction. S4BQ pins only the immediate 7.1.4 patch, binds the exact package checksum and resolved Swift/Android/public-API hashes, requires available Apple pixel-format selection before output configuration, rejects the old unconditional BGRA assignment, preserves assignment-safe Android floors and limits application scope to the two reviewed pickup/return scanners. The complete local gate and exact CI `32618368745` pass at `910e888`; no MobileScanner Gradle warning path remains. | Closed by one exact patch lock, source-behavior and application-scope contracts, Privacy source rebinding without decision drift, complete local regression and exact clean-host CI. Retain physical Apple validation as a separate external gate. No later scanner migration, dependency override, cache patch, warning filter, retry, reduced suite or source-equals-device claim may replace it. |
| `TD-RR-021` | **CLOSED 23.08.2026.** PF14B's first current-head signed build completed the AAB, APK and privacy scan but failed with `ENOSPC` while copying the exact artifacts into the private archive. The general capacity guard had counted an existing generated tree as replaceable capacity without making its removal part of the signed builder's deterministic lifecycle. The builder now performs one cold generated-tree clean before compilation, archives only after verification and cleans generated output on success or failure. Exact regression `32644493652` and CodeQL `32644493643` passed at `1b3e86e`; that same clean commit then created and independently validated its four-file owner-only archive, ending with 5,495,736 KiB free. | Closed by source-bound cold/failure lifecycle, unchanged fixed limits, exact CI, same-commit signed private archive and sanitized physical update evidence. The incident cleanup and failed attempt are not acceptance evidence. No manual cleanup, alternate volume, reduced artifact set, retry, sleep or capacity override may become a prerequisite. |

## Observation log

- 11.09.2026, WP112: the physical on-device Listing-AI app journey passed, but
  two pre-closure automation attempts failed safely. The first measurement
  incorrectly required every suggestion chip in one scroll viewport; the
  retained runner accumulates a bounded set of read-only UI sections. The
  second used the forward scroll direction while locating the exact controlled
  thumbnail for cleanup; the retained runner uses the explicit reverse
  direction and requires both local-recovery and exact-media removal before
  PASS. Neither correction repeats an app mutation, changes a product timeout,
  reads private media, weakens a gate or becomes a release prerequisite. The
  exact committed runner then passed end to end with a single generated draft,
  zero cost, no publication and protected-owner restoration.

- 10.09.2026, WP102: an owner reported absent normal Staging verification
  messages, including the expected mailbox's spam view. Read-only application
  checks established SMTP readiness but not recipient delivery; the affected
  source previously swallowed a known verification-delivery command error and
  still returned a successful pending-registration response. Source commit
  `ccb247d356e56b96d956efc5839ed773013720e8` now returns a typed `503` for
  that known error, preserves normal retry and uses processed-request wording
  rather than delivery wording. Synthetic local regression covers regular and
  unverified-social paths; no real message was sent and no external state was
  changed. This is an observation, not a timing or retry accommodation: the
  separate read-only provider message trace remains open, and only it can
  classify the reported recipient outcome. The complete regression also
  correctly stopped at the retained Android-candidate source binding; no
  candidate rollover, version reuse, build bypass or CI overclaim is accepted
  to turn that stop into a pass.

- 02.09.2026, RW23: two local complete-gate attempts stopped only at the fixed
  capacity bounds after prior generated Android/Gradle output consumed the Mac
  mini reserve. Only rebuildable output/caches and the superseded private
  `2026090205` candidate were removed. The unchanged gate then passed locally;
  exact GitHub Regression `33671122573` independently passed on a clean runner
  and produced a byte-identical debug APK, while the same-commit signed builder
  completed its cold cleanup/archive lifecycle. The manual cleanup is retained
  only as incident recovery and is not release acceptance evidence, a timing
  workaround or a permanent prerequisite. This is a recurrence observation
  under the still-enforced deterministic contracts `TD-RR-012` and
  `TD-RR-021`; their fixed capacity and cold-builder guards were not weakened.

- 23.08.2026, PF14B: the first signed `2026082302` internal Staging build
  completed compilation and privacy verification but retained no archive after
  an `ENOSPC` failure during the private copy. One exact `flutter clean`
  recovered only ignored generated files after the failed attempt; it is not
  acceptance evidence. The signed builder now owns a cold generated lifecycle,
  cleanup-on-failure and archive-before-cleanup ordering. Exact regression
  `32644493652` and CodeQL `32644493643` passed at `1b3e86e`; the same commit
  then retained its exact four-file owner-only archive with 5,495,736 KiB free.
  A strict data-preserving Pixel update and five-target physical 200%-font
  geometry diagnostic passed without Store or live changes. This closes
  `TD-RR-021`; all 21/21 deterministic exits are retained.

- 23.08.2026, S4BQ: the immediately following MobileScanner patch fixes the
  documented iPhone 17 scanner-start crash by selecting an available capture
  pixel format. The exact 7.1.4 lock and resolved Swift/Android/public-API
  hashes are guarded; broader 7.2 through 7.4 changes are excluded. The first
  complete run correctly rejected a stale Privacy source hash. Exact rebinding
  changed no decision, all 58 Privacy/Retention contracts passed, and the
  identical complete local gate plus exact CI `32618368745` passed at
  `910e888`. CI includes all four scanner contracts, analyzer zero, Web/Wasm,
  Android and binary minSdk 24 with no MobileScanner warning path. This closes
  `TD-RR-020`; all 20/20 deterministic exits are retained. Physical Apple
  evidence, P0B and every external gate remain closed.

- 23.08.2026, S4BP: dependency review found that the current Printing Web
  adapter contains PDF.js 3.2.146 and that the nominal next Printing version is
  neither toolchain-compatible nor above the later applicable PDF.js advisory
  floor. The retained contract binds the exact dependency and adapter sources,
  recursively limits application use to three `layoutPdf` and one `sharePdf`
  calls, and proves those Web paths do not initialize PDF.js. Eighteen focused
  assertions, the complete local gate and exact clean-host CI `32617626521`
  pass at `0ec4d0a`; CI includes all four reachability subtests, analyzer zero,
  Web/Wasm, Android and binary minSdk 24. This closes `TD-RR-019`; all 19/19
  deterministic exits are retained. P0B and every external gate remain closed.

- 23.08.2026, S4BO: the bounded PathProvider review selected only
  `path_provider_android` 2.2.19 and explicitly excluded the later 2.3.x JNI
  migration. The exact checksum and Flutter 3.41.7 floors are guarded, and the
  complete runner retains the new contract. Seventeen focused contracts, one
  448-task local all-warning build, the complete local gate and exact clean-host
  CI `32616929359` pass at `620b729`. The former PathProvider Build-file warning
  path is absent and the actual APK remains minSdk 24. This closes
  `TD-RR-018`; all 18/18 deterministic exits are retained. Remaining vendor
  warnings stay visible. P0B and every external gate remain closed.

- 23.08.2026, S4BN: the first newest-resolvable three-bridge build remained red
  because AndroidX Browser, Activity and Core required compile SDK 36 and AGP
  8.9.1 or later. No broad migration or warning workaround was accepted. The
  retained exact locks select the earliest compatible Gradle-9 fixes and remove
  the three bridge warning paths. The same single Android build now feeds an
  `aapt` minSdk-24 artifact check. Fourteen focused contracts, the complete
  local gate and exact clean-host CI `32616408339` pass at `09094df`. This
  closes `TD-RR-017`; all 17/17 deterministic exits are retained. Remaining
  vendor warnings stay visible. P0B and every external gate remain closed.

- 23.08.2026, S4BM: Gradle's summary-only Android output was replaced by full
  warning visibility on the same single build. The output is printed unchanged
  and any warning location inside the checked-out SIT `android/` Build or
  Settings files fails the gate. Eleven focused contracts, the complete local
  gate and exact CI `32615539334` pass at `1ad3410`. Clean-host warnings are
  individually visible under resolved Pub-cache plugin paths; none is silently
  accepted as a baseline, and no SIT-owned warning path passed. This closes
  `TD-RR-016`; all 16/16 deterministic exit contracts are retained. P0B and
  every external gate remain closed.

- 23.08.2026, S4BL: an all-warning Android inventory attributed deprecations to
  plugin/toolchain paths rather than SIT-owned Gradle scripts. The narrow
  compatible correction changed only `flutter_plugin_android_lifecycle`
  2.0.30 to 2.0.35 and removed its former Groovy syntax warning. The same
  review found that S4BJ/S4BK dependency contracts were focused-only; file
  picker, PDF/WebAssembly and lifecycle contracts now all execute in and guard
  their permanent full-gate registration. The direct 448-task all-warning
  build, unchanged local gate and exact CI `32614834455` pass at `fcd2a0d`.
  This closes `TD-RR-015`; all 15/15 deterministic exit contracts are retained.
  Remaining vendor/SDK warnings stay visible. P0B and every external gate
  remain closed.

- 23.08.2026, S4BK: the bounded PDF/printing dependency review removed the two
  WebAssembly findings without a broad upgrade or suppression. A real
  financial-document test then exposed unsupported typography in the default
  PDF font, so Regular/Bold Roboto v3.015 assets, exact hashes and the SIL OFL
  1.1 text are now bundled for deterministic offline rendering. The unchanged
  local gate passed after only recoverable relocation of four unused caches;
  that relocation is not evidence. Exact clean-host CI `32613968872` passed at
  `52aa41f` with `Wasm dry run succeeded`, no former finding signature and
  publication skipped. This closes `TD-RR-014`; all 14/14 deterministic exit
  contracts are retained. Android vendor warnings remain separate and
  visible. P0B and every external gate remain closed.

- 23.08.2026, S4BJ: a targeted dependency review found that locked
  `file_picker` 10.3.3 preceded the upstream Android path-traversal correction.
  The floor and exact lock now require 11.0.3, all three consumers use its
  static API, and focused policy, Privacy/Retention, Flutter and full local
  checks pass. The first full gate correctly refused 4,161,440 KiB effective
  capacity. Generated diagnostic output was cleaned and one unused old package
  cache was moved recoverably off-volume; neither action is acceptance
  evidence. Exact clean-host CI `32613104943` passed at `95b0ead`, so
  `TD-RR-012` remains closed by its deterministic guard rather than cleanup.
  Third-party Wasm/Android warnings remain visible and separate.

- 23.08.2026, S4BI: the canonical PostgreSQL integration's previously
  non-fatal same-client query warning was converted into a deterministic
  failure with `--throw-deprecation`. The red proof stopped at the first
  affected booking availability query. Six transaction-scoped workflows now
  issue their independent reads explicitly in order, and the privacy export
  uses ordered query operations inside its existing consistent transaction.
  The real local fresh-cluster runner then returned `passed-and-cleaned`, the
  complete unchanged gate passed with zero generated-footprint growth, and
  exact CI `32612314131` passed the independent PostgreSQL proof at `76cb636`.
  This closes `TD-RR-013`; all 13/13 deterministic exit contracts are retained.
  P0B and every external gate remain closed.

- 23.08.2026, S4BG: the repository-owned PostgreSQL runner now executes in an
  independent Ubuntu-24.04 CI job without a service, supplied database, port,
  bin override or lifecycle command. First run `32610811354` failed on the
  compiled Unix-socket directory and remained failed. The source now disables
  Unix sockets for its loopback-only test cluster; exact run `32610904963`
  passed `passed-and-cleaned` on PostgreSQL 16, Backend and Flutter. This closes
  `TD-RR-004` and the 12/12 register. P0B and all external gates remain closed.

- 23.08.2026, S4BF: the complete gate now measures fixed release-host capacity
  before all work and validates bounded generated footprint plus minimum free
  space after Android. Local and exact CI run `32609567488` passed at
  `891ecdc` without cleanup, retry or parameter override. Manual exact-head run
  `32609858706` then passed five complete default-parallel Flutter suites.
  S4W's controlled loopback browser observation completed in a dedicated
  temporary profile with nine exact keys and value-free output. This closes
  `TD-RR-001`, `002`, `003`, `005`, `006`, `007`, `008`, `009` and `012`.
  `TD-RR-004` remains open because the repository-owned fresh-cluster runner
  itself has not yet executed in CI.

- 23.08.2026, S4BE: the final message-thread analyzer ratchet removed one
  disconnected animation-parameter chain and two unused animation values plus
  the never-selected location-map loading state. Native `No issues found!`
  output is normalized to the exact empty snapshot at fingerprint
  `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b`.
  One focused run, the unchanged complete local standard-parallel gate and
  exact CI run `32608792863` passed without retry, lint suppression, reduced
  parallelism, timing delay, cleanup, network switch or Pixel dependency.
  `TD-RR-010` is closed; the zero snapshot remains a permanent gate.

- 23.08.2026, S4AV: the first focused Flutter selection failed with
  `No space left on device` after 15 green results. The data volume exposed only
  238 MiB free. No test parameter changed. Regenerable Flutter/build and
  package-manager caches were removed, then the identical 96-test selection
  and the complete standard-parallel gate passed at `4632aac`. `TD-RR-012`
  records the capacity incident so cache purging cannot become an undocumented
  release prerequisite.

- 22.08.2026, S4H: extending the already large PostgreSQL HTTP integration with
  more authenticated requests exhausted its shared general rate-limit bucket
  before the final compliance-page assertion. No new IP rotation, limiter
  bypass or increased production limit was introduced. The new S4H state
  transitions were moved to direct transactional workflow integration against
  PostgreSQL; the unchanged canonical HTTP integration and complete technical
  regression then passed. `TD-RR-002` remains open until isolated application
  and limiter tests pass repeatedly without request-source manipulation.
- 22.08.2026, S4H: PostgreSQL 16 verification again required a manually created
  scoped data directory and loopback port. Successful cleanup is operational
  hygiene, not deterministic runner evidence; `TD-RR-004` remains open.
- 22.08.2026, S4I: the standard HTTP integration passed after adding the two
  content-guard requests without another limiter exemption, changed limit or
  new request-source rotation. This is positive package evidence but does not
  close `TD-RR-002`; the suite still needs repository-owned isolated limiter
  state and separate repeatable threshold tests. The fresh PostgreSQL 16
  instance was again started manually, so `TD-RR-004` also remains open.
- 22.08.2026, S4J: the first integration run reproduced `TD-RR-002`: six new
  harassment endpoint requests consumed the monolithic application's remaining
  general-limit budget and a later unchanged compliance request received 429.
  No wait, IP rotation, bypass or increased general limit was accepted. The S4J
  HTTP scenario now owns a fresh application/limiter instance while continuing
  against the same isolated PostgreSQL transaction fixture; the canonical
  integration then passed twice consecutively from fresh databases. This is
  deterministic scenario isolation, but
  `TD-RR-002` remains open until the whole monolith is split and real thresholds
  pass separately and repeatedly.
- 22.08.2026, S4J: the focused Flutter check still used concurrency one and the
  PostgreSQL instance still required manual lifecycle commands. These runs do
  not close `TD-RR-003` or `TD-RR-004`; neither accommodation may be part of the
  release-ready path.
- 22.08.2026, S4K: the first PostgreSQL address-window run exposed a real
  timezone defect: the JavaScript PostgreSQL client represented SQL `DATE`
  values as instants and the local timezone shifted the policy date backward.
  The product query now reads those values explicitly as calendar-date text;
  focused and fresh PostgreSQL tests cover the booking-local-date comparison.
  This is a source fix, not a timing workaround.
- 22.08.2026, S4K: the final full gate passed without sleeps, limiter changes,
  request-source rotation or clock-bound waiting. The exact boundary tests use
  injected clocks and the integration uses database-checked appointment truth.
  Temporary database/log fixtures were stopped and moved to Trash. Manual
  PostgreSQL setup, temporary Node resolution, Flutter concurrency one and the
  required two-run bounded-disk proof remain open under `TD-RR-001`,
  `TD-RR-003`, `TD-RR-004` and `TD-RR-005`; this successful package does not
  close them.
- 22.08.2026, S4L: adding the specialized endpoint late in the monolithic
  PostgreSQL HTTP sequence consumed the shared safety-intake test bucket and
  returned `429`. No wait, IP rotation, limiter reset/bypass or higher product
  limit was accepted. Authenticated route/limiter wiring and transactional
  PostgreSQL workflow/database truth are tested separately. `TD-RR-002`
  remains open until isolated real-threshold tests pass repeatedly.
- 22.08.2026, S4L: the technical runner's implicit concurrency-one default was
  removed. Two consecutive complete Flutter runs passed at standard
  parallelism with 376 passes and one documented skip each. This is positive
  local evidence, but `TD-RR-003` remains open pending retained stress evidence
  and green CI on the exact commit.
- 22.08.2026, S4L: Backend tests now load repository-owned non-secret defaults
  for otherwise required unit-test configuration without overriding CI or an
  explicit integration environment. The full default package command passed
  with 568 tests and one expected no-database skip. Temporary Node resolution
  and unavailable shell `pnpm` still keep `TD-RR-001` open.
- 22.08.2026, S4L: the final PostgreSQL 16 integration passed all migrations
  through `062`, all three handover exceptions, forged-audit rejection and
  rollback refusal. Its lifecycle was still manually orchestrated, so
  `TD-RR-004` remains open.
- 22.08.2026, S4M: spring and autumn DST, the inclusive 48-hour boundary and
  seven-calendar-day recurrence are covered by injected fixed instants in both
  server and client policy tests. The complete Flutter suite passed at standard
  parallelism with 379 passes and one documented skip. No sleep, clock-bound
  retry, concurrency override, limiter change or IP rotation was introduced.
  This is further local evidence for `TD-RR-003`, not closure without retained
  stress evidence and exact-commit CI.
- 22.08.2026, S4M: fresh PostgreSQL 16 applied migration `063` and verified the
  versioned calendar constraints. The database lifecycle was still assembled
  manually and local Backend checks still used the temporary Node runtime, so
  `TD-RR-004` and `TD-RR-001` remain open. The temporary database was stopped
  and moved to Trash; neither accommodation is a release prerequisite.
- 22.08.2026, S4N: a dedicated Safety bucket alone was proven insufficient
  because the preceding general bucket could still starve urgent intake. The
  source fix allows only exact protected Safety and handover-exception requests
  to skip that bucket while a dedicated 30-attempt limiter still runs before
  auth/database work. Exact 10/30/240 loopback boundaries passed twice with one
  fixed source and fresh application instances, with no sleep, reset, IP
  rotation or production-limit change. This closes the isolated-policy part of
  `TD-RR-002`; the item remains open until the historical monolithic fixture is
  free of request-source accommodations and exact-commit CI is green.
- 22.08.2026, S4N: the complete Flutter suite again passed at standard
  parallelism with 379 passes and one documented skip. Two fresh PostgreSQL 16
  integrations also passed, but their lifecycle was still manual. These are
  positive local results for `TD-RR-003` and `TD-RR-004`, not closure evidence.
- 22.08.2026, S4O: the repository-owned local PostgreSQL runner now requires
  major 16, creates a unique cluster and database on an OS-selected loopback
  port, requires `pg_isready`, runs the canonical integration and performs
  guarded `finally` cleanup on success and deliberate test-child failure. Six
  contract tests and two real consecutive runs passed through migration `063`;
  runner temp-root count was `0 -> 0`. No fixed port, sleep, reused database or
  manual cleanup was used. `TD-RR-004` is locally implemented but remains open
  until exact-commit CI and a normal pinned Node/pnpm shell satisfy the closure
  rule.
- 22.08.2026, S4O full gate: two stale static contracts were exposed rather
  than bypassed. Safety wiring now checks the central bounded limiter policy,
  and return lifecycle wiring checks seven booking-calendar days instead of
  fixed 24-hour arithmetic. The complete gate then passed at standard Flutter
  parallelism; neither correction changed product policy to fit a test.
- 22.08.2026, S4P: the normal login shell initially had no Node command and
  exposed pnpm 11.19.0 only through a Codex-internal fallback. Repository
  bootstraps now install/link Node 22, activate exact pnpm 11.16.0 and expose
  FVM Flutter 3.41.7, Dart 3.11.5 and Java 17 through normal shell paths. Fresh
  shell frozen install, Backend/PostgreSQL and the complete technical gate pass
  with no temporary runtime, PATH prefix, `JAVA_HOME` override or serial
  Flutter mode. This completes the local part of `TD-RR-001`; exact CI is still
  required for closure.
- 22.08.2026, S4P security audit: the first normal-shell audit found one
  moderate `uuid 9.0.1` advisory exclusively below unused Firebase Admin
  Storage. Storage and Firestore are now exact ignored optional dependencies,
  their 123-package surface is absent, Auth/Messaging focused checks pass and
  the production audit reports zero known vulnerabilities. CI now fails from
  moderate severity. No forced incompatible version, advisory mute or provider
  configuration change was used.
- 22.08.2026, S4P regression: another complete Flutter run passed at standard
  parallelism with 379 passes and one documented skip. This is retained local
  evidence for `TD-RR-003`; exact-commit CI/stress evidence remains missing.
- 22.08.2026, S4Q: twelve tool-test files were proven to own all 1,605 current
  orphan fixture directories (731,460 KiB). A shared safe-prefix tracker now
  registers fail-closed `node:test` cleanup, and the full technical gate runs a
  count-and-KiB boundedness guard over all affected suites twice at standard
  Node parallelism. The guard first proved the historical set no longer grew;
  those directories and the unused temporary Node copy were then moved to
  Trash. A clean focused run and two consecutive complete technical regressions
  passed `0/0 KiB -> 0/0 KiB`, without sleeps, serialization, alternate temp
  roots or manual deletion between runs. This implements the local part of
  `TD-RR-005`; exact-commit CI is still required for formal closure.
- 22.08.2026, S4R: all reserved request sources used only to preserve order in
  the monolithic PostgreSQL HTTP integration were removed. Independent DSA,
  evidence, recovery, export and authentication scenarios now close the prior
  loopback server and create a fresh application with fresh limiter stores
  while retaining the same isolated database. A source contract allows exactly
  one forwarded header: ten distinct sources are the explicit distributed
  credential-attack input whose target account must still lock. The final
  per-source login threshold uses one fresh loopback application. Focused
  policy/contract tests, two fresh PostgreSQL 16 runs, full Backend and two
  complete standard-parallel regressions passed without wait, reset, bypass,
  limit change or unrelated source rotation. This implements the local part of
  `TD-RR-002`; exact-commit CI is still required for formal closure.
- 22.08.2026, S4S: a repository-owned clean-exact-commit proof ran the complete
  Flutter suite five consecutive times at standard parallelism. Every run
  passed 379 tests with one documented skip at
  `cea3a1f404f90cc4ae1ed8dd86c453245f97e331`; the temp-fixture root remained
  empty. A committed contract rejects concurrency overrides, sleeps and
  retries. GitHub exposes the same proof only through an explicit manual input
  defaulting false. This implements the local retained-stress part of
  `TD-RR-003`; exact-commit CI with that input remains required for closure.
- 22.08.2026, S4T: the Flutter CI job's three-attempt Gradle wrapper loop and
  five-/ten-second sleeps were removed. It now runs one
  `./android/gradlew --version` after the verified basic-cache setup. A committed
  contract locks exactly one invocation, step order, Gradle 8.12's distribution
  SHA-256 and URL validation, and rejects attempt loops, sleeps and retries.
  Eight focused tests, a direct Gradle 8.12/Java 17 invocation and the complete
  clean implementation-head local metadata gate passed. This implements the
  local part of `TD-RR-007`; independent green exact-commit CI is still required
  for formal closure.
- 22.08.2026, S4U: a clean-exact-commit command repeated the reset-token
  single-clock unit five times and the repository-owned fresh PostgreSQL 16
  integration twice. All runs passed at
  `db92a8c6564a9554bc6379c95783eec6d3406a69`; migration `057` retained the
  database 30-minute upper bound and runner temp roots stayed `0 -> 0`. The
  committed wiring contract rejects sleeps, retries, clock waits, concurrency
  overrides and noncanonical database execution. This implements the local
  deterministic part of `TD-RR-006`; exact-commit CI remains required for
  formal closure.
- 22.08.2026, S4V: the P0A Web smoke's fixed port `18765`, twenty-attempt curl
  loop and fixed `sleep 0.1` were removed. The repository-owned Python helper
  now binds an OS-selected `127.0.0.1` port synchronously and performs one
  request for each of the three current-source artifacts. Three focused tests,
  the complete clean implementation-head local metadata gate and five further
  consecutive real smokes passed at
  `1d6aeda04a272648ae5fdea98f7b8a94f5a85a9f`. The ten-second request timeout
  fails closed and cannot retry. This implements the local deterministic part
  of `TD-RR-008`; exact-commit CI remains required for formal closure.
- 22.08.2026, S4W: the local booking-QA CDP seed's scheduled 50-millisecond
  reload, two-second sleep and target reconnect were removed. The tool now
  guards the current main-frame loader, queues events received before command
  responses, waits for the same frame's new-loader `load` lifecycle event and
  fails on any post-reload storage mismatch without printing stored values.
  Four focused tests, five consecutive repetitions and the complete clean
  implementation-head local metadata gate passed at
  `8bc4feddc4fed87c4614c1c20df0776dfec04571`; cache and SIT temp-root counts
  remained zero. No browser seed was applied. This implements the automated
  portion of `TD-RR-009`; exact-commit CI and one controlled local-browser
  observation remain required for formal closure.
- 22.08.2026, S4X: the technical gate's count-only analyzer ceiling was
  removed. The exact snapshot now locks all 220 normalized severity, path, code
  and message records at fingerprint
  `3a2fcf242ac029bcf4e3f2b70a92660700f88b68a05e3a3fca7d81b94b5010bd`.
  Seven focused tests reject unratcheted improvement, same-count replacement
  and parse/summary disagreement. The actual analyzer and complete clean
  implementation-head local metadata gate passed at
  `5a1aba962aa4047b938af4415882a7834681d894`. This contains `TD-RR-010` but
  does not close it; reviewed source ratchets to zero plus exact-commit CI remain
  mandatory.
- 22.08.2026, S4Y: four mounted checks now stop Wishlist add/move selectors
  immediately after either async lookup when the caller was disposed. No delay,
  retry or lint suppression was introduced. The analyzer ratcheted exactly
  `220 -> 214`, `use_build_context_synchronously` `98 -> 92`, and the Wishlist
  path bucket `6 -> 0`; every other bucket stayed unchanged. Nine focused tests,
  five saved-item tests and the complete clean implementation-head local
  metadata gate passed at `195824802b5edaf2c65d8b8ab611abfccae4b707`.
  `TD-RR-010` remains open for further reviewed reductions to zero and
  exact-commit CI.
- 22.08.2026, S4Z: popup and toast timers now capture their root navigator
  synchronously and require that it is still mounted. Dialog completion also
  disarms the standard popup timer, preventing a manually dismissed popup from
  popping a later route. Two focused widget tests and the complete clean
  implementation-head local metadata gate passed at
  `e7b7f8f586ec457ce90efe2cae118e0aa0279963`. The analyzer ratcheted exactly
  `214 -> 212`, `use_build_context_synchronously` `92 -> 90`, and the popup
  path bucket `2 -> 0`; every other bucket stayed unchanged. One exploratory
  test/analyzer invocation encountered Flutter's process lock because those two
  commands were launched together; it was discarded as evidence and both were
  rerun sequentially before the clean full gate. Parallel Flutter commands are
  not an accepted release prerequisite. `TD-RR-010` remains open for further
  reviewed reductions to zero and exact-commit CI.
- 22.08.2026, S4AA: the image gallery now stops a late Wishlist success before
  disposed `setState`, and stops late Wishlist/Share failures before popup
  creation unless the exact context remains mounted. The analyzer correctly
  rejected an initial State-only guard as unrelated to the local context;
  acceptance required the precise context boundary. Three focused lifecycle
  tests and the complete clean implementation-head local metadata gate passed
  at `4522bb26c156500518af22045671ac67836285ca`. The analyzer ratcheted exactly
  `212 -> 210`, `use_build_context_synchronously` `90 -> 88`, and the gallery
  path bucket `2 -> 0`; every other bucket stayed unchanged. No delay, retry or
  lint suppression was introduced. `TD-RR-010` remains open for further
  reviewed reductions to zero and exact-commit CI.
- 22.08.2026, S4AB: initial ItemCard Wishlist loading and every selection,
  assignment, move and removal continuation now stop before later State/context
  access when the card is disposed. The Move path snapshots a nullable list ID
  instead of force-unwrapping mutable post-dialog State. Four focused contracts,
  five Gemerkt/Mietkorb tests and the complete clean implementation-head local
  metadata gate passed at `84dcc078bbd0d1f32d19b2a1ec83f7eb7504e561`.
  The analyzer ratcheted exactly `210 -> 207`,
  `use_build_context_synchronously` `88 -> 85`, and the ItemCard path bucket
  `3 -> 0`; every other bucket stayed unchanged. `TD-RR-010` remains open.
- 22.08.2026, S4AC: exact GitHub run `32592388940` was kept failed after its
  cold PR runner restored/saved zero Gradle cache entries, received Maven
  `403 Forbidden` for Kotlin dependencies and exposed Flutter CLI's automatic
  100-millisecond APK retry. No manual rerun was used. The PR now writes only
  its GitHub-scoped open-source Basic Cache, while the technical gate executes
  one direct checksum-bound `:app:assembleDebug --no-daemon`. Ten focused
  contracts, a direct 448-task build and the complete clean implementation-head
  local gate passed at `1d9816e41304fd4f3d5ba3b95a8a14f3200312ee`.
  Exact post-remediation run `32593274378` then passed on head `5f58368`
  without rerun. Basic Cache reported `0 restored, 1 saved`; log counts were
  one direct `> Task :app:assembleDebug`, zero `flutter build apk` and zero
  `Retrying Gradle Build`. At that point `TD-RR-011` stayed open only for a
  later green restored-cache run with the same single-attempt contract.
- 22.08.2026, S4AD: listing-option add, move and removal callbacks now check
  their exact caller context after every relevant selector, lookup and
  persistence boundary before later callback, navigator or toast access. Ten
  combined Wishlist lifecycle contracts, five Gemerkt/Mietkorb tests and the
  complete clean implementation-head local metadata gate passed at
  `1299518107e51b6079bee17624e711c3e794ca0b`. The analyzer ratcheted exactly
  `207 -> 204`, `use_build_context_synchronously` `85 -> 82`, and the
  listing-options path bucket `3 -> 0`; every other bucket stayed unchanged.
  No delay, retry or lint suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AE: profile save now rechecks its owning State after the
  success toast before navigation. A separate late load-error path also stops
  before disposed `setState`. Three focused lifecycle contracts, 15 profile and
  large-text tests and the complete clean implementation-head local metadata
  gate passed at `42a2982109db3b7a9c784f74ed82f9caa7a247cc`. The analyzer
  ratcheted exactly `204 -> 203`, `use_build_context_synchronously` `82 -> 81`,
  and the profile-info path bucket `1 -> 0`; every other bucket stayed
  unchanged. No delay, retry or lint suppression was introduced. `TD-RR-010`
  remains open.
- 22.08.2026, S4AC closure: exact later GitHub run `32594060058` passed on
  head `e715af5` without rerun and restored the PR-scoped open-source Basic
  Cache (`1 restored, 0 saved`). The log contained one direct
  `> Task :app:assembleDebug`, zero `flutter build apk` and zero
  `Retrying Gradle Build`. No paid provider, mirror, manual injection, sleep or
  retry was used. The cold-write/restore sequence closes `TD-RR-011`; its
  single-attempt source contract remains permanent.
- 22.08.2026, S4AF: the picked-photo preview now rechecks its exact thumbnail
  context after asynchronous file access before opening a dialog. Four focused
  photo/lifecycle contracts and the complete clean local metadata gate passed
  at `eb413d1e61e05c3e2e001a0a73bf02c6aafafb8d`. The analyzer ratcheted
  exactly `203 -> 202`, `use_build_context_synchronously` `81 -> 80`, and the
  create-listing path bucket `1 -> 0`; every other bucket stayed unchanged.
  Privacy and retention source hashes were refreshed and both fail-closed
  validators passed without changing a disclosure or retention decision. No
  delay, retry or lint suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AG: profile sharing now rechecks its exact screen context after
  clipboard access before success UI, and profile blocking proves that same
  context immediately before its asynchronous confirmation flow. Three focused
  source contracts, 16 public-profile/blocking/large-text Flutter tests and the
  complete clean local metadata gate passed at
  `4f8a150f7ca4e8e7fff9b0e8c2f2307633c50d6f`. The analyzer ratcheted exactly
  `202 -> 200`, `use_build_context_synchronously` `80 -> 78`, and the
  public-profile path bucket `2 -> 0`; every other bucket stayed unchanged. No
  delay, retry or lint suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AH: owner acceptance and decline now recheck their exact
  request-detail context after the acceptance commit or decline mutation before
  navigation. Twenty combined request-detail/acceptance source-contract
  assertions, nine focused pricing/checkout Flutter tests and the complete
  clean local metadata gate passed at
  `c8c2a56087b330c67a6e1374905222ae1cc73606`. The analyzer ratcheted exactly
  `200 -> 198`, `use_build_context_synchronously` `78 -> 76`, and the
  request-detail path bucket `2 -> 0`; every other bucket stayed unchanged. No
  contract, quote, deadline or status rule changed, and no delay, retry or lint
  suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AI: booking-card navigation now rechecks its exact builder
  context after the read mutation, and inline renter review rechecks its owning
  State after current-user lookup. Twenty combined booking/quote/privacy source
  contracts, 55 focused booking/review Flutter tests, 73 privacy/retention
  contracts and the complete clean local metadata gate passed at
  `4a050fc4a695183e9352de2349255507bccc487f`. The analyzer ratcheted exactly
  `198 -> 196`, `use_build_context_synchronously` `76 -> 74`, and the bookings
  path bucket `2 -> 0`; every other bucket stayed unchanged. The exact privacy
  source hash was refreshed without changing disclosure truth. No delay, retry
  or lint suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AJ: owner decline now rechecks its screen lifecycle after both
  status mutation and list refresh before result UI, and inline owner review
  rechecks its owning State after current-user lookup. Twenty-one combined
  owner-request/acceptance source contracts, 15 focused
  owner-request/pricing/checkout/review Flutter tests and the complete clean
  local metadata gate passed at
  `9727cf6acfcb0cd7f1d17721540aede22f9287bc`. The analyzer ratcheted exactly
  `196 -> 194`, `use_build_context_synchronously` `74 -> 72`, and the
  owner-requests path bucket `2 -> 0`; every other bucket stayed unchanged.
  Existing product auto-close timers were retained and no timing workaround,
  retry or lint suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AK: search-result Wishlist actions now recheck their owning
  State after the initial Wishlist lookup and after manage-option selection
  before later context access. Five Wishlist/search lifecycle source contracts,
  nine focused catalog/saved-item Flutter tests and the complete clean local
  metadata gate passed at `204e60f08c7fd366c919db73f6d6a7be0445a0f5`.
  The analyzer ratcheted exactly `194 -> 191`,
  `use_build_context_synchronously` `72 -> 69`, and the search-results path
  bucket `3 -> 0`; every other bucket stayed unchanged. No delay, retry or lint
  suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AL: Explore Wishlist actions now recheck their owning State
  after the initial Wishlist lookup and after manage-option selection before
  later context access. Eleven focused Wishlist/Explore/display/supply source
  contracts, 21 focused Flutter tests, the privacy and retention validators and
  the complete clean local metadata gate passed at
  `79b0a1ebba1b2478deac6eb5b37196d9cad167b9`. The analyzer ratcheted exactly
  `191 -> 188`, `use_build_context_synchronously` `69 -> 66`, and the Explore
  path bucket `3 -> 0`; every other bucket stayed unchanged. Both source
  inventories were rebound without changing disclosure or retention state. No
  delay, retry or lint suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AM: message-thread owner acceptance, booking-detail routing,
  time proposal and other-party profile navigation now recheck the owning State
  after their relevant asynchronous lookups. Eighteen focused
  message-thread/acceptance source contracts, 17 privacy contracts, 96 focused
  Flutter tests and the complete clean local metadata gate passed at
  `d481515b71ec065fe1d80cc1bcaca3a2b8707acf`. The analyzer ratcheted exactly
  `188 -> 182`, `use_build_context_synchronously` `66 -> 60`, and the
  message-thread context bucket `6 -> 0`; every other bucket stayed unchanged.
  The privacy inventory was rebound without changing disclosure state. No
  delay, retry or lint suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AN: owner-detail appointment management and overflow-menu
  actions now recheck the owning State or exact builder context after their
  relevant asynchronous dependencies. Thirty-four focused
  source/analyzer/privacy contracts, 96 focused Flutter tests, the privacy and
  retention validators and the complete clean local metadata gate passed at
  `b4ac1d1325d513103f6fe87c10e8306ec8ef0986`. The analyzer ratcheted exactly
  `182 -> 175`, `use_build_context_synchronously` `60 -> 53`, and the
  owner-detail context bucket `17 -> 10`; every other bucket stayed unchanged.
  The privacy inventory was rebound without changing disclosure state. No
  delay, retry or lint suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AO: owner-detail request decline and acceptance now prove the
  exact body context after refresh, and their existing auto-close callbacks
  prove it again before navigator access. Twenty-nine focused
  source/analyzer/privacy contracts, 96 focused Flutter tests, the privacy and
  retention validators and the complete clean local metadata gate passed at
  `5c09b025009e43c88b8d66a5cbc831c40227fff4`. The analyzer ratcheted exactly
  `175 -> 171`, `use_build_context_synchronously` `53 -> 49`, and the
  owner-detail context bucket `10 -> 6`; every other bucket stayed unchanged.
  Both existing three-second product timers were retained exactly. No new
  delay, retry or lint suppression was introduced. `TD-RR-010` remains open.
- 22.08.2026, S4AP: pickup/return starters, Maps failure feedback, return
  completion and pickup-challenge handoff now prove their exact State or caller
  context after asynchronous work. Thirty-four focused
  source/analyzer/privacy contracts, 96 focused Flutter tests, the privacy and
  retention validators and the complete clean local metadata gate passed at
  `921d18510f4fb328fd60856060825358b4f678b9`. The analyzer ratcheted exactly
  `171 -> 165`, `use_build_context_synchronously` `49 -> 43`, and the
  owner-detail context bucket `6 -> 0`; every other bucket stayed unchanged.
  No delay, retry or lint suppression was introduced. `TD-RR-010` remains open
  for booking-detail and item-overlay reductions.
- 22.08.2026, S4AQ: time management, listing lookup, overflow selection and
  completed-renter review now prove their owning State and exact callback
  contexts after asynchronous work. Thirty-nine focused
  source/analyzer/privacy contracts, 96 focused Flutter tests, the privacy and
  retention validators and the complete clean local metadata gate passed at
  `1cb74899cc2c051c749acd85a8b40d9dc414b47e`. The analyzer ratcheted exactly
  `165 -> 155`, `use_build_context_synchronously` `43 -> 33`, and the
  booking-detail context bucket `22 -> 12`; every other bucket stayed
  unchanged. No delay, retry or lint suppression was introduced. `TD-RR-010`
  remains open for 12 booking-detail and 21 item-overlay context findings.
- 22.08.2026, S4AR: stepper, QR and manual-code pickup/return paths now prove
  their owning State after challenge, identity, transition, synchronization,
  notification and banner work. Forty-five focused source/analyzer/privacy
  contracts, 96 focused Flutter tests, the privacy and retention validators and
  the complete clean local metadata gate passed in one execution at
  `5658f101a9a744f34c7ccdfd70cce1a317646cd8`. The analyzer ratcheted exactly
  `155 -> 143`, `use_build_context_synchronously` `33 -> 21`, and the
  booking-detail context bucket `12 -> 0`; every other bucket stayed unchanged.
  No delay, retry, rerun or lint suppression was introduced. `TD-RR-010`
  remains open for 21 item-overlay context findings.
- 22.08.2026, S4AS: listing-sheet, listing-page and bottom-action reservation
  completion now prove their owning State, exact caller context and mounted
  root navigator after asynchronous work. The confirmation helper proves its
  exact context after data lookup. Three 120-millisecond waits and one
  80-millisecond wait were removed without replacement. Forty-nine focused
  source/analyzer/privacy contracts, 96 focused Flutter tests, the privacy and
  retention validators and the application-source-identical pre-registration
  complete gate passed. The final clean-head run at
  `be95424e83fdc0cf6878f837f224d92af16a1e78` stopped emitting after 293 green
  Flutter results while its compiler was idle. A terminal interrupt was
  requested; the same command continued through Google-only, Web and Android
  and returned success, but is not accepted as deterministic evidence. The analyzer
  ratcheted exactly `143 -> 132`, `use_build_context_synchronously` `21 -> 10`,
  and the item-overlay context bucket `21 -> 10`; every other bucket stayed
  unchanged. No retry, rerun, reduced parallelism, timeout or alternate command
  was used. `TD-RR-003` retains the local-output-control observation;
  exact-commit CI is required. `TD-RR-010` remains open for ten item-overlay
  context findings.

## Closure rule

Each item closes only through a separate bounded implementation with committed
tests, a clean repeated local result and green CI on the exact commit. A note,
manual workaround or single successful rerun is not closure. P0/P1 security,
legal and data-integrity blockers continue to preempt this debt register.
