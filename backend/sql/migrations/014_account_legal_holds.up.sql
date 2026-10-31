-- Technical legal-hold enforcement. Policy activation and retention periods
-- remain separate owner/legal decisions.

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
  ON account_legal_holds(user_id)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS account_legal_holds_created_idx
  ON account_legal_holds(created_at DESC, id);
