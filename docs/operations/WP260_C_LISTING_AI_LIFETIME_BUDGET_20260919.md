# WP260-C — Listing-AI result and lifetime sandbox budget

Status: **SOURCE PASS; provider execution remains separately gated**

The Listing-AI source path keeps the existing visible, owner-triggered,
editable draft flow. It never auto-publishes. WP260-C closes the remaining
budget invariant for the optional external provider: one durable `lifetime`
bucket, EUR 100 maximum (`10,000` cents), reservations counted before egress
and unknown/transport-loss attempts settled as spent. A separate deterministic
smoke seam may cap one process run at five provider attempts; that is not a
product or lifetime limit. The bucket is persisted in PostgreSQL and therefore
does not reset at month boundaries, process restart, or checkout clone.
Existing monthly spend, reservations and call counts are aggregated into the
lifetime row exactly once during migration. The opening spend is the
conservative maximum of the monthly aggregate and the append-only billed-cost
ledger; the migration fails closed if existing spend plus open reservations
would exceed EUR 100. The budget remains exactly `10,000` cents and is never
raised to accommodate historical data.

The memory guard accepts the optional five-call smoke cap for deterministic
tests. The server health projection exposes only `budgetScope`, `budgetCents`
and `runMaxProviderCalls`; no credential or provider payload is exposed. Existing
mock/on-device paths remain zero-cost and provider-backed execution remains
disabled until its separate test-only owner/provider setup is complete.

## Verification

- Source commits: `726c7e3fcf9ce0bced46ebc421ca7e18dc1aa962` (initial package),
  `d40f74cb273f39c097f2fa278d053fdcd8a16f7d` (fail-closed opening-balance correction).
- Focused backend listing-AI suites: 40/40 passed before the correction;
  budget/config suites 11/11 passed after it.
- Real PostgreSQL 16 integration: migration preservation, hard-cap failure,
  non-destructive down migration and full foundation/identity/MFA suites passed.
- `git diff --check`: passed.
- No provider call, live money, production, Store, Play or device mutation.

## Remaining boundary

The Stripe test-mode CLI permission and restricted test credential are not
activated by this package. The next provider package may continue only with
the existing test-only account and exact staging routes. Production, real
money, external publication and automatic listing publication remain false.
