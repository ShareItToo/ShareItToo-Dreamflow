-- S3P / SUP-115 through SUP-117: exact, append-only and user-bound
-- Statement of Reasons evidence. This migration does not execute a content,
-- account, payout or payment measure and does not enable external delivery.

CREATE TABLE moderation_statements_of_reasons (
  moderation_decision_id UUID PRIMARY KEY
    REFERENCES moderation_decisions(id) ON DELETE RESTRICT,
  statement_version TEXT NOT NULL CHECK (
    statement_version = 'sit_dsa_statement_of_reasons_v1'
  ),
  decision_ground TEXT NOT NULL CHECK (
    decision_ground IN ('alleged_illegal_content', 'terms_violation')
  ),
  decision_origin TEXT NOT NULL CHECK (
    decision_origin IN ('notice', 'own_initiative')
  ),
  territorial_scope TEXT NOT NULL CHECK (
    char_length(territorial_scope) BETWEEN 3 AND 2000
  ),
  duration_type TEXT NOT NULL CHECK (
    duration_type IN ('fixed', 'until_reversed', 'not_applicable')
  ),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  automation_role TEXT NOT NULL CHECK (
    automation_role IN ('none', 'signal', 'decision_support')
  ),
  human_reviewed BOOLEAN NOT NULL CHECK (human_reviewed),
  human_reviewed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  review_channel TEXT NOT NULL CHECK (review_channel = 'authenticated_in_app'),
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (duration_type = 'fixed' AND ends_at IS NOT NULL AND ends_at > starts_at)
    OR (duration_type = 'until_reversed' AND ends_at IS NULL)
    OR (duration_type = 'not_applicable' AND ends_at IS NULL)
  ),
  CHECK (published_at >= starts_at)
);

CREATE OR REPLACE FUNCTION sit_validate_moderation_statement_of_reasons()
RETURNS TRIGGER AS $$
DECLARE
  decision_row moderation_decisions%ROWTYPE;
  reviewer_role TEXT;
BEGIN
  SELECT * INTO decision_row
    FROM moderation_decisions
   WHERE id = NEW.moderation_decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moderation_statement_decision_missing';
  END IF;
  IF decision_row.issued_by IS NULL
     OR NEW.human_reviewed_by IS DISTINCT FROM decision_row.issued_by THEN
    RAISE EXCEPTION 'moderation_statement_human_reviewer_mismatch';
  END IF;
  SELECT role INTO reviewer_role
    FROM users
   WHERE id = NEW.human_reviewed_by;
  IF reviewer_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'moderation_statement_admin_reviewer_required';
  END IF;
  IF decision_row.detection_method = 'human'
     AND (NEW.automation_role <> 'none' OR decision_row.automated_means IS NOT NULL) THEN
    RAISE EXCEPTION 'moderation_statement_automation_mismatch';
  END IF;
  IF decision_row.detection_method IN ('automated', 'hybrid')
     AND (NEW.automation_role = 'none' OR decision_row.automated_means IS NULL) THEN
    RAISE EXCEPTION 'moderation_statement_automation_missing';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER moderation_statements_of_reasons_validate
BEFORE INSERT ON moderation_statements_of_reasons
FOR EACH ROW EXECUTE FUNCTION sit_validate_moderation_statement_of_reasons();

CREATE TRIGGER moderation_statements_of_reasons_append_only
BEFORE UPDATE OR DELETE ON moderation_statements_of_reasons
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION sit_require_moderation_statement_of_reasons()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.measure_type IN (
    'account_suspension', 'scope_suspension', 'listing_restriction',
    'private_marketplace_review', 'measure_reversal'
  ) AND NOT EXISTS (
    SELECT 1 FROM moderation_statements_of_reasons
     WHERE moderation_decision_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'moderation_statement_of_reasons_required';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER moderation_decisions_statement_required
AFTER INSERT ON moderation_decisions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sit_require_moderation_statement_of_reasons();
