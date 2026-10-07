-- G2B persistent rental intent. A rental cart is explicitly not a booking,
-- reservation, availability hold, checkout, or payment instruction.

CREATE TABLE IF NOT EXISTS rental_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_cart_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES rental_carts(id) ON DELETE CASCADE,
  client_project_id TEXT NOT NULL CHECK (
    char_length(client_project_id) BETWEEN 8 AND 120
    AND client_project_id ~ '^[A-Za-z0-9_.:-]+$'
  ),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cart_id, client_project_id),
  UNIQUE (id, cart_id)
);

CREATE TABLE IF NOT EXISTS rental_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES rental_carts(id) ON DELETE CASCADE,
  client_item_id TEXT NOT NULL CHECK (
    char_length(client_item_id) BETWEEN 8 AND 120
    AND client_item_id ~ '^[A-Za-z0-9_.:-]+$'
  ),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES rental_cart_projects(id) ON DELETE SET NULL,
  rental_start_date DATE NOT NULL,
  rental_end_date DATE NOT NULL,
  quote_id TEXT REFERENCES booking_quotes(id) ON DELETE RESTRICT,
  quote_hash TEXT CHECK (quote_hash IS NULL OR quote_hash ~ '^[0-9a-f]{64}$'),
  quote_payload JSONB,
  quote_status TEXT NOT NULL DEFAULT 'needs_recheck'
    CHECK (quote_status IN ('current', 'changed', 'unavailable', 'needs_recheck')),
  quote_error_code TEXT CHECK (
    quote_error_code IS NULL OR (
      char_length(quote_error_code) BETWEEN 1 AND 120
      AND quote_error_code ~ '^[a-z0-9_.:-]+$'
    )
  ),
  quote_rechecked_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rental_start_date < rental_end_date),
  CHECK (
    (quote_status IN ('current', 'changed')
      AND quote_hash IS NOT NULL
      AND quote_payload IS NOT NULL AND quote_error_code IS NULL
      AND quote_rechecked_at IS NOT NULL)
    OR
    (quote_status = 'unavailable'
      AND quote_error_code IS NOT NULL AND quote_rechecked_at IS NOT NULL)
    OR
    (quote_status = 'needs_recheck')
  ),
  UNIQUE (cart_id, client_item_id)
);

CREATE INDEX IF NOT EXISTS rental_cart_projects_cart_order_idx
  ON rental_cart_projects(cart_id, sort_order, created_at, id);

CREATE INDEX IF NOT EXISTS rental_cart_items_cart_order_idx
  ON rental_cart_items(cart_id, sort_order, created_at, id);

CREATE INDEX IF NOT EXISTS rental_cart_items_listing_idx
  ON rental_cart_items(listing_id, rental_start_date, rental_end_date);

CREATE OR REPLACE FUNCTION sit_validate_rental_cart_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rental_cart_projects AS project
    WHERE project.id = NEW.project_id AND project.cart_id = NEW.cart_id
  ) THEN
    RAISE EXCEPTION 'rental_cart_project_mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_cart_items_project_guard ON rental_cart_items;
CREATE TRIGGER rental_cart_items_project_guard
BEFORE INSERT OR UPDATE OF cart_id, project_id ON rental_cart_items
FOR EACH ROW EXECUTE FUNCTION sit_validate_rental_cart_project();
