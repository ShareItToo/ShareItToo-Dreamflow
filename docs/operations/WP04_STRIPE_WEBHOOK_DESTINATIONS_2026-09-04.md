# WP04 — separate Stripe webhook destinations

Status: **LOCAL CORRECTION AND FULL LOCAL REGRESSION PASS /
PROVIDER E2E NOT PERFORMED**.

Subsequent local verification: exact clean
`c4c576d3e26166591130ca1e4744048069afbbc3` passes the complete cold R10,
including Backend, audit, isolated PostgreSQL, full technical regression and
byte-identical debug APKs. See `WP04_R10_COLD_STORAGE_2026-09-04.md` for the
two separately preserved runner failures and their verified corrections.
Fresh Staging readiness still reports payment transport `memory`, live=false,
on deployed `5d88295f`; no provider E2E, deployment or exact new-head CI pass
is implied. The eight actual Stripe sandbox scenarios remain unperformed.

Independent work under the encompassing Staging Goal, not WP04 completion.
Implementation commit: `bd1199211476dbc093dd00ba2865762592cee97f`.
Base: `9b99e958244ec3b3dd0448933b654832afd555c1`, branch
`codex/master-workflow-20260808`, worktree
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
The four preceding unpushed commits are preserved.

## Finding and correction

N25 uses the official SDK for snapshot and Accounts v2 thin notifications,
but both paths received the same configured webhook secret. The existing
unit fixture also signed both families with that one value. Real Stripe
snapshot and thin event destinations are registered separately and have
their own signing secrets. Thus the original fixture did not establish that
both real destinations could authenticate successfully.

The new tests reproduce rejection of a correctly signed thin notification
when the snapshot destination has a different secret. The runtime now:

- requires a distinct `STRIPE_CONNECT_WEBHOOK_SECRET` for Stripe transport,
  alongside the existing snapshot `STRIPE_WEBHOOK_SECRET`;
- selects the matching verifier and destination secret without falling back
  to the other secret; original raw bytes remain signature input;
- rejects wrong or missing event mode before any thin account retrieval or
  database access;
- retains the original raw-payload hash for deduplication after retrieving
  the account; duplicate delivery does not reapply its account update.

The Staging Compose service passes the new variable. The example contains
names only, no credential. No key was read, generated, copied or installed.
No endpoint URL, payment math, ledger query, migration, dependency, API
version, timeout, retry policy, mobile source or Production Compose changed.

## Verification and scope

- Original code fails 7 of the 10 new/configuration tests; the private red
  log is retained. Two failures expose the newly required configuration
  property; the real-SDK and workflow cases reproduce the actual defect.
- Final focused provider/configuration/workflow suites: **26 passed**.
- Complete Backend suite: **814 passed / 2 explicit database-environment
  skips**, syntax and working-tree secret scan passed.
- Privacy/retention/provider/predecessor validator suites: **203 passed**.
- Full normal technical regression passed: 2,166 tool tests, 665 default
  Flutter tests / 33 explicit-profile skips plus all explicit profiles,
  analyzer zero, Web debug/Wasm dry run, loopback smoke and Android debug.
  Android passed in 19 seconds (12 of 471 tasks executed); minSdk 24 and
  R11's 14 permissions / 8 exports pass. This is not standalone Wasm runtime
  acceptance or a newly signed release build. No cache purge or waiver.
- The first exact clean-head R10 attempt stopped at its package-manager
  identity check; it is not a clean-checkout pass. A reproduced context
  selection defect and bounded correction are documented in
  `WP04_R10_PACKAGE_CONTEXT_2026-09-04.md`.
- Exact-head CI and clean-checkout proof are pending at this checkpoint;
  no historical green result applies to WP04.

All fixtures are synthetic. Signature verification uses the actual installed
Stripe SDK. The workflow proof injects provider retrieval and a transaction
double; it is not a real database/provider transaction or sandbox acceptance.

## Source-binding maintenance

The changed shared config/provider/workflow sources invalidate maintained
P0B, privacy, retention, support-readiness and predecessor source hashes.
All dependent hashes are updated through their dependency graph. A semantic
diff audit verifies **32 evidence/validator files changed only in SHA-256
values**: no approval, state, date, test count, CI run, implementation commit
or validation predicate changed. This is source-inventory maintenance, not
new acceptance of those historical candidates or their external gates.
Initial regression attempts correctly stopped on stale hashes and remain
retained. No test was disabled and no check was weakened.

## Activation prerequisites — still OPEN

1. Confirm that the connected test account belongs to the intended SIT
   operator. A read-only connector lists one generically named test account;
   this does not prove its identity. Owner clarification was requested once.
2. Complete the unchanged P0B provider/legal/identity prerequisites. Do not
   infer these from the adapter, general autonomy or a connected account.
3. Supply the server with a least-privilege test restricted key and two
   separate destination signing secrets through its approved private secret
   mechanism, never through Git, chat, client builds or logs.
4. Register the snapshot payment/refund destination and the Accounts v2
   thin-event destination separately. The current handler can verify both
   families at `/api/v1/payments/webhook`, using their distinct secrets.
   Register only the event types consumed by the application. No destination
   was created or modified in this package.
5. Verify exact candidate CI, then perform the authorized Staging rollout
   with `STRIPE_LIVEMODE=false`, isolated synthetic roles and rollback ready.
   Stripe mode now intentionally refuses startup if the second signing
   secret is missing or equals the first. Existing memory/disabled modes
   remain unchanged; a prior image does not support the two-secret contract.
6. Execute all eight P0B sandbox scenarios against real Stripe test objects.
   The count remains **0/8 provider scenarios**; real-money readiness false.

GitHub's official existing-scope CLI renewal reached the owner's email
confirmation page, but its CLI session subsequently terminated with an
expired device authorization. The owner page remains available; after owner
verification, start a fresh official CLI flow. Do not reuse the expired code
or claim a live wait, successful renewal or push. The Telegram safety-blocked
route was not retried or bypassed.
Frozen APK/AAB `1.0.0+2026090402` and source
`bfd3e9e4422a6a6e6bf3c09bd825c6a089909d04` remain unchanged and uninstalled.
Exact frozen-source Regression remains failed, CodeQL passed. No third
workflow retry, device write, new signed build or provider traffic occurred.

## Sources and retained proof

Official Stripe documentation read on 2026-09-04:
[Webhook setup and separate thin destination](https://docs.stripe.com/webhooks),
[snapshot versus thin events](https://docs.stripe.com/event-destinations).
The installed official SDK remains the repository-pinned version 22.6.1.

Private logs: task directory `SIT_WP04_WEBHOOK_EVIDENCE.IQxzop` (owner-only).

| Proof | SHA-256 |
| --- | --- |
| Original-code red tests | `4a923b0e22b68ccc4051f7afecb130c11138c81cf298afb297a79986ce47f19a` |
| Final 26 focused tests | `36a3c4577a7e0b334ef5267e0f87588f3b6dc70a1d18517bb1e1debfee89f52c` |
| Full Backend | `3a33d40b2d229ad4d0562a1f114d02dbc046ad7842832a905a5f218bf76ee488` |
| Backend syntax | `db204e539675ce352bc23179c6db37ce97e9fa4e76de47fc693b5b575fb19e42` |
| Full normal local regression | `38e78d2756b144c6dd2e1e036c275a55aabb61e89b2344f81ed05a2e6eeb1be1` |
| 203 affected binding checks | `8342c345babab66281f5e3e42b52eac32d56f8c848334dd12668c1d2f77d6cab` |
