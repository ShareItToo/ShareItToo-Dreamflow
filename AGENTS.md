# ShareItToo Repository Guidance

## Scope and authority

This file applies to the entire repository. Follow the newest explicit Walid
decision for the specific subject, then `docs/current_work_package.md`,
`docs/current_state.md`, validated machine-readable manifests, and versioned
architecture/operations evidence. Treat the root `architecture.md` as a
historical prototype snapshot.

Work on one bounded package at a time. A green package may continue only within
the currently authorized runway. Stop on contradictory evidence involving
money, contracts, privacy, security, release truth or user data.

## Context and credit efficiency

`docs/operations/SIT_CODEX_CONTEXT_CREDIT_EFFICIENCY_RULES_V1.md` is the
binding efficiency policy. Carry only the active package capsule forward,
search before rereading large sources, avoid unchanged duplicate gates and
retain all audit evidence. Efficiency must never weaken deterministic tests,
exact-HEAD CI, security, legal, privacy, data-integrity or release boundaries.

Before every SIT turn, read
`docs/operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md` as the compact entry
point. Read larger status histories only when a concrete discrepancy requires
them; do not reconstruct the project from historical files by default.

When a package changes a source file bound by privacy, retention or another
current source-inventory manifest, refresh every affected current manifest
once after the final source merge and before the first push/full regression.
Run the fail-closed consumer-closure check before CI; never spend a CI run to
discover a mechanically stale source hash.

- Frozen source-bound evidence must not be reinterpreted by later mutable
  validator schemas. Verify its recorded exact validator/source digests or run
  the validator from that captured snapshot; never rewrite historical evidence
  to satisfy the current schema.

## Sol, Luna and Gemini review loop

- Luna executes one bounded package and returns useful evidence, not a claim of
  perfect completeness. Sol performs a targeted review and records exactly one
  decision: `PASS`, `FIX` or `GEMINI_GATE_REQUIRED:<gate-id>`.
- Sol is also the mentor. At the first recognized avoidable error, closure
  omission, unsafe assumption or wasteful reasoning pattern, stop it before a
  second occurrence. Sol gives one direct corrective rule and updates the
  nearest authoritative instruction. Add a deterministic test, validator or
  fail-closed guard when the pattern is technically enforceable. Duplicate UI
  output or repeated reporting of one still-open incident remains one finding.
  Repeat-promotion pre-state contracts must derive from the last verified final
  runtime shape, not a stale first-promotion source shape; deterministic tests
  must assert the exact live tuple and reject extra, missing or changed mounts.
- Recovery mutations must target the captured immutable provider/container ID,
  never a mutable name; stateful test executors must model or explicitly reject
  every accepted security/resource option.
- Live-tool mentor invariant: after the first fail-closed live-tool defect,
  restore the affected service first, then reproduce it in an isolated,
  production-shaped deterministic test, review the fix and re-gate it with
  Sol before re-execution; use Gemini only for a separately defined critical
  gate. Never blind-retry the live tool.
- Shell variable hygiene: in zsh never assign `path`, `PATH`, `fpath`, `cdpath`
  or another shell-special array or option as a task variable. Use a
  task-specific name such as `sit_route`; after variable shadowing causes
  `command not found`, discard that snippet and rerun only with the verified
  task-specific name.
- Mutating Ops-runner invariant: a runner is not ready for live execution until
  a deterministic command-executor test drives its generated plan with
  production-shaped readbacks through the point immediately before the first
  irreversible phase; helper- or plan-shape-only tests are insufficient.
- Gated acceptance-runner invariant: derive every exact synthetic principal ID
  before the first data mutation and preflight those IDs against the configured
  access gate and every enabled payment-pilot gate; never use wildcard or
  post-mutation allowlisting. For memory-payment acceptance, missing or
  incomplete `PAYMENT_PILOT_USER_IDS` is a fail-closed preflight error.
- Cleanup evidence must follow the product's declared retention contract, not
  an invented row-retention expectation. Revoked or expired credential rows
  such as `staff_elevations` are expected to be purged; preserve and verify the
  corresponding append-only audit event instead of recreating credential
  material or treating its removal as evidence loss.
