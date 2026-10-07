# SIT Pilot Phase Capsule — 2026-09-23

## Current execution capsule — 2026-10-03

This is the current ShareItToo/SIT entry point. Follow only the next bounded
source link. Everything below **Historical snapshots** is retained provenance,
not current execution or release authority.

- **Objective:** advance Mission source safely while using Staging Web for
  fast, source-bound pilot acceptance. The exact-name image policy successor
  and its responsive browser acceptance are closed at exact source 967. The
  Google-Web activation prerequisite diagnosis is closed and awaits only its
  named Gemini gate. Independently, the dormant P7-A1 synthetic Quorum source
  package, its isolated P7-A2a Web-test presentation and the local-only P7-A2b
  browser vertical-slice runner are closed as the synthetic P7 source/VERIFY
  phase at exact `08636b6c`. The dormant D4 threat/abort contract is also
  Sol-reviewed and exact-head CI-green at `d1f12132`; real Mission
  matching/data activation remains gated.
- **Authoritative sources:** [Mission masterplan](../product/SIT_MISSION_MASTERPLAN_2026-09-30.md),
  [Web contract](STAGING_WEB_PILOT.md), [Web/native matrix](SIT_WEB_NATIVE_CAPABILITY_MATRIX_2026-10-02.md),
  [P6-C2 boundary](SIT_MISSION_P6C2_OWNER_API_2026-10-02.md) and
  [D3/D4 FIX record](SIT_GEMINI_MISSION_P6C_D3_D4_GATE_2026-10-02.md).
  Older checkpoint statements in linked documents do not supersede this capsule.
- **Source/candidate truth:** the deployed Web source remains exact
  `967958f6c6a4d580f4f05e6849b32991db233603` on branch
  `codex/master-workflow-20260808`. The closed synthetic P7 source/VERIFY head
  is `08636b6ce5cd1011fb3faf8458e5ae4daae0d460`. Current non-deployed source
  head `244e4511848cba795f4827ebfdec9ca5909a32dd` contains the pure,
  unrouteable D4 threat/abort contract, synthetic D1/D2 acceptance-outcome
  diagnostic and v2 server-readback envelope. None is a server-origin,
  contract, payment, persistence or coordination adapter. None of these
  successors is deployed, routeable, feature-flagged or evidence of real
  Mission completion.
- **Remote source CI — Sol verified PASS:** exact
  `73887e3ca5f619bb0089d88cb6daef6f507d25f3`, Regression
  [37083356044](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37083356044)
  and CodeQL
  [37083356038](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37083356038)
  both **SUCCESS**. This is exact-738 source CI, not a CI/deployment claim for
  current local 244 or a Mission/contract/payment activation.
- **Exact-244 CI — FIX; narrow dependency successor locally PASS:** Sol verified
  audit/R10 failed on high advisories `GHSA-xjh9-v7x6-24jw` and
  `GHSA-x8mw-p69m-v3mx`; Backend 2,249 pass/23 skip and PostgreSQL proof were
  green. [Security-fix record](SIT_FASTIFY_BUSBOY_SECURITY_FIX_2026-10-03.md):
  only locked `@fastify/busboy` **3.2.0 → 3.2.1**; Firebase Admin 14.2.0 and
  package declarations unchanged, no override or suppression. Red-first floor
  guard now 4/4; frozen install, fresh production audit, complete Backend
  **2,251 pass/23 skip**, syntax, consumer **39/39**, secret/diff checks passed.
  This is an uncommitted local successor, not patched live runtime or green
  exact-head successor CI. Do not retry unchanged 244.
- **Critical disk incident — Sol cleanup/natural-health closure PASS:**
  [alert diagnosis](SIT_CRITICAL_ALERT_SPAM_SOURCE_MAP_2026-10-03.md) verified
  a real disk failure, valid cooldown/marker and roughly hourly delivery.
  Installed alert bytes matched; healthcheck bytes were older/different.
  [Exact cleanup record](SIT_DISK_RETENTION_SOURCE_MAP_2026-10-03.md): only ten
  prep/input directories plus verified Staging build `5d3b4261` removed after
  fresh guards; total 100,476,656 KiB, used 88,435,628 → 84,257,056 KiB,
  available 12,024,644 → 16,203,216 KiB, **89% → 84%**. Releases,
  current/previous inputs, evidence, backups and Green seals/images remained.
  Deletion has no filesystem undo; source/artifacts are reconstructible from
  exact Git commits/retained releases. Natural timer finished at
  `2026-10-03 01:30:15 UTC`, `Result=success`, `ExecMainStatus=0`, journal
  `ShareItToo health check passed`; following disk readback stayed **84%**
  (used 84,257,308 KiB, available 16,202,964 KiB). No forced check, mail send
  or cooldown/threshold change; observed incident closed, no future guarantee.
