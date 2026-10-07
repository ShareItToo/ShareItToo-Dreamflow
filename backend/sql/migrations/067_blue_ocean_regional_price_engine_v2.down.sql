-- N5 rollback is allowed only while no V2 observation or V2 snapshot exists.
-- This prevents destructive loss of reviewed market provenance or price truth.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM regional_market_observations
     WHERE market_observation_version = 'regional-market-observation-v2'
  ) OR EXISTS (
    SELECT 1 FROM regional_price_engine_snapshots
     WHERE engine_version = 'N5-2026-08-24.1'
  ) THEN
    RAISE EXCEPTION 'N5 rollback blocked: regional price V2 data exists';
  END IF;
END;
$$;

ALTER TABLE regional_price_engine_snapshots
  DROP CONSTRAINT regional_price_engine_snapshots_v2_contract;

ALTER TABLE regional_price_engine_snapshots
  DROP COLUMN synthetic_learning_applied,
  DROP COLUMN owner_override_applied,
  DROP COLUMN owner_selected_daily_minor,
  DROP COLUMN quote_preview,
  DROP COLUMN duration_schedule,
  DROP COLUMN demand_factor_basis_points,
  DROP COLUMN fallback_share_basis_points,
  DROP COLUMN confidence,
  DROP COLUMN geography_scope,
  DROP COLUMN effective_observation_count_milli,
  DROP COLUMN regional_weighted_median_minor,
  DROP COLUMN fallback_anchor_minor,
  DROP COLUMN market_observation_version;

DROP INDEX regional_market_observations_v2_lookup_idx;

ALTER TABLE regional_market_observations
  DROP CONSTRAINT regional_market_observations_v2_contract;

ALTER TABLE regional_market_observations
  DROP COLUMN exclusion_reason_code,
  DROP COLUMN engine_eligible,
  DROP COLUMN synthetic,
  DROP COLUMN amount_includes_only_rent,
  DROP COLUMN reviewed,
  DROP COLUMN provenance_reference,
  DROP COLUMN status_class,
  DROP COLUMN source_quality_basis_points,
  DROP COLUMN source_class,
  DROP COLUMN distance_millikm,
  DROP COLUMN country_code,
  DROP COLUMN state_code,
  DROP COLUMN geography_bucket,
  DROP COLUMN market_actor_type,
  DROP COLUMN condition_class,
  DROP COLUMN brand_model_family,
  DROP COLUMN market_observation_version;