- Deployment executor context invariant: dependency-bearing steps must execute
  in the declared runtime image, UID, network and mounted-file context; tests
  must not mock away host/runtime/network assumptions that the live command
  depends on.
- Read-only mount composition invariant: never plan child-file bind mounts
  beneath a read-only parent-directory mount. Before execution, construct one
  merged directory containing every consumed file (without symlinks), record
  its exact source commit and SHA256 manifest, then mount that directory once
  read-only; verify the merged files in the exact runtime context before the
  first mutation.
- A derived runtime env file must pass the exact candidate image's real config
  import before the first service start. Preserve each setting's accepted
  encoding from verified runtime state; never guess that `false` and `0` (or
  `true` and `1`) are interchangeable.
- Provider-isolated clone transport must not rely on a published host port from
  an internal-only Docker network. Prove health inside the exact container,
  require empty host port bindings, inspect its run-scoped internal IP, and use
  that immutable readback only as the remote target of an SSH loopback tunnel.
- Remote read-only invariant: read-only remote work permits zero writes,
  including temporary, scratch or evidence files; use stdout or command
  substitution only and never write through a remote shell.
- Remote execution preflight: before a remote package install or runner,
  verify host tool/runtime versions, package engine requirements and imports;
  reuse a verified isolated runtime rather than changing the system runtime.
- Idempotent startup/readiness polls must retry transient resets and empty
  replies as well as refused connections, with bounded retries; never broaden
  retry behavior onto mutating requests.
- Unauthenticated operational probes must target paths explicitly allowlisted by
  the access gate; focused tests must cover the enabled/valid gate matrix and
  reject nearby protected paths.
- Public-gateway operational probes must bind the complete external gateway
  prefix and path (for example `/api/version`); tests must assert the full URL,
  while authenticated product calls remain bound to `/api/v1/*`.
- Restricted provider lanes must use least-privilege API reads; bind account
  identity from trusted lane configuration and session creation, not an
  account-wide verification read requiring broader permissions.
- Calendar-bounded lane tests must inject a fixed clock through the production
  function boundary; never weaken or extend the runtime authorization window to
  keep expired fixtures passing.
- Provider readback after authorization rotation must bind historical proof to
  the immutable persisted run authorization/config revision; the current
  authorization remains the access gate but must not invalidate an already
  bound pending or paid run.
- Parallel old/Green staging resources require an explicit evidence-bound CLI
  target; diagnostics must never fall back to a legacy resource name.
- Operational forbidden-name checks must use identifier boundaries/tokens, never
  arbitrary substrings over absolute paths; preserve explicit exact legacy
  resource checks alongside the boundary check.
- After validating a private backup or snapshot, reuse the same stable
  descriptor/bytes for the consuming operation; do not reopen its path. Evidence
  files must serialize once, then use those exact bytes for exclusive write,
  byte count and digest.
- Full commit identifiers recorded in evidence must come directly from an exact
  `git rev-parse` or immutable runtime readback and be passed unchanged into the
  writer. Never manually expand or infer a 40-character SHA from a short prefix.
- Database-row decoders must test actual `pg` runtime types before live
  acceptance: `timestamptz` arrives as a JavaScript `Date` while `date` remains
  a string; canonicalize trusted row values at the decoder boundary and fail
  closed on invalid dates without weakening external request validation.
- Security-sensitive/private-file checks must bind metadata and bytes to the same
  `O_NOFOLLOW` descriptor/handle; never `lstat`/`stat` a path and reopen or read
  it by path afterward, and fail closed when stable opening or metadata
  validation fails.
- Remote alias mentor invariant: after an alias or DNS failure, read the exact
  saved SSH configuration and authoritative project source before concluding
  that remote access is unavailable; test only the verified saved alias. A
  guessed alias is not a blocker.
- Time-bounded optional provider authorization may fail closed only for its own
  lane; an expired authorization must not prevent API startup or restart.
  Future, overlong or malformed authorization configuration remains a hard
  validation error and requires deterministic restart/config coverage.
