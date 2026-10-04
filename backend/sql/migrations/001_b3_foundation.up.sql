CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION sit_try_timestamptz(value TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN value::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sit_try_numeric(value TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN value::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

UPDATE users
SET role = CASE
      WHEN profile->>'role' IN ('user', 'support', 'admin') THEN profile->>'role'
      ELSE 'user'
    END,
    account_status = CASE
      WHEN deactivated_at IS NOT NULL THEN 'closed'
      WHEN profile->>'isBanned' = 'true' THEN 'suspended'
      ELSE 'active'
    END;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'support', 'admin')) NOT VALID,
  ADD CONSTRAINT users_account_status_check
    CHECK (account_status IN ('active', 'suspended', 'closed')) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_role_check;
ALTER TABLE users VALIDATE CONSTRAINT users_account_status_check;
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users(role, account_status);

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS price_per_day_minor BIGINT,
  ADD COLUMN IF NOT EXISTS security_deposit_minor BIGINT;

UPDATE listings
SET currency = CASE
      WHEN upper(COALESCE(payload->>'currency', '')) ~ '^[A-Z]{3}$'
        THEN upper(payload->>'currency')
      ELSE 'EUR'
    END,
    price_per_day_minor = CASE
      WHEN sit_try_numeric(payload->>'pricePerDay') >= 0
        THEN round(sit_try_numeric(payload->>'pricePerDay') * 100)::bigint
      ELSE NULL
    END,
    security_deposit_minor = CASE
      WHEN sit_try_numeric(payload->>'deposit') >= 0
        THEN round(sit_try_numeric(payload->>'deposit') * 100)::bigint
      ELSE NULL
    END;

ALTER TABLE listings
  ADD CONSTRAINT listings_currency_check
    CHECK (currency ~ '^[A-Z]{3}$') NOT VALID,
  ADD CONSTRAINT listings_price_minor_check
    CHECK (price_per_day_minor IS NULL OR price_per_day_minor >= 0) NOT VALID,
  ADD CONSTRAINT listings_deposit_minor_check
    CHECK (security_deposit_minor IS NULL OR security_deposit_minor >= 0) NOT VALID;
ALTER TABLE listings VALIDATE CONSTRAINT listings_currency_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_price_minor_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_deposit_minor_check;

CREATE TABLE bookings (
  id TEXT PRIMARY KEY REFERENCES rental_requests(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  renter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'running', 'completed')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  quoted_total_minor BIGINT CHECK (quoted_total_minor IS NULL OR quoted_total_minor >= 0),
  security_deposit_minor BIGINT CHECK (security_deposit_minor IS NULL OR security_deposit_minor >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (owner_id <> renter_id),
  CHECK (starts_at < ends_at)
);

INSERT INTO bookings (
  id, listing_id, owner_id, renter_id, status, starts_at, ends_at,
  currency, quoted_total_minor, security_deposit_minor, created_at, updated_at
)
SELECT
  request.id,
  request.item_id,
  request.owner_id,
  request.renter_id,
  CASE
    WHEN request.status IN ('pending', 'accepted', 'declined', 'cancelled', 'running', 'completed')
      THEN request.status
    ELSE 'pending'
  END,
  parsed.starts_at,
  parsed.ends_at,
  CASE
    WHEN upper(COALESCE(listing.currency::text, listing.payload->>'currency', '')) ~ '^[A-Z]{3}$'
      THEN upper(COALESCE(listing.currency::text, listing.payload->>'currency'))
    ELSE 'EUR'
  END,
  CASE
    WHEN sit_try_numeric(request.payload->>'quotedTotalRenter') >= 0
      THEN round(sit_try_numeric(request.payload->>'quotedTotalRenter') * 100)::bigint
    ELSE NULL
  END,
  listing.security_deposit_minor,
  request.created_at,
  request.updated_at
FROM rental_requests AS request
JOIN listings AS listing ON listing.id = request.item_id
CROSS JOIN LATERAL (
  SELECT
    sit_try_timestamptz(request.payload->>'start') AS starts_at,
    sit_try_timestamptz(request.payload->>'end') AS ends_at
) AS parsed
WHERE parsed.starts_at IS NOT NULL
  AND parsed.ends_at IS NOT NULL
  AND parsed.starts_at < parsed.ends_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM rental_requests AS request
    LEFT JOIN bookings AS booking ON booking.id = request.id
    WHERE booking.id IS NULL
  ) THEN
    RAISE EXCEPTION 'B3 migration blocked: rental request with invalid or missing period';
  END IF;
END;
$$;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_active_overlap
  EXCLUDE USING gist (
    listing_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status IN ('accepted', 'running'))
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX bookings_owner_created_idx ON bookings(owner_id, created_at DESC);
CREATE INDEX bookings_renter_created_idx ON bookings(renter_id, created_at DESC);
CREATE INDEX bookings_listing_period_idx ON bookings(listing_id, starts_at, ends_at);
CREATE INDEX bookings_status_updated_idx ON bookings(status, updated_at DESC);

