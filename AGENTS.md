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
   for that path to the file's SHA-256 and run the associated validators. A hash
   refresh never authorizes changing legal/privacy claims or approval state.
5. Run focused checks first. Run the complete technical regression at package
   and release gates.
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

Protected Android signing and Firebase files are local, Git-ignored inputs.
Validate their presence through repository tooling without printing values.
Release-candidate, Store, live-provider and production commands are separate
gated actions and are never implied by a normal build or regression task.