- **967 exact-head CI:**
  [Regression 37066632738](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37066632738)
  and [CodeQL 37066632784](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37066632784)
  completed **SUCCESS** for exact 967; all four required Regression jobs passed.
- **Live Staging Web — technical promotion PASS:** source exact 967, manifest
  `73202bfa3e6b30d0ba0e0b3445cc927c379796fcaaca540069fe224cffa4590e`, archive
  `e72e1ea5322632616c7a5e84ffdfccae4f8017c3ec8306a9983f5d1227935c2e`.
  One clean build, two smokes, seal, independent archive/extraction checks and
  one reversible Staging-only promotion passed. Static assets match manifest
  hashes with `no-store`; previous is c513/6d62474d and rollback preflight passed.
- **Unchanged runtime boundary:** API remains
  `6c0ef70db2656df3e378add858d5f5157388127e` in test. Before/after API version,
  one-row synthetic catalog and exact-origin CORS 204 readbacks were identical.
  Production root bytes/pointer and Caddy configuration were unchanged;
  no API, provider, payment or Play activation occurred.
- **Responsive browser acceptance — Sol PASS:** fresh live Staging checks at
  390x844, 768x1024, 1920x1080 and 3840x2160 render the dedicated synthetic
  illustration in the detail view, preserve the full synthetic disclosure and
  keep `Nicht buchbar – nur Katalogtest` disabled. Home and detail have no
  horizontal overflow. At 1920 and 3840 the home content stays centered within
  1,200 px and detail content within 920 px; the same detail geometry is stable
  at both desktop widths. Accessibility exposes the image as
  `Testillustration, kein aktueller Produkt- oder Zustandsnachweis`; current
  browser console warnings/errors are empty. The live anonymous image remains
  HTTP 200 `image/webp`, 1,172 bytes, SHA
  `d5b762e354eff48a5a8b744ce144ab9edafdc1c8a85be96ec6bf40a135ad04bf`.
  Synthetic truth, disabled booking and all provider/native/Mission boundaries
  remain intact.
- **Mobile layout source proof — included in deployed 967:** at 390 px the row
  has two complete 157.33 px cards plus 25% of a third, with a 320 px maximum.
  Synthetic cards have a 280 px disclosure/action height floor and no implicit
  margin that narrows the visible surface. Desktop content/detail bounds, synthetic labels,
  disabled booking and anonymous image opt-in remain intact.
  [Widget proof](../../test/catalog_responsive_layout_test.dart) observes actual
  visible geometry, unsplit title words with shipped Roboto glyphs and initially
  reachable title, full notice and action without scrolling the card. The matrix
  is 390×844, 768×1024, 1920×1080 and 3840×2160. The old 390 px layout fails
  the minimum-width assertion. Focused Flutter 40/40, changed-scope analyzer,
  current-consumer closure (451 assertions across 50 test files), privacy and
  retention validators, working-tree secret scan and diff checks passed.
  Reverse-binding discovery found exactly two mutable Explore bindings
  (privacy/retention); both were refreshed once after final source changes.
  Historical evidence and existing fail-closed approvals remain unchanged.
- **d2cc build/seal smoke PASS; compatibility FIX, not deployed:** one isolated
  exact-d2cc Web build and both loopback smokes passed; its retained manifest is
  `369c85c920fc008cec618e05404e6b701f1d7ee2efb6751dcb2d0d47a982e8e7`.
  The committed archive builder correctly refused five shipped CanvasKit WASM
  modes and then 16 USTAR-unrepresentable image names. That build is retained
  only as rejected compatibility evidence, never relabelled as a new candidate.
- **Archive repair — introduced in c513 and included in deployed 967:**
  [Node-only builder/readback](../../tool/staging_web_archive.mjs) preserves
  `0755` only for five exact manifest-bound, validated CanvasKit WASM paths.
  Canonical GNU LongName records are allowed only for safe manifest-bound paths
  that cannot fit USTAR; PAX, other GNU extensions, xattr/ACL/provenance metadata,
  links/specials, path ambiguity and inventory/mode/byte drift remain rejected.
  The unchanged complete d2cc artifact passed two identical archive builds,
  independent parsing, warning-free system-tar extraction and manifest/mode/hash
  readback: archive SHA
  `960403cb6630685d8d072e38ffe47022964b676e2d0da0b46efc7bb6b8429cf7`,
  87,505,408 bytes, 148 files, 18 directories and 16 necessary LongName records.
  Owning tests passed 207/207, archive tests 100/100; closure, syntax, privacy,
  retention and diff checks passed without changing approval state. No current
  source-inventory binding was affected. The d2cc artifact was not deployed;
  c513's separate exact-source promotion is recorded above.
