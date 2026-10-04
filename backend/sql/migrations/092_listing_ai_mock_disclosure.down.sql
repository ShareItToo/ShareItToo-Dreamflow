-- Do not roll back while mock consent is durable: removing its allowed value
-- would make existing rows invalid.  Never delete or rewrite that history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM listing_ai_drafts
     WHERE disclosure_version = 'listing-ai-mock-disclosure-v1'
  ) THEN
    RAISE EXCEPTION
      'Mock listing AI disclosure rollback blocked: durable consent history exists';
  END IF;
END;
$$;

ALTER TABLE listing_ai_drafts
  DROP CONSTRAINT listing_ai_drafts_consent_state_check;

ALTER TABLE listing_ai_drafts
  ADD CONSTRAINT listing_ai_drafts_consent_state_check CHECK (
    (disclosure_version IS NULL AND disclosure_accepted_at IS NULL)
    OR (
      disclosure_version IN (
        'listing-ai-image-disclosure-v1',
        'listing-ai-on-device-disclosure-v1'
      )
      AND disclosure_accepted_at IS NOT NULL
    )
  );
