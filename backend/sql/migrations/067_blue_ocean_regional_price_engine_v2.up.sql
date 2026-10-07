-- N5 enriches the N2 append-only observation and snapshot foundations. Existing
-- N2 rows remain ineligible until they are explicitly reviewed into the V2
-- schema. No listing, quote, payment or historical record is rewritten.

ALTER TABLE regional_market_observations
  ADD COLUMN market_observation_version TEXT,
  ADD COLUMN brand_model_family TEXT,
  ADD COLUMN condition_class TEXT,
  ADD COLUMN market_actor_type TEXT,
  ADD COLUMN geography_bucket TEXT,
  ADD COLUMN state_code TEXT,
  ADD COLUMN country_code TEXT,
  ADD COLUMN distance_millikm INTEGER,
  ADD COLUMN source_class TEXT,
  ADD COLUMN source_quality_basis_points INTEGER,
  ADD COLUMN status_class TEXT,
  ADD COLUMN provenance_reference TEXT,
  ADD COLUMN reviewed BOOLEAN,
  ADD COLUMN amount_includes_only_rent BOOLEAN,
  ADD COLUMN synthetic BOOLEAN,
  ADD COLUMN engine_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN exclusion_reason_code TEXT;

ALTER TABLE regional_market_observations
  ADD CONSTRAINT regional_market_observations_v2_contract CHECK (
    (
      market_observation_version IS NULL
      AND brand_model_family IS NULL
      AND condition_class IS NULL
      AND market_actor_type IS NULL
      AND geography_bucket IS NULL
      AND state_code IS NULL
      AND country_code IS NULL
      AND distance_millikm IS NULL
      AND source_class IS NULL
      AND source_quality_basis_points IS NULL
      AND status_class IS NULL
      AND provenance_reference IS NULL
      AND reviewed IS NULL
      AND amount_includes_only_rent IS NULL
      AND synthetic IS NULL
      AND engine_eligible = false
      AND exclusion_reason_code IS NULL
    )
    OR
    (
      market_observation_version = 'regional-market-observation-v2'
      AND (brand_model_family IS NULL OR char_length(brand_model_family) BETWEEN 1 AND 160)
      AND condition_class IN ('like_new', 'good', 'visibly_used_but_functional')
      AND market_actor_type IN ('private', 'commercial')
      AND geography_bucket ~ '^[a-z][a-z0-9_-]{2,79}$'
      AND geography_bucket !~ '[0-9]{4}'
      AND state_code ~ '^[A-Z]{2}-[A-Z]{2}$'
      AND country_code = 'DE'
      AND distance_millikm BETWEEN 0 AND 1000000
      AND source_class IN (
        'completed_sit_rental',
        'accepted_sit_request',
        'active_sit_listing',
        'reviewed_external_c2c_asking_price',
        'professional_commercial_reference',
        'synthetic_fixture'
      )
      AND source_quality_basis_points = CASE source_class
        WHEN 'completed_sit_rental' THEN 10000
        WHEN 'accepted_sit_request' THEN 9000
        WHEN 'active_sit_listing' THEN 5500
        WHEN 'reviewed_external_c2c_asking_price' THEN 4000
        WHEN 'professional_commercial_reference' THEN 2500
        WHEN 'synthetic_fixture' THEN 0
      END
      AND status_class = CASE source_class
        WHEN 'completed_sit_rental' THEN 'completed'
        WHEN 'accepted_sit_request' THEN 'accepted'
        WHEN 'active_sit_listing' THEN 'active'
        WHEN 'reviewed_external_c2c_asking_price' THEN 'reviewed'
        WHEN 'professional_commercial_reference' THEN 'reviewed'
        WHEN 'synthetic_fixture' THEN 'synthetic'
      END
      AND provenance_reference ~ '^[A-Za-z0-9_.:-]{8,160}$'
      AND reviewed IS NOT NULL
      AND amount_includes_only_rent IS NOT NULL
      AND synthetic = (source_class = 'synthetic_fixture')
      AND (
        source_class NOT IN (
          'reviewed_external_c2c_asking_price',
          'professional_commercial_reference'
        )
        OR reviewed = true
      )
      AND engine_eligible = (
        source_quality_basis_points > 0
        AND amount_includes_only_rent = true
        AND exclusion_reason_code IS NULL
      )
      AND (
        exclusion_reason_code IS NULL
        OR exclusion_reason_code ~ '^[a-z][a-z0-9_]{2,79}$'
      )
    )
  );

CREATE INDEX regional_market_observations_v2_lookup_idx
  ON regional_market_observations(
    category_id, subcategory, state_code, country_code,
    distance_millikm, observed_at DESC, id
  )
  WHERE market_observation_version = 'regional-market-observation-v2'
    AND engine_eligible = true;

ALTER TABLE regional_price_engine_snapshots
  ADD COLUMN market_observation_version TEXT,
  ADD COLUMN fallback_anchor_minor BIGINT,
  ADD COLUMN regional_weighted_median_minor BIGINT,
  ADD COLUMN effective_observation_count_milli BIGINT,
  ADD COLUMN geography_scope TEXT,
  ADD COLUMN confidence TEXT,
  ADD COLUMN fallback_share_basis_points INTEGER,
  ADD COLUMN demand_factor_basis_points INTEGER,
  ADD COLUMN duration_schedule JSONB,
  ADD COLUMN quote_preview JSONB,
  ADD COLUMN owner_selected_daily_minor BIGINT,
  ADD COLUMN owner_override_applied BOOLEAN,
  ADD COLUMN synthetic_learning_applied BOOLEAN;

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
