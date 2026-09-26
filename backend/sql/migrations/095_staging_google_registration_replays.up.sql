CREATE TABLE staging_google_registration_replays (
  token_digest CHAR(64) PRIMARY KEY
    CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  identity_digest CHAR(64) NOT NULL
    CHECK (identity_digest ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX staging_google_registration_replays_expires_at_idx
  ON staging_google_registration_replays (expires_at);
