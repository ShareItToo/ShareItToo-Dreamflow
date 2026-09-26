-- N25: Make Accounts v2 capability state the only payout-readiness truth for
-- newly created Stripe connected accounts. Legacy v1 columns remain for
-- historical rows and rollback safety, but execution no longer trusts them.

ALTER TABLE stripe_connect_accounts
  ADD COLUMN account_api_version TEXT NOT NULL DEFAULT 'v1'
    CHECK (account_api_version IN ('v1', 'v2')),
  ADD COLUMN dashboard_type TEXT
    CHECK (dashboard_type IS NULL OR dashboard_type IN ('express', 'full', 'none')),
  ADD COLUMN fees_collector TEXT
    CHECK (fees_collector IS NULL OR fees_collector IN ('application', 'stripe')),
  ADD COLUMN losses_collector TEXT
    CHECK (losses_collector IS NULL OR losses_collector IN ('application', 'stripe')),
  ADD COLUMN recipient_transfers_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (recipient_transfers_status IN ('inactive', 'pending', 'active', 'restricted', 'unsupported')),
  ADD COLUMN future_requirements JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE stripe_connect_accounts
SET recipient_transfers_status = transfers_capability
WHERE account_api_version = 'v1';

CREATE INDEX stripe_connect_accounts_v2_ready_idx
  ON stripe_connect_accounts(account_api_version, recipient_transfers_status, updated_at DESC);
