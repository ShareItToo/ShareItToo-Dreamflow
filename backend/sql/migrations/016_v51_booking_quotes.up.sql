-- V5.1 server-authoritative booking quotes. Quotes are immutable evidence and
-- expire before they can be used to create a private-pilot booking.

CREATE TABLE IF NOT EXISTS booking_quotes (
  id TEXT PRIMARY KEY CHECK (id ~ '^quote_[0-9a-f-]{36}$'),
  renter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  rental_start_date DATE NOT NULL,
  rental_end_date DATE NOT NULL,
  rental_timezone TEXT NOT NULL CHECK (char_length(rental_timezone) BETWEEN 1 AND 120),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  catalog_revision INTEGER NOT NULL CHECK (catalog_revision >= 0),
  availability_revision INTEGER NOT NULL CHECK (availability_revision > 0),
  quote_version INTEGER NOT NULL CHECK (quote_version > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  quote_payload JSONB NOT NULL,
  quote_hash TEXT NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (rental_start_date < rental_end_date),
  CHECK (starts_at < ends_at),
  CHECK (issued_at < expires_at),
  UNIQUE (id, quote_hash)
);

CREATE INDEX IF NOT EXISTS booking_quotes_renter_time_idx
  ON booking_quotes(renter_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS booking_quotes_listing_period_idx
  ON booking_quotes(listing_id, starts_at, ends_at);

DROP TRIGGER IF EXISTS booking_quotes_append_only ON booking_quotes;
CREATE TRIGGER booking_quotes_append_only
BEFORE UPDATE OR DELETE ON booking_quotes
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