CREATE TABLE listing_availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  local_start TIME NOT NULL,
  local_end TIME NOT NULL,
  valid_from DATE,
  valid_until DATE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (local_start < local_end),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_from <= valid_until),
  UNIQUE (listing_id, weekday, local_start, local_end, valid_from)
);
CREATE INDEX listing_availability_rules_listing_idx
  ON listing_availability_rules(listing_id, weekday);

CREATE TABLE listing_availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'owner_block'
    CHECK (kind IN ('owner_block', 'maintenance', 'safety_hold')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at)
);
ALTER TABLE listing_availability_blocks
  ADD CONSTRAINT listing_availability_blocks_no_overlap
  EXCLUDE USING gist (
    listing_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  );
CREATE INDEX listing_availability_blocks_listing_period_idx
  ON listing_availability_blocks(listing_id, starts_at, ends_at);

CREATE TABLE booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  idempotency_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_status IS NULL OR from_status IN ('pending', 'accepted', 'declined', 'cancelled', 'running', 'completed')),
  CHECK (to_status IS NULL OR to_status IN ('pending', 'accepted', 'declined', 'cancelled', 'running', 'completed'))
);
CREATE INDEX booking_events_booking_created_idx ON booking_events(booking_id, created_at);
CREATE INDEX booking_events_actor_created_idx ON booking_events(actor_id, created_at DESC);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe')),
  provider_payment_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'requires_action', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_booking_created_idx ON payments(booking_id, created_at DESC);
CREATE INDEX payments_status_updated_idx ON payments(status, updated_at DESC);

CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  provider_refund_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'cancelled')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refunds_payment_created_idx ON refunds(payment_id, created_at DESC);

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  payee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider_payout_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'pending', 'paid', 'failed', 'cancelled', 'reversed')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  available_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payouts_booking_created_idx ON payouts(booking_id, created_at DESC);
CREATE INDEX payouts_payee_status_idx ON payouts(payee_id, status, created_at DESC);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  opened_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'waiting_for_user', 'resolved', 'rejected', 'closed')),
  reason_code TEXT NOT NULL,
  summary TEXT NOT NULL,
  resolution JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX disputes_booking_created_idx ON disputes(booking_id, created_at DESC);
CREATE INDEX disputes_status_updated_idx ON disputes(status, updated_at DESC);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT CHECK (body IS NULL OR char_length(body) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reviewer_id <> reviewee_id),
  UNIQUE (booking_id, reviewer_id)
);
CREATE INDEX reviews_reviewee_created_idx ON reviews(reviewee_id, created_at DESC);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'listing', 'booking', 'message', 'review')),
  target_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  details TEXT CHECK (details IS NULL OR char_length(details) <= 8000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'triaged', 'investigating', 'actioned', 'dismissed', 'closed')),
  resolution JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX reports_status_created_idx ON reports(status, created_at DESC);
CREATE INDEX reports_target_idx ON reports(target_type, target_id, created_at DESC);

CREATE TABLE user_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  imposed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'account'
    CHECK (scope IN ('account', 'listing', 'booking', 'messaging', 'payout')),
  reason_code TEXT NOT NULL,
  note TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  lifted_at TIMESTAMPTZ,
  lifted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at < ends_at)
);
CREATE INDEX user_suspensions_active_idx
  ON user_suspensions(user_id, starts_at, ends_at)
  WHERE lifted_at IS NULL;

CREATE TABLE audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_role IN ('user', 'support', 'admin', 'system')),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  request_id TEXT,
  before_hash TEXT CHECK (before_hash IS NULL OR before_hash ~ '^[0-9a-f]{64}$'),
  after_hash TEXT CHECK (after_hash IS NULL OR after_hash ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_resource_created_idx
  ON audit_log(resource_type, resource_id, created_at DESC);
CREATE INDEX audit_log_actor_created_idx ON audit_log(actor_id, created_at DESC);
CREATE INDEX audit_log_request_idx ON audit_log(request_id) WHERE request_id IS NOT NULL;

ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'listing_image',
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_id TEXT REFERENCES message_threads(id) ON DELETE SET NULL;
ALTER TABLE uploads
  ADD CONSTRAINT uploads_purpose_check
    CHECK (purpose IN ('listing_image', 'profile_image', 'message_attachment', 'handover_evidence', 'return_evidence')) NOT VALID,
  ADD CONSTRAINT uploads_visibility_check
    CHECK (visibility IN ('public', 'private')) NOT VALID;
ALTER TABLE uploads VALIDATE CONSTRAINT uploads_purpose_check;
ALTER TABLE uploads VALIDATE CONSTRAINT uploads_visibility_check;
CREATE INDEX uploads_listing_idx ON uploads(listing_id, created_at DESC) WHERE listing_id IS NOT NULL;
CREATE INDEX uploads_thread_idx ON uploads(thread_id, created_at) WHERE thread_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sit_reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER booking_events_append_only
BEFORE UPDATE OR DELETE ON booking_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER listing_availability_rules_set_updated_at BEFORE UPDATE ON listing_availability_rules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON refunds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payouts_set_updated_at BEFORE UPDATE ON payouts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER disputes_set_updated_at BEFORE UPDATE ON disputes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER reviews_set_updated_at BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER reports_set_updated_at BEFORE UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
