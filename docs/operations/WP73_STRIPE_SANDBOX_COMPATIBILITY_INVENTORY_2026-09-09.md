# WP73 — Stripe sandbox compatibility inventory

Status: **IMPLEMENTED; LOCAL/GITHUB VERIFICATION PENDING**.

## Decision

The current ShareItToo payment architecture is compatible with the intended
Stripe Marketplace sandbox after one mandatory payment-integrity correction
and a fresh read-only provider verification. The repository already uses an
Accounts v2 recipient with Express Dashboard access, application fee and loss
responsibility, separate charges and transfers, explicit payout readiness,
file-only Staging secrets, and separate signed snapshot and thin event
destinations.

This package performed no provider mutation. The reported isolated sandbox and
its internal name are accepted only as handover facts, not as independently
verified current provider state. The official connector's read-only request
failed because that connection requires reauthentication. No credential or
browser cookie was read, no CLI was installed and no Stripe object was created.

## Proven blocking gap

The ordinary refund path reverses an already-paid owner transfer before it
refunds the platform charge. The `charge.dispute.*` path does not: it creates or
updates the dispute, records chargeback ledger entries and blocks future payout,
but it has no transfer reversal or durable recovery state if the owner transfer
was already paid before the dispute.

That distinction is material for separate charges and transfers. Stripe debits
the platform for refunds and chargebacks, while an associated transfer is not
automatically reconciled. Stripe recommends recovering disputed funds with a
transfer reversal. The current implementation therefore must not execute any
Stripe sandbox money flow until a separate local package closes the paid-
transfer dispute recovery, including insufficient-balance and uncertain-result
handling, immutable ledger binding, `needsReview` escalation and deterministic
final-outcome tests.

## Compatibility inventory

- **Provider abstraction — PASS:** disabled, memory and Stripe transports are
  separated; operation keys are opaque and durable; uncertain checkout state
  cannot open a second payment; provider events require exact local bindings.
- **Accounts v2 — PASS at repository-contract level:** recipient, Express,
  `fees_collector=application`, `losses_collector=application` and
  `stripe_balance.stripe_transfers` match the official Marketplace pattern.
  Both transfers and payouts must be active; legacy v1 truth cannot promote an
  account to ready. The actual sandbox state remains unverified.
- **Funds flow — PARTIAL:** Checkout creates a platform charge and the later
  transfer uses `source_transaction` and one transfer group. The owner amount,
  not an application-fee flag, leaves the platform. Refund reversal exists;
  paid-transfer dispute recovery does not.
- **Test configuration — PASS, unactivated:** Staging stays memory-only by
  default. Stripe requires a separate explicit deploy opt-in, exact-commit
  confirmation, test credentials and `livemode=false`. Live credentials fail
  closed outside Production.
- **Secrets — PASS, unprovisioned:** Staging rejects direct environment secrets.
  It requires three distinct, bounded, non-symlinked, read-only files outside
  the repository with restricted permissions; values are neither printed nor
  committed.
- **Webhooks — PASS at repository-contract level:** raw bytes are verified;
  snapshot payment/dispute events and thin Accounts v2 events use distinct
  secrets with no fallback; mode mismatch is rejected before database work;
  thin account events retrieve the latest account state. Actual destinations
  remain unverified.
- **SDK — PASS:** installed Stripe `22.6.1` and its generated default both bind
  `2026-08-26.dahlia`, matching the application configuration.

Official basis:

- <https://docs.stripe.com/connect/accounts-v2/connected-account-configuration>
- <https://docs.stripe.com/connect/marketplace/tasks/create>
- <https://docs.stripe.com/connect/separate-charges-and-transfers>
- <https://docs.stripe.com/connect/disputes>
- <https://docs.stripe.com/event-destinations>

## Exact owner gate

`WP73_STRIPE_READONLY_REAUTH_REQUIRED`

Reauthenticate the official Stripe connector and select only the isolated
ShareItToo sandbox in test mode. Do not enable live mode and do not create API
keys, webhook destinations, products, prices, customers, connected accounts,
payments, refunds or transfers. After reauthentication, Codex may only read:
the exact sandbox context, country/currency, sanitized requirement names,
charges/payout/capability status, and counts/types of existing connected
accounts and event destinations.

This owner action does not authorize credentials, provider traffic, billing,
money, deployment or activation. Independent local work may continue with WP74
to close the proven dispute-recovery gap.

Machine-readable evidence:
`docs/evidence/release-readiness/wp73-stripe-sandbox-compatibility-inventory-20260909.json`.
