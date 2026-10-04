-- V5.1 contract persistence foundation. This migration is intentionally
-- append-only and does not activate a checkout, payment, public route or
-- production behavior by itself.

CREATE TABLE IF NOT EXISTS legal_document_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_key TEXT NOT NULL CHECK (
    document_key IN (
      'platform_terms',
      'private_rental_terms',
      'cancellation',
      'community_moderation',
      'privacy',
      'imprint',
      'withdrawal'
    )
  ),
  document_version TEXT NOT NULL CHECK (char_length(document_version) BETWEEN 1 AND 120),
  locale TEXT NOT NULL DEFAULT 'de' CHECK (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  content_type TEXT NOT NULL CHECK (content_type IN ('text/html', 'text/plain')),
  content_text TEXT NOT NULL CHECK (char_length(content_text) > 0),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_key, document_version, locale, content_sha256)
);

CREATE TABLE IF NOT EXISTS platform_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL UNIQUE
    REFERENCES bookings(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  quote_id TEXT NOT NULL CHECK (char_length(quote_id) BETWEEN 1 AND 160),
  quote_hash TEXT NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{64}$'),
  contract_version TEXT NOT NULL CHECK (char_length(contract_version) BETWEEN 1 AND 120),
  platform_terms_snapshot_id UUID NOT NULL
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  private_rental_terms_snapshot_id UUID NOT NULL
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  locale TEXT NOT NULL DEFAULT 'de' CHECK (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  client_build TEXT NOT NULL CHECK (char_length(client_build) BETWEEN 1 AND 120),
  accepted_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 1 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (accepted_at <= created_at + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS platform_contracts_user_time_idx
  ON platform_contracts(user_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS platform_contract_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  declaration_type TEXT NOT NULL CHECK (
    declaration_type IN (
      'private_terms_and_platform_terms',
      'early_performance_and_withdrawal'
    )
  ),
  exact_wording TEXT NOT NULL CHECK (char_length(exact_wording) > 0),
  wording_sha256 TEXT NOT NULL CHECK (wording_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, declaration_type)
);

CREATE INDEX IF NOT EXISTS platform_contract_declarations_contract_idx
  ON platform_contract_declarations(contract_id, declaration_type);

CREATE TABLE IF NOT EXISTS platform_contract_receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('generated', 'delivery_attempted', 'delivered', 'failed')
  ),
  artifact_format TEXT NOT NULL CHECK (artifact_format IN ('html', 'pdf', 'email')),
  artifact_sha256 TEXT NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_reference TEXT NOT NULL CHECK (
    char_length(artifact_reference) BETWEEN 1 AND 500
    AND artifact_reference !~* '^(?:https?://)?[^/]*@'
  ),
  delivery_channel TEXT NOT NULL CHECK (
    delivery_channel IN ('email', 'in_app', 'download')
  ),
  recipient_hash TEXT CHECK (recipient_hash IS NULL OR recipient_hash ~ '^[0-9a-f]{64}$'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 1 AND 240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS platform_contract_receipt_events_contract_time_idx
  ON platform_contract_receipt_events(contract_id, occurred_at DESC);

DROP TRIGGER IF EXISTS legal_document_snapshots_append_only
  ON legal_document_snapshots;
CREATE TRIGGER legal_document_snapshots_append_only
BEFORE UPDATE OR DELETE ON legal_document_snapshots
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS platform_contracts_append_only
  ON platform_contracts;
CREATE TRIGGER platform_contracts_append_only
BEFORE UPDATE OR DELETE ON platform_contracts
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS platform_contract_declarations_append_only
  ON platform_contract_declarations;
CREATE TRIGGER platform_contract_declarations_append_only
BEFORE UPDATE OR DELETE ON platform_contract_declarations
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS platform_contract_receipt_events_append_only
  ON platform_contract_receipt_events;
CREATE TRIGGER platform_contract_receipt_events_append_only
BEFORE UPDATE OR DELETE ON platform_contract_receipt_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