- **Image policy successor — source/runtime/browser PASS:** exact string
  equality accepts only the dedicated storage name at the configured managed
  upload URL. It grants no listing-photo authenticity. Existing explicit public
  image surfaces send no credentials; private guest/default surfaces remain
  credential-gated and blank. Near names, encodings, query/fragment, alternate
  paths, foreign origins and arbitrary names remain rejected; UUID-full rules
  are unchanged. The 390px Explore-to-detail proof scrolls the intended grid
  action into view, asserts `hitTestable()` and taps it with missed-tap warnings
  fatal. The earlier warning-bearing tap is rejected evidence, not acceptance.
  Final exact two-file Flutter gate passed 15/15 with zero framework warnings
  or exceptions; wiring, analyzer and diff passed. The preceding focused
  functional gate and current-consumer closure passed. Only BackendConfig's
  current privacy binding was refreshed once; retention and historical evidence
  remain unchanged. Working-tree secret scan and privacy/retention validators
  passed. Exact-head CI, exact-source build/promotion and the fresh four-width
  browser matrix above close this successor.
- **Google Web auth — prerequisite diagnosis PASS; activation FIX:** fresh
  read-only Firebase Management and Identity Toolkit readbacks against the
  exact Staging-runtime project found zero registered Web apps and no
  `staging.shareittoo.com` authorized-domain entry. The Google provider is
  already enabled with client configuration present. Backend Firebase auth is
  enabled; service-account, runtime and native Firebase project bindings match;
  no auth emulator is configured. Runtime verifies exact audience and issuer,
  and the focused source cluster passed 9/9. Source popup/session handling and
  `/v1/auth/social` exist, but the current build profile intentionally keeps
  Google Web off and no real Web token was tested. The smallest missing provider
  package is exactly one Web-app registration plus only the Staging authorized
  domain, followed by sanitized independent readback; no flag activation or
  login belongs to that package. This access/security mutation is
  `GEMINI_GATE_REQUIRED:SIT-GOOGLE-WEB-PREREQ-01`. The visible Gemini tab is
  currently signed out at the correct account's passkey challenge. The remote
  phone cannot satisfy the cross-device Bluetooth-proximity route; no alternate
  login, gate send or accepted answer has occurred.
  Apple/Facebook stay off; account/session/MFA/allowlist gates stay authoritative.
- **Mission/Gemini boundary:** P6-A resolver stays synthetic/injected; P6-C2 stays
  default-off, with no real matching, region or provider effects. D3/D4 remains
  open with prior FIX. Per Sol UI handoff, the Gemini tab awaits a signed-in
  Pro Extended send; no new accepted answer exists. This gate does not block
  the source-only image policy successor.
- **P6-A safe revoke — already closed:** commit
  `7ef06f6e223d7d982b9ee206c3a4779da8054228`, already contained in 967,
  allows an owner under booking-only suspension to revoke the owner's released
  Mission demand while preserving account suspension, authentication, owner,
  revision, idempotency and default-off boundaries. Fresh focused recheck passed
  workflow/wiring 8/8 and the real PostgreSQL-16 HTTP matrix 1/1 with runner
  cleanup; privacy/retention, consumer inventory, syntax, secret scan and diff
  checks passed. No duplicate source change or hash refresh was made.
- **P7 source map — Sol PASS; no runtime claim:** P2 Mission need/revision is
  the existing durable root and P5 resolution revision plus slot is the existing
  component identity. P4 fit is strictly same-owner; a foreign P6 Shelf release
  has no P4 fit proof. P6 `released` is only purpose-/expiry-bound visibility,
  never acceptance, quote, booking or contract. Existing G3/G5 booking,
  handover/return, 4+4 evidence, QR-v3/six-digit fallback and dispute contracts
  remain owner- and booking-specific, and no authoritative Mission-component to
  Booking relation exists. Therefore P7-A1 adds only an unpersisted,
  unrouteable synthetic read projection with explicit `unknown`/`not_bound`
  axes and `bindingStatus: non_binding`; D1-D4 and all activation gates stay open.
