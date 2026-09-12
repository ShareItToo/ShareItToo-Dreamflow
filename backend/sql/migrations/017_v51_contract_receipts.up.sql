-- Immutable V5.1 contract confirmations. The artifact is stored in the
-- database so the renter can retrieve the exact accepted texts and hashes
-- independently of later public-page changes.

CREATE TABLE IF NOT EXISTS platform_contract_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL UNIQUE
    REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  artifact_format TEXT NOT NULL CHECK (artifact_format = 'html'),
  content_html TEXT NOT NULL CHECK (char_length(content_html) > 0),
  artifact_sha256 TEXT NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  generated_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 1 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (generated_at <= created_at + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS platform_contract_receipts_contract_time_idx
  ON platform_contract_receipts(contract_id, generated_at DESC);

DROP TRIGGER IF EXISTS platform_contract_receipts_append_only
  ON platform_contract_receipts;
CREATE TRIGGER platform_contract_receipts_append_only
BEFORE UPDATE OR DELETE ON platform_contract_receipts
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
