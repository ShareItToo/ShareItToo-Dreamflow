# N25 Stripe test-mode Accounts v2 foundation

Status: **TECHNICALLY COMPLETE / EXTERNAL SANDBOX ACTIVATION HELD / LIVE MODE
FORBIDDEN** on 03.09.2026.

## Decision

ShareItToo uses Stripe Accounts v2 with only the `recipient` configuration for
future Staging marketplace tests. The account receives the Express dashboard,
while ShareItToo remains the fees and negative-balance-loss collector. This is
the smallest account surface needed for the already selected separate-charges-
and-transfers model: the platform creates the renter charge and transfers the
owner share only after the repository's payout-release rules pass.

The application must not infer readiness from legacy Accounts v1 flags. A
connected owner is payout-ready only when all of these server-observed facts
hold together:

- the stored account API version is `v2`;
- the recipient configuration is applied and not closed;
- `stripe_balance.stripe_transfers` is `active`;
- dashboard access is `express`;
- fees collector and losses collector are both `application`.

Any absent, unsupported, pending, restricted or responsibility-drifted fact
fails closed. Existing v1 rows are deliberately not upgraded by the schema
migration and cannot authorize checkout or payout.

## Provider boundary

The backend now uses the official `stripe` Node SDK at the exact locked version
`22.6.1` and API version `2026-08-26.dahlia`. It creates and retrieves v2 core
accounts, creates hosted recipient-onboarding links, and verifies both v1
snapshot webhook envelopes and v2 thin-event envelopes. A thin event is not
used as account truth: after its signature passes, the exact related account is
retrieved through the official SDK before state is applied.

Checkout remains a platform charge. Refunds act on that platform charge and do
not use destination-charge refund flags. Owner payment uses a separate transfer
with the original charge as source transaction; if money was already
transferred, the corresponding amount is recovered through an explicit
transfer reversal. Every external mutation retains the existing server-side
idempotency boundary.

## Configuration boundary

Staging accepts only a server-side Stripe test secret or restricted key plus a
webhook signing secret. A live key with live mode is rejected outside
Production, and key/mode mismatches are rejected before startup. No credential
is stored in Git or exposed by diagnostics.

The in-memory provider remains deterministic test infrastructure. Its v2 shape
exercises the same readiness rules, but it is not evidence of a real Stripe
account, payment, refund, transfer or payout.

## Data migration and recovery

Migration `071_stripe_connect_accounts_v2` adds the v2 account truth fields and
an index for readiness lookups. The down migration refuses to run once any v2
account row exists. Fresh PostgreSQL 16 and the R9 recovery round trip passed
with the new migration, including this rollback guard.

## Activation conditions still open

N25 intentionally performed no application-runtime provider request and no
deployment. The separate official connector observation was read-only. Before
a real Staging sandbox E2E can start, an owner must establish the exact test-mode
platform identity and safely provide a test server credential and webhook
secret through the deployment secret mechanism. Any old Staging v1/memory
connected-account rows must then be explicitly migrated or retired; they must
never be silently promoted. The P0B provider matrix therefore remains `0/8
HOLD` until actual test-mode account onboarding, charge, webhook, refund,
transfer and reversal evidence exists.

Production, live Stripe, real money, public registration, Play, Firebase,
Cloud/VPS/DNS, OnePlus and PR merge remain unchanged.