- **P7-A1 dormant synthetic Quorum — Sol source PASS:** the pure projection
  binds the Mission root, current resolution revision, every component slot,
  authoritative listing owner, exact released/revoked demand history and the
  source digest before showing eleven separate lifecycle axes. Expired pending
  demand remains `expired_no_response`; explicit rejected/revoked decisions are
  preserved. Same-owner P4 Fit is never reused for a foreign P6 Shelf. Synthetic
  4+4 handover/return evidence, QR-v3/six-digit fallback and lifecycle fixtures
  remain visibly non-authentic and `non_binding`; missing or contradictory proof
  cannot become complete. The workflow owns a repeatable-read/read-only
  transaction and exposes its namespaced fixture adapter only under Node's test
  context. A structural test proves that runtime/app/routes/jobs/flags do not
  reference the package. Focused projection 16/16, runner 14/14 and PostgreSQL-16
  1/1 passed with byte-equivalent public tables and verified cleanup. The prior
  unchanged full Backend gate passed 1,928 tests with 23 regular skips and zero
  failures; syntax and diff checks remain green. No migration, route, real
  binding, provider call or combined payment was added.
- **P7-A1 exact-head CI — PASS:** Regression
  [37074425077](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37074425077)
  completed successfully at exact `0940f1dc`; backend, PostgreSQL-16,
  Flutter/Android and clean-checkout reproducibility jobs all passed. CodeQL
  [37074425086](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37074425086)
  also completed successfully at the same head. The publish job was correctly
  skipped; this is source/CI evidence, not deployment.
- **P7-A2a isolated synthetic Web presentation — Sol source PASS:** a
  versioned, whitelist-only display envelope revalidates P7-A1 and binds its
  projection digest plus all visible bytes. It exposes two distinct synthetic
  owners/components, eleven separate axes, exact four named pickup and four
  return slots, QR-v3 and exact-six-digit fallback metadata without exposing a
  usable code, authentic media or real identity. The Flutter decoder requires
  the independently supplied digest and principal, rejects malformed/real IDs
  and detaches caller data. Its disclosure remains permanently visible and
  states synthetic/non-authentic/non-binding/no-money truth. Missing 4/4,
  rejection, timeout, optional conflict and dispute isolation remain honest.
  Backend P7+A2a passed 23/23; VM and Chrome widget matrices passed 14/14 each
  at 390/768/1920/3840 px and text scale 1/2; the runtime/import boundary passed
  3/3. Analyzer, syntax, diff and working-tree secret scan passed. All six files
  live under `backend/test` or `test`; normal app, API, jobs, flags, builds,
  Staging profile, network and persistence have no P7-A2a dependency. This is
  accessible browser-test evidence only, not a public Staging page or activation.
- **P7-A2a exact-head CI — PASS:** Regression
  [37077345814](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37077345814)
  completed successfully at exact
  `02fa266529ff7a22acd75fb492f43d2e210dc35a`; backend, PostgreSQL-16,
  Flutter/Android and clean-checkout reproducibility jobs all passed. CodeQL
  [37077345875](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37077345875)
  also completed successfully at the same head. No publish or deployment
  evidence follows from these source checks.
- **P7-A2b local browser vertical slice — Sol source/runtime PASS:** the
  test-support-only runner accepts only the exact current source head and
  ephemeral port `0`, revalidates every bound P7-A2a byte before and after the
  build, derives an isolated minimal Flutter project from the committed lock,
  and builds under an OS-level network deny plus offline package resolution.
  It serves only from `127.0.0.1` with no-store/CSP headers and never imports a
  product bootstrap, plugin, provider, persistence layer or service worker.
  The runner matrix passed 9/9 and the unchanged runtime/import contract 3/3.
  Sol independently repeated the real build and browser review: the permanent
  synthetic/non-authentic/non-binding/no-money disclosure, two owners, eleven
  separate axes, exact 4+4 named slots, QR-v3, exact-six-digit fallback and
  reset were exposed through browser accessibility. Shutdown then emitted one
  cleanup record; listener port `55487`, runner/build PIDs and the owned temp
  root were independently absent. No product, Staging, Play or deployment file
  changed. This proves the isolated P7 VERIFY vertical slice only; D1-D4 remain
  open and no real Mission, provider or payment was activated.
- **P7-A2b exact-head CI and bounded P7 closure — PASS:** Regression
  [37079218795](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37079218795)
  completed successfully at exact
  `08636b6ce5cd1011fb3faf8458e5ae4daae0d460`; backend, PostgreSQL-16,
  Flutter/Android and clean-checkout reproducibility jobs all passed, while
  publishing was correctly skipped. CodeQL
  [37079218881](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37079218881)
  also passed at the same head. The requirement-to-evidence closure found the
  P7 objective, acceptance, exclusions and VERIFY clauses proven for the
  explicitly synthetic, non-binding and unrouteable scope: complete slots,
  separate owners/components, honest partial/timeout/replay/concurrency states,
  component-level pickup/return/dispute, isolated PostgreSQL error matrix,
  accessible 4+4/QR/six-digit Web slice and exact cleanup. This is not Staging,
  real-data, contract, provider, payment or pilot-release evidence. D1-D4 stay
  open.
