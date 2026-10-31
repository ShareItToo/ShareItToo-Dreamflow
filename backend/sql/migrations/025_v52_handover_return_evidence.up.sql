-- V5.2 handover/return evidence, challenge and substantiated return-case
-- bindings. All new records are append-only and bind to the immutable booking
-- quote, platform contract, legal snapshot and processed private uploads.
-- This migration records no payment execution and creates no damage charge.

CREATE TABLE IF NOT EXISTS v52_condition_evidence_bindings (
  evidence_id UUID PRIMARY KEY
    REFERENCES booking_condition_evidence(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  platform_contract_id UUID NOT NULL
    REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  handover_return_damage_snapshot_id UUID NOT NULL
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  quote_id TEXT NOT NULL CHECK (char_length(quote_id) BETWEEN 1 AND 160),
  quote_hash TEXT NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{64}$'),
  contract_version TEXT NOT NULL CHECK (contract_version LIKE 'V5.2-%'),
  locale TEXT NOT NULL CHECK (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  segment TEXT NOT NULL CHECK (segment IN ('pickup', 'return')),
  evidence_kind TEXT NOT NULL CHECK (
    evidence_kind IN ('presenter_photo', 'counterparty_deviation')
  ),
  semantic_slot TEXT NOT NULL CHECK (
    semantic_slot IN ('overview', 'detail', 'accessories', 'critical', 'deviation')
  ),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'renter')),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  upload_id UUID NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
  upload_purpose TEXT NOT NULL CHECK (
    upload_purpose IN ('handover_evidence', 'return_evidence')
  ),
  upload_sha256 TEXT NOT NULL CHECK (upload_sha256 ~ '^[0-9a-f]{64}$'),
  source TEXT NOT NULL CHECK (source IN ('camera', 'gallery', 'browser_picker')),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (evidence_kind = 'presenter_photo' AND semantic_slot <> 'deviation')
    OR (evidence_kind = 'counterparty_deviation' AND semantic_slot = 'deviation')
  ),
  CHECK (
    (segment = 'pickup' AND upload_purpose = 'handover_evidence')
    OR (segment = 'return' AND upload_purpose = 'return_evidence')
  ),
  CHECK (observed_at <= created_at + INTERVAL '5 minutes')
);

CREATE UNIQUE INDEX IF NOT EXISTS v52_presenter_evidence_slot_idx
  ON v52_condition_evidence_bindings(booking_id, segment, semantic_slot)
  WHERE evidence_kind = 'presenter_photo';

CREATE INDEX IF NOT EXISTS v52_condition_evidence_contract_idx
  ON v52_condition_evidence_bindings(platform_contract_id, booking_id, segment, created_at);

CREATE TABLE IF NOT EXISTS v52_condition_confirmation_bindings (
  confirmation_id UUID PRIMARY KEY
    REFERENCES booking_condition_confirmations(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  platform_contract_id UUID NOT NULL
    REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  handover_return_damage_snapshot_id UUID NOT NULL
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  quote_id TEXT NOT NULL CHECK (char_length(quote_id) BETWEEN 1 AND 160),
  quote_hash TEXT NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{64}$'),
  contract_version TEXT NOT NULL CHECK (contract_version LIKE 'V5.2-%'),
  locale TEXT NOT NULL CHECK (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  segment TEXT NOT NULL CHECK (segment IN ('pickup', 'return')),
  verifier_role TEXT NOT NULL CHECK (verifier_role IN ('owner', 'renter')),
  verifier_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'deviation_recorded')),
  presenter_evidence_set_sha256 TEXT NOT NULL
    CHECK (presenter_evidence_set_sha256 ~ '^[0-9a-f]{64}$'),
  presenter_photo_count INTEGER NOT NULL CHECK (presenter_photo_count = 4),
  deviation_photo_count INTEGER NOT NULL CHECK (deviation_photo_count >= 0),
  confirmed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (confirmed_at <= created_at + INTERVAL '5 minutes'),
  CHECK (
    (decision = 'confirmed' AND deviation_photo_count = 0)
    OR (decision = 'deviation_recorded' AND deviation_photo_count >= 1)
  )
);

CREATE INDEX IF NOT EXISTS v52_condition_confirmation_contract_idx
  ON v52_condition_confirmation_bindings(platform_contract_id, booking_id, segment, confirmed_at);

