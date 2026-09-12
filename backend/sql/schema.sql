CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE profile->>'emailVerified' = 'true' AND email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  replaced_by_hash TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expiry_idx ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS auth_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify_email', 'reset_password')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_action_tokens_user_kind_idx
  ON auth_action_tokens(user_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_action_tokens_expiry_idx
  ON auth_action_tokens(expires_at);

CREATE TABLE IF NOT EXISTS account_legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason_code TEXT NOT NULL CHECK (
    char_length(reason_code) BETWEEN 1 AND 120
    AND reason_code ~ '^[a-z0-9_.:-]+$'
  ),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 8000),
  placed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  released_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  release_reason_code TEXT CHECK (
    release_reason_code IS NULL OR (
      char_length(release_reason_code) BETWEEN 1 AND 120
      AND release_reason_code ~ '^[a-z0-9_.:-]+$'
    )
  ),
  idempotency_key TEXT NOT NULL UNIQUE,
  release_idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  CHECK (
    (released_at IS NULL AND released_by IS NULL AND release_reason_code IS NULL
      AND release_idempotency_key IS NULL)
    OR
    (released_at IS NOT NULL AND released_by IS NOT NULL AND release_reason_code IS NOT NULL
      AND release_idempotency_key IS NOT NULL AND released_at >= created_at)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS account_legal_holds_one_active_per_user_idx
  ON account_legal_holds(user_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS account_legal_holds_created_idx
  ON account_legal_holds(created_at DESC, id);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_owner_idx ON listings(owner_id);
CREATE INDEX IF NOT EXISTS listings_active_created_idx ON listings(is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS rental_requests (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  renter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (owner_id <> renter_id)
);
CREATE INDEX IF NOT EXISTS rental_requests_owner_idx ON rental_requests(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rental_requests_renter_idx ON rental_requests(renter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_threads (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES rental_requests(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  user1_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user2_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_for JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  CHECK (user1_id <> user2_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS message_threads_request_idx ON message_threads(request_id);
CREATE INDEX IF NOT EXISTS message_threads_user1_idx ON message_threads(user1_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS message_threads_user2_idx ON message_threads(user2_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL DEFAULT 'user',
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_thread_created_idx ON messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uploads_owner_idx ON uploads(owner_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS listings_set_updated_at ON listings;
CREATE TRIGGER listings_set_updated_at BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS rental_requests_set_updated_at ON rental_requests;
CREATE TRIGGER rental_requests_set_updated_at BEFORE UPDATE ON rental_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
