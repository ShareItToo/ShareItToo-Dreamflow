-- B9: authoritative moderation, staff step-up authentication and reviews.
-- Additive and forward-compatible with B7/B8 application images.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS report_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS reporter_reference TEXT,
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE reports
  ADD CONSTRAINT reports_version_check CHECK (report_version = 1) NOT VALID,
  ADD CONSTRAINT reports_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')) NOT VALID,
  ADD CONSTRAINT reports_reference_check CHECK (
    reporter_reference IS NULL OR char_length(reporter_reference) <= 500
  ) NOT VALID;
ALTER TABLE reports VALIDATE CONSTRAINT reports_version_check;
ALTER TABLE reports VALIDATE CONSTRAINT reports_priority_check;
ALTER TABLE reports VALIDATE CONSTRAINT reports_reference_check;
WITH ranked_active_reports AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY reporter_id, target_type, target_id
           ORDER BY created_at DESC, id DESC
         ) AS position
  FROM reports
  WHERE status IN ('open', 'triaged', 'investigating', 'actioned')
)
UPDATE reports AS report
SET status = 'closed',
    resolution = jsonb_build_object('migration', 'duplicate_active_report_consolidated'),
    closed_at = COALESCE(closed_at, now()),
    updated_at = now()
FROM ranked_active_reports AS ranked
WHERE report.id = ranked.id AND ranked.position > 1;
CREATE UNIQUE INDEX reports_active_reporter_target_idx
  ON reports(reporter_id, target_type, target_id)
  WHERE status IN ('open', 'triaged', 'investigating', 'actioned');

ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
ALTER TABLE uploads
  ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (
    'listing_image', 'profile_image', 'message_attachment',
    'handover_evidence', 'return_evidence', 'report_evidence'
  )) NOT VALID;
ALTER TABLE uploads VALIDATE CONSTRAINT uploads_purpose_check;

CREATE TABLE report_evidence (
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  upload_id UUID NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, upload_id)
);
CREATE INDEX report_evidence_report_created_idx
  ON report_evidence(report_id, created_at, upload_id);

CREATE TABLE moderation_case_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_role IN ('user', 'support', 'admin', 'system')),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'report_created', 'assigned', 'status_changed', 'staff_note',
    'moderation_action', 'moderation_reversed'
  )),
  from_status TEXT,
  to_status TEXT,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 8000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX moderation_case_events_report_created_idx
  ON moderation_case_events(report_id, created_at, id);

INSERT INTO moderation_case_events (
  report_id, actor_id, actor_role, event_type, to_status,
  metadata, idempotency_key, created_at
)
SELECT report.id, report.reporter_id, 'user', 'report_created', report.status,
       jsonb_build_object('backfilled', true), 'backfill:report:' || report.id::text,
       report.created_at
FROM reports AS report
ON CONFLICT (idempotency_key) DO NOTHING;

CREATE TABLE staff_elevations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  role TEXT NOT NULL CHECK (role IN ('support', 'admin')),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX staff_elevations_active_idx
  ON staff_elevations(user_id, session_id, expires_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE user_suspensions
  ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES reports(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS moderation_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS moderation_previous_status TEXT,
  ADD COLUMN IF NOT EXISTS moderation_previous_is_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE listings
  ADD CONSTRAINT listings_moderation_status_check CHECK (
    moderation_status IN ('active', 'hidden', 'removed')
  ) NOT VALID;
ALTER TABLE listings VALIDATE CONSTRAINT listings_moderation_status_check;
CREATE INDEX listings_public_moderation_idx
  ON listings(moderation_status, created_at DESC);

CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE RESTRICT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('support', 'admin', 'system')),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'user_suspended', 'user_suspension_lifted',
    'listing_status_changed', 'report_transitioned'
  )),
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'listing', 'report')),
  target_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL UNIQUE,
  reversed_action_id UUID REFERENCES moderation_actions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_target_created_idx
  ON moderation_actions(target_type, target_id, created_at DESC);
CREATE INDEX moderation_actions_report_created_idx
  ON moderation_actions(report_id, created_at DESC) WHERE report_id IS NOT NULL;

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS listing_id TEXT REFERENCES listings(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'published';

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;
ALTER TABLE reviews ALTER COLUMN rating TYPE NUMERIC(2, 1) USING rating::numeric(2, 1);
ALTER TABLE reviews
  ADD CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5) NOT VALID;
ALTER TABLE reviews VALIDATE CONSTRAINT reviews_rating_check;

UPDATE reviews AS review
SET listing_id = booking.listing_id,
    direction = CASE
      WHEN review.reviewer_id = booking.renter_id THEN 'renter_to_owner'
      ELSE 'owner_to_renter'
    END,
    criteria = CASE
      WHEN jsonb_array_length(review.criteria) = 0 THEN jsonb_build_array(
        jsonb_build_object('key', 'overall', 'stars', review.rating, 'note', review.body)
      )
      ELSE review.criteria
    END
FROM bookings AS booking
WHERE booking.id = review.booking_id
  AND (review.listing_id IS NULL OR review.direction IS NULL OR jsonb_array_length(review.criteria) = 0);

ALTER TABLE reviews
  ALTER COLUMN listing_id SET NOT NULL,
  ALTER COLUMN direction SET NOT NULL,
  ADD CONSTRAINT reviews_version_check CHECK (review_version = 1) NOT VALID,
  ADD CONSTRAINT reviews_direction_check CHECK (
    direction IN ('renter_to_owner', 'owner_to_renter')
  ) NOT VALID,
  ADD CONSTRAINT reviews_criteria_check CHECK (
    jsonb_typeof(criteria) = 'array'
    AND jsonb_array_length(criteria) BETWEEN 1 AND 8
  ) NOT VALID,
  ADD CONSTRAINT reviews_moderation_status_check CHECK (
    moderation_status IN ('published', 'hidden', 'removed')
  ) NOT VALID;
ALTER TABLE reviews VALIDATE CONSTRAINT reviews_version_check;
ALTER TABLE reviews VALIDATE CONSTRAINT reviews_direction_check;
ALTER TABLE reviews VALIDATE CONSTRAINT reviews_criteria_check;
ALTER TABLE reviews VALIDATE CONSTRAINT reviews_moderation_status_check;
CREATE INDEX reviews_listing_created_idx ON reviews(listing_id, created_at DESC);
CREATE INDEX reviews_public_reviewee_created_idx
  ON reviews(reviewee_id, created_at DESC) WHERE moderation_status = 'published';

DROP TRIGGER IF EXISTS moderation_case_events_append_only ON moderation_case_events;
CREATE TRIGGER moderation_case_events_append_only
BEFORE UPDATE OR DELETE ON moderation_case_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS moderation_actions_append_only ON moderation_actions;
CREATE TRIGGER moderation_actions_append_only
BEFORE UPDATE OR DELETE ON moderation_actions
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
