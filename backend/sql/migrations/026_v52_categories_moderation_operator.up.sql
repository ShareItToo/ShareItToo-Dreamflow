-- V5.2 categories, private-marketplace eligibility, reasoned moderation and
-- internal professional-review evidence. This migration does not enable a
-- provider, live payment, public legal surface, Store submission or release.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS private_marketplace_review_status TEXT NOT NULL DEFAULT 'clear';
ALTER TABLE users
  ADD CONSTRAINT users_private_marketplace_review_status_check CHECK (
    private_marketplace_review_status IN ('clear', 'review_required', 'blocked')
  ) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_private_marketplace_review_status_check;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS private_pilot_region_code TEXT;
ALTER TABLE listings
  ADD CONSTRAINT listings_private_pilot_region_code_check CHECK (
    private_pilot_region_code IS NULL
    OR (
      char_length(private_pilot_region_code) BETWEEN 1 AND 120
      AND private_pilot_region_code = lower(btrim(private_pilot_region_code))
    )
  ) NOT VALID;
ALTER TABLE listings VALIDATE CONSTRAINT listings_private_pilot_region_code_check;
CREATE INDEX IF NOT EXISTS listings_private_pilot_catalog_idx
  ON listings(private_pilot_region_code, category_id, subcategory, created_at DESC)
  WHERE private_status_confirmed_at IS NOT NULL;

CREATE TABLE private_marketplace_review_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('admin', 'system')),
  from_status TEXT NOT NULL CHECK (from_status IN ('clear', 'review_required', 'blocked')),
  to_status TEXT NOT NULL CHECK (to_status IN ('clear', 'review_required', 'blocked')),
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[a-z0-9_.:-]{3,120}$'),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 8000),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX private_marketplace_review_events_user_time_idx
  ON private_marketplace_review_events(user_id, created_at DESC, id DESC);

CREATE TABLE moderation_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE RESTRICT,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'listing', 'review', 'message', 'report')),
  target_id TEXT NOT NULL,
  measure_type TEXT NOT NULL CHECK (measure_type IN (
    'account_suspension', 'scope_suspension', 'listing_restriction',
    'private_marketplace_review', 'report_resolution', 'measure_reversal'
  )),
  measure_state TEXT NOT NULL CHECK (char_length(measure_state) BETWEEN 1 AND 120),
  facts TEXT NOT NULL CHECK (char_length(facts) BETWEEN 3 AND 8000),
  basis TEXT NOT NULL CHECK (char_length(basis) BETWEEN 3 AND 2000),
  reasoning TEXT NOT NULL CHECK (char_length(reasoning) BETWEEN 3 AND 8000),
  detection_method TEXT NOT NULL CHECK (detection_method IN ('human', 'automated', 'hybrid')),
  automated_means TEXT CHECK (
    automated_means IS NULL OR char_length(automated_means) BETWEEN 3 AND 2000
  ),
  review_available BOOLEAN NOT NULL DEFAULT true,
  review_deadline_at TIMESTAMPTZ,
  issued_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (detection_method = 'human' AND automated_means IS NULL)
    OR (detection_method IN ('automated', 'hybrid') AND automated_means IS NOT NULL)
  ),
  CHECK (
    (review_available AND review_deadline_at IS NOT NULL AND review_deadline_at > created_at)
    OR (NOT review_available AND review_deadline_at IS NULL)
  )
);
CREATE INDEX moderation_decisions_user_time_idx
  ON moderation_decisions(recipient_user_id, created_at DESC, id DESC);
CREATE INDEX moderation_decisions_report_idx
  ON moderation_decisions(report_id, created_at DESC) WHERE report_id IS NOT NULL;

CREATE TABLE moderation_review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES moderation_decisions(id) ON DELETE RESTRICT,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 8000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'in_review', 'upheld', 'modified', 'reversed')
  ),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution TEXT CHECK (resolution IS NULL OR char_length(resolution) BETWEEN 3 AND 8000),
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (decision_id, requester_id),
  CHECK (
    (status IN ('submitted', 'in_review') AND resolution IS NULL AND resolved_at IS NULL)
    OR (status IN ('upheld', 'modified', 'reversed') AND resolution IS NOT NULL AND resolved_at IS NOT NULL)
  )
);
CREATE INDEX moderation_review_requests_status_time_idx
  ON moderation_review_requests(status, submitted_at, id);

CREATE TABLE moderation_review_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  review_request_id UUID NOT NULL REFERENCES moderation_review_requests(id) ON DELETE RESTRICT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('user', 'support', 'admin', 'system')),
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted', 'assigned', 'resolved')),
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (
    to_status IN ('submitted', 'in_review', 'upheld', 'modified', 'reversed')
  ),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 8000),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX moderation_review_events_request_time_idx
  ON moderation_review_events(review_request_id, created_at, id);

CREATE TABLE compliance_reserve_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  operations_due_minor BIGINT NOT NULL CHECK (operations_due_minor >= 0),
  tax_due_minor BIGINT NOT NULL CHECK (tax_due_minor >= 0),
  refund_due_minor BIGINT NOT NULL CHECK (refund_due_minor >= 0),
  available_reserve_minor BIGINT NOT NULL CHECK (available_reserve_minor >= 0),
  evidence_reference TEXT NOT NULL CHECK (char_length(evidence_reference) BETWEEN 3 AND 500),
  idempotency_key TEXT NOT NULL UNIQUE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX compliance_reserve_attestations_time_idx
  ON compliance_reserve_attestations(recorded_at DESC, id DESC);

CREATE TABLE compliance_professional_review_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[a-z0-9_.:-]{3,120}$'),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 3 AND 8000),
  evidence_reference TEXT NOT NULL CHECK (char_length(evidence_reference) BETWEEN 3 AND 500),
  idempotency_key TEXT NOT NULL UNIQUE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX compliance_professional_review_incidents_time_idx
  ON compliance_professional_review_incidents(recorded_at DESC, id DESC);

DROP TRIGGER IF EXISTS private_marketplace_review_events_append_only
  ON private_marketplace_review_events;
CREATE TRIGGER private_marketplace_review_events_append_only
BEFORE UPDATE OR DELETE ON private_marketplace_review_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS moderation_decisions_append_only ON moderation_decisions;
CREATE TRIGGER moderation_decisions_append_only
BEFORE UPDATE OR DELETE ON moderation_decisions
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS moderation_review_events_append_only ON moderation_review_events;
CREATE TRIGGER moderation_review_events_append_only
BEFORE UPDATE OR DELETE ON moderation_review_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS compliance_reserve_attestations_append_only
  ON compliance_reserve_attestations;
CREATE TRIGGER compliance_reserve_attestations_append_only
BEFORE UPDATE OR DELETE ON compliance_reserve_attestations
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS compliance_professional_review_incidents_append_only
  ON compliance_professional_review_incidents;
CREATE TRIGGER compliance_professional_review_incidents_append_only
BEFORE UPDATE OR DELETE ON compliance_professional_review_incidents
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
