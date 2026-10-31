# WP09 — Stripe Accounts v2 payout readiness

Status: **IMPLEMENTATION CLOSED; EXTERNAL STRIPE TEST-MODE ACTIVATION PENDING**
on 05.09.2026 at implementation commit
`831fc7ec5138579f691a5ec1e4b3a76feae903b5`.

## Finding and correction

The Accounts v2 mapping treated an active
`configuration.recipient.capabilities.stripe_balance.stripe_transfers` status
as sufficient for payout readiness. Stripe reports
`configuration.recipient.capabilities.stripe_balance.payouts` independently.
The old predicate could therefore admit checkout or payout release while the
account could receive transfers but could not pay out.

WP09 now requires both statuses to be `active`. Missing, unknown, pending,
inactive, restricted or unsupported payout status fails closed. The stored
account predicate is centralized and used by account status, checkout and
payout release; it additionally preserves the existing Accounts v2 recipient,
Express dashboard, application-fee and application-loss responsibility
contract. PostgreSQL coverage proves that a restricted payout event stores
`payouts_enabled=false`, exposes `ready=false`, and that a later active event
restores readiness.

Only `stripe_transfers` remains explicitly requested when creating the
recipient configuration. This is intentional: Stripe automatically requests
the payouts capability for recipient configurations. WP09 observes that
separate capability as authoritative truth instead of requesting it twice or
inferring it from transfers.

## Read-only provider truth

The connected Stripe session was audited in test mode without reading or
extracting credentials and without printing or storing provider account IDs.
Exactly one test platform is available. Current readback remains not ready:
profile submission, charges, payouts, business type, business profile and
capabilities are absent or false; business-profile/support and owner terms
requirements are past due. There are no connected accounts and no webhook
destinations.

The remaining owner action is to supply or approve truthful business-profile
and support data and personally accept Stripe terms. SIT must not invent those
facts or accept terms for the owner. This read-only audit created no Stripe
object and changed no account setting.

## Verification

- Focused Stripe/payment/wiring tests: 31/31 passed.
- Backend suite: 826 passed, zero failed, two expected database skips; syntax
  check passed.
- Repository-owned PostgreSQL 16 integration: 2/2 passed, including the
  restricted-to-active payout transition; temporary cluster cleaned.
- Tool inventory: 2251/2251 passed.
- Complete local technical regression passed, including analyzer, Flutter,
  Web/Wasm, loopback and Android build.
- Exact clean-checkout R10 passed: full gate 709 seconds, second Android build
  38 seconds, 116 migrations and 84 assets, with byte-identical APKs. The
  private machine report remains outside Git and has SHA-256
  `967ebcc116556eb5f0d661d3f6e489ed4dce8afd7823c0a935655fea7a69e27b`.
- GitHub CodeQL run `33955021006` passed with zero open code-scanning alerts.
- GitHub Regression run `33955020884` passed at the exact implementation
  commit. Its clean-checkout R10, Flutter regression and signed candidate,
  Backend regression and real PostgreSQL jobs are green; image publication was
  skipped by design.
- PR #7 remains Draft, open, mergeable and unmerged at the exact
  implementation commit.

Hash-ratchet changes are limited to intentional current-source drift and its
direct evidence dependencies. They do not change historical commits, legal
holds, provider status or live boundaries.

Sanitized structured evidence is
`docs/evidence/release-readiness/wp09-stripe-accounts-v2-payout-readiness-20260905.json`.

## Remaining boundaries

No Stripe object, account setting, credential, Staging deployment, Production,
Play, device, real-money, legal-snapshot or PR-merge state changed. External
test-money acceptance remains 0/8 until the platform profile and terms are
complete, an isolated test connected account exists, two distinct test webhook
destinations are configured through external secrets, and the eight P0B
sandbox scenarios pass. V5.2 professional legal approval and external Listing
AI stay separate holds.
