-- N2 establishes an additive, versioned listing-AI draft domain. It does not
-- alter listings, copy historical listing payloads, call a provider or publish.

CREATE TABLE listing_ai_drafts (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^listing_ai_draft_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  domain_version TEXT NOT NULL CHECK (domain_version = 'N2-2026-08-23.1'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'listing-ai-draft-v1'),
  prompt_version TEXT NOT NULL CHECK (prompt_version = 'listing-ai-prompt-v1'),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'editing' CHECK (
    status IN ('editing', 'review_ready', 'discarded')
  ),
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  discarded_at TIMESTAMPTZ,
  CHECK ((status = 'discarded') = (discarded_at IS NOT NULL))
);

CREATE INDEX listing_ai_drafts_owner_updated_idx
  ON listing_ai_drafts(owner_id, updated_at DESC, id);

CREATE TABLE listing_ai_draft_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES listing_ai_drafts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  generation_key CHAR(64) NOT NULL CHECK (generation_key ~ '^[0-9a-f]{64}$'),
  generation_mode TEXT NOT NULL CHECK (
    generation_mode IN ('manual_foundation', 'mock', 'provider')
  ),
  input_image_refs JSONB NOT NULL CHECK (
    jsonb_typeof(input_image_refs) = 'array'
    AND jsonb_array_length(input_image_refs) BETWEEN 1 AND 4
  ),
  fields JSONB NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
  clarification_questions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(clarification_questions) = 'array'
    AND jsonb_array_length(clarification_questions) <= 3
  ),
  owner_confirmations JSONB NOT NULL CHECK (
    jsonb_typeof(owner_confirmations) = 'object'
    AND owner_confirmations ?& ARRAY[
      'ownership', 'item_identity', 'allowed_category', 'functionality',
      'condition', 'accessories', 'owner_price', 'duration_discounts',
      'availability', 'pickup_region', 'final_publication'
    ]
    AND owner_confirmations - ARRAY[
      'ownership', 'item_identity', 'allowed_category', 'functionality',
      'condition', 'accessories', 'owner_price', 'duration_discounts',
      'availability', 'pickup_region', 'final_publication'
    ] = '{}'::jsonb
    AND jsonb_typeof(owner_confirmations -> 'ownership') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'item_identity') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'allowed_category') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'functionality') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'condition') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'accessories') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'owner_price') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'duration_discounts') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'availability') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'pickup_region') = 'boolean'
    AND jsonb_typeof(owner_confirmations -> 'final_publication') = 'boolean'
  ),
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, revision),
  UNIQUE (draft_id, generation_key),
  UNIQUE (id, draft_id)
);

CREATE INDEX listing_ai_draft_versions_current_idx
  ON listing_ai_draft_versions(draft_id, revision DESC, id);

CREATE TABLE listing_ai_analysis_derivatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES listing_ai_drafts(id) ON DELETE CASCADE,
  image_reference TEXT NOT NULL CHECK (
    image_reference ~ '^[A-Za-z0-9_.:-]{8,160}$'
  ),
  derivative_kind TEXT NOT NULL CHECK (
    derivative_kind IN ('resized_analysis_copy', 'ocr_text', 'object_labels')
  ),
  storage_reference TEXT CHECK (
    storage_reference IS NULL OR storage_reference ~ '^[A-Za-z0-9_.:-]{8,200}$'
  ),
  state TEXT NOT NULL DEFAULT 'prepared' CHECK (
    state IN ('prepared', 'analysis_ready', 'consumed', 'purged')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purged_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK ((state = 'purged') = (purged_at IS NOT NULL)),
  UNIQUE (draft_id, image_reference, derivative_kind)
);

CREATE INDEX listing_ai_derivatives_expiry_idx
  ON listing_ai_analysis_derivatives(state, expires_at, id);

CREATE TABLE regional_market_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES listing_ai_drafts(id) ON DELETE CASCADE,
  coarse_region_key TEXT NOT NULL CHECK (
    coarse_region_key ~ '^[a-z0-9][a-z0-9_-]{2,79}$'
    AND coarse_region_key !~ '[0-9]{4}'
  ),
  category_id TEXT NOT NULL CHECK (char_length(category_id) BETWEEN 1 AND 80),
  subcategory TEXT NOT NULL CHECK (char_length(subcategory) BETWEEN 1 AND 120),
  daily_price_minor BIGINT NOT NULL CHECK (daily_price_minor BETWEEN 1 AND 100000000),
  currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  source_type TEXT NOT NULL CHECK (
    source_type IN ('owner_observation', 'pilot_aggregate', 'public_aggregate', 'synthetic_test')
  ),
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX regional_market_observations_lookup_idx
  ON regional_market_observations(
    coarse_region_key, category_id, subcategory, observed_at DESC, id
  );

CREATE TABLE regional_price_engine_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES listing_ai_drafts(id) ON DELETE CASCADE,
  draft_version_id UUID NOT NULL,
  engine_authority TEXT NOT NULL CHECK (
    engine_authority = 'SIT_REGIONAL_PRICE_ENGINE_V2'
  ),
  engine_version TEXT NOT NULL CHECK (char_length(engine_version) BETWEEN 1 AND 80),
  input_sha256 CHAR(64) NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  range_low_minor BIGINT NOT NULL CHECK (range_low_minor > 0),
  recommended_daily_minor BIGINT NOT NULL,
  range_high_minor BIGINT NOT NULL,
  explanation TEXT NOT NULL CHECK (char_length(explanation) BETWEEN 1 AND 1000),
  snapshot_payload JSONB NOT NULL CHECK (jsonb_typeof(snapshot_payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    range_low_minor <= recommended_daily_minor
    AND recommended_daily_minor <= range_high_minor
    AND range_high_minor <= 100000000
  ),
  FOREIGN KEY (draft_version_id, draft_id)
    REFERENCES listing_ai_draft_versions(id, draft_id) ON DELETE CASCADE
);

