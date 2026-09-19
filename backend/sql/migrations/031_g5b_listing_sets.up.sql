-- G5B: optional same-owner SIT Sets and 1-Stop Sets. Set versions and their
-- membership snapshots are additive user intent. They do not reserve listings,
-- create bookings/contracts/payments, or replace item-level V5.2/G3 evidence.

CREATE TABLE listing_sets (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^listing_set_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX listing_sets_owner_created_idx
  ON listing_sets(owner_id, created_at DESC, id);

CREATE TABLE listing_set_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_set_id TEXT NOT NULL REFERENCES listing_sets(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  set_kind TEXT NOT NULL CHECK (set_kind IN ('sit_set', 'one_stop_set')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'ended')),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  country_code CHAR(2) NOT NULL DEFAULT 'DE' CHECK (country_code = 'DE'),
  member_count INTEGER NOT NULL CHECK (member_count BETWEEN 2 AND 12),
  required_member_count INTEGER NOT NULL CHECK (
    required_member_count BETWEEN 2 AND member_count
  ),
  membership_hash CHAR(64) NOT NULL CHECK (membership_hash ~ '^[0-9a-f]{64}$'),
  created_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_set_id, revision),
  UNIQUE (id, listing_set_id)
);

CREATE INDEX listing_set_versions_current_idx
  ON listing_set_versions(listing_set_id, revision DESC, id);

CREATE TABLE listing_set_version_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_set_id TEXT NOT NULL REFERENCES listing_sets(id) ON DELETE CASCADE,
  listing_set_version_id UUID NOT NULL,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  member_role TEXT NOT NULL CHECK (member_role IN ('required', 'optional')),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 11),
  category_id TEXT NOT NULL CHECK (char_length(category_id) BETWEEN 1 AND 80),
  subcategory TEXT NOT NULL CHECK (char_length(subcategory) BETWEEN 1 AND 120),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  country_code CHAR(2) NOT NULL DEFAULT 'DE' CHECK (country_code = 'DE'),
  handover_location_key CHAR(64) NOT NULL
    CHECK (handover_location_key ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (listing_set_version_id, listing_set_id)
    REFERENCES listing_set_versions(id, listing_set_id) ON DELETE CASCADE,
  UNIQUE (listing_set_version_id, listing_id),
  UNIQUE (listing_set_version_id, sort_order)
);

CREATE INDEX listing_set_members_listing_idx
  ON listing_set_version_members(listing_id, listing_set_version_id);
CREATE INDEX listing_set_members_version_order_idx
  ON listing_set_version_members(listing_set_version_id, sort_order, id);

CREATE OR REPLACE FUNCTION sit_validate_listing_set_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_set listing_sets%ROWTYPE;
  previous_version listing_set_versions%ROWTYPE;
BEGIN
  SELECT * INTO target_set FROM listing_sets
    WHERE id = NEW.listing_set_id FOR UPDATE;
  IF target_set.id IS NULL OR target_set.owner_id <> NEW.created_by_id THEN
    RAISE EXCEPTION 'listing_set_owner_mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO previous_version FROM listing_set_versions
    WHERE listing_set_id = NEW.listing_set_id
    ORDER BY revision DESC LIMIT 1 FOR KEY SHARE;
  IF previous_version.id IS NULL THEN
    IF NEW.revision <> 1 THEN
      RAISE EXCEPTION 'listing_set_initial_revision_mismatch' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF previous_version.status = 'ended'
      OR NEW.revision <> previous_version.revision + 1
      OR NEW.set_kind <> previous_version.set_kind
    THEN
      RAISE EXCEPTION 'listing_set_revision_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_set_versions_context_guard
BEFORE INSERT ON listing_set_versions
FOR EACH ROW EXECUTE FUNCTION sit_validate_listing_set_version();

CREATE OR REPLACE FUNCTION sit_validate_listing_set_member()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_set listing_sets%ROWTYPE;
  target_version listing_set_versions%ROWTYPE;
  target_listing listings%ROWTYPE;
  normalized_country TEXT;
  current_handover_key TEXT;
