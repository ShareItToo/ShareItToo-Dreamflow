-- S3Q rollback is intentionally fail-closed. It removes only schema objects
-- and refuses to run after any independent-review resolution was recorded.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM moderation_review_resolutions LIMIT 1) THEN
    RAISE EXCEPTION
      'rollback refused: independent moderation review evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS moderation_review_requests_resolution_required
  ON moderation_review_requests;
DROP FUNCTION IF EXISTS sit_require_moderation_review_resolution();

DROP TRIGGER IF EXISTS moderation_review_requests_update_guard
  ON moderation_review_requests;
DROP FUNCTION IF EXISTS sit_validate_moderation_review_request_update();

DROP TRIGGER IF EXISTS moderation_review_resolutions_append_only
  ON moderation_review_resolutions;
DROP TRIGGER IF EXISTS moderation_review_resolutions_validate
  ON moderation_review_resolutions;
DROP FUNCTION IF EXISTS sit_validate_moderation_review_resolution();
DROP TABLE moderation_review_resolutions;
