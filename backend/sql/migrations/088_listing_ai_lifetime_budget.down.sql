ALTER TABLE listing_ai_budget_aggregates
  DROP COLUMN reserved_calls;
-- Lifetime rows are retained deliberately. Reintroducing the old monthly-only
-- check would make preserved data invalid and would silently invite a reset.
