CREATE TABLE technical_sandbox_runs (
  id TEXT PRIMARY KEY CHECK (id ~ '^technical_sandbox_[A-Za-z0-9_-]{20,120}$'),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,159}$'),
  authorization_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'unknown', 'expired')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor = 100),
  currency TEXT NOT NULL CHECK (currency = 'EUR'),
  synthetic_email TEXT NOT NULL CHECK (synthetic_email LIKE '%@example.invalid'),
  provider_session_id TEXT UNIQUE,
  provider_payment_intent_id TEXT UNIQUE,
  provider_account_id TEXT,
  provider_livemode BOOLEAN,
  provider_session_status TEXT,
  provider_payment_status TEXT,
  provider_payment_intent_status TEXT,
  checkout_expires_at TIMESTAMPTZ,
  provider_event_received_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX technical_sandbox_runs_user_created_idx
  ON technical_sandbox_runs(user_id, created_at DESC);

CREATE TABLE technical_sandbox_provider_events (
  provider_event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES technical_sandbox_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL CHECK (livemode = false),
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  outcome TEXT NOT NULL DEFAULT 'accepted'
    CHECK (outcome IN ('accepted', 'duplicate', 'rejected'))
);

CREATE INDEX technical_sandbox_provider_events_run_idx
  ON technical_sandbox_provider_events(run_id, received_at DESC);
