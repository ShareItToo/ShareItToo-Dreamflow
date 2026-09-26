-- S4G / SUP-097 + SUP-098: harden the existing account-action token and
-- credential-change session lifecycle. No token, email or account action is
-- created by this migration.

ALTER TABLE auth_action_tokens
  ADD CONSTRAINT auth_action_tokens_hash_format_check CHECK (
    token_hash ~ '^[0-9a-f]{64}$'
  ) NOT VALID,
  ADD CONSTRAINT auth_action_tokens_lifetime_check CHECK (
    expires_at > created_at
    AND (
      kind <> 'reset_password'
      OR expires_at <= created_at + interval '30 minutes'
    )
  ) NOT VALID,
  ADD CONSTRAINT auth_action_tokens_consumption_time_check CHECK (
    consumed_at IS NULL OR consumed_at >= created_at
  ) NOT VALID;

ALTER TABLE auth_action_tokens
  VALIDATE CONSTRAINT auth_action_tokens_hash_format_check;
ALTER TABLE auth_action_tokens
  VALIDATE CONSTRAINT auth_action_tokens_lifetime_check;
ALTER TABLE auth_action_tokens
  VALIDATE CONSTRAINT auth_action_tokens_consumption_time_check;

CREATE UNIQUE INDEX auth_action_tokens_one_live_user_kind_idx
  ON auth_action_tokens(user_id, kind)
  WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION sit_validate_auth_action_token_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.kind = 'reset_password' OR NEW.kind = 'reset_password')
    AND ROW(
      NEW.user_id, NEW.kind, NEW.token_hash, NEW.expires_at,
      NEW.created_at, NEW.payload
    ) IS DISTINCT FROM ROW(
      OLD.user_id, OLD.kind, OLD.token_hash, OLD.expires_at,
      OLD.created_at, OLD.payload
    )
  THEN
    RAISE EXCEPTION 'auth_action_token_identity_immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.kind = 'reset_password'
    AND OLD.consumed_at IS NOT NULL
    AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at
  THEN
    RAISE EXCEPTION 'auth_action_token_consumption_immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auth_action_tokens_update_guard
BEFORE UPDATE ON auth_action_tokens
FOR EACH ROW EXECUTE FUNCTION sit_validate_auth_action_token_update();
