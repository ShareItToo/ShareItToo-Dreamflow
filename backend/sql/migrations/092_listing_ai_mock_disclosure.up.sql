-- The deterministic mock provider is a local/test execution lane.  Its
-- disclosure is still durable consent and must satisfy the same paired-field
-- invariant as the reviewed external and on-device disclosures.

ALTER TABLE listing_ai_drafts
  DROP CONSTRAINT listing_ai_drafts_consent_state_check;

ALTER TABLE listing_ai_drafts
  ADD CONSTRAINT listing_ai_drafts_consent_state_check CHECK (
    (disclosure_version IS NULL AND disclosure_accepted_at IS NULL)
    OR (
      disclosure_version IN (
        'listing-ai-image-disclosure-v1',
        'listing-ai-on-device-disclosure-v1',
        'listing-ai-mock-disclosure-v1'
      )
      AND disclosure_accepted_at IS NOT NULL
    )
  );
