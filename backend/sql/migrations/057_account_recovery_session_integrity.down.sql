DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth_action_tokens WHERE kind = 'reset_password' LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'Cannot roll back account recovery session integrity while reset-token evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS auth_action_tokens_update_guard ON auth_action_tokens;
DROP FUNCTION IF EXISTS sit_validate_auth_action_token_update();
DROP INDEX IF EXISTS auth_action_tokens_one_live_user_kind_idx;

ALTER TABLE auth_action_tokens
  DROP CONSTRAINT IF EXISTS auth_action_tokens_consumption_time_check,
  DROP CONSTRAINT IF EXISTS auth_action_tokens_lifetime_check,
  DROP CONSTRAINT IF EXISTS auth_action_tokens_hash_format_check;
