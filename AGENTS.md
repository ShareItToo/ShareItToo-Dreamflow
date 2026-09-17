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

## Sol, Luna and Astra review loop

- Luna executes one bounded package and returns useful evidence, not a claim of
  perfect completeness. Sol performs a targeted review and records exactly one
  decision: `PASS`, `FIX` or `ASTRA_GATE_REQUIRED:<gate-id>`.
- Sol is also the mentor. At the first recognized avoidable error, closure
  omission, unsafe assumption or wasteful reasoning pattern, stop it before a
  second occurrence. Sol gives one direct corrective rule and updates the
  nearest authoritative instruction. Add a deterministic test, validator or
  fail-closed guard when the pattern is technically enforceable. Duplicate UI
  output or repeated reporting of one still-open incident remains one finding.
- A visible-function P0/P1 requires proven reachability from a current route or
  configuration. Unreachable legacy/dead code is tracked separately and is
  not itself a release blocker until reachability is demonstrated.
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
- Escalate to Astra only at a named gate involving contradictory evidence or a
  material decision in money, contract, privacy, security, release truth or
  user data. Astra is an AI reviewer and cannot replace professional or owner
  approval. Technical incompleteness stays with Luna under `FIX`.
- Team handoffs use four short fields: `RESULT`, `EVIDENCE`, `BLOCKER`, `NEXT`.
  Add detail only when Maximus/owner action, safety or regulated risk requires
  it. Never compress away a decisive error, version, hash, source or gate.
- A delegated Luna turn must not end silently. If the package is unfinished and
  no named gate blocks it, continue the same package. If execution must stop,
  return the four-field capsule with the exact preserved paths and next command;
  an idle/completed turn state alone is not a valid blocker or handoff.
- Before coordinate-based device UI input, reread the current hierarchy and
  bind the action to the target's current bounds and the active scrollable
  viewport. After one no-op or unexpected screen, reread state and correct the
  mechanism; never repeat unchanged blind taps or out-of-bounds swipes.
- Runtime evidence must follow the product's actual state partition (for
  example active listings versus drafts) and prove the expected tab, route and
  post-restart value. Evidence from a neighboring tab or a backend-only write
  cannot close an explicitly required app projection or edit gate.
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
