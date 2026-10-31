-- V5.1 condition evidence is private, participant-bound and append-only.
-- Pickup presenter: owner. Return presenter: renter. The counterparty either
-- confirms the four-photo set or records at least one deviation photo.

CREATE TABLE IF NOT EXISTS booking_condition_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  segment TEXT NOT NULL CHECK (segment IN ('pickup', 'return')),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('presenter_photo', 'counterparty_deviation')),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'renter')),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  upload_id UUID NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
  message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('camera', 'gallery', 'browser_picker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (segment = 'pickup' AND evidence_kind = 'presenter_photo' AND actor_role = 'owner')
    OR (segment = 'pickup' AND evidence_kind = 'counterparty_deviation' AND actor_role = 'renter')
    OR (segment = 'return' AND evidence_kind = 'presenter_photo' AND actor_role = 'renter')
    OR (segment = 'return' AND evidence_kind = 'counterparty_deviation' AND actor_role = 'owner')
  )
);

CREATE INDEX IF NOT EXISTS booking_condition_evidence_lookup_idx
  ON booking_condition_evidence(booking_id, segment, evidence_kind, actor_role, created_at);

CREATE TABLE IF NOT EXISTS booking_condition_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  segment TEXT NOT NULL CHECK (segment IN ('pickup', 'return')),
  verifier_role TEXT NOT NULL CHECK (verifier_role IN ('owner', 'renter')),
  verifier_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'deviation_recorded')),
  presenter_photo_count INTEGER NOT NULL CHECK (presenter_photo_count >= 4),
  deviation_photo_count INTEGER NOT NULL DEFAULT 0 CHECK (deviation_photo_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, segment, verifier_role),
  CHECK (
    (segment = 'pickup' AND verifier_role = 'renter')
    OR (segment = 'return' AND verifier_role = 'owner')
  ),
  CHECK (
    (decision = 'confirmed' AND deviation_photo_count = 0)
    OR (decision = 'deviation_recorded' AND deviation_photo_count >= 1)
  )
);

CREATE INDEX IF NOT EXISTS booking_condition_confirmations_lookup_idx
  ON booking_condition_confirmations(booking_id, segment, created_at);

CREATE OR REPLACE FUNCTION sit_reject_booking_condition_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'booking condition evidence is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_condition_evidence_immutable ON booking_condition_evidence;
CREATE TRIGGER booking_condition_evidence_immutable
BEFORE UPDATE OR DELETE ON booking_condition_evidence
FOR EACH ROW EXECUTE FUNCTION sit_reject_booking_condition_evidence_mutation();

DROP TRIGGER IF EXISTS booking_condition_confirmations_immutable ON booking_condition_confirmations;
CREATE TRIGGER booking_condition_confirmations_immutable
BEFORE UPDATE OR DELETE ON booking_condition_confirmations
FOR EACH ROW EXECUTE FUNCTION sit_reject_booking_condition_evidence_mutation();
