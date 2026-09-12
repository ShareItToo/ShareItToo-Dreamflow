-- N6 connects the append-only AI draft foundation to an explicit owner review
-- and publication boundary. It does not migrate or rewrite existing listings.

ALTER TABLE listing_ai_drafts
  DROP CONSTRAINT listing_ai_drafts_status_check;

ALTER TABLE listing_ai_drafts
  ADD CONSTRAINT listing_ai_drafts_status_check CHECK (
    status IN ('editing', 'review_ready', 'published', 'discarded')
  ),
  ADD COLUMN disclosure_version TEXT,
  ADD COLUMN disclosure_accepted_at TIMESTAMPTZ,
  ADD COLUMN image_preflight_status TEXT CHECK (
    image_preflight_status IS NULL
    OR image_preflight_status IN ('consumed', 'review_required', 'blocked')
  ),
  ADD COLUMN published_listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  ADD COLUMN published_at TIMESTAMPTZ,
  ADD CONSTRAINT listing_ai_drafts_publication_state_check CHECK (
    (status = 'published') =
      (published_listing_id IS NOT NULL AND published_at IS NOT NULL)
  ),
  ADD CONSTRAINT listing_ai_drafts_consent_state_check CHECK (
    (disclosure_version IS NULL AND disclosure_accepted_at IS NULL)
    OR (disclosure_version = 'listing-ai-image-disclosure-v1'
      AND disclosure_accepted_at IS NOT NULL)
  );

ALTER TABLE listing_ai_draft_versions
  ADD COLUMN review_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(review_metadata) = 'object'
  );

CREATE UNIQUE INDEX listing_ai_drafts_published_listing_idx
  ON listing_ai_drafts(published_listing_id)
  WHERE published_listing_id IS NOT NULL;

CREATE TABLE listing_ai_publication_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES listing_ai_drafts(id) ON DELETE CASCADE,
  draft_version_id UUID NOT NULL,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  explicit_action TEXT NOT NULL CHECK (
    explicit_action = 'Anzeige veröffentlichen'
  ),
  readiness_state TEXT NOT NULL CHECK (
    readiness_state = 'READY_TO_PUBLISH'
  ),
  revision_payload_sha256 CHAR(64) NOT NULL CHECK (
    revision_payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id),
  UNIQUE (listing_id),
  FOREIGN KEY (draft_version_id, draft_id)
    REFERENCES listing_ai_draft_versions(id, draft_id) ON DELETE CASCADE
);

CREATE INDEX listing_ai_publication_receipts_owner_created_idx
  ON listing_ai_publication_receipts(owner_id, created_at DESC, id);

CREATE TRIGGER listing_ai_publication_receipts_append_only_guard
BEFORE UPDATE ON listing_ai_publication_receipts
FOR EACH ROW EXECUTE FUNCTION sit_reject_listing_ai_append_only_mutation();
