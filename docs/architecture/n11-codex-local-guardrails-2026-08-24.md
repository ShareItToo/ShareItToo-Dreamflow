# N11 Codex local guardrails

Status: **IMPLEMENTED LOCALLY — TRUST REVIEW PENDING — OPTIONAL DEFENSE IN DEPTH**

Official Codex documentation now supports repo-local `hooks.json`, synchronous
`PreToolUse` blocking and `Stop` lifecycle scripts. Project hooks are loaded
only for trusted repositories; every new or changed non-managed hook definition
must be reviewed and trusted before it runs. The same documentation states
that specialized tool paths can bypass the default hook path, so hooks are a
useful guardrail rather than a complete enforcement boundary:
<https://learn.chatgpt.com/docs/hooks>.

The local CLI reports `hooks` as stable and enabled. N11 therefore implements
the smallest reversible repo-local setup in `.codex/`; it does not modify the
user-level Codex config, install a plugin, add a paid service or change any live
system.

## Implemented lifecycle hooks

### `SessionStart`

Adds one bounded instruction: hooks never replace owner gates, permissions, CI
or full regression. A real stop gate is declared only with
`SIT_PENDING_GATE: <UPPER_SNAKE_TOKEN>`.

### `PreToolUse` for Bash

- blocks destructive Git reset/clean/forced-push/deletion patterns unless the
  exact command carries the separately approved
  `SIT_DESTRUCTIVE_GIT_APPROVED=R0_DESTRUCTIVE_GIT_GO` token;
- blocks recognized production, Payment, Store, VPS, DNS, Cloud and PR-merge
  mutations unless the exact command carries the separately approved
  `SIT_EXTERNAL_MUTATION_APPROVED=R0_EXTERNAL_MUTATION_GO` token;
- before `git commit`, scans staged normal text files for high-confidence
  secret shapes, runs `git diff --cached --check`, all current
  `validate_blue_ocean_n*.mjs` validators and the fast pilot/external-gate
  validators;
- reports only a bounded reason or affected path, never the matched secret.

The tokens are authorization markers, not secrets and not standing approval.
Their names in the repository do not authorize their use. A human or governing
goal must explicitly approve the exact destructive or external action first.

### `Stop`

If the final message declares one strict uppercase pending-gate marker, the
hook atomically writes a minimized local artifact to the worktree Git metadata
path `codex/sit-pending-gate.json`. It stores only schema, state, gate token,
source and a false personal-data flag. It does not read unstable transcript
content, store names/contact details or commit the artifact.

## Non-dependency boundary

- Flutter, Backend, builds and production do not import or load `.codex/`.
- Hooks are not required for application correctness or runtime safety.
- The normal full regression and GitHub workflows remain authoritative.
- Hook failure, disablement, bypass or unsupported tool coverage never becomes
  a release workaround; it means the ordinary controls must still catch the
  action.
- The hook unit tests may verify the optional files, but product code has no
  path to them.

## Activation and rollback

Codex must show the new repository hook definition for review. Until it is
trusted through the official hook review UI, Codex skips it. This is an honest
pending local trust step, not a technical failure and not permission to bypass
the review.

Rollback is one reversible repository change: remove `.codex/hooks.json` and
`.codex/hooks/sit_guardrail.py`. The local pending-gate artifact, if present,
can be inspected separately in Git metadata and is never part of release
history. No production, Cloud, Payment, Store, VPS, DNS or user-level Codex
configuration is changed by N11.
