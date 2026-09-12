DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM listing_ai_publication_receipts LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM listing_ai_drafts
      WHERE status = 'published' OR published_listing_id IS NOT NULL
      LIMIT 1
    )
  THEN
    RAISE EXCEPTION 'N6 rollback blocked: listing workflow publication data exists';
  END IF;
END;
$$;

DROP TRIGGER listing_ai_publication_receipts_append_only_guard
  ON listing_ai_publication_receipts;
DROP TABLE listing_ai_publication_receipts;
DROP INDEX listing_ai_drafts_published_listing_idx;

ALTER TABLE listing_ai_draft_versions
  DROP COLUMN review_metadata;

ALTER TABLE listing_ai_drafts
  DROP CONSTRAINT listing_ai_drafts_consent_state_check,
  DROP CONSTRAINT listing_ai_drafts_publication_state_check,
  DROP COLUMN published_at,
  DROP COLUMN published_listing_id,
  DROP COLUMN image_preflight_status,
  DROP COLUMN disclosure_accepted_at,
  DROP COLUMN disclosure_version,
  DROP CONSTRAINT listing_ai_drafts_status_check;

ALTER TABLE listing_ai_drafts
  ADD CONSTRAINT listing_ai_drafts_status_check CHECK (
    status IN ('editing', 'review_ready', 'discarded')
  );
