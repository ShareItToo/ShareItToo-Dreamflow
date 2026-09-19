# 48H R12 Codex hook guardrails

Status: **VERIFIED — READY FOR R14**

R12 hardens the existing optional repository-local Codex hooks using only the
official `hooks.json` lifecycle. It adds no product/runtime import, paid
service, plugin, user-level Codex configuration or live-system dependency.
Repository trust review remains pending after the changed hook definition.

Official support and its limitation are documented at
<https://learn.chatgpt.com/docs/hooks>: `PreToolUse` can deny supported local
tool calls and `Stop` can run a bounded lifecycle command, but specialized tool
paths may opt out. These hooks are defense in depth; normal permissions,
owner gates, code review, validators and CI remain authoritative.

## Exact guardrails

### HOOK-A — secret guard

Before a Bash command, the hook rejects high-confidence private-key, provider
key, OAuth bearer and sensitive credential-assignment shapes. Before a commit,
it also scans staged normal text and rejects signing containers with `.jks`,
`.keystore`, `.p12` or `.pfx` suffixes. Denials contain only a generic reason
and, for staged content, a path; matched material is never printed.

Known placeholder markers such as `example`, `test`, `redacted`, `changeme`
and shell-variable placeholders are accepted. Pattern matching is deliberately
conservative and can neither prove that content is secret-free nor replace
repository and provider scanners.

### HOOK-B — destructive Git guard

The deny list covers forced or deleting pushes, rebase, squash merge, branch
or tag deletion, `reset --hard`, destructive clean, PR merge, explicit push to
`main`/`master`, and commit/history mutation while the checkout itself is on
`main` or `master`. The existing exact token is only an authorization marker;
its text in the repository is not standing permission to use it. A future
governing instruction must authorize the exact command separately.

### HOOK-C — live-boundary guard

Known mutating paths for production deploys, remote hosts, DNS/Cloud,
Firebase, Play/App Store automation, public releases, real payment providers,
KYC providers, real-money operations and mutating production HTTP requests are
denied. Read-only checks such as `stripe --version`, local tests and Git status
remain allowed. The same explicit-owner-gate rule applies to the existing
external-mutation marker.

### HOOK-D — SIT package completion

A final strict marker of the form
`SIT_PACKAGE_GREEN: R12_HOOKS_CODEX_AUTONOMY_GUARDRAILS` is accepted only when:

- working-tree and staged whitespace checks pass;
- the worktree is clean and known;
- the exact N11 and R12 behavior/validator suite passes;
- those tests leave the worktree clean.

An unknown package marker fails closed because it has no exact focused-test
policy. This focused completion check does not replace the full technical
regression or GitHub verification.

### HOOK-E — pending gate

A strict marker `SIT_PENDING_GATE: <ID>` atomically creates
`docs/SIT_PENDING_GATE_<ID>.md` with only the sanitized gate token, pending
state, hook source and false personal-data flag. The minimized local Git
metadata record from N11 is retained. Existing divergent files, symlinks or
unsafe directories fail closed; identical repeat execution is idempotent.

## Verification and failure behavior

The isolated tests cover safe commands, unsafe command matrices, direct and
staged secret shapes without disclosure, placeholders, protected branches,
read-only payment CLI checks, missing repository context, malformed hook input,
dirty/unknown GREEN markers, idempotent gate creation and symlink conflicts.
They also copy and remove the complete `.codex` hook package to verify that
rollback has no runtime dependency.

If a hook errors or cannot prove required context, the sensitive operation or
completion declaration is denied with bounded output. If hooks are unavailable
or disabled, ordinary SIT controls remain mandatory; bypass is not a release
workaround.

## Activation and rollback

R12 does not approve the repository hook in Codex and does not alter the user
configuration. The changed hook hash must be reviewed through the official
Codex trust UI when it is next discovered. Rollback is removal of
`.codex/hooks.json` and `.codex/hooks/sit_guardrail.py`; application and backend
code have no reference to either file.

No production, VPS, DNS, Cloud, Firebase, Payment, KYC, Store, public release,
PR merge or protected-branch mutation was performed.

## Exact verification

Implementation commit `a8dbb0c508ca9e20e6836e3ce7eb667c3d163c46`
passed GitHub Regression `32773678462`, including backend job `97579674980`,
PostgreSQL job `97579674963`, Flutter job `97579674656` and clean-checkout job
`97579674982`. CodeQL workflow `32773678533` and Advanced Security check
`97580266868` passed with zero annotations. Signed-candidate build, explicit
parallel stress and API-image publication remained skipped. The unchanged
external GitGuardian history check `97579664956` remained failed; its finding
and any credential detail were not inspected and it is not classified as an
R12 regression. PR #7 remained Draft, open and unmerged.
