-- WP109: persist the zero-billing Android on-device Listing-AI provider.
-- Images are analysed on the owner's device; the server stores only the
-- normalized, owner-reviewable draft and the zero-cost audit ledger entry.

ALTER TABLE listing_ai_cost_ledger
  DROP CONSTRAINT listing_ai_cost_ledger_provider_check;
ALTER TABLE listing_ai_cost_ledger
  ADD CONSTRAINT listing_ai_cost_ledger_provider_check CHECK (
    provider IN ('disabled', 'mock', 'on_device', 'openai')
  );

ALTER TABLE listing_ai_budget_aggregates
  DROP CONSTRAINT listing_ai_budget_aggregates_provider_check;
ALTER TABLE listing_ai_budget_aggregates
  ADD CONSTRAINT listing_ai_budget_aggregates_provider_check CHECK (
    provider IN ('disabled', 'mock', 'on_device', 'openai')
  );
