-- B7: authoritative booking communication, notification outbox and delivery audit.

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS communication_version SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE message_threads AS thread
SET booking_id = thread.request_id,
    communication_version = 1,
    updated_at = now()
WHERE thread.booking_id IS NULL
  AND EXISTS (
    SELECT 1 FROM bookings AS booking
    WHERE booking.id = thread.request_id AND booking.workflow_version = 1
  );

ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_communication_version_check;
ALTER TABLE message_threads
  ADD CONSTRAINT message_threads_communication_version_check
  CHECK (communication_version IN (0, 1));
CREATE UNIQUE INDEX IF NOT EXISTS message_threads_booking_idx
  ON message_threads(booking_id) WHERE booking_id IS NOT NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS message_version SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_attachments_array_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_attachments_array_check
  CHECK (jsonb_typeof(attachments) = 'array');
CREATE UNIQUE INDEX IF NOT EXISTS messages_thread_client_message_idx
  ON messages(thread_id, client_message_id) WHERE client_message_id IS NOT NULL;

CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  message_push_enabled BOOLEAN NOT NULL DEFAULT true,
  booking_push_enabled BOOLEAN NOT NULL DEFAULT true,
  locale TEXT NOT NULL DEFAULT 'de-DE',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (
    category IN ('important', 'bookings', 'rentals', 'handover', 'messages', 'support', 'payments', 'reviews', 'system')
  ),
  kind TEXT NOT NULL,
  priority SMALLINT NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 3),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  entity_type TEXT,
  entity_id TEXT,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  thread_id TEXT REFERENCES message_threads(id) ON DELETE CASCADE,
  action_url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_key, user_id)
);
CREATE INDEX notifications_user_created_idx
  ON notifications(user_id, created_at DESC, id DESC);
CREATE INDEX notifications_user_unread_idx
  ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
  kind TEXT NOT NULL,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  thread_id TEXT REFERENCES message_threads(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'suppressed', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  not_before TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error_code TEXT,
  provider_message_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_key, user_id, channel)
);
CREATE INDEX notification_outbox_ready_idx
  ON notification_outbox(not_before, created_at)
  WHERE status IN ('pending', 'retry');
CREATE INDEX notification_outbox_user_idx
  ON notification_outbox(user_id, created_at DESC);

CREATE TABLE notification_delivery_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  outbox_id UUID NOT NULL REFERENCES notification_outbox(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
  outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'suppressed', 'retry', 'dead')),
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outbox_id, attempt_number)
);

CREATE TABLE message_reads (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX message_reads_thread_user_idx
  ON message_reads(thread_id, user_id, read_at DESC);

CREATE TABLE user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL DEFAULT 'user_request',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unblocked_at TIMESTAMPTZ,
  CHECK (blocker_id <> blocked_id)
);
CREATE UNIQUE INDEX user_blocks_active_pair_idx
  ON user_blocks(blocker_id, blocked_id) WHERE unblocked_at IS NULL;
CREATE INDEX user_blocks_blocked_active_idx
  ON user_blocks(blocked_id, blocker_id) WHERE unblocked_at IS NULL;

DROP TRIGGER IF EXISTS message_threads_set_updated_at ON message_threads;
CREATE TRIGGER message_threads_set_updated_at BEFORE UPDATE ON message_threads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notification_outbox_set_updated_at ON notification_outbox;
CREATE TRIGGER notification_outbox_set_updated_at BEFORE UPDATE ON notification_outbox
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notification_delivery_attempts_append_only ON notification_delivery_attempts;
CREATE TRIGGER notification_delivery_attempts_append_only
BEFORE UPDATE OR DELETE ON notification_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