- Missing operational config or a project secret is not an owner blocker when
  authorized runtime state can be reconstructed server-side or a missing key
  can be atomically generated in the approved external directory; exhaust that
  safe path without exposing values, escalating only an unavoidable physical act.
- Acceptance runner stdin invariant: commands without input use ignored stdin;
  every piped-input command installs stdin error/close handling before writing,
  and a deterministic early-close regression is required before live use.
- A visible-function P0/P1 requires proven reachability from a current route or
  configuration. Unreachable legacy/dead code is tracked separately and is
  not itself a release blocker until reachability is demonstrated.
- Never use `orElse: collection.first`, `.first`, `.single` or an equivalent
  element fallback on an async, remote or mutable collection unless emptiness
  was handled first. The empty/loading state must be deterministic, truthful
  and covered beside the populated state in the focused test.
- Any persisted media URL must be server-bound to an owned, approved upload
  row (including purpose, visibility and content-scan status). Client-side URL
  validation is never authorization; reject unowned, malformed, thumbnail,
  wrong-purpose or unapproved references before persistence.
- After every review, Sol assigns Luna the next bounded task. A `FIX` must name
  the failed assertion and expected proof; it must not request a broad restart.
- Authentication failure counters and lockouts must be proven committed even
  when the HTTP response is an error; never rely on a rolled-back exception
  path. Critical authentication changes require HTTP contract coverage plus
  real PostgreSQL transaction/integration coverage; mocked query tests alone
  are insufficient.
- Escalate to Gemini only at a named gate involving contradictory evidence or a
  material decision in money, contract, privacy, security, release truth or
  user data. Use the visible ShareItToo Gemini thread in Google AI Pro mode
  `Pro` with `Extended` thinking; never route these gates to Astra. Gemini is an
  AI reviewer and cannot replace professional or owner approval. Technical
  incompleteness stays with Luna under `FIX`.
- Immediately before every Gemini send, read back the visible mode selector and
  require exactly `Pro` plus `Extended`. If Pro is quota-blocked or the selector
  shows Flash, Flash-Lite or another mode, do not send or accept that answer;
  wait for Pro availability and retry the unchanged gate without substituting.
- Before every gate answer, Gemini must freshly open every decisive source and
  verify its currentness. For law use the current consolidated official text
  and check amendment and effective dates; for product, account, provider,
  repository and runtime facts check the current live state or exact commit.
  Cite the direct source plus version or effective date and access date.
- For German federal law, Gemini must read the live full-text header on
  `gesetze-im-internet.de` and record its current full citation and last-
  amendment date. A remembered date, search snippet, section-only page or
  citation that conflicts with that header invalidates the whole gate answer
  and requires a fresh re-gate; its prior `PASS` must not be carried forward.
- End every Gemini gate answer with a complete source register for every source
  actually used: title or issuing body, direct URL or exact repository/Drive
  path, publication/version/effective date, access date and the supported
  claim. Never invent a citation or list an unopened source as evidence.
- A Gemini Workspace citation chip or bare attachment filename is not a source
  locator. Every Drive source needs its exact `drive.google.com` URL or a
  verified full Drive path in the register; otherwise the gate is incomplete
  and cannot pass.
- Treat undated, cached, draft, historical, prior-AI, screenshot-only and older
  Drive claims as stale until currentness is proven. If freshness cannot be
  verified, label the point `NOT VERIFIED` or `STALE` and never return `PASS`.
  When sources conflict, identify which current source supersedes the older
  one. Every Gemini `PASS` self-check must include source freshness, version or
  effective date and a contradiction scan.
- Team handoffs use four short fields: `RESULT`, `EVIDENCE`, `BLOCKER`, `NEXT`.
  Add detail only when Maximus/owner action, safety or regulated risk requires
  it. Never compress away a decisive error, version, hash, source or gate.
