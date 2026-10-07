ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS minimum_age_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS personal_data_erased_at TIMESTAMPTZ;

ALTER TABLE users
  ADD CONSTRAINT users_phone_e164_check
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\\+[1-9][0-9]{7,14}$') NOT VALID,
  ADD CONSTRAINT users_failed_login_attempts_check
    CHECK (failed_login_attempts BETWEEN 0 AND 1000) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_phone_e164_check;
ALTER TABLE users VALIDATE CONSTRAINT users_failed_login_attempts_check;

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label TEXT NOT NULL DEFAULT 'Unbekanntes Gerät',
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);
CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions(user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES auth_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS family_id UUID,
  ADD COLUMN IF NOT EXISTS parent_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

INSERT INTO auth_sessions (
  id, user_id, device_label, user_agent, created_at, last_seen_at, revoked_at, revoked_reason
)
SELECT
  token.id,
  token.user_id,
  'Bestehende Sitzung',
  token.user_agent,
  token.created_at,
  token.created_at,
  token.revoked_at,
  CASE WHEN token.revoked_at IS NULL THEN NULL ELSE 'legacy_revoked' END
FROM refresh_tokens AS token
ON CONFLICT (id) DO NOTHING;

UPDATE refresh_tokens
SET session_id = id,
    family_id = id
WHERE session_id IS NULL OR family_id IS NULL;

ALTER TABLE refresh_tokens
  ALTER COLUMN session_id SET NOT NULL,
  ALTER COLUMN family_id SET NOT NULL;

CREATE OR REPLACE FUNCTION sit_assign_legacy_refresh_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;
  IF NEW.session_id IS NULL THEN
    NEW.session_id := NEW.id;
    INSERT INTO auth_sessions (
      id, user_id, device_label, user_agent, created_at, last_seen_at,
      revoked_at, revoked_reason
    ) VALUES (
      NEW.session_id, NEW.user_id, 'Legacy-App-Sitzung', NEW.user_agent,
      COALESCE(NEW.created_at, now()), COALESCE(NEW.created_at, now()),
      NEW.revoked_at,
      CASE WHEN NEW.revoked_at IS NULL THEN NULL ELSE 'legacy_revoked' END
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  IF NEW.family_id IS NULL THEN
    NEW.family_id := NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_tokens_assign_legacy_session ON refresh_tokens;
CREATE TRIGGER refresh_tokens_assign_legacy_session
BEFORE INSERT ON refresh_tokens
FOR EACH ROW EXECUTE FUNCTION sit_assign_legacy_refresh_session();

CREATE INDEX refresh_tokens_session_active_idx
  ON refresh_tokens(session_id, expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX refresh_tokens_family_idx
  ON refresh_tokens(family_id, created_at DESC);

ALTER TABLE auth_action_tokens
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE auth_action_tokens
  DROP CONSTRAINT IF EXISTS auth_action_tokens_kind_check;
ALTER TABLE auth_action_tokens
  ADD CONSTRAINT auth_action_tokens_kind_check
    CHECK (kind IN ('verify_email', 'reset_password', 'change_email', 'delete_account'));

CREATE TABLE auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_subject TEXT NOT NULL,
  email_at_link TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);
CREATE INDEX auth_identities_user_idx ON auth_identities(user_id);

CREATE TABLE push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES auth_sessions(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  token TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  locale TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_user_enabled_idx
  ON push_devices(user_id, last_seen_at DESC)
  WHERE enabled = true;

CREATE INDEX auth_action_tokens_live_idx
  ON auth_action_tokens(kind, expires_at)
  WHERE consumed_at IS NULL;
