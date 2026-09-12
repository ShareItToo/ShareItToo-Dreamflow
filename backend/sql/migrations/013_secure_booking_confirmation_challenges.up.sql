-- One-time, server-issued confirmation challenges for pickup and return.
-- Raw six-digit codes are never persisted. A challenge may be consumed only
-- once by the counterparty and is then bound to the booking evidence trail.

CREATE TABLE IF NOT EXISTS booking_confirmation_challenges (
  id UUID PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  segment TEXT NOT NULL CHECK (segment IN ('pickup', 'return')),
  presenter_role TEXT NOT NULL CHECK (presenter_role IN ('owner', 'renter')),
  presenter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  verifier_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  code_digest TEXT NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  locked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (expires_at > issued_at),
  CHECK (
    (consumed_at IS NULL AND verifier_user_id IS NULL)
    OR (consumed_at IS NOT NULL AND verifier_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_confirmation_challenges_one_active_idx
  ON booking_confirmation_challenges(booking_id, segment, presenter_role)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS booking_confirmation_challenges_expiry_idx
  ON booking_confirmation_challenges(expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS booking_confirmation_challenges_audit_idx
  ON booking_confirmation_challenges(booking_id, issued_at DESC);