- **D4 dormant threat/abort contract — Sol source PASS:**
  `mission_supply_safety_v1` is a pure, import-free and unrouteable recheck for
  one already released, request-bound demand. It binds the server-supplied
  requester/recipient, Mission and resolution revisions/digests/slot,
  participation and Shelf item revisions, demand/release state, expiry,
  bilateral-block result, rate-limit result and opaque support context. Missing,
  stale, mismatched, withdrawn, unconfirmed, duplicate, conflicting, blocked,
  rate-limited, revoked or expired evidence aborts in deterministic order.
  Even the positive internal result remains `non_binding`; the only public-safe
  shape is always `unavailable` and contains no identifiers, private media,
  location or reason details. The focused suite passed 191/191; syntax, diff,
  secret and no-consumer checks passed. The contract has no clock, randomness,
  storage, network, resolver, route, job, flag or provider use. It does not
  authenticate the origin/common snapshot of supplied verdicts and introduces
  no thresholds, retention period, legal basis, selection, contact, reservation,
  contract or payment. D3/D4 therefore remain open pending a fresh-source gate
  and any required professional review.
- **D4 exact-head CI — PASS:** Regression
  [37080972379](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37080972379)
  completed successfully at exact
  `d1f12132b0be20878cff1d69fea7264c25ca0995`; Backend, PostgreSQL-16,
  Flutter/Android and clean-checkout reproducibility all passed, while
  publication was correctly skipped. CodeQL
  [37080972375](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/37080972375)
  also passed at the same head. This is source/CI evidence only.
- **D1/D2 synthetic outcome contract — Sol source PASS:** exact source commit
  `5a3cd92290c029d0391d526dd58cf8703ea24348` adds only the import-free,
  synchronous and unrouteable diagnostic described in
  [its boundary report](SIT_MISSION_D1_D2_SYNTHETIC_ACCEPTANCE_OUTCOME_CONTRACT_2026-10-03.md).
  Independent focused verification passed 43/43 checks plus syntax, diff,
  secret and no-consumer checks. Planned request bindings are separate from
  observed effects: not-started, unknown/readback and no-effect states carry no
  booking, contract, payment or provider identifiers; only complete matching
  supplied positive observations may carry synthetic booking/contract IDs.
  All legal, Mission and payment statuses remain `not_determined`; D1/D2 remain
  open. The later exact-738 source CI is recorded above, not a runtime approval.
- **D1/D2 server-readback v2 — Sol source PASS:**
  [boundary and evidence](SIT_MISSION_D1_D2_SERVER_READBACK_CONTRACT_2026-10-03.md),
  focused **76/76**. Planned request, authoritative pre-existing context and
  observed effect remain separate shapes. Schema-native synthetic IDs,
  command/actor binding and exact Mission-slot association fail closed; missing
  association remains unavailable/unmapped. No DB, route, provider, effect,
  payment or retry authority; D1/D2 remain **OPEN**.
- **D1/D2 PG-readback gate packet — prepared, not sent:**
  [exact packet](SIT_GEMINI_MISSION_D1_D2_PG_READBACK_GATE_PACKET_2026-10-03.md),
  SHA-256 `c62d2fcba657e36d6c23844c8fdcaf2283569c1a1b552590f5d551797f9cb447`.
  It asks only whether a test-only, unrouteable read-only common-snapshot
  provenance reader may be built. Missing Mission-slot→command/booking relations
  stay unavailable/unmapped; no positive effect, legal/payment or retry inference.
  No Gemini answer or adapter implementation/activation is claimed.
- **Fresh D3/D4 gate packet — Sol packet PASS; not sent:**
  [SIT-MISSION-D3D4-SAFETY-02](SIT_GEMINI_MISSION_D3_D4_SAFETY_GATE_PACKET_2026-10-03.md)
  (`SHA-256 a60905feba13180ab47eaff1d7084d8e0103acd89134aa516af387831a04ae88`)
  binds six exact repository blobs at `d1f12132`, keeps D1–D4 open and asks
  only whether a still-dormant PostgreSQL origin/common-snapshot adapter may be
  built. Its official-source register records inaccessible GDPR/ePrivacy
  article reads as `NOT VERIFIED`; they cannot silently become a PASS. No
  Gemini access, answer, professional review, implementation or activation is
  claimed by packet preparation.
