ALTER TABLE listing_ai_budget_aggregates
  DROP CONSTRAINT listing_ai_budget_aggregates_call_count_check;
ALTER TABLE listing_ai_budget_aggregates
  DROP COLUMN max_call_count,
  DROP COLUMN reserved_calls;
ALTER TABLE listing_ai_budget_aggregates
  DROP CONSTRAINT listing_ai_budget_aggregates_period_key_check;
ALTER TABLE listing_ai_budget_aggregates
  ADD CONSTRAINT listing_ai_budget_aggregates_period_key_check
  CHECK (period_key ~ '^[0-9]{4}-[0-9]{2}$');
