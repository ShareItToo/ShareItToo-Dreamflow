ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS catalog_version SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS catalog_revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category_id TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS condition TEXT,
  ADD COLUMN IF NOT EXISTS location_text TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS min_days INTEGER,
  ADD COLUMN IF NOT EXISTS max_days INTEGER,
  ADD COLUMN IF NOT EXISTS handover_radius_km NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS protection_model TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

UPDATE listings
SET status = CASE
      WHEN payload->>'status' IN ('draft', 'active', 'paused', 'ended')
        THEN payload->>'status'
      WHEN is_active THEN 'active'
      ELSE 'paused'
    END,
    title = NULLIF(btrim(payload->>'title'), ''),
    description = NULLIF(btrim(payload->>'description'), ''),
    category_id = NULLIF(btrim(payload->>'categoryId'), ''),
    subcategory = NULLIF(btrim(payload->>'subcategory'), ''),
    condition = NULLIF(btrim(payload->>'condition'), ''),
    location_text = NULLIF(btrim(payload->>'locationText'), ''),
    city = NULLIF(btrim(payload->>'city'), ''),
    country = NULLIF(btrim(payload->>'country'), ''),
    latitude = sit_try_numeric(payload->>'lat')::double precision,
    longitude = sit_try_numeric(payload->>'lng')::double precision,
    min_days = CASE
      WHEN sit_try_numeric(payload->>'minDays') BETWEEN 1 AND 3650
        THEN sit_try_numeric(payload->>'minDays')::integer
      ELSE NULL
    END,
    max_days = CASE
      WHEN sit_try_numeric(payload->>'maxDays') BETWEEN 1 AND 3650
        THEN sit_try_numeric(payload->>'maxDays')::integer
      ELSE NULL
    END,
    handover_radius_km = CASE
      WHEN sit_try_numeric(COALESCE(
        payload->>'handoverRadiusKm',
        payload->>'maxDeliveryKmAtDropoff',
        payload->>'maxPickupKmAtReturn'
      )) BETWEEN 0 AND 500
        THEN sit_try_numeric(COALESCE(
          payload->>'handoverRadiusKm',
          payload->>'maxDeliveryKmAtDropoff',
          payload->>'maxPickupKmAtReturn'
        ))
      ELSE NULL
    END,
    protection_model = CASE
      WHEN payload->>'protectionModel' IN ('standard', 'deposit', 'none')
        THEN payload->>'protectionModel'
      ELSE 'standard'
    END,
    published_at = CASE WHEN is_active THEN COALESCE(created_at, now()) ELSE NULL END,
    ended_at = CASE
      WHEN payload->>'endedAt' IS NOT NULL
        AND payload->>'endedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (payload->>'endedAt')::timestamptz
      ELSE NULL
    END;

UPDATE listings
SET is_active = (status = 'active'),
    published_at = CASE
      WHEN status = 'active' THEN COALESCE(published_at, created_at, now())
      ELSE published_at
    END;

-- Existing incomplete rows are retained for their owners but cannot remain public.
UPDATE listings
SET status = 'paused',
    is_active = false,
    payload = jsonb_set(
      jsonb_set(payload, '{status}', '"paused"'::jsonb),
      '{isActive}',
      'false'::jsonb
    )
WHERE status = 'active'
  AND (
    title IS NULL OR char_length(title) < 3
    OR description IS NULL OR char_length(description) < 10
    OR category_id IS NULL
    OR condition NOT IN ('new', 'like-new', 'good', 'acceptable', 'worn', 'used')
    OR city IS NULL OR country IS NULL
    OR latitude NOT BETWEEN -90 AND 90
    OR longitude NOT BETWEEN -180 AND 180
    OR price_per_day_minor IS NULL OR price_per_day_minor <= 0
  );

-- The former server bootstrap catalogue is never part of a real public catalogue.
UPDATE listings AS listing
SET status = 'ended',
    is_active = false,
    ended_at = COALESCE(ended_at, now()),
    payload = jsonb_set(
      jsonb_set(
        jsonb_set(payload, '{status}', '"ended"'::jsonb),
        '{isActive}',
        'false'::jsonb
      ),
      '{endedAt}',
      to_jsonb(COALESCE(ended_at, now())::text)
    )
FROM users AS owner
WHERE listing.owner_id = owner.id
  AND owner.email = 'u1@shareittoo.demo'
  AND listing.id IN ('1', '2', '3', '4', '5');

