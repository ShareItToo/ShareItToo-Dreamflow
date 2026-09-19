-- WP260-D: durable, owner-bound analysis attempts.  A paid provider call may
-- only start after an attempt is claimed as running.  Unknown outcomes remain
-- occupied and are never implicitly retried.
ALTER TABLE listing_ai_cost_ledger
  ALTER COLUMN billed_cost_cents DROP NOT NULL;

CREATE TABLE listing_ai_analysis_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES listing_ai_drafts(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_key CHAR(64) NOT NULL CHECK (generation_key ~ '^[0-9a-f]{64}$'),
  request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  image_sha256 CHAR(64) NOT NULL CHECK (image_sha256 ~ '^[0-9a-f]{64}$'),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 200),
  consent_sha256 CHAR(64) NOT NULL CHECK (consent_sha256 ~ '^[0-9a-f]{64}$'),
  max_cost_cents INTEGER NOT NULL CHECK (max_cost_cents BETWEEN 0 AND 10000),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'egress_started', 'succeeded', 'unknown', 'failed')),
  provider_call_count INTEGER NOT NULL DEFAULT 0 CHECK (provider_call_count >= 0),
  estimated_cost_cents INTEGER CHECK (estimated_cost_cents IS NULL OR estimated_cost_cents >= 0),
  billed_cost_cents INTEGER CHECK (billed_cost_cents IS NULL OR billed_cost_cents >= 0),
  reserved_cost_cents INTEGER NOT NULL CHECK (reserved_cost_cents >= 0),
  reserved_call_count INTEGER NOT NULL CHECK (reserved_call_count BETWEEN 1 AND 5),
  egress_started_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, generation_key)
);

CREATE INDEX listing_ai_analysis_attempts_owner_idx
  ON listing_ai_analysis_attempts(owner_id, updated_at DESC, id);

CREATE INDEX listing_ai_analysis_attempts_unknown_idx
  ON listing_ai_analysis_attempts(status, updated_at DESC, id)
  WHERE status = 'unknown';

CREATE TABLE listing_ai_budget_reservations (
  attempt_id UUID PRIMARY KEY REFERENCES listing_ai_analysis_attempts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'openai'),
  reserved_cents INTEGER NOT NULL CHECK (reserved_cents > 0),
  reserved_calls INTEGER NOT NULL CHECK (reserved_calls BETWEEN 1 AND 5),
  consumed_cents INTEGER NOT NULL DEFAULT 0 CHECK (consumed_cents >= 0),
  consumed_calls INTEGER NOT NULL DEFAULT 0 CHECK (consumed_calls >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'settled', 'unknown', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
