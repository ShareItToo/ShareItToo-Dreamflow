-- Durable provider-deletion queue for Firebase Authentication identities.
-- The raw provider UID exists only while deletion is pending and the entire
-- row is removed after Firebase confirms deletion or reports user-not-found.

CREATE TABLE IF NOT EXISTS firebase_identity_deletion_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_user_id TEXT NOT NULL UNIQUE
    CHECK (char_length(firebase_user_id) BETWEEN 1 AND 180),
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'facebook')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS firebase_identity_deletion_outbox_due_idx
  ON firebase_identity_deletion_outbox(next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry');
