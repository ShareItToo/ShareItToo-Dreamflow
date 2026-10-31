DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM listing_ai_cost_ledger WHERE provider = 'on_device'
  ) OR EXISTS (
    SELECT 1 FROM listing_ai_budget_aggregates WHERE provider = 'on_device'
  ) THEN
    RAISE EXCEPTION
      'On-device listing AI rollback blocked: durable provider history exists';
  END IF;
END;
$$;

ALTER TABLE listing_ai_cost_ledger
  DROP CONSTRAINT listing_ai_cost_ledger_provider_check;
ALTER TABLE listing_ai_cost_ledger
  ADD CONSTRAINT listing_ai_cost_ledger_provider_check CHECK (
    provider IN ('disabled', 'mock', 'openai')
  );

ALTER TABLE listing_ai_budget_aggregates
  DROP CONSTRAINT listing_ai_budget_aggregates_provider_check;
ALTER TABLE listing_ai_budget_aggregates
  ADD CONSTRAINT listing_ai_budget_aggregates_provider_check CHECK (
    provider IN ('disabled', 'mock', 'openai')
  );