- **Google Web prerequisite gate packet — Sol packet PASS; not sent:**
  [SIT-GOOGLE-WEB-PREREQ-01](SIT_GEMINI_GOOGLE_WEB_PREREQ_GATE_PACKET_2026-10-03.md)
  (`SHA-256 8385e23481905fcaaab586f4e409624e19d60b418cf1ab904b3eac77d5c61985`)
  binds 19 immutable repository blobs and three separate installed-SDK
  snapshots to exact `d1f12132`, records six freshly opened official platform
  sources and passed 14/14 focused local source checks. It asks only whether
  one existing-project Web-app registration and the single Staging authorized
  domain may be added before sanitized independent readback. Current provider
  state remains `NOT VERIFIED`; packet preparation is not an A/PASS, provider
  mutation, login proof, activation or release.
- **Exact next:** Sol reviews the narrow Busboy lock/floor successor; only after
  the source fix may a new exact-head CI run close audit/R10. Then resume the
  paused source-only D5 measurement map. Disk incident remains closed; no more
  cleanup or alert-source fix. The D1/D2 source map, v2 envelope and PG gate
  packet are prepared. Do not implement
  or wire the PostgreSQL reader before its narrow gate. When the visible SIT
  Gemini account is signed in, verify exactly
  Google AI Pro `Pro` with `Extended`, then submit
  `SIT-MISSION-D3D4-SAFETY-02` with its exact supplied bytes. Only an A/PASS may
  permit the named dormant D3/D4 PostgreSQL adapter; B/FIX or C/BLOCK stays
  fail-closed. Separately refresh the sanitized provider/runtime identity and
  prerequisite state, then submit `SIT-GOOGLE-WEB-PREREQ-01`; only its PASS may
  permit exactly one Staging Web-app registration and only the Staging
  authorized domain, followed by sanitized independent readback before any flag
  activation or login test. Never conflate the two gates. D1/D2/D3/D4 stay
  open, and a blocked provider lane must not stop the independent source work.
  No Production/Play change or pilot-complete claim follows from this sequence.

## Historical snapshots — retained evidence, superseded execution state

## Parent objective addendum — SIT Mission / Blue Ocean — 2026-09-30

The authoritative top-level objective is the
[SIT Mission Masterplan](../product/SIT_MISSION_MASTERPLAN_2026-09-30.md).
Staging Web/CORS and safe two-role synthetic catalog QA remain **Phase 0**,
with separate source/runtime evidence and unchanged safety gates. They support
the Mission goal; they do not replace or close it. After Phase 0 closure, resume
the masterplan at **P2 — dauerhafter unverbindlicher Missionsbedarf**.
Preserve the historical phase/readiness records below without treating their
older ordering or status as current authority. Keep execution autonomous inside
the authorized package; involve Walid only for unavoidable physical actions.
Use Gemini only for narrow, named critical gates bound to current sources.
No new live/provider/payment/Production/Play authorization follows.

## Web-first pilot execution addendum — 2026-09-30

Walid changed the active execution order on 30 September 2026. Routine product
changes are no longer uploaded to Google Play one by one. The active bounded
package is now the closed **Staging Web Pilot**:

- build the accepted ShareItToo Flutter source as a browser client bound to
  `https://staging.shareittoo.com/api/v1`,
- serve it from `https://staging.shareittoo.com` behind the existing Staging
  access and no-real-money boundaries,
- use that browser surface for fast iterative UX and functional acceptance,
- keep `https://shareittoo.com`, Production and Google Play unchanged during
  ordinary iterations,
- use direct Android QA only for native behavior that the browser cannot prove,
  especially native provider login, push delivery, Android permissions,
  camera/QR behavior, installation and update compatibility,
- create and upload a new Play candidate only after Web acceptance plus the
  required native checkpoint are complete.

This addendum supersedes the Android/Play-first ordering in the older “Exact
next sequence” paragraph below. It does not relax any pilot rule, release
truth, security, privacy, legal, payment or data-integrity gate.

Current verified baseline for this package:

- clean branch `codex/master-workflow-20260808` at
  `8a90ec61fbe2a0c67265191809ddf332dd26a6b4`, aligned with its remote,
- exact-source Flutter Web release build passed locally with the Staging API
  binding and the current closed-pilot feature profile,
- the repository Web smoke passed on a loopback-bound ephemeral port,
- the complete local technical regression passed with exit 0 on 30 September
  2026, including the full app suite, a fresh Web release build/smoke and the
  Android debug build; exact-HEAD GitHub and live Staging evidence remain open,
- Staging API readback reports exact commit `8a90ec61…`, environment `test`,
  memory-only payment, `STRIPE_LIVEMODE=false` and no external Listing-AI
  execution,
- `shareittoo.com` still serves the older public Web/Production state, while
  the Staging root still returns only the gateway placeholder; neither was
  changed by this decision.

Exit criteria for the active package are a reversible exact-source Web
deployment, a Staging-root/browser readback, focused functional acceptance,
an explicit browser/native capability matrix and a compact next-package
capsule. A Web PASS is not Android or Play proof.

