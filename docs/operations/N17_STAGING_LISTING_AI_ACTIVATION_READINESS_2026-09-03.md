# N17 Staging listing-AI activation readiness

Status: **CLOSED AS READINESS / PROVIDER OWNER GATE PENDING / RUNTIME STILL MOCK** on
03.09.2026.

N17 prepares the safest bounded path for the existing server-side listing-AI
adapter. It does not activate an external provider, make a provider request,
configure billing, or change the currently deployed Staging service. Current
Staging therefore remains `mock` with a zero-cent listing-AI budget.

The existing adapter already performs server-side WebP derivation, strips
metadata, asks for strict structured JSON, disables tool use and storage, runs
behind per-principal rate and PostgreSQL budget guards, and always returns a
draft for owner review. An AI response cannot publish a listing. The missing
operational layer was a safe way to activate that adapter in Staging without a
credential in Git or a reusable manual Compose workaround.

The new activation overlay is disabled by default and allowed only for
`staging` plus the exact `heilbronn_wave0` pilot. Activation requires all of:

- an exact deployment-commit confirmation;
- the reviewed model snapshot `gpt-4o-mini-2024-07-18`;
- a deliberate external-execution flag;
- an integer provider budget from 2 to 500 cents;
- a private regular, non-symlink credential file outside the repository;
- owner/root mode `0600`, or root/runtime-group mode `0640`;
- successful secret validation before Compose is invoked.

The container receives the credential only as a read-only bind-mounted file.
The overlay explicitly clears the direct environment credential. The API
accepts file-based credentials only from an absolute regular non-symlink file,
does not expose credential data through health endpoints, and reports the
listing-AI provider boundary separately from overall readiness. Deployment
readback must prove `enabled`, provider `openai`, external execution allowed,
and automatic publication forbidden. A failed rollout restores the previous
image with listing AI forced back to `mock`, zero budget, no external execution
and no credential dependency.

Official OpenAI documentation was checked on 03.09.2026. The reviewed snapshot
is still listed for GPT-4o mini, supports image input and Structured Outputs,
and had no observed entry in the current deprecation table. The implementation
continues to use the Responses API with a JSON schema and `store: false`:

- <https://developers.openai.com/api/docs/models/gpt-4o-mini>
- <https://developers.openai.com/api/docs/guides/structured-outputs>
- <https://developers.openai.com/api/docs/guides/images-vision>
- <https://developers.openai.com/api/docs/deprecations>

No subscription or local Codex credential is reused. `codex_local_dev` remains
developer-only and is not eligible for the SIT runtime. Real activation still
requires a dedicated provider credential and owner-approved provider account
or billing action at action time. A first real image evaluation must remain in
Staging, inside the five-euro hard ceiling, and stop at the editable owner
review draft; publication remains a separate explicit owner action.

Machine evidence is
`docs/evidence/release-readiness/n17-staging-listing-ai-activation-readiness-20260903.json`.
The complete local technical regression passed, including the full Flutter
suite, backend and evidence validators, Web/Wasm checks, loopback smoke,
Android debug build, and generated-artifact capacity guard. Clean-checkout
Compose validation plus exact-head GitHub Regression `33710641470` attempt 2
and CodeQL `33710641236` passed for implementation commit
`4c081a50d3d90e142a4c1bc427c12cefaaf370f4`; open code-scanning alerts were
zero. Regression attempt 1 failed only while resolving the Android Gradle
plugin because Maven Central returned HTTP 429. No code changed before attempt
2 passed, and the failed attempt remains recorded rather than being treated as
a product pass.

N17 changes no Pixel or OnePlus installation, Play track, Production, public
registration, payment, legal status, Firebase project, DNS, VPS or PR merge.
