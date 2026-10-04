CREATE TABLE support_evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL UNIQUE REFERENCES support_evidence(id) ON DELETE RESTRICT,
  uploader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_storage_name TEXT NOT NULL UNIQUE CHECK (
    original_storage_name ~ '^support-evidence-[0-9a-f-]{36}-original[.](jpg|png|webp|quarantine)$'
  ),
  preview_storage_name TEXT UNIQUE CHECK (
    preview_storage_name IS NULL
    OR preview_storage_name ~ '^support-evidence-[0-9a-f-]{36}-preview[.]webp$'
  ),
  detected_mime_type TEXT NOT NULL CHECK (
    detected_mime_type IN (
      'image/jpeg', 'image/png', 'image/webp', 'application/x-eicar-test'
    )
  ),
  original_byte_size INTEGER NOT NULL CHECK (
    original_byte_size BETWEEN 1 AND 8388608
  ),
  original_sha256 TEXT NOT NULL CHECK (original_sha256 ~ '^[0-9a-f]{64}$'),
  preview_mime_type TEXT CHECK (
    preview_mime_type IS NULL OR preview_mime_type = 'image/webp'
  ),
  preview_byte_size INTEGER CHECK (
    preview_byte_size IS NULL OR preview_byte_size BETWEEN 1 AND 8388608
  ),
  preview_sha256 TEXT CHECK (
    preview_sha256 IS NULL OR preview_sha256 ~ '^[0-9a-f]{64}$'
  ),
  image_width INTEGER CHECK (image_width IS NULL OR image_width BETWEEN 1 AND 12000),
  image_height INTEGER CHECK (image_height IS NULL OR image_height BETWEEN 1 AND 12000),
  scan_status TEXT NOT NULL CHECK (
    scan_status IN ('pending', 'clean', 'quarantined', 'failed')
  ),
  scan_engine TEXT NOT NULL CHECK (
    scan_engine IN ('none', 'deterministic_signature', 'internal_test_fixture')
  ),
  scan_reference TEXT,
  quarantine_reason_code TEXT CHECK (
    quarantine_reason_code IS NULL
    OR quarantine_reason_code ~ '^[a-z0-9_.:-]{3,120}$'
  ),
  external_ai_used BOOLEAN NOT NULL DEFAULT false CHECK (external_ai_used = false),
  idempotency_key TEXT NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 160
    AND idempotency_key ~ '^[A-Za-z0-9_.:-]+$'
  ),
  request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scanned_at TIMESTAMPTZ,
  UNIQUE (uploader_user_id, idempotency_key),
  CHECK (
    (preview_storage_name IS NULL AND preview_mime_type IS NULL
      AND preview_byte_size IS NULL AND preview_sha256 IS NULL
      AND image_width IS NULL AND image_height IS NULL)
    OR
    (preview_storage_name IS NOT NULL AND preview_mime_type = 'image/webp'
      AND preview_byte_size IS NOT NULL AND preview_sha256 IS NOT NULL
      AND image_width IS NOT NULL AND image_height IS NOT NULL)
  ),
  CHECK (
    (scan_status = 'pending' AND scan_engine = 'none' AND scanned_at IS NULL
      AND quarantine_reason_code IS NULL)
    OR
    (scan_status = 'clean' AND scan_engine = 'internal_test_fixture'
      AND scanned_at IS NOT NULL AND preview_storage_name IS NOT NULL
      AND quarantine_reason_code IS NULL)
    OR
    (scan_status = 'quarantined' AND scan_engine IN (
        'deterministic_signature', 'internal_test_fixture'
      ) AND scanned_at IS NOT NULL AND quarantine_reason_code IS NOT NULL)
    OR
    (scan_status = 'failed' AND scan_engine = 'internal_test_fixture'
      AND scanned_at IS NOT NULL AND quarantine_reason_code IS NOT NULL)
  )
);

CREATE INDEX support_evidence_files_case_access_idx
  ON support_evidence_files(evidence_id, scan_status, created_at);

CREATE TABLE support_evidence_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_file_id UUID NOT NULL REFERENCES support_evidence_files(id) ON DELETE CASCADE,
  subject_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes'),
  CHECK (last_used_at IS NULL OR (last_used_at >= created_at AND last_used_at <= expires_at))
);

CREATE INDEX support_evidence_access_grants_subject_idx
  ON support_evidence_access_grants(subject_user_id, session_id, expires_at);

CREATE OR REPLACE FUNCTION sit_guard_support_evidence_file_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'support evidence files are retained and immutable';
  END IF;

  IF OLD.evidence_id IS DISTINCT FROM NEW.evidence_id
      OR OLD.uploader_user_id IS DISTINCT FROM NEW.uploader_user_id
      OR OLD.original_storage_name IS DISTINCT FROM NEW.original_storage_name
      OR OLD.preview_storage_name IS DISTINCT FROM NEW.preview_storage_name
      OR OLD.detected_mime_type IS DISTINCT FROM NEW.detected_mime_type
      OR OLD.original_byte_size IS DISTINCT FROM NEW.original_byte_size
      OR OLD.original_sha256 IS DISTINCT FROM NEW.original_sha256
      OR OLD.preview_mime_type IS DISTINCT FROM NEW.preview_mime_type
      OR OLD.preview_byte_size IS DISTINCT FROM NEW.preview_byte_size
      OR OLD.preview_sha256 IS DISTINCT FROM NEW.preview_sha256
      OR OLD.image_width IS DISTINCT FROM NEW.image_width
      OR OLD.image_height IS DISTINCT FROM NEW.image_height
      OR OLD.external_ai_used IS DISTINCT FROM NEW.external_ai_used
      OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
      OR OLD.request_sha256 IS DISTINCT FROM NEW.request_sha256
      OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'support evidence source and preview are immutable';
  END IF;

  IF OLD.scan_status = NEW.scan_status THEN
    IF OLD.scan_engine IS DISTINCT FROM NEW.scan_engine
        OR OLD.scan_reference IS DISTINCT FROM NEW.scan_reference
        OR OLD.quarantine_reason_code IS DISTINCT FROM NEW.quarantine_reason_code
        OR OLD.scanned_at IS DISTINCT FROM NEW.scanned_at THEN
      RAISE EXCEPTION 'support evidence scan result requires one terminal transition';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.scan_status <> 'pending'
      OR NEW.scan_status NOT IN ('clean', 'quarantined', 'failed') THEN
    RAISE EXCEPTION 'support evidence scan result is terminal';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_evidence_files_guard ON support_evidence_files;
CREATE TRIGGER support_evidence_files_guard
BEFORE UPDATE OR DELETE ON support_evidence_files
FOR EACH ROW EXECUTE FUNCTION sit_guard_support_evidence_file_mutation();