## P4 closure addendum — 2026-09-25

P4 Green Staging promotion/readback is **CLOSED — technical PASS only** for
runtime `c2da8585b1f822e123307d7c763530dc0f598893` and image digest
`sha256:cb7f92814225044a677106d9979b95bc7d019a549ca223228c17bd281a2b97d8`.
The older `2026092205` P3 paragraph below is superseded for this P4 closure by
this exact c2da-bound runtime evidence.
Ops commit is `928861bd4cfd080f90463d0445d59810c3280ad2`; the target digest is
`585422e5880147459571a1ca8bbae7a586987b9c08f745334fdb7d491f8d6b84`.
Schema `97`→`98` and the exact migration/ledger readbacks are recorded in the
closure evidence. Attempts 01 and 02 failed before mutation with verified
cleanup; attempt 03 succeeded. Four seals are stopped, no transient resources
remain, and the payment-safe baseline is `memory`/off/`on_device`. P5 is
active and available; P6 is blocked on successor/source truth. No
provider/payment, legal, pilot or production claim follows.
See `docs/operations/P4_GREEN_STAGING_CLOSURE_2026-09-25.md` and
`docs/evidence/release-readiness/p4-green-staging-closure-20260925.json`.

The currently healthy exact-c2da runtime is `e08a420f…`; FCM is the sole
environment delta (`memory` → `fcm`). Controlled activation evidence is the
private remote artifact
`/docker/shareittoo/evidence/green-fcm-activation-c2da-20260925T214445Z.json`
with SHA-256 `7c2f18da3fdd1c618c7788a3634b518ed51995693dbe4cc0a78ac2613cd26e2e`;
the retained pgdump begins `9b0b8201…`. Schema `98` and ledger `796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196`
are unchanged; payments, mail and identity remain `memory`, with zero real
money, and a stopped rollback seal exists. A transient `502` from an erroneous
preflight deletion was recovered by reconstructing the same c2da Memory
runtime; controlled FCM activation then passed with no data, schema or ledger
change.

This file is the compact entry point before large status histories. It records
the current source-bound runway and the next bounded gate; it does not replace
historical evidence or grant any external, legal, provider or release approval.

## Current synthetic clone-lane successor — source PASS; external gates open

The accepted package on branch `codex/master-workflow-20260808` binds the
normal Play successor `1.0.0+2026092902` and the strictly intermediate
local-QA build `2026092901`, above the installed Play baseline `2026092803`.
It contains a local-QA-only successor for the synthetic non-binding full-booking lane. The
loopback-only internal build flag is fail-closed, the persistent notice is
exactly `Synthetischer Test – keine vertragliche oder finanzielle Wirkung`, and
the clone path covers two run-scoped roles, requested→accepted→active→returned,
four named pickup plus four named return photo slots, QR-v3, exact six-digit
fallback, audit/status readback and verified cleanup. Normal/Play behavior is
unchanged when the flag is false; the lane has no contract, payment, payout,
review, ranking, reminder, notification or provider effect.

Local source evidence is green: focused Flutter `8/8`, backend clone `8/8`,
physical-runner contract `10/10`, Android build tooling `34/34`, full Flutter
regression, full analyzer, backend `1375` pass / `15` skip / `0` fail,
privacy/retention/current-consumer closure, dependency audit and working-tree
secret scan. No successor release artifact or external proof is bound to this
source state. Physical workflow execution,
CI/GitHub, Green/Staging, and Play Internal/Store gates for this successor
remain **OPEN** and must not be inferred from the source checks.

## Fixed phases and exit criteria

1. **P1 — Source convergence**
   - Close known source packages first, in dependency order.
   - Exit only when the owning focused clusters are green, current source
     bindings and manifests are refreshed, and exactly one final full gate is
     ready to run.

2. **P2 — Exact-HEAD push, Regression and CodeQL**
   - Push only the accepted clean exact HEAD.
   - Exit only with exact-HEAD GitHub Regression and CodeQL evidence; local
     green tests alone do not close this phase.

3. **P3 — Fresh higher Android candidate**
   - Read the highest current Play versionCode freshly, then choose a strictly
     higher candidate from the accepted source state and bind its artifact and
     manifest hashes. The existing `2026092203` candidate is expected
     deferred P3 evidence, not a P1 source blocker; never assume it is an
     exact-HEAD candidate.
   - Exit only when the candidate identity is fresh, reproducible and the
     prior-candidate manifest is no longer stale.

4. **P4 — Green Staging, readback and sandbox/provider E2E**
   - Verify Green Staging against the exact candidate, then perform bounded
     readback and the approved sandbox/provider E2E checks.
   - Exit only with exact runtime/source readback and separately labeled
     deterministic, sandbox and provider evidence; no live claim is inferred.

