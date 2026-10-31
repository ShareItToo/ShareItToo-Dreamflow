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
    CHECK (reserved_calls >= 0);

-- A rollover must never make the EUR 100 allowance larger and must not lose
-- costs that were already recorded in the append-only cost ledger.  If the
-- existing aggregate or ledger already exceeds the allowance (including open
-- reservations), fail closed instead of creating a misleading lifetime row.
DO $$
DECLARE
  aggregate_spent INTEGER;
  aggregate_reserved INTEGER;
  ledger_spent INTEGER;
BEGIN
  SELECT COALESCE(SUM(spent_cents), 0), COALESCE(SUM(reserved_cents), 0)
    INTO aggregate_spent, aggregate_reserved
    FROM listing_ai_budget_aggregates
   WHERE period_key <> 'lifetime' AND provider = 'openai';

  SELECT COALESCE(SUM(billed_cost_cents), 0)
    INTO ledger_spent
    FROM listing_ai_cost_ledger
   WHERE provider = 'openai';

  IF GREATEST(aggregate_spent, ledger_spent) + aggregate_reserved > 10_000
     OR aggregate_spent > 10_000
     OR ledger_spent > 10_000
  THEN
    RAISE EXCEPTION
      'listing_ai_lifetime_budget_rollover_exceeds_hardcap';
  END IF;
END;
$$;

INSERT INTO listing_ai_budget_aggregates (
  period_key, provider, budget_cents, spent_cents, reserved_cents,
  call_count, reserved_calls
)
SELECT
  'lifetime',
  provider,
  CASE WHEN provider = 'openai' THEN 10_000 ELSE MAX(budget_cents) END,
  CASE WHEN provider = 'openai' THEN GREATEST(
    COALESCE(SUM(spent_cents), 0),
    COALESCE((SELECT SUM(billed_cost_cents)
                FROM listing_ai_cost_ledger
               WHERE provider = 'openai'), 0)
  ) ELSE COALESCE(SUM(spent_cents), 0) END,
  COALESCE(SUM(reserved_cents), 0),
  COALESCE(SUM(call_count), 0),
  COALESCE(SUM(reserved_calls), 0)
FROM listing_ai_budget_aggregates
WHERE period_key <> 'lifetime'
GROUP BY provider
ON CONFLICT (period_key, provider) DO NOTHING;
