# P0B Marketplace-PSP Sandbox E2E Runbook

Version: `P0B-PSP-2026-08-21.1`

Authorization: `P0B_NEXT_PSP_SANDBOX_E2E_ONLY`

This procedure is non-live. It may contact a provider only after the provider,
contracted marketplace product, test account and legal/privacy facts have been
verified. It never authorizes real money, production, public activation or a
Store submission.

## Hard preflight

Before any provider request, all of these facts require authenticated,
sanitized evidence references:

1. selected licensed provider and the exact contracted marketplace product;
2. executed contract and approved product configuration;
3. provider sandbox account controlled by the intended SIT operator;
4. DPA, processing regions and transfer mechanism;
5. bounded professional approval of the PSP, checkout, withdrawal and refund
   model;
6. test-class server key and sandbox webhook secret present in an approved
   secret store, inspected only as presence/type and never copied into Git;
7. authenticated provider dashboard or equivalent identity verification; and
8. `livemode=false`, isolated test users and an explicit abort route.

If one fact is missing, stop before network traffic. Repository code naming a
provider is not a contract. A unit-test credential is not a provider credential.

## Required provider-sandbox scenarios

Run every scenario with synthetic people and test payment instruments only:

1. connected owner onboarding, required details and transfers capability;
2. authorization, capture, decline and final-state mapping;
3. signed webhook handling, replay deduplication and out-of-order state;
4. separate rent and SIT-fee refunds, including retry idempotency;
5. partial payout hold with immediate release of the undisputed owner amount;
6. chargeback opening, payout block and reversal/final outcome;
7. reconciliation against immutable ledger and financial-document snapshots;
8. provider/DB mismatch, timeout and repeated-command recovery without a
   duplicate capture, refund or payout.

Every record must bind provider event/reference, booking/payment object,
idempotency key, expected and observed state, integer-cent amounts, currency,
timestamps, sanitized logs and reviewer result. Never store full card/bank
data, keys, webhook secrets, dashboard screenshots with personal data or raw
provider exports in Git.

## Abort conditions

Abort immediately if `livemode=true`, a live key is detected, the provider or
dashboard identity is unclear, the connected account is not a sandbox entity,
amount/source fields diverge, a webhook cannot be authenticated, or any retry
could create a second money action. Preserve sanitized evidence and leave the
gate on hold.

## Completion semantics

`sandboxE2ePassed=true` means only that all eight scenarios passed in the
verified contracted provider sandbox. `realMoneyReady` remains false. Later
legal, operator, reconciliation, security, privacy, release and explicit
activation gates still apply.
