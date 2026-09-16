-- The R6 constraint may be restored to the N5-only contract only while no R6
-- snapshot exists. This never deletes price evidence.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM regional_price_engine_snapshots
     WHERE engine_version = 'R6-2026-08-24.1'
  ) THEN
    RAISE EXCEPTION 'R6 rollback blocked: hardened price snapshot data exists';
  END IF;
END;
$$;

ALTER TABLE regional_price_engine_snapshots
  DROP CONSTRAINT regional_price_engine_snapshots_v2_contract;

ALTER TABLE regional_price_engine_snapshots
  ADD CONSTRAINT regional_price_engine_snapshots_v2_contract CHECK (
    (
      engine_version <> 'N5-2026-08-24.1'
      AND market_observation_version IS NULL
      AND fallback_anchor_minor IS NULL
      AND regional_weighted_median_minor IS NULL
      AND effective_observation_count_milli IS NULL
      AND geography_scope IS NULL
      AND confidence IS NULL
      AND fallback_share_basis_points IS NULL
      AND demand_factor_basis_points IS NULL
      AND duration_schedule IS NULL
      AND quote_preview IS NULL
      AND owner_selected_daily_minor IS NULL
      AND owner_override_applied IS NULL
      AND synthetic_learning_applied IS NULL
    )
    OR
    (
      engine_version = 'N5-2026-08-24.1'
      AND market_observation_version = 'regional-market-observation-v2'
      AND fallback_anchor_minor BETWEEN 1 AND 100000000
      AND (
        regional_weighted_median_minor IS NULL
        OR regional_weighted_median_minor BETWEEN 1 AND 100000000
      )
      AND effective_observation_count_milli BETWEEN 0 AND 5000000
      AND geography_scope IN (
        'within_20_km', 'within_50_km', 'within_100_km',
        'baden_wuerttemberg', 'germany'
      )
      AND confidence IN ('HIGH', 'MEDIUM', 'LOW')
      AND fallback_share_basis_points BETWEEN 0 AND 10000
      AND demand_factor_basis_points BETWEEN 9000 AND 11000
      AND jsonb_typeof(duration_schedule) = 'object'
      AND jsonb_typeof(quote_preview) = 'object'
      AND (
        owner_selected_daily_minor IS NULL
        OR owner_selected_daily_minor BETWEEN 1 AND 100000000
      )
      AND owner_override_applied IS NOT NULL
      AND (owner_override_applied = false OR owner_selected_daily_minor IS NOT NULL)
      AND synthetic_learning_applied = false
    )
  );
