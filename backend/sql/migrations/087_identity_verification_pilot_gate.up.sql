CREATE TABLE IF NOT EXISTS identity_verification_control (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  pilot_closed BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO identity_verification_control (id, pilot_closed)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;
