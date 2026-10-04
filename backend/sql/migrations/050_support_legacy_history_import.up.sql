-- SIT Support Packet V1: append-only, non-live import archive for confirmed
-- legacy support threads. Enabling an importer remains a separate internal
-- configuration decision; this schema performs no automatic backfill.

CREATE TABLE support_legacy_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES support_cases(id) ON DELETE RESTRICT,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_system TEXT NOT NULL CHECK (
    source_system = 'local_shared_preferences_message_threads_v1'
  ),
  source_thread_id TEXT NOT NULL CHECK (
    char_length(source_thread_id) BETWEEN 1 AND 160
    AND source_thread_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'
  ),
  source_fingerprint CHAR(64) NOT NULL CHECK (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  source_created_at_text TEXT CHECK (
    source_created_at_text IS NULL OR char_length(source_created_at_text) <= 80
  ),
  source_updated_at_text TEXT CHECK (
    source_updated_at_text IS NULL OR char_length(source_updated_at_text) <= 80
  ),
  legacy_status TEXT NOT NULL CHECK (legacy_status IN ('open', 'paused')),
  mapped_status TEXT NOT NULL CHECK (mapped_status IN (
    'acknowledged', 'waiting_for_user', 'waiting_for_other_party',
    'under_review', 'escalated'
  )),
  template_state TEXT NOT NULL DEFAULT 'historical_disabled' CHECK (
    template_state = 'historical_disabled'
  ),
  verification_state TEXT NOT NULL DEFAULT 'unverified_user_device_source' CHECK (
    verification_state = 'unverified_user_device_source'
  ),
  history_entry_count INTEGER NOT NULL CHECK (
    history_entry_count BETWEEN 1 AND 500
  ),
  unresolved_local_timestamp_count INTEGER NOT NULL DEFAULT 0 CHECK (
    unresolved_local_timestamp_count BETWEEN 0 AND history_entry_count
  ),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_user_id, source_system, source_thread_id)
);

CREATE INDEX support_legacy_imports_reporter_idx
  ON support_legacy_imports(reporter_user_id, imported_at DESC, id);

CREATE TABLE support_legacy_history_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES support_legacy_imports(id) ON DELETE RESTRICT,
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  source_message_id TEXT NOT NULL CHECK (
    char_length(source_message_id) BETWEEN 1 AND 160
    AND source_message_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'
  ),
  sequence_number INTEGER NOT NULL CHECK (sequence_number BETWEEN 0 AND 499),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'support', 'system')),
  sender_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  source_trust TEXT NOT NULL DEFAULT 'unverified_user_device_source' CHECK (
    source_trust = 'unverified_user_device_source'
  ),
  rendered_content TEXT NOT NULL CHECK (char_length(rendered_content) BETWEEN 1 AND 4000),
  rendered_content_sha256 CHAR(64) NOT NULL CHECK (
    rendered_content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  source_timestamp_text TEXT NOT NULL CHECK (
    char_length(source_timestamp_text) BETWEEN 1 AND 80
  ),
  occurred_at TIMESTAMPTZ,
  timestamp_interpretation TEXT NOT NULL CHECK (
    timestamp_interpretation IN ('explicit_offset', 'utc', 'unresolved_local_time')
  ),
  was_read BOOLEAN NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (import_id, source_message_id),
  UNIQUE (import_id, sequence_number),
  CHECK (
    (sender_type = 'user' AND sender_user_id IS NOT NULL)
    OR (sender_type IN ('support', 'system') AND sender_user_id IS NULL)
  )
);

CREATE INDEX support_legacy_history_case_sequence_idx
  ON support_legacy_history_entries(case_id, sequence_number, id);

CREATE OR REPLACE FUNCTION sit_reject_support_legacy_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'support legacy import history is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER support_legacy_imports_append_only
BEFORE UPDATE OR DELETE ON support_legacy_imports
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_legacy_history_mutation();

CREATE TRIGGER support_legacy_history_entries_append_only
BEFORE UPDATE OR DELETE ON support_legacy_history_entries
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_legacy_history_mutation();