- A delegated Luna turn must not end silently. If the package is unfinished and
  no named gate blocks it, continue the same package. If execution must stop,
  return the four-field capsule with the exact preserved paths and next command;
  an idle/completed turn state alone is not a valid blocker or handoff.
- Do not block the executor turn with `gh run watch` while another independent,
  already assigned source package can proceed. Sol owns lightweight CI polling;
  Luna returns to an exact failing assertion only if that poll reports red.
- Before coordinate-based device UI input, reread the current hierarchy and
  bind the action to the target's current bounds and the active scrollable
  viewport. After one no-op or unexpected screen, reread state and correct the
  mechanism; never repeat unchanged blind taps or out-of-bounds swipes.
- Negative authentication-matrix checks and physical-device smoke must not run
  in the same login-limiter window for the same client class. Let the natural
  window expire and use the server's existing reset semantics; never clear a
  limiter through a restart, proxy/IP/authority change, bypass, or policy
  relaxation.
- Runtime evidence must follow the product's actual state partition (for
  example active listings versus drafts) and prove the expected tab, route and
  post-restart value. Evidence from a neighboring tab or a backend-only write
  cannot close an explicitly required app projection or edit gate.
- Store/runtime recency invariant: before naming the active Store build,
  provider state or deployed runtime as a cause, take a fresh authenticated
  console/runtime readback. Historical release evidence is provenance only and
  must never override a newer live observation.
- Runtime ownership mentor invariant: never invent numeric UID/GID values for
  overlays, secret files or persisted volumes; verify the exact candidate image
  `USER` and resolved UID/GID, plus persisted-volume ownership, from readback
  before deployment.
- Immutable release identity invariant: Green deployment env files must not
  carry `APP_VERSION`, `APP_COMMIT` or `APP_BUILD_TIME`; `assertGreenRuntimeConfig`
  must reject those keys before any command or quiesce, and `/version` must bind
  the immutable image/runtime identity.
- Green evidence-family invariant: before any Green command or quiesce, preflight
  the exact final evidence JSON and every derived artifact (`.pgdump`,
  `.isolated.env`) as one reserved namespace; any existing or unsafe member is
  a fail-closed collision. Each attempt uses a fresh immutable base and never
  reuses a retained backup namespace; exclusive writes remain the race guard.
- Green Docker env-file invariant: `docker --env-file` may receive only the
  protected real `config.envFile` or the generated `.isolated.env`; a JSON
  config/target manifest is descriptive input only and must never be passed to
  Docker. Deterministic command tests reject JSON env-file sources before any
  mutation.
- Green control-runtime executable invariant: enumerate the executables in the
  generated Ops command plan (including `bash`, `docker`, `curl`, `node` or
  `sh` whenever the plan uses them) and preflight their availability in the
  external control runtime before quiescing Green, creating backups, or any
  other mutating command. A missing executable is a fail-closed preflight
  result, never a mid-promotion spawn failure.
- Authenticated capability handshakes are principal-bound state: bind every
  effective provider/disclosure/policy/config field into the request hash, make
  config revisions a digest of the effective configuration rather than a
  static gateway label, and after every async refresh perform an authoritative
  owner check before mutating UI state; stale responses invalidate the owned
  route and never trigger an automatic retry.
- Any client-source change invalidates previously built or installed APK
  evidence. Before the next device assertion, build once from the current
  source, assign a distinct local-QA version, verify package and SHA-256, and
  install that artifact; never continue runtime proof with a stale binary.
- A QA package name and version do not prove its compile-time configuration.
  Build through the canonical lane or record every required Dart define, then
  prove the running app reached the intended local API before using feature
  evidence. A debug build with default backend flags is not local-QA proof.
- Bind every package command to the repository root verified in its preflight.
  After any missing-workdir or wrong-worktree error, discard that stale path
  immediately and use only the verified root for the rest of the package; do
  not retry a path inherited from an older task or chat.

## Project-safe handoffs

- Before every handoff, message, automation or task routing action, identify the
  exact target project from verified context. A host, computer or device is not
  a project and must never be used as a substitute for one.
