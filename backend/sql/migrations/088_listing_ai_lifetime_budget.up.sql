-- WP260-C: the external Listing-AI allowance is a project-wide lifetime
-- envelope. It must not reset by month, process restart, or clone.
ALTER TABLE listing_ai_budget_aggregates
  DROP CONSTRAINT listing_ai_budget_aggregates_period_key_check;
ALTER TABLE listing_ai_budget_aggregates
  ADD CONSTRAINT listing_ai_budget_aggregates_period_key_check CHECK (
    period_key = 'lifetime' OR period_key ~ '^[0-9]{4}-[0-9]{2}$'
  );

ALTER TABLE listing_ai_budget_aggregates
  ADD COLUMN reserved_calls INTEGER NOT NULL DEFAULT 0
    CHECK (reserved_calls >= 0),
  ADD COLUMN max_call_count INTEGER NOT NULL DEFAULT 5
    CHECK (max_call_count BETWEEN 1 AND 5);

ALTER TABLE listing_ai_budget_aggregates
  ADD CONSTRAINT listing_ai_budget_aggregates_call_count_check
  CHECK (call_count + reserved_calls <= max_call_count);