ALTER TABLE listings
  ADD CONSTRAINT listings_catalog_version_check
    CHECK (catalog_version IN (0, 1)) NOT VALID,
  ADD CONSTRAINT listings_catalog_revision_check
    CHECK (catalog_revision >= 0) NOT VALID,
  ADD CONSTRAINT listings_status_check
    CHECK (status IN ('draft', 'active', 'paused', 'ended')) NOT VALID,
  ADD CONSTRAINT listings_condition_check
    CHECK (condition IS NULL OR condition IN ('new', 'like-new', 'good', 'acceptable', 'worn', 'used')) NOT VALID,
  ADD CONSTRAINT listings_latitude_check
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90) NOT VALID,
  ADD CONSTRAINT listings_longitude_check
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180) NOT VALID,
  ADD CONSTRAINT listings_duration_check
    CHECK (
      (min_days IS NULL OR min_days BETWEEN 1 AND 3650)
      AND (max_days IS NULL OR max_days BETWEEN 1 AND 3650)
      AND (min_days IS NULL OR max_days IS NULL OR min_days <= max_days)
    ) NOT VALID,
  ADD CONSTRAINT listings_handover_radius_check
    CHECK (handover_radius_km IS NULL OR handover_radius_km BETWEEN 0 AND 500) NOT VALID,
  ADD CONSTRAINT listings_protection_model_check
    CHECK (protection_model IN ('standard', 'deposit', 'none')) NOT VALID,
  ADD CONSTRAINT listings_active_status_check
    CHECK (catalog_version = 0 OR is_active = (status = 'active')) NOT VALID,
  ADD CONSTRAINT listings_active_catalog_ready_check
    CHECK (
      catalog_version = 0
      OR status <> 'active'
      OR (
        title IS NOT NULL AND char_length(title) BETWEEN 3 AND 160
        AND description IS NOT NULL AND char_length(description) BETWEEN 10 AND 10000
        AND category_id IS NOT NULL
        AND condition IS NOT NULL
        AND city IS NOT NULL AND country IS NOT NULL
        AND latitude BETWEEN -90 AND 90
        AND longitude BETWEEN -180 AND 180
        AND price_per_day_minor IS NOT NULL AND price_per_day_minor > 0
      )
    ) NOT VALID;

ALTER TABLE listings VALIDATE CONSTRAINT listings_catalog_version_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_catalog_revision_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_status_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_condition_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_latitude_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_longitude_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_duration_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_handover_radius_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_protection_model_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_active_status_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_active_catalog_ready_check;

CREATE INDEX IF NOT EXISTS listings_public_search_idx
  ON listings USING gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(category_id, '') || ' ' ||
      coalesce(subcategory, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(country, '')
    )
  )
  WHERE catalog_version = 1 AND is_active = true;
CREATE INDEX IF NOT EXISTS listings_public_filter_idx
  ON listings(category_id, condition, price_per_day_minor, created_at DESC)
  WHERE catalog_version = 1 AND is_active = true;
CREATE INDEX IF NOT EXISTS listings_public_location_idx
  ON listings(latitude, longitude)
  WHERE catalog_version = 1 AND is_active = true;

ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS thumbnail_storage_name TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS thumbnail_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_byte_size INTEGER,
  ADD COLUMN IF NOT EXISTS image_width INTEGER,
  ADD COLUMN IF NOT EXISTS image_height INTEGER,
  ADD COLUMN IF NOT EXISTS content_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS content_scan_status TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE uploads
  ADD CONSTRAINT uploads_thumbnail_size_check
    CHECK (thumbnail_byte_size IS NULL OR thumbnail_byte_size BETWEEN 1 AND 2097152) NOT VALID,
  ADD CONSTRAINT uploads_image_dimensions_check
    CHECK (
      (image_width IS NULL AND image_height IS NULL)
      OR (image_width BETWEEN 1 AND 12000 AND image_height BETWEEN 1 AND 12000)
    ) NOT VALID,
  ADD CONSTRAINT uploads_content_sha256_check
    CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$') NOT VALID,
  ADD CONSTRAINT uploads_content_scan_status_check
    CHECK (content_scan_status IN ('legacy', 'passed', 'rejected')) NOT VALID;

ALTER TABLE uploads VALIDATE CONSTRAINT uploads_thumbnail_size_check;
ALTER TABLE uploads VALIDATE CONSTRAINT uploads_image_dimensions_check;
ALTER TABLE uploads VALIDATE CONSTRAINT uploads_content_sha256_check;
ALTER TABLE uploads VALIDATE CONSTRAINT uploads_content_scan_status_check;

-- Legacy rows without a verified, server-processed image cannot be booked or published.
UPDATE listings AS listing
SET status = 'paused',
    is_active = false,
    payload = jsonb_set(
      jsonb_set(listing.payload, '{status}', '"paused"'::jsonb),
      '{isActive}',
      'false'::jsonb
    )
WHERE listing.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM uploads AS upload
    WHERE upload.listing_id = listing.id
      AND upload.purpose = 'listing_image'
      AND upload.content_scan_status = 'passed'
  );

CREATE INDEX IF NOT EXISTS uploads_listing_public_idx
  ON uploads(listing_id, created_at)
  WHERE purpose = 'listing_image'
    AND visibility = 'public'
    AND content_scan_status = 'passed';

-- A rolled-back B4 application does not know the catalog projection columns.
-- If it changes a B5 row without advancing catalog_revision, quarantine the
-- row in version 0. B4 continues to work from payload/is_active; a restored B5
-- application will not publish or book the row until a validated edit.
CREATE OR REPLACE FUNCTION sit_guard_listing_catalog_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.catalog_revision = OLD.catalog_revision
    AND (
      NEW.payload IS DISTINCT FROM OLD.payload
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.price_per_day_minor IS DISTINCT FROM OLD.price_per_day_minor
      OR NEW.security_deposit_minor IS DISTINCT FROM OLD.security_deposit_minor
    )
  THEN
    NEW.catalog_version := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_catalog_write_guard ON listings;
CREATE TRIGGER listings_catalog_write_guard
BEFORE UPDATE ON listings
FOR EACH ROW
EXECUTE FUNCTION sit_guard_listing_catalog_write();
