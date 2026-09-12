-- V5.1 immutable financial documents. These documents are derived only from
-- captured payment, succeeded refund, or paid payout snapshots. They do not
-- enable live money and they never turn a private rental into a SIT VAT sale.

CREATE TABLE IF NOT EXISTS financial_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  audience_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'booking_payment_receipt',
    'sit_fee_receipt',
    'owner_payout_statement',
    'refund_receipt'
  )),
  payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
  refund_id UUID REFERENCES refunds(id) ON DELETE RESTRICT,
  payout_id UUID REFERENCES payouts(id) ON DELETE RESTRICT,
  document_number TEXT NOT NULL UNIQUE
    CHECK (char_length(document_number) BETWEEN 12 AND 80),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  private_rent_minor BIGINT NOT NULL DEFAULT 0 CHECK (private_rent_minor >= 0),
  sit_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (sit_fee_minor >= 0),
  owner_payout_minor BIGINT NOT NULL DEFAULT 0 CHECK (owner_payout_minor >= 0),
  rent_refund_minor BIGINT NOT NULL DEFAULT 0 CHECK (rent_refund_minor >= 0),
  sit_fee_refund_minor BIGINT NOT NULL DEFAULT 0 CHECK (sit_fee_refund_minor >= 0),
  supplier_role TEXT NOT NULL CHECK (supplier_role IN ('private_owner', 'sit', 'payment_provider')),
  debtor_role TEXT NOT NULL CHECK (debtor_role IN ('renter', 'owner', 'sit', 'payment_provider')),
  tax_treatment TEXT NOT NULL CHECK (tax_treatment IN (
    'private_rent_no_sit_vat',
    'sit_fee_tax_status_pending',
    'sit_fee_tax_status_configured',
    'not_applicable'
  )),
  test_mode BOOLEAN NOT NULL,
  snapshot JSONB NOT NULL,
  content_html TEXT NOT NULL CHECK (char_length(content_html) > 0),
  artifact_sha256 CHAR(64) NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (payment_id IS NOT NULL)::int
      + (refund_id IS NOT NULL)::int
      + (payout_id IS NOT NULL)::int = 1
  ),
  CHECK (
    (document_type IN ('booking_payment_receipt', 'sit_fee_receipt')
      AND payment_id IS NOT NULL)
    OR (document_type = 'refund_receipt' AND refund_id IS NOT NULL)
    OR (document_type = 'owner_payout_statement' AND payout_id IS NOT NULL)
  ),
  CHECK (
    (document_type = 'booking_payment_receipt'
      AND amount_minor = private_rent_minor + sit_fee_minor
      AND owner_payout_minor = 0
      AND rent_refund_minor = 0
      AND sit_fee_refund_minor = 0
      AND supplier_role = 'private_owner'
      AND debtor_role = 'renter'
      AND tax_treatment = 'private_rent_no_sit_vat')
    OR (document_type = 'sit_fee_receipt'
      AND amount_minor = sit_fee_minor
      AND private_rent_minor = 0
      AND owner_payout_minor = 0
      AND rent_refund_minor = 0
      AND sit_fee_refund_minor = 0
      AND supplier_role = 'sit'
      AND debtor_role = 'renter'
      AND tax_treatment IN (
        'sit_fee_tax_status_pending',
        'sit_fee_tax_status_configured'
      ))
    OR (document_type = 'owner_payout_statement'
      AND amount_minor = owner_payout_minor
      AND private_rent_minor = 0
      AND sit_fee_minor = 0
      AND rent_refund_minor = 0
      AND sit_fee_refund_minor = 0
      AND supplier_role = 'private_owner'
      AND debtor_role = 'payment_provider'
      AND tax_treatment = 'not_applicable')
    OR (document_type = 'refund_receipt'
      AND amount_minor = rent_refund_minor + sit_fee_refund_minor
      AND private_rent_minor = 0
      AND sit_fee_minor = 0
      AND owner_payout_minor = 0
      AND supplier_role = 'payment_provider'
      AND debtor_role = 'payment_provider'
      AND tax_treatment = 'not_applicable')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_documents_payment_type_audience_idx
  ON financial_documents(document_type, payment_id, audience_user_id)
  WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS financial_documents_refund_type_audience_idx
  ON financial_documents(document_type, refund_id, audience_user_id)
  WHERE refund_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS financial_documents_payout_type_audience_idx
  ON financial_documents(document_type, payout_id, audience_user_id)
  WHERE payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS financial_documents_audience_time_idx
  ON financial_documents(audience_user_id, issued_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS financial_documents_booking_time_idx
  ON financial_documents(booking_id, issued_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS financial_document_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES financial_documents(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('generated', 'downloaded')),
  artifact_sha256 CHAR(64) NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS financial_document_events_document_time_idx
  ON financial_document_events(document_id, occurred_at DESC);

DROP TRIGGER IF EXISTS financial_documents_append_only ON financial_documents;
CREATE TRIGGER financial_documents_append_only
BEFORE UPDATE OR DELETE ON financial_documents
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS financial_document_events_append_only ON financial_document_events;
CREATE TRIGGER financial_document_events_append_only
BEFORE UPDATE OR DELETE ON financial_document_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
