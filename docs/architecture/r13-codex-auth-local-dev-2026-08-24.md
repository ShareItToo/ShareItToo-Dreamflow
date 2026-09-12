# R13 Codex authentication for local developer evaluation

Status: **CODEX_AUTH_LOCAL_DEV_SUPPORTED — LOCAL DEVELOPER ONLY — DISABLED BY DEFAULT**

## Decision

The exact R13 classification is:

`CODEX_AUTH_LOCAL_DEV_SUPPORTED`

Official OpenAI documentation distinguishes ChatGPT sign-in for subscription
access from API-key sign-in for usage-based API access. The Codex CLI and
desktop app support ChatGPT sign-in for local work, `codex login status`
reports the active authentication method, and non-interactive `codex exec`
reuses the saved CLI authentication:

- <https://learn.chatgpt.com/docs/auth>
- <https://learn.chatgpt.com/docs/non-interactive-mode>

The local Mac mini inspection used only the documented status command. It
observed `codex-cli 0.149.0-alpha.4.1` and the status `Logged in using ChatGPT`.
No OAuth token, browser cookie, credential file or secret value was read,
copied, printed or committed. No account setting or login state was changed.

This supports a local developer using Codex itself for a bounded evaluation
under the owner's existing ChatGPT/Codex allowance. It does **not** make the
owner's consumer authentication a SIT application entitlement, public model
backend, production provider, API project or transferable user service.

## `codex_local_dev` boundary

`tool/codex_local_dev.mjs` is a repository-owned local developer adapter. Its
default `status` operation performs no inference. An evaluation additionally
requires the invocation-local marker `SIT_CODEX_LOCAL_DEV_ENABLED=1`; this is
not persisted and does not enable any runtime feature.

Every evaluation:

1. refuses execution if an OpenAI/Azure API key, project, organization or
   custom endpoint environment is present;
2. requires the exact documented ChatGPT login status;
3. accepts only the four repository-owned synthetic fixtures under
   `store/assets/synthetic-listings/`;
4. launches `codex exec` with `--ephemeral`, `--ignore-user-config`,
   `--sandbox read-only`, no approvals and no Shell, Browser, Computer Use,
   Apps, image-generation or image-file tool;
5. runs inside an owner-only temporary directory with a fixed prompt and a
   closed output schema;
6. passes the response through the existing N2/N3 strict draft, allowlist,
   low-confidence, unsupported-claim and publication-authority validation;
7. deletes the temporary schema and response unconditionally.

The child receives only the minimum local environment required to locate the
saved Codex login. No API billing environment and no arbitrary user prompt are
forwarded. Errors expose only stable local codes, never raw CLI output.

## Verified synthetic evaluation

One explicitly enabled local evaluation used
`store/assets/synthetic-listings/cordless-drill.png`. It completed under
ChatGPT authentication with no API billing environment and produced a strict
editable draft for `cat8 / Bohrmaschinen`. Brand, model, replacement value and
pickup region remained low-confidence blanks where the image could not support
them. Functionality remained an owner question. All eleven owner confirmations
were false, the publication action remained explicit-owner-only and automatic
publication stayed false.

The evaluation is developer evidence only. It is not an observed SIT user
flow, does not enter regional learning, does not write a listing and is not
wired to the backend or Flutter runtime.

The exact implementation/security commit
`b504bbb3a5ab97dbf2b162b13061e35400fa640d` passed GitHub regression run
`32717658624`, CodeQL workflow `32717658646` and Advanced Security check
`97402679227` with no new alerts. The separate GitGuardian failure reports the
same 250-commit PR-history finding that was already present at the R13 base; it
was not treated as green and no credential detail was inspected.

## Operation and rollback

Read-only status:

```sh
node tool/codex_local_dev.mjs status
```

Explicit synthetic local evaluation:

```sh
SIT_CODEX_LOCAL_DEV_ENABLED=1 node tool/codex_local_dev.mjs evaluate \
  --image store/assets/synthetic-listings/cordless-drill.png
```

Rollback is a normal revert of the adapter, its tests and documentation. There
is no user-level profile, token copy, account mutation, backend configuration,
database migration, runtime dependency or live provider state to undo.
