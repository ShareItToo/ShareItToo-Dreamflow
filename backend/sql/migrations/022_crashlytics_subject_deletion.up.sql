-- Pseudonymous Crashlytics subjects exist only for accounts that explicitly
-- enable crash diagnostics.  The provider outbox intentionally contains no
-- SIT user identifier and survives local account erasure until Firebase
-- accepts the report-deletion request.

CREATE TABLE IF NOT EXISTS crashlytics_subjects (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  firebase_app_id TEXT NOT NULL
    CHECK (char_length(firebase_app_id) BETWEEN 10 AND 180),
  subject_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, platform),
  UNIQUE (subject_id)
);

CREATE TABLE IF NOT EXISTS crashlytics_report_deletion_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_app_id TEXT NOT NULL
    CHECK (char_length(firebase_app_id) BETWEEN 10 AND 180),
  subject_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  last_error_code TEXT,
  target_complete_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firebase_app_id, subject_id)
);

CREATE INDEX IF NOT EXISTS crashlytics_report_deletion_outbox_due_idx
  ON crashlytics_report_deletion_outbox(next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry');