- Never send a task, chat follow-up or automation into another project. Create
  a new Codex task only when Walid explicitly requests a new task.
- If the target project is unclear, do not delegate. Ask Walid through the
  established Maximus channel using a content-light message with no secrets or
  project details; if that channel is unavailable, ask in the current chat.
- If work was misrouted, stop only the wrongly routed work and perform the
  smallest safe cleanup. Do not disturb unrelated tasks, projects or evidence.

## Non-negotiable boundaries

- Do not reset, rebase, squash, force-push, delete branches, rewrite history or
  discard work. Preserve a verified rollback before any integration choice.
- Do not change production, VPS/OpenClaw/Maximus, DNS, cloud billing, repository
  visibility, live payment mode, stores or public rollout without a dedicated
  gate.
- Before any production container recreate or Hostinger deploy, read
  `docs/operations/SIT_PRODUCTION_RECREATE_GUARD_2026-09-10.md`, prepare a
  sanitized plan and pass
  `node tool/validate_production_recreate_plan.mjs <plan.json>`. Never use
  `shareittoo-api:local`, `latest` or another unverified image fallback. After
  success or abort, reread website, API, database, mail, containers, disk,
  backup freshness, the Health service/timer and one automatic Health run.
- Do not invent operator, register, provider, tax, legal, privacy, retention or
  approval facts. Existing draft/open/blocked states remain fail-closed until
  their named authority approves them.
- Never expose, commit or copy secrets, signing files, Firebase configuration,
  account identifiers or raw device identifiers into reports or evidence.
- Routine tests must not send real email, SMS, push, payment, KYC or other live
  provider traffic.
- Synthetic PEM or credential markers in tests must be assembled from separate runtime fragments; a baseline is never their replacement and may review an exact immutable historical finding only after its marker has landed in history.
- Germany/private-adult pilot boundaries remain active: no vehicles/transport,
  paid delivery, shipping, express, deposit, SIT insurance/protection, real
  money, ads, marketing analytics or external generative AI.
- FCM is transactional only. Crashlytics requires its own voluntary choice.
  General Firebase Analytics remains off.

### Listing helper truthfulness (WP195)

- Automatic listing paths (typing, debounce, widget initialization and rebuild)
  use bounded local rules or cached data only; they must not call an external
  provider or claim model/market evidence.
- A provider-backed listing action is allowed only after an explicit user
  action, through one authenticated server endpoint with typed fields,
  in-flight deduplication/idempotency and server-side budget/rate limiting.
- Local rule output is always labelled as rule-based orientation. It is not a
  market-price estimate and never proves provider execution.
- Synthetic acceptance fixtures must import canonical domain policy constants,
  preserve their required field cardinality, and never duplicate legal/policy
  strings in runner payloads.

### Candidate version binding

- Every Android candidate bump updates `pubspec.yaml` and the V5.2
  `PrivatePilotConfig.v52ClientBuild` fallback atomically. Release preflight
  must fail before any binary build when those values drift; never repair the
  mismatch by reusing or rebinding an already archived candidate.
- An Internal/Staging candidate rollover (`SIT_ALLOW_CANDIDATE_ROLLOVER=1`) must
  explicitly bind the complete private-pilot profile before Firebase,
  preflight or artifact work: Google=true, Apple=false, Facebook=false,
  Blue Ocean=true, `SIT_CLOSED_PILOT_ENVELOPE=true`,
  `SIT_STAGE_A_PILOT_ID=heilbronn_wave0`, and
  `SIT_REQUIRE_STORE_SUBMISSION=false`,
  `SIT_REQUIRE_CANONICAL_SIGNING=true`, and `SIT_REQUIRE_FIREBASE=true`.
  Omitted or reduced profile values are hard failures; a reduced archive is
  never a candidate.
- Isolated-worker tasks must verify the worktree root, branch and HEAD before
  the first mutation and must never commit or revert in the canonical checkout.
- Current-candidate validators must resolve
  `store/google-play/current-rollover-candidate.json.candidateManifestRef` to
  the exact canonical in-repo versioned manifest, then bind its build and
  source fields; never hardcode a historical rollover manifest path.

