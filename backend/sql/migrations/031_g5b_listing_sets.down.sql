-- G5B rollback is fail-closed after any listing-set user intent exists. Empty
-- additive objects can be removed without touching listings or booking truth.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM listing_set_version_members)
    OR EXISTS (SELECT 1 FROM listing_set_versions)
    OR EXISTS (SELECT 1 FROM listing_sets)
  THEN
    RAISE EXCEPTION 'G5B rollback blocked: listing set data exists';
  END IF;
END;
$$;

DROP TRIGGER listing_set_members_complete_guard ON listing_set_version_members;
DROP TRIGGER listing_set_versions_members_complete_guard ON listing_set_versions;
DROP TRIGGER listing_set_members_context_guard ON listing_set_version_members;
DROP TRIGGER listing_set_versions_context_guard ON listing_set_versions;

DROP FUNCTION sit_validate_listing_set_member_complete();
DROP FUNCTION sit_validate_listing_set_version_members_complete();
DROP FUNCTION sit_assert_listing_set_members_complete(UUID);
DROP FUNCTION sit_validate_listing_set_member();
DROP FUNCTION sit_validate_listing_set_version();

DROP TABLE listing_set_version_members;
DROP TABLE listing_set_versions;
DROP TABLE listing_sets;
