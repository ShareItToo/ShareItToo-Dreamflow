ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_phone_e164_check;

ALTER TABLE users
  ADD CONSTRAINT users_phone_e164_check
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^[+][1-9][0-9]{7,14}$') NOT VALID;

ALTER TABLE users VALIDATE CONSTRAINT users_phone_e164_check;