CREATE INDEX regional_price_engine_snapshots_draft_idx
  ON regional_price_engine_snapshots(draft_id, created_at DESC, id);

CREATE TABLE listing_ai_cost_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES listing_ai_drafts(id) ON DELETE CASCADE,
  generation_key CHAR(64) NOT NULL CHECK (generation_key ~ '^[0-9a-f]{64}$'),
  provider TEXT NOT NULL CHECK (provider IN ('disabled', 'mock', 'openai')),
  model TEXT,
  input_units INTEGER NOT NULL DEFAULT 0 CHECK (input_units >= 0),
  output_units INTEGER NOT NULL DEFAULT 0 CHECK (output_units >= 0),
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_cents >= 0),
  billed_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (billed_cost_cents >= 0),
  outcome TEXT NOT NULL CHECK (
    outcome IN ('disabled', 'mocked', 'succeeded', 'failed', 'timed_out', 'schema_rejected')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, generation_key),
  CHECK (provider = 'openai' OR billed_cost_cents = 0)
);

CREATE INDEX listing_ai_cost_ledger_created_idx
  ON listing_ai_cost_ledger(created_at DESC, id);

CREATE TABLE listing_ai_budget_aggregates (
  period_key TEXT NOT NULL CHECK (period_key ~ '^[0-9]{4}-[0-9]{2}$'),
  provider TEXT NOT NULL CHECK (provider IN ('disabled', 'mock', 'openai')),
  budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
  spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (spent_cents >= 0),
  reserved_cents INTEGER NOT NULL DEFAULT 0 CHECK (reserved_cents >= 0),
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (period_key, provider),
  CHECK (spent_cents + reserved_cents <= budget_cents),
  CHECK (provider = 'openai' OR spent_cents = 0)
);

CREATE OR REPLACE FUNCTION sit_reject_listing_ai_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'listing_ai_record_is_append_only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER listing_ai_draft_versions_append_only_guard
BEFORE UPDATE ON listing_ai_draft_versions
FOR EACH ROW EXECUTE FUNCTION sit_reject_listing_ai_append_only_mutation();

CREATE TRIGGER regional_market_observations_append_only_guard
BEFORE UPDATE ON regional_market_observations
FOR EACH ROW EXECUTE FUNCTION sit_reject_listing_ai_append_only_mutation();

CREATE TRIGGER regional_price_engine_snapshots_append_only_guard
BEFORE UPDATE ON regional_price_engine_snapshots
FOR EACH ROW EXECUTE FUNCTION sit_reject_listing_ai_append_only_mutation();

CREATE TRIGGER listing_ai_cost_ledger_append_only_guard
BEFORE UPDATE ON listing_ai_cost_ledger
FOR EACH ROW EXECUTE FUNCTION sit_reject_listing_ai_append_only_mutation();

CREATE OR REPLACE FUNCTION sit_validate_listing_ai_draft_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_draft listing_ai_drafts%ROWTYPE;
BEGIN
  SELECT * INTO target_draft FROM listing_ai_drafts
    WHERE id = NEW.draft_id FOR UPDATE;
  IF target_draft.id IS NULL OR target_draft.status = 'discarded'
    OR NEW.revision <> target_draft.current_revision + 1
  THEN
    RAISE EXCEPTION 'listing_ai_draft_revision_invalid' USING ERRCODE = '23514';
  END IF;
  UPDATE listing_ai_drafts
     SET current_revision = NEW.revision,
         updated_at = now()
   WHERE id = NEW.draft_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_ai_draft_versions_revision_guard
BEFORE INSERT ON listing_ai_draft_versions
FOR EACH ROW EXECUTE FUNCTION sit_validate_listing_ai_draft_version();

CREATE OR REPLACE FUNCTION sit_validate_listing_ai_derivative_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.draft_id, NEW.image_reference, NEW.derivative_kind,
    NEW.storage_reference, NEW.metadata, NEW.expires_at, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.draft_id, OLD.image_reference, OLD.derivative_kind,
    OLD.storage_reference, OLD.metadata, OLD.expires_at, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'listing_ai_derivative_payload_immutable' USING ERRCODE = '55000';
  END IF;
  IF NOT (
    (OLD.state = 'prepared' AND NEW.state IN ('analysis_ready', 'purged'))
    OR (OLD.state = 'analysis_ready' AND NEW.state IN ('consumed', 'purged'))
    OR (OLD.state = 'consumed' AND NEW.state = 'purged')
  ) OR NEW.updated_at <= OLD.updated_at
  THEN
    RAISE EXCEPTION 'listing_ai_derivative_transition_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_ai_derivative_update_guard
BEFORE UPDATE ON listing_ai_analysis_derivatives
FOR EACH ROW EXECUTE FUNCTION sit_validate_listing_ai_derivative_update();

CREATE OR REPLACE FUNCTION sit_reject_listing_ai_derivative_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state <> 'purged'
    AND EXISTS (SELECT 1 FROM listing_ai_drafts WHERE id = OLD.draft_id)
  THEN
    RAISE EXCEPTION 'listing_ai_derivative_delete_requires_purge' USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER listing_ai_derivative_delete_guard
BEFORE DELETE ON listing_ai_analysis_derivatives
FOR EACH ROW EXECUTE FUNCTION sit_reject_listing_ai_derivative_delete();