5. **P5 — Play Internal**
   - Use the exact candidate in the Internal track with the required account,
     artifact and rollout evidence.
   - Exit only after the external Play state is freshly read back; repository
     evidence cannot substitute for Play evidence.

6. **P6 — Pixel/OnePlus two roles**
   - Run the bound renter and owner role matrix on Pixel and OnePlus against the
     exact candidate.
   - Exit only when both device/role cells have their required evidence and all
     unresolved cells remain explicitly fail-closed.

7. **P7 — Completion/Pilot**
   - Reconcile all source, runtime, provider, device and owner gates.
   - Exit only with a current pilot decision and no hidden external, legal,
     security, payment or release blocker. No phase label is a professional or
     owner approval.

## Active capsule

- Branch: `codex/master-workflow-20260808`.
- P1 Source convergence: **CLOSED** for the accepted source package and its
  focused closure evidence.
- P2 Exact-HEAD CI: **CLOSED** at clean HEAD
  `c2da8585b1f822e123307d7c763530dc0f598893`; GitHub Regression run
  `36183779963` and CodeQL run `36179682061` both succeeded on that exact
  head.
- P3 candidate: **ACCEPTED and VERIFIED** as `1.0.0+2026092206`, source
  `c2da8585b1f822e123307d7c763530dc0f598893`, internal/Staging, full closed
  pilot envelope `heilbronn_wave0`, G3/G4/G5 technical surfaces enabled, and
  Google-only social auth (`Google=true`, `Apple=false`, `Facebook=false`).
  External Listing AI remains disabled.
- Candidate artifact evidence: archive basename
  `2026092206-c2da8585b1f822e123307d7c763530dc0f598893`; AAB
  `139603858` bytes / SHA-256
  `d6562effaade3e580e4e35b118252040d8080ea21742852e0f54a4736a01932e`;
  APK `201763203` bytes / SHA-256
  `9c3b5ca942471a634498af406c7958a98832a993428619e57c9afe9bcbf465b7`;
  privacy report SHA-256
  `860f33280d4a0aaa5cbc4ec990070e84c80a6f25ae22e7953e052b2f45533163`;
  upload certificate SHA-256
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- P5 Play Internal: **ACTIVE and VERIFIED** for release id `29`, VersionCode
  `2026092206`, status `Available to internal testers`, and the unchanged
  `SIT interner Test` list with 2 users. The temporary app name is
  `com.shareittoo.app (unreviewed)`; the internal-test join link is available.
  A sanitized Pixel readback verifies Play-installed package
  `com.shareittoo.app` `1.0.0+2026092206`, installer `com.android.vending`,
  and split delivery; no serial or raw device identity is retained. No tester
  change, provider, production, payment, DNS, Firebase or pull-request
  mutation is claimed.
- P6 Pixel/OnePlus and exact listing-AI truth: **BLOCKED; SUCCESSOR REQUIRED**.
  The exact-2206 physical listing-AI PASS was not achieved; the runner exposed
  a real app-route loss during same-session token rotation and photo-picker
  handling. The source fix is uncommitted and a strictly higher successor is
  required, so 2206 is not claimed fixed. Defer the core Pixel two-role rerun
  to that successor. OnePlus exact-current physical proof is pending and the
  user device is absent.
- Candidate `2026092203` remains stale/deferred P3 evidence and is not reused.
- The first `2026092204` build attempt stopped before archive/evidence because
  social flags were omitted. No archive and no
  `build/release-evidence/android-2026092204` were created;
  that stopped attempt did not consume an artifact and is not a candidate.
- A later reduced-profile signed `2026092204` archive was created and is
  rejected as a noncandidate because `closedPilotEnvelope=false`, the pilot ID
  was empty, and G3/G4/G5 technical surfaces were disabled. Retain it privately
  for audit only; it was never uploaded, activated, installed or used for
  device/live evidence.
- Gemini listing-confirmation gate: **closed — Decision 1 / PASS** in
  `SIT_GEMINI_LISTING_CONFIRMATION_GATE_PACKET_2026-09-23.md`. The
  `LISTING-CONFIRMATION-1` package remains bounded and `final_publication` is
  false until an exact publish action.

## Exact next sequence

P4 Green Staging promotion/readback is closed by the 2026-09-25 technical
closure addendum, and P5 Play Internal is active and available from the fresh
console readback. P6 remains the next bounded phase but is blocked until the
strictly higher successor is built and verified. Repository evidence does not
claim 2206 fixed, OnePlus completion, provider traffic, legal approval or pilot
completion.
