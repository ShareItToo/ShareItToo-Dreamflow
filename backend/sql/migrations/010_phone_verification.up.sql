CREATE UNIQUE INDEX IF NOT EXISTS users_verified_phone_unique_idx
  ON users(phone_e164)
  WHERE phone_e164 IS NOT NULL AND phone_verified_at IS NOT NULL;

COMMENT ON INDEX users_verified_phone_unique_idx IS
  'A phone number proven by the configured identity provider can belong to only one ShareItToo account at a time.';