- Play-delivered Android installations may contain bounded base/split APK sets;
  device-update and runtime-diagnostic preflight must inspect every installed
  split signer before a data-preserving update or exact-candidate claim. Exact
  Play-installed truth requires the version, Play installer, bounded split set,
  and the canonical Play app-signing SHA-256 (never the upload certificate).
  Never assume a single APK, and fail closed if PackageManager cannot replace
  a split install with the exact candidate.

### Fail-closed validator complements

- When a fail-closed validator gains a newly allowed exception, it must still
  inspect the complete relevant inventory and include a deterministic negative
  complement test that rejects an additional non-allowed path or case.

## Repository map

- `lib/`, `test/`: Flutter client and tests.
- `backend/src`, `backend/sql`, `backend/test`: Node API, PostgreSQL schema and
  backend tests.
- `tool/`, `scripts/`, `test/tool`: fail-closed validators, release tooling and
  their regression tests.
- `store/`: machine-readable Store, privacy, legal, retention and device state.
- `docs/architecture`, `docs/operations`, `docs/compliance`, `docs/evidence`:
  versioned design, runbooks and sanitized evidence.

## Change workflow

1. Confirm the real checkout, branch, HEAD, remote relationship and working
   tree before editing.
2. Read only the active package inputs and inspect nearby code/tests before
   changing behavior.
3. Keep changes narrow and reversible. Add or update a focused regression for
   behavioral fixes.
4. If a file listed in a `sourceInventory` changes, update every exact binding
   for that path to the file's SHA-256 and run the associated validators. Before
   the first package commit, compute the complete reverse-binding closure and
   update it once in dependency order; do not create serial inventory-refresh
   commits for dependencies that were discoverable up front. A hash refresh
   never authorizes changing legal/privacy claims or approval state. If the
   closure is cyclic or self-referential, redesign the binding instead of
   chasing hashes across commits.
   Mentor/source-binding ratchet: mutable current inventories may be refreshed
   only against the current source they intentionally bind; historical evidence
   snapshots are immutable and must never be rewritten or rebound. Historical
   source hashes must be verified from the exact recorded Git commit/blob, with
   no worktree fallback, and a missing commit/blob is a hard failure.
5. Run focused checks first. Run the complete technical regression at package
   and release gates.
   Focused regression tests must exercise their intended branch under the
   repository's standard runner; do not rely on an unrecorded dart-define,
   environment flag or local-only invocation. Test-only seams may inject a
   deterministic dependency, but the default command must pass and prove the
   behavior it names.
6. Use `git add -- <confirmed paths>` only. Review the staged diff and never use
   add-all. Push only fast-forward to the intended branch; do not merge PR #7
   unless separately authorized.
7. Record status, behavior, tests, migrations, risks, rollback and the next
   package/gate in a concise handover.

## Verified toolchain and checks

- Flutter 3.41.7 / Dart 3.11.5 and Java 17.
- Backend Node >=22 with pnpm 11.16.0 and the locked dependency graph.
- Focused Flutter: `flutter test <test paths>` and
  `flutter analyze <changed Dart paths>`.
- Backend: from `backend/`, run `pnpm test` and `pnpm run check`.
- Full gate: `SIT_ALLOW_CANDIDATE_ROLLOVER=1 bash scripts/technical_regression_check.sh`.
  The Mac-mini local metadata-only handoff check may additionally use `CI=true`;
  this must not be used to claim a Store upload or device pass.
- When the current work package records a dedicated Mac-mini build-cache
  profile, run full gates and release builds through
  `node tool/run_with_local_build_cache.mjs --profile <private-profile.json> -- <command>`.
  See `docs/operations/WP02_BUILD_WORKSPACE_2026-09-04.md`. Keep the private
  profile outside Git; do not silently fall back to the global cache or repeat
  cache purges. The normal source-capacity and release gates still apply.
  Current Mac-mini Android gates/releases use the version-2 profile documented
  in `docs/operations/WP05_SCOPED_ANDROID_ENTRYPOINT_2026-09-04.md`; it supplies
  both SDK variables and isolated Flutter configuration, verifies effective SDK
  selection, and refuses global overrides. The historical version-1 cache-only
  profile does not provide this Android prerequisite.