CREATE TABLE IF NOT EXISTS v52_confirmation_challenge_bindings (
  challenge_id UUID PRIMARY KEY
    REFERENCES booking_confirmation_challenges(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  platform_contract_id UUID NOT NULL
    REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  handover_return_damage_snapshot_id UUID NOT NULL
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  quote_id TEXT NOT NULL CHECK (char_length(quote_id) BETWEEN 1 AND 160),
  quote_hash TEXT NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{64}$'),
  contract_version TEXT NOT NULL CHECK (contract_version LIKE 'V5.2-%'),
  locale TEXT NOT NULL CHECK (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  segment TEXT NOT NULL CHECK (segment IN ('pickup', 'return')),
  presenter_role TEXT NOT NULL CHECK (presenter_role IN ('owner', 'renter')),
  presenter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  presenter_evidence_set_sha256 TEXT NOT NULL
    CHECK (presenter_evidence_set_sha256 ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (issued_at <= created_at + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS v52_confirmation_challenge_contract_idx
  ON v52_confirmation_challenge_bindings(platform_contract_id, booking_id, segment, issued_at);

CREATE TABLE IF NOT EXISTS v52_confirmation_verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL UNIQUE
    REFERENCES booking_confirmation_challenges(id) ON DELETE RESTRICT,
  confirmation_id UUID NOT NULL
    REFERENCES booking_condition_confirmations(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  verifier_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  verifier_role TEXT NOT NULL CHECK (verifier_role IN ('owner', 'renter')),
  presenter_evidence_set_sha256 TEXT NOT NULL
    CHECK (presenter_evidence_set_sha256 ~ '^[0-9a-f]{64}$'),
  verification_method TEXT NOT NULL CHECK (verification_method = 'server_challenge'),
  verified_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (verified_at <= created_at + INTERVAL '5 minutes')
);

CREATE TABLE IF NOT EXISTS v52_return_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_case_id UUID NOT NULL UNIQUE REFERENCES booking_cases(id) ON DELETE RESTRICT,
  report_id UUID NOT NULL UNIQUE REFERENCES reports(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  platform_contract_id UUID NOT NULL
    REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  handover_return_damage_snapshot_id UUID NOT NULL
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  quote_id TEXT NOT NULL CHECK (char_length(quote_id) BETWEEN 1 AND 160),
  quote_hash TEXT NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{64}$'),
  contract_version TEXT NOT NULL CHECK (contract_version LIKE 'V5.2-%'),
  locale TEXT NOT NULL CHECK (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  opened_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opened_by_role TEXT NOT NULL CHECK (opened_by_role IN ('owner', 'renter')),
  reason_code TEXT NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 120),
  reason_details TEXT NOT NULL CHECK (char_length(reason_details) BETWEEN 10 AND 4000),
  t0 TIMESTAMPTZ NOT NULL,
  t1 TIMESTAMPTZ NOT NULL,
  report_deadline TIMESTAMPTZ NOT NULL,
  response_due_at TIMESTAMPTZ NOT NULL,
  next_status_update_due_at TIMESTAMPTZ NOT NULL,
  authorized_booking_minor BIGINT NOT NULL CHECK (authorized_booking_minor >= 0),
  contested_authorized_minor BIGINT NOT NULL CHECK (contested_authorized_minor > 0),
  undisputed_releasable_minor BIGINT NOT NULL CHECK (undisputed_releasable_minor >= 0),
  additional_charge_minor BIGINT NOT NULL DEFAULT 0 CHECK (additional_charge_minor = 0),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  command_sha256 TEXT NOT NULL CHECK (command_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (contested_authorized_minor <= authorized_booking_minor),
  CHECK (undisputed_releasable_minor = authorized_booking_minor - contested_authorized_minor),
  CHECK (t1 >= t0 AND t1 <= report_deadline),
  CHECK (report_deadline = t0 + INTERVAL '48 hours'),
  CHECK (response_due_at = t1 + INTERVAL '5 days'),
  CHECK (next_status_update_due_at = t1 + INTERVAL '7 days'),
  CHECK (t1 <= created_at + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS v52_return_cases_contract_idx
  ON v52_return_cases(platform_contract_id, t1 DESC);

CREATE TABLE IF NOT EXISTS v52_return_case_evidence (
  return_case_id UUID NOT NULL REFERENCES v52_return_cases(id) ON DELETE RESTRICT,
  upload_id UUID NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
  upload_purpose TEXT NOT NULL CHECK (upload_purpose = 'report_evidence'),
  upload_sha256 TEXT NOT NULL CHECK (upload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (return_case_id, upload_id)
);

CREATE TABLE IF NOT EXISTS v52_return_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_case_id UUID NOT NULL REFERENCES v52_return_cases(id) ON DELETE RESTRICT,
  actor_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'renter', 'support', 'admin', 'system')),
  event_type TEXT NOT NULL CHECK (event_type IN ('opened', 'response_recorded', 'status_update')),
  occurred_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (occurred_at <= created_at + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS v52_return_case_events_time_idx
  ON v52_return_case_events(return_case_id, occurred_at, id);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'v52_condition_evidence_bindings',
    'v52_condition_confirmation_bindings',
    'v52_confirmation_challenge_bindings',
    'v52_confirmation_verification_events',
    'v52_return_cases',
    'v52_return_case_evidence',
    'v52_return_case_events'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_append_only ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_append_only BEFORE UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation()',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;
