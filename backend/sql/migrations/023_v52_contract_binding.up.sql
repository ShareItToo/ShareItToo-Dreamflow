-- V5.2 checkout and platform-contract binding. This migration is forward-only:
-- historical V5.1 rows and their two original snapshot columns remain intact.
-- It does not provision, approve, publish, or activate a legal document.

ALTER TABLE legal_document_snapshots
  DROP CONSTRAINT IF EXISTS legal_document_snapshots_document_key_check;

ALTER TABLE legal_document_snapshots
  ADD CONSTRAINT legal_document_snapshots_document_key_check CHECK (
    document_key IN (
      'platform_terms',
      'private_rental_terms',
      'cancellation',
      'community_moderation',
      'privacy',
      'imprint',
      'withdrawal',
      'cancellation_refund',
      'handover_return_damage',
      'payment_payout',
      'community_safety',
      'reporting_moderation_review',
      'imprint_withdrawal_shorttexts'
    )
  ) NOT VALID;

ALTER TABLE legal_document_snapshots
  VALIDATE CONSTRAINT legal_document_snapshots_document_key_check;

ALTER TABLE platform_contracts
  ADD COLUMN IF NOT EXISTS cancellation_refund_snapshot_id UUID
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS handover_return_damage_snapshot_id UUID
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_payout_snapshot_id UUID
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS community_safety_snapshot_id UUID
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reporting_moderation_review_snapshot_id UUID
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS privacy_snapshot_id UUID
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS imprint_withdrawal_shorttexts_snapshot_id UUID
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS sit_acceptance_wording TEXT,
  ADD COLUMN IF NOT EXISTS sit_acceptance_sha256 TEXT;

ALTER TABLE platform_contracts
  ADD CONSTRAINT platform_contracts_v52_complete_binding_check CHECK (
    contract_version NOT LIKE 'V5.2-%'
    OR (
      cancellation_refund_snapshot_id IS NOT NULL
      AND handover_return_damage_snapshot_id IS NOT NULL
      AND payment_payout_snapshot_id IS NOT NULL
      AND community_safety_snapshot_id IS NOT NULL
      AND reporting_moderation_review_snapshot_id IS NOT NULL
      AND privacy_snapshot_id IS NOT NULL
      AND imprint_withdrawal_shorttexts_snapshot_id IS NOT NULL
      AND sit_acceptance_wording IS NOT NULL
      AND char_length(sit_acceptance_wording) > 0
      AND sit_acceptance_sha256 IS NOT NULL
      AND sit_acceptance_sha256 ~ '^[0-9a-f]{64}$'
    )
  ) NOT VALID;

ALTER TABLE platform_contracts
  VALIDATE CONSTRAINT platform_contracts_v52_complete_binding_check;

ALTER TABLE platform_contract_declarations
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  ADD COLUMN IF NOT EXISTS document_version TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT,
  ADD COLUMN IF NOT EXISTS client_build TEXT,
  ADD COLUMN IF NOT EXISTS quote_id TEXT,
  ADD COLUMN IF NOT EXISTS quote_hash TEXT,
  ADD COLUMN IF NOT EXISTS document_references JSONB;

ALTER TABLE platform_contract_declarations
  ADD CONSTRAINT platform_contract_declarations_v52_metadata_check CHECK (
    num_nonnulls(
      user_id, booking_id, document_version, locale, client_build,
      quote_id, quote_hash, document_references
    ) = 0
    OR (
      user_id IS NOT NULL
      AND booking_id IS NOT NULL
      AND document_version IS NOT NULL
      AND char_length(document_version) BETWEEN 1 AND 120
      AND locale IS NOT NULL
      AND locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'
      AND client_build IS NOT NULL
      AND char_length(client_build) BETWEEN 1 AND 120
      AND quote_id IS NOT NULL
      AND char_length(quote_id) BETWEEN 1 AND 160
      AND quote_hash IS NOT NULL
      AND quote_hash ~ '^[0-9a-f]{64}$'
      AND document_references IS NOT NULL
      AND jsonb_typeof(document_references) = 'array'
      AND jsonb_array_length(document_references) > 0
    )
  ) NOT VALID;

ALTER TABLE platform_contract_declarations
  VALIDATE CONSTRAINT platform_contract_declarations_v52_metadata_check;

ALTER TABLE platform_contract_declarations
  DROP CONSTRAINT IF EXISTS platform_contract_declarations_contract_id_fkey;

ALTER TABLE platform_contract_declarations
  ADD CONSTRAINT platform_contract_declarations_contract_id_fkey
  FOREIGN KEY (contract_id) REFERENCES platform_contracts(id) ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS platform_contract_declarations_user_booking_idx
  ON platform_contract_declarations(user_id, booking_id, accepted_at DESC)
  WHERE user_id IS NOT NULL AND booking_id IS NOT NULL;
