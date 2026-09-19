-- V5.2 actual-loss evidence and resolution for after-start cancellation and
-- renter no-show. This is forward-only, append-only evidence. It records no
-- payment execution and cannot create a damage charge or amount above the
-- immutable booking quote.

CREATE TABLE IF NOT EXISTS v52_actual_loss_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  platform_contract_id UUID NOT NULL
    REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  cancellation_refund_snapshot_id UUID NOT NULL
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  rent_refund_obligation_id UUID NOT NULL UNIQUE
    REFERENCES v51_cancellation_refund_obligations(id) ON DELETE RESTRICT,
  sit_fee_refund_obligation_id UUID NOT NULL UNIQUE
    REFERENCES v51_cancellation_refund_obligations(id) ON DELETE RESTRICT,
  cause TEXT NOT NULL CHECK (cause IN ('after_start', 'renter_no_show')),
  contract_version TEXT NOT NULL CHECK (contract_version LIKE 'V5.2-%'),
  locale TEXT NOT NULL CHECK (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  quote_id TEXT NOT NULL CHECK (char_length(quote_id) BETWEEN 1 AND 160),
  quote_hash TEXT NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{64}$'),
  rental_subtotal_minor BIGINT NOT NULL CHECK (rental_subtotal_minor >= 0),
  platform_fee_minor BIGINT NOT NULL CHECK (platform_fee_minor >= 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  opened_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opened_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (opened_at <= created_at + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS v52_actual_loss_cases_contract_idx
  ON v52_actual_loss_cases(platform_contract_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS v52_actual_loss_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES v52_actual_loss_cases(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'renter')),
  statement_type TEXT NOT NULL CHECK (
    statement_type IN ('owner_loss_statement', 'renter_lower_loss_statement')
  ),
  owner_claimed_loss_minor BIGINT CHECK (owner_claimed_loss_minor >= 0),
  saved_expense_minor BIGINT CHECK (saved_expense_minor >= 0),
  replacement_rental_minor BIGINT CHECK (replacement_rental_minor >= 0),
  proven_lower_loss_minor BIGINT CHECK (proven_lower_loss_minor >= 0),
  evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(evidence_references) = 'array'
    AND jsonb_array_length(evidence_references) <= 50
  ),
  statement_text TEXT CHECK (
    statement_text IS NULL OR char_length(statement_text) <= 4000
  ),
  submitted_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (submitted_at <= created_at + INTERVAL '5 minutes'),
  CHECK (
    (actor_role = 'owner'
      AND statement_type = 'owner_loss_statement'
      AND owner_claimed_loss_minor IS NOT NULL
      AND saved_expense_minor IS NOT NULL
      AND replacement_rental_minor IS NOT NULL
      AND proven_lower_loss_minor IS NULL)
    OR
    (actor_role = 'renter'
      AND statement_type = 'renter_lower_loss_statement'
      AND owner_claimed_loss_minor IS NULL
      AND saved_expense_minor IS NULL
      AND replacement_rental_minor IS NULL
      AND proven_lower_loss_minor IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS v52_actual_loss_statements_case_idx
  ON v52_actual_loss_statements(case_id, actor_role, submitted_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS v52_actual_loss_statement_evidence (
  statement_id UUID NOT NULL
    REFERENCES v52_actual_loss_statements(id) ON DELETE RESTRICT,
  upload_id UUID NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (statement_id, upload_id)
);

CREATE TABLE IF NOT EXISTS v52_actual_loss_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES v52_actual_loss_cases(id) ON DELETE RESTRICT,
  owner_statement_id UUID NOT NULL
    REFERENCES v52_actual_loss_statements(id) ON DELETE RESTRICT,
  renter_statement_id UUID
    REFERENCES v52_actual_loss_statements(id) ON DELETE RESTRICT,
  renter_lower_loss_accepted BOOLEAN NOT NULL,
  resolved_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  resolver_role TEXT NOT NULL CHECK (resolver_role = 'admin'),
  reason_code TEXT NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 120),
  calculation_basis JSONB NOT NULL CHECK (jsonb_typeof(calculation_basis) = 'object'),
  rent_refund_minor BIGINT NOT NULL CHECK (rent_refund_minor >= 0),
  rent_retained_minor BIGINT NOT NULL CHECK (rent_retained_minor >= 0),
  sit_fee_refund_minor BIGINT NOT NULL CHECK (sit_fee_refund_minor >= 0),
  sit_fee_retained_minor BIGINT NOT NULL CHECK (sit_fee_retained_minor >= 0),
  resolved_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (resolved_at <= created_at + INTERVAL '5 minutes'),
  CHECK (
    (renter_lower_loss_accepted AND renter_statement_id IS NOT NULL)
    OR (NOT renter_lower_loss_accepted)
  )
);

CREATE TABLE IF NOT EXISTS v52_cancellation_refund_resolution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_id UUID NOT NULL
    REFERENCES v52_actual_loss_resolutions(id) ON DELETE RESTRICT,
  obligation_id UUID NOT NULL UNIQUE
    REFERENCES v51_cancellation_refund_obligations(id) ON DELETE RESTRICT,
  refund_type TEXT NOT NULL CHECK (refund_type IN ('rent_refund', 'sit_fee_refund')),
  debtor_role TEXT NOT NULL CHECK (debtor_role IN ('owner', 'sit')),
  amount_due_minor BIGINT NOT NULL CHECK (amount_due_minor >= 0),
  calculation_basis JSONB NOT NULL CHECK (jsonb_typeof(calculation_basis) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  CHECK (
    (refund_type = 'rent_refund' AND debtor_role = 'owner')
    OR (refund_type = 'sit_fee_refund' AND debtor_role = 'sit')
  )
);

CREATE TABLE IF NOT EXISTS v52_actual_loss_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_id UUID NOT NULL UNIQUE
    REFERENCES v52_actual_loss_resolutions(id) ON DELETE RESTRICT,
  artifact_format TEXT NOT NULL CHECK (artifact_format = 'html'),
  content_html TEXT NOT NULL CHECK (char_length(content_html) > 0),
  artifact_sha256 TEXT NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  generated_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (generated_at <= created_at + INTERVAL '5 minutes')
);

CREATE TABLE IF NOT EXISTS v52_actual_loss_receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_id UUID NOT NULL
    REFERENCES v52_actual_loss_resolutions(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('generated', 'delivery_attempted', 'delivered', 'failed')
  ),
  artifact_sha256 TEXT NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS v52_actual_loss_receipt_events_time_idx
  ON v52_actual_loss_receipt_events(resolution_id, occurred_at DESC);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'v52_actual_loss_cases',
    'v52_actual_loss_statements',
    'v52_actual_loss_statement_evidence',
    'v52_actual_loss_resolutions',
    'v52_cancellation_refund_resolution_events',
    'v52_actual_loss_receipts',
    'v52_actual_loss_receipt_events'
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
