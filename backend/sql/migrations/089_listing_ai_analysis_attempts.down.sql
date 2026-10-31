DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM listing_ai_cost_ledger WHERE billed_cost_cents IS NULL) THEN
    RAISE EXCEPTION 'WP260-D rollback blocked: unknown billed cost evidence exists';
  END IF;
END;
$$;

DROP TABLE listing_ai_budget_reservations;
DROP TABLE listing_ai_analysis_attempts;
ALTER TABLE listing_ai_cost_ledger
  ALTER COLUMN billed_cost_cents SET NOT NULL;
