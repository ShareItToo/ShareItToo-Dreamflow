# WP03 — Listing-AI response acceptance

Status: **LOCAL CORRECTION, FULL LOCAL REGRESSION AND CLEAN BACKEND PASS /
PUSH AUTHENTICATION BLOCKED / NOT DEPLOYED**.

Implementation commit: `f3b1d7edd052cede6d25105c8d07da050b8c1c13`.
The subsequent documentation-only commit records the clean-checkout results.

Bounded independent work while WP01/WP02's frozen candidate CI and owner
authentication dependencies remain incomplete. This does not complete WP03
or create a separate Goal.

## Provenance and unchanged candidate

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Implementation base: `7b1e19331035b1b32f0ae6f7ef76b542705eb235`, initially clean,
  two documentation commits ahead of the local remote-tracking ref.
- Frozen signed `2026090402` source remains
  `bfd3e9e4422a6a6e6bf3c09bd825c6a089909d04`. Neither APK nor AAB is rebuilt or
  changed. Its exact Regression remains failed; CodeQL remains successful on
  fresh connector readback. No third workflow retry or Pixel installation.
- CLI authentication remains invalid on current readback. A normal push of the
  preceding documentation was already rejected; no credential extraction or
  alternate API-created Git history is used.

## Reproduced defect and correction

The actual OpenAI adapter previously accepted valid structured text for
`failed`, `cancelled`, `queued`, `in_progress`, absent and unknown response
status. Only `incomplete` was rejected. It also returned convenience
`output_text` before inspecting canonical output for an explicit refusal.

New deterministic tests failed against the original implementation with
missing expected rejections. The correction accepts only `completed`, retains
the existing incomplete error, and inspects refusals before convenience text.
Errors retain one attempted provider call and never disclose refusal text.
Existing budget settlement and no-retry behavior are unchanged.

The provider-bound schema now explicitly types its constant values. Constant
values, nullable field types, length/range constraints, owner-confirmed=false
and the frozen domain schema remain unchanged. This removes an avoidable
schema-typing ambiguity; **no live API schema rejection or acceptance was
observed**, so this is not a claimed provider compatibility certification.

The actual adapter is additionally exercised through the real listing workflow
and image-derivative pipeline with injected local HTTP responses: a failed
screening or generation returns manual fallback, preserves input photos and
manual editing, produces no draft revision, forbids automatic publication and
keeps billed cost unknown. These are synthetic transport tests, not real AI
quality, billing or device evidence.

## Verification

- Original adapter: new failure cases reproduced before the correction.
- Provider plus listing-workflow focused suite: **25 passed, zero skipped**.
- Existing N17/source/privacy guard suites: **12 passed**.
- Final full Backend suite: **808 passed / 2 explicit PostgreSQL-environment
  skips**; syntax and working-tree secret scan passed.
- Full normal local technical regression: **PASS**, including 2,166 tool
  tests, Flutter and explicit profiles, zero analyzer issues, Web debug with
  successful Wasm dry run (not standalone Wasm runtime acceptance), loopback
  smoke, Android debug build and R11 surface (14 permissions / 8 exports).
  Android executed 466 of 471 tasks in 46 seconds. Normal capacity gates pass,
  using the same dedicated cache and complete process-local SDK configuration.
  No cache purge, timeout change, suppressed check or provider call was needed.
- Exact new-HEAD GitHub/CodeQL and full R10 clean-checkout proof: pending.
  No prior result is transferred to the new implementation.
- Fresh `git clone --no-local` at exact implementation commit f3b1d7ed,
  canonical origin restored, clean before/after. Path:
  `/Volumes/SIT-Build-20260904/wp03-provider-proof.1W2oHQ`.
  Normal frozen-lockfile install, full Backend **808 passed / 2 explicit
  environment skips**, and syntax check pass. No protected signing/Firebase
  inputs copied. This is Backend clean-checkout evidence, not full R10 proof.
- Normal push of f3b1d7ed was attempted and rejected with missing HTTPS
  authentication, exit 128. No forced push or connector credential reuse.
- N17's maintained provider hash is updated in its manifest and validator.
  N17's historical verification fields remain bound only to its recorded
  implementation commit; the added maintenance note links this follow-up.

Private logs are retained in
`/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_WP03_PROVIDER_EVIDENCE.jlBxtK`.

| Proof | SHA-256 |
| --- | --- |
| Original implementation failing new tests | `3decd8840f613fa40eec3d24bc899075fdaffa234f9878984abfcf59cfcf67f6` |
| Final focused provider/workflow suite | `1f8b65d72ff40216dc823dd07e5cfa103c98bf738b992aa174c8126b9a48fd9e` |
| Final full Backend suite | `b0330b94b77b5cd8a8e31866d16ec3de6a9b367116776ac82f39536fba0a6ea1` |
| Backend syntax check | `db204e539675ce352bc23179c6db37ce97e9fa4e76de47fc693b5b575fb19e42` |
| Full local technical regression | `f0075f186b3def71a92361ed7fd4fa2bb5c2e8fc61f7330585ca5a1974556016` |
| Clean-checkout dependency install | `7ba7de5d00bd32b4e81029defb9458841ffb13b023c2def7863f4b1bdd64b986` |
| Clean-checkout full Backend | `57bd20abdb14b84aa6a978eb7b489eb130c3a2ed1c9bc3fc110c0990a52411bf` |
| Clean-checkout syntax | `db204e539675ce352bc23179c6db37ce97e9fa4e76de47fc693b5b575fb19e42` |

## Official documentation and runtime limits

The official [GPT-4o mini model page](https://developers.openai.com/api/docs/models/gpt-4o-mini)
still lists the configured snapshot and image/structured-output support.
The [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
documents strict schemas and their supported subset. Model, endpoint and
approval requirements were not changed. Firecrawl CLI was unavailable and
its connector returned HTTP 402; official-domain web search and page retrieval
were used instead, without activating a paid service.

N17's last deployment evidence records mock AI; no new deployment inspection
is claimed. A public `/api/v1/health` read returned 404; a root `/health/ready`
read did not yield JSON. Neither proves backend or provider failure, and no
runtime state is inferred from them. The deployment script confirms that its
Staging health read uses the private host-local port (default 18080), not these
public guesses. The next authoritative runtime check must use that established
deployment route. No further URL guessing or host access was attempted.

Real Staging AI still requires the approved server-only provider setup and a
real, consented image evaluation. Owner-only provider/billing actions remain
pending; no API credential was read and no external AI call was made. Consumer
Codex auth remains unrelated to the runtime adapter. No fake image analysis,
mock response or developer evaluation is counted as fulfillment of WP03.

No mobile, production, Store, Firebase, payment, DNS, provider activation,
account mutation, PR merge, OnePlus or Pixel action occurred.

## Next step and rollback

The backend-only correction is committed. Owner action remains the official
`gh auth login -h github.com --web` on the Mac mini (locally or through the
existing private remote connection). No credentials should be pasted into chat.
Once normal GitHub authentication is restored, push normally and require exact
new-HEAD CI/CodeQL and clean-checkout evidence before staging deployment.
Keep the frozen 2026090402 candidate and its outstanding CI separate. No
database migration is required. If necessary, revert the narrow provider
correction in a new reviewed commit; never rewrite history or restore a
failed result as a successful draft.
