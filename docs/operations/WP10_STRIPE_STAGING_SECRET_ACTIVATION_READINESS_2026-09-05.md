# WP10 — Stripe Staging secret and activation readiness

Status: **IMPLEMENTATION CLOSED; EXTERNAL STRIPE TEST-MODE ACTIVATION PENDING**
on 05.09.2026 at implementation commit
`6714d993adcd0c11b185ab2989295df910b82ba6`.

## Result

Stripe can no longer be enabled accidentally in Staging through ordinary
environment values. The optional deployment path is default-off and requires
the exact commit, the exact `heilbronn_wave0` pilot, three distinct external
secret files and a successful preflight before Compose is invoked. The files
must be absolute, outside the repository, regular non-symlinks, owner-only
`0600` or root/runtime-group `0640`, bounded in size and distinct by
device/inode. Live keys, reused webhook signing secrets and direct Staging
environment credentials fail closed.

The runtime reads the mounted files without following symbolic links and
clears temporary byte buffers. Readiness exposes only provider, test/live mode,
API version, currency, country and the credential source; it never reports
credential values or presence details. Deployment must read back Stripe/test,
API `2026-08-26.dahlia`, EUR, DE and file sourcing. Rollback removes the
credential overlay and forces the memory transport with live mode false.

GitHub now validates the exact three-file Compose overlay with Docker Compose.
Docker is not installed on this local Mac mini checkout, so the local YAML was
parsed and the authoritative Compose-plan proof was performed by the exact
GitHub backend job. This is not a release workaround or runtime prerequisite.

## Verification

- Focused deployment/config/secret/payment tests: 32/32 passed.
- Backend suite: 834 passed, zero failed, two expected database skips; syntax
  check passed.
- Tool inventory: 2251/2251 passed.
- Complete local technical regression passed, including analyzer, Flutter,
  Web/Wasm, loopback and Android build.
- Exact local clean-checkout R10 passed: full gate 705 seconds, second Android
  build 33 seconds, 116 migrations and 84 assets, with byte-identical APKs.
  Its private machine report remains outside Git and has SHA-256
  `d103587d122ae46d54da48e7ed790f32ac8ef1c51eaeac4367a61a73e827aeed`.
- GitHub Regression run `33957235535` passed at the exact implementation
  commit. Clean-checkout R10, Flutter, Backend plus Docker Compose and real
  PostgreSQL jobs are green; image publication was skipped by design.
- GitHub CodeQL run `33957235541` passed with zero open code-scanning alerts.
- PR #7 remains Draft, open, mergeable and unmerged.

The hash-ratchet changes were caused only by the reviewed Stripe secret reader,
deployment, health and CI changes. Their dependent evidence chain was
recalculated to convergence; 2251 permanent tool tests prove that all current
bindings agree. Historical commits, legal/provider truth and live gates were
not changed.

## External truth and remaining work

The last read-only Stripe test-mode audit still showed an incomplete platform
profile and owner terms, charges and payouts disabled, no connected accounts
and no webhook endpoints. No provider object, setting, credential, deployment
or account identity was read into repository evidence.

The next bounded package starts with another read-only provider audit. Only if
the platform is now ready may it create an isolated test recipient and two
distinct test webhook destinations, deliver their test-only credentials through
the new external files, deploy this exact Staging overlay and execute the eight
synthetic P0B sandbox scenarios. Production, live money, Google Play, devices,
V5.2 legal activation, external Listing AI and PR merge remain separate.

Sanitized structured evidence is
`docs/evidence/release-readiness/wp10-stripe-staging-secret-activation-readiness-20260905.json`.
