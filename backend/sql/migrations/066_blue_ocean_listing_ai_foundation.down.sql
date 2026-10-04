-- N2 rollback is intentionally blocked once draft or observation data exists.
-- Empty additive objects can be removed without touching historical listings.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM listing_ai_drafts)
    OR EXISTS (SELECT 1 FROM regional_market_observations)
    OR EXISTS (SELECT 1 FROM listing_ai_cost_ledger)
    OR EXISTS (SELECT 1 FROM listing_ai_budget_aggregates)
  THEN
    RAISE EXCEPTION 'N2 rollback blocked: listing AI foundation data exists';
  END IF;
END;
$$;

DROP TRIGGER listing_ai_derivative_delete_guard ON listing_ai_analysis_derivatives;
DROP TRIGGER listing_ai_derivative_update_guard ON listing_ai_analysis_derivatives;
DROP TRIGGER listing_ai_draft_versions_revision_guard ON listing_ai_draft_versions;
DROP TRIGGER listing_ai_cost_ledger_append_only_guard ON listing_ai_cost_ledger;
DROP TRIGGER regional_price_engine_snapshots_append_only_guard ON regional_price_engine_snapshots;
DROP TRIGGER regional_market_observations_append_only_guard ON regional_market_observations;
DROP TRIGGER listing_ai_draft_versions_append_only_guard ON listing_ai_draft_versions;

DROP FUNCTION sit_reject_listing_ai_derivative_delete();
DROP FUNCTION sit_validate_listing_ai_derivative_update();
DROP FUNCTION sit_validate_listing_ai_draft_version();
DROP FUNCTION sit_reject_listing_ai_append_only_mutation();

DROP TABLE listing_ai_budget_aggregates;
DROP TABLE listing_ai_cost_ledger;
DROP TABLE regional_price_engine_snapshots;
DROP TABLE regional_market_observations;
DROP TABLE listing_ai_analysis_derivatives;
DROP TABLE listing_ai_draft_versions;
DROP TABLE listing_ai_drafts;