- Run `git diff --check` before staging. Preserve the analyzer baseline and do
  not suppress forbidden analyzer codes to make a check pass.

## Pilot closure truthfulness

- Never hide, remove, permanently disable, downgrade to toast-only, demo-only,
  placeholder or silent no-op any reachable control merely to close a finding.
- Every reachable function must have a real persisted or server-authoritative
  effect with explicit success, failure, retry and stale-owner/session proof.
- A confirmed account-bound write is not retroactively a failed write because
  the session or UI context drifts afterwards. After the server/local write is
  confirmed, close or report success truthfully; session drift may suppress
  only later UI refresh, navigation, or readback and must never invite a retry.
- Visible payment-test success must validate every local server-contract binding
  fail-closed: exact run/amount/currency/status, a positively validated receipt,
  and plausible test-mode provider IDs. Never treat a missing field or
  `value != false` as proof.
- For profile feedback and other external support writes, idempotency keys must
  be opaque cryptographic values: never derive them from a session ID, user ID,
  email, token, or other principal data. Same-principal background refreshes may
  not clear an unsent draft or rotate its key; an epoch/session/principal change
  must invalidate that draft. Client-side length limits must include all fixed
  prefixes so the server's bounded summary contract is never exceeded.
- Support/compliance intake booleans must reflect guidance actually shown and
  acknowledged by the user; never manufacture an attestation by hardcoding a
  `guidanceShown`, single-issue, non-urgent, or similar claim without its UI
  basis.
- While a review has known FIX items, run only the focused checks that exercise
  the changed invariant. Run a package or repository full regression exactly
  once after the implementation, review fixes and required real-infrastructure
  tests are stable; an earlier full run is diagnostic only and is never reused
  as closure evidence.

Tests and scanners must be made precise rather than bypassed: never obfuscate
production code or use semantically irrelevant spelling solely to evade a
source check.

Protected Android signing and Firebase files are local, Git-ignored inputs.
Validate their presence through repository tooling without printing values.
Release-candidate, Store, live-provider and production commands are separate
gated actions and are never implied by a normal build or regression task.

For local Android QA login, use only `tool/login_android_local_qa.mjs`. It must
read the current synthetic session manifest, perform one status-only API sanity
login and immediately revoke that temporary session, then use a bounds-based
UI dump with `input keycombination` to clear and fill the current login form.
Never use ad-hoc repeated login taps, print credentials/tokens, or retain a UI
dump after success or failure; its fake-ADB contract test must remain green.

## External-create recovery invariant

When an external provider create can succeed before its response reaches SIT,
persist a durable local placeholder claim first, use a deterministic
provider-idempotency key and provider request body, and reconcile pending claims
in a bounded background worker. A user retry or account-deletion path is never
the only recovery mechanism; provider/session and cleanup state changes use
compare-and-set transactions and sanitized operational errors.

## Technical-provider test boundary

A technical or synthetic provider test must never change or imply a production
trust/verified state, eligibility, ranking, booking benefit, fraud protection,
or completed real-world verification. Every reachable copy and action must name
the test boundary and preserve the server-authoritative no-confirmation
disclosure.

Positive and negative synthetic fixture cases are permanently separate. A
negative fixture intentionally made missing, future-dated, hash-invalid or
otherwise unusable may prove fail-closed rejection only; it must never replace
an explicitly required positive end-to-end fixture or be reported as the
technical cause of a positive-path blocker.

Release feature-scope classifications must bind current source reachability to
current runtime evidence. A stale audit, historical candidate or source-only
contract cannot close a live-scope finding; a missing runtime route or provider
activation remains an explicit fail-closed blocker.

After an alias or DNS error, read the exact stored SSH configuration and
project source before declaring a remote unavailable; test only the verified
target alias. A guessed alias is not a blocker.