BEGIN
  SELECT * INTO target_set FROM listing_sets
    WHERE id = NEW.listing_set_id FOR KEY SHARE;
  SELECT * INTO target_version FROM listing_set_versions
    WHERE id = NEW.listing_set_version_id FOR KEY SHARE;
  SELECT * INTO target_listing FROM listings
    WHERE id = NEW.listing_id FOR KEY SHARE;
  IF target_set.id IS NULL OR target_version.id IS NULL OR target_listing.id IS NULL
  THEN
    RAISE EXCEPTION 'listing_set_member_reference_not_found' USING ERRCODE = '23503';
  END IF;

  normalized_country := CASE lower(COALESCE(target_listing.country, ''))
    WHEN 'de' THEN 'DE'
    WHEN 'deutschland' THEN 'DE'
    WHEN 'germany' THEN 'DE'
    ELSE ''
  END;
  current_handover_key := encode(digest(concat_ws(E'\n',
    COALESCE(target_listing.location_text, ''),
    COALESCE(target_listing.latitude::text, ''),
    COALESCE(target_listing.longitude::text, ''),
    COALESCE(target_listing.handover_radius_km::text, '')
  ), 'sha256'), 'hex');

  IF target_version.listing_set_id <> NEW.listing_set_id
    OR target_listing.owner_id <> target_set.owner_id
    OR target_listing.catalog_version <> 1
    OR (target_version.status = 'active' AND (
      target_listing.status <> 'active'
      OR target_listing.is_active <> true
      OR target_listing.moderation_status <> 'active'
    ))
    OR target_listing.category_id <> NEW.category_id
    OR COALESCE(target_listing.subcategory, '') <> NEW.subcategory
    OR target_listing.currency <> NEW.currency
    OR normalized_country <> NEW.country_code
    OR current_handover_key <> NEW.handover_location_key
    OR target_version.currency <> NEW.currency
    OR target_version.country_code <> NEW.country_code
  THEN
    RAISE EXCEPTION 'listing_set_member_context_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_set_members_context_guard
BEFORE INSERT ON listing_set_version_members
FOR EACH ROW EXECUTE FUNCTION sit_validate_listing_set_member();

CREATE OR REPLACE FUNCTION sit_assert_listing_set_members_complete(version_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  target_version listing_set_versions%ROWTYPE;
  actual_count INTEGER;
  actual_required_count INTEGER;
  handover_count INTEGER;
BEGIN
  SELECT * INTO target_version FROM listing_set_versions WHERE id = version_id;
  IF target_version.id IS NULL THEN
    RETURN;
  END IF;
  SELECT count(*)::int,
         count(*) FILTER (WHERE member_role = 'required')::int,
         count(DISTINCT handover_location_key)::int
    INTO actual_count, actual_required_count, handover_count
    FROM listing_set_version_members
   WHERE listing_set_version_id = version_id;
  IF actual_count <> target_version.member_count
    OR actual_required_count <> target_version.required_member_count
    OR (target_version.status = 'active'
      AND target_version.set_kind = 'one_stop_set' AND handover_count <> 1)
  THEN
    RAISE EXCEPTION 'listing_set_membership_incomplete' USING ERRCODE = '23514';
  END IF;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_listing_set_version_members_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sit_assert_listing_set_members_complete(NEW.id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_listing_set_member_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sit_assert_listing_set_members_complete(
    CASE WHEN TG_OP = 'DELETE'
      THEN OLD.listing_set_version_id
      ELSE NEW.listing_set_version_id
    END
  );
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER listing_set_versions_members_complete_guard
AFTER INSERT ON listing_set_versions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sit_validate_listing_set_version_members_complete();

CREATE CONSTRAINT TRIGGER listing_set_members_complete_guard
AFTER INSERT OR UPDATE OR DELETE ON listing_set_version_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sit_validate_listing_set_member_complete();
