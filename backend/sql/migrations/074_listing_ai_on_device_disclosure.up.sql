-- WP109 follow-up: the Android on-device provider has its own disclosure copy.
-- Both reviewed disclosures remain valid because existing external-provider
-- drafts are append-only and must continue to satisfy the consent invariant.

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