Before any forward schema deployment, compare the prior image's SQL contract
with the exact migration delta and record a protected backup/restore rehearsal
against the bound source commit. Health and readiness prove liveness only, not
rollback compatibility. If no compatible recovery image is proven, isolate
Staging after the forward attempt; never boot an observed old image or run an
automatic down migration/database restore. Filesystem safety checks must finish
before any backup-directory mutation, and the complete Staging container target
set must be label-validated before any partial quiesce; check for foreign DB
writers immediately before and after the protected backup. A successful
protected rehearsal leaves all quiesced services stopped; cleanup must be
verified and any cleanup failure overrides PASS. Runtime source and Ops
orchestration commits are pinned separately and must be recorded at invocation.
Every disposable rehearsal container and network must be created with an exact
run-scoped name plus matching disposable labels, and those identities must be
inspected and attested before the first start; rehearsal storage must use
anonymous volumes attached to the captured container and may only be removed
atomically with that immutable container ID using `--volumes`. No standalone
rehearsal volume create/rm or name-based volume cleanup is allowed; a loopback
port or container name alone is never sufficient. Before any candidate start, capture
the complete sanitized payment-recovery-needs-review and support-next-update-
overdue finding sets from that same restore using only stable hashed IDs,
cause/status and coarse time classes. Re-read after candidate migrations/start
and continue technical probes only when the canonical sets are byte-for-byte
identical; missing, new, removed, changed or unreadable findings fail closed.
This fingerprint never heals or suppresses a readiness=503 release blocker.
Safety helpers are not considered implemented until the real orchestrated
runner calls them; focused tests must exercise configured resource names and
the baseline-versus-post-start branch, including negative drift and cleanup
failures.
Mutating container recovery must bind rollback to the immutable preflight
container Id plus the expected Config and network map; never rename or start
by container name alone, and treat same-name identity ambiguity as failure.
For a fresh official PostgreSQL volume, an initial `pg_isready` is not a final
startup proof: require the official init-complete log marker followed by two
stable `SELECT 1` successes before any restore operation.
The only acceptance target after that rehearsal is the exact candidate image on
an immediately preflighted free dedicated loopback port (the current reserved
port is `18082`); the public Staging proxy port and any foreign listener must
never serve or be stopped for the candidate. The controlled Compose file must
use an explicit minimal environment (no `env_file` secret injection), hard-pin
provider-neutral test modes, and mount only the validated runtime-readable MFA
key (`root:65532`, mode `0640`). Storage/preparation may remain owner-only
(`0600`); metadata-only preparation requires exact confirmation and must never
rotate or print key material. New root-created keys must end runtime-ready.
The runner must prove readiness and an authenticated synthetic MFA
enroll/pending/cancel flow, then write owner-only external evidence bound to the
exact runtime and Ops commits. Compose `--wait` without an explicit application
healthcheck is not readiness proof; acceptance must also use bounded
application-level polling and stable sanitized transport/timeout phases.
On failure, capture only sanitized container state before cleanup, remove the
complete identity-validated acceptance inventory, and write PASS evidence only
after cleanup is proven. `deploy_release.sh staging` remains blocked
until that evidence and an exact public-release confirmation validate; no
automatic promotion or observed-old-image fallback is allowed.
Application bootstrap must also remain backward-compatible with the currently
deployed migration boundary: `schema.sql` may add nullable forward-compatibility
columns before planning dependent indexes, while the numbered migration owns
validation/backfill and constraint tightening. A legacy 001-074 restore must
have a deterministic real-PostgreSQL startup test before any new acceptance
attempt.

Before declaring a missing-artifact or toolchain blocker, verify the
authoritative target host and exact artifact path first. A protected source
backup and a previously written success-evidence file are different artifacts;
never substitute one for the other or claim a run was blocked before start
until the target-host readback is complete.

An explicit apply/commit path must be executed before a work package is
closed. A transaction ROLLBACK is not a COMMIT and must never be described as
one; if the guarded commit path is blocked, record the exact blocker and stop.
