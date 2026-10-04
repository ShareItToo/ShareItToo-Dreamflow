DROP TRIGGER IF EXISTS mfa_totp_factors_set_updated_at ON mfa_totp_factors;
DROP FUNCTION IF EXISTS sit_mfa_totp_factors_updated_at();
DROP TABLE IF EXISTS auth_mfa_challenges;
DROP TABLE IF EXISTS mfa_totp_factors;
ALTER TABLE auth_sessions DROP COLUMN IF EXISTS mfa_verified_at;
