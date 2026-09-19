ALTER TABLE auth_identities
  DROP CONSTRAINT IF EXISTS auth_identities_provider_check;

ALTER TABLE auth_identities
  ADD CONSTRAINT auth_identities_provider_check
    CHECK (provider IN ('google', 'apple', 'facebook'));

ALTER TABLE auth_identities
  ADD COLUMN IF NOT EXISTS firebase_user_id TEXT;

UPDATE auth_identities
SET firebase_user_id = provider_subject
WHERE firebase_user_id IS NULL;

ALTER TABLE auth_identities
  ALTER COLUMN firebase_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS auth_identities_firebase_user_idx
  ON auth_identities(firebase_user_id);

COMMENT ON TABLE auth_identities IS
  'Server-authoritative links to verified Firebase federated identities; native provider subjects and Firebase user IDs are retained, while provider tokens and secrets are never stored.';
