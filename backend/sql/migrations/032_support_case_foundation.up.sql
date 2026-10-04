-- SIT Support Packet V1: additive, non-live case foundation. This schema is
-- intentionally fail-closed and does not enable external messages, payment,
-- account measures, public support automation or a pilot by itself.

CREATE TABLE support_policy_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_type TEXT NOT NULL CHECK (char_length(policy_type) BETWEEN 3 AND 80),
  version TEXT NOT NULL CHECK (char_length(version) BETWEEN 1 AND 80),
  effective_from TIMESTAMPTZ NOT NULL,
  rule_values JSONB NOT NULL CHECK (jsonb_typeof(rule_values) = 'object'),
  source_document_ids TEXT[] NOT NULL DEFAULT '{}',
  approval_reference TEXT NOT NULL CHECK (char_length(approval_reference) BETWEEN 3 AND 500),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (policy_type, version, content_sha256)
);

CREATE TABLE support_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  human_readable_case_number TEXT NOT NULL UNIQUE CHECK (
    human_readable_case_number ~ '^SIT-[A-HJ-NP-Z2-9]{12}$'
  ),
  case_type TEXT NOT NULL CHECK (case_type IN (
    'general_help', 'booking_pre_start', 'active_handover', 'active_rental',
    'active_return', 'post_return_dispute', 'cancellation_no_show',
    'money_case', 'trust_safety', 'moderation_content', 'privacy_security',
    'legal_authority', 'listing_quality'
  )),
  case_subtype TEXT NOT NULL CHECK (
    char_length(case_subtype) BETWEEN 3 AND 100
    AND case_subtype ~ '^[a-z0-9_]+$'
  ),
  CHECK (
    (case_type = 'general_help' AND case_subtype IN (
      'login_or_registration', 'profile_or_verification', 'notification_or_push',
      'invoice_or_document', 'app_error_or_display', 'accessibility_or_usability',
      'general_how_to'
    )) OR
    (case_type = 'booking_pre_start' AND case_subtype IN (
      'booking_request_or_acceptance', 'availability_or_overlap',
      'date_or_time_confirmation', 'address_reveal', 'delivery_or_collection',
      'pre_start_cancellation', 'booking_change_or_extension'
    )) OR
    (case_type = 'active_handover' AND case_subtype IN (
      'party_not_present', 'item_not_as_listed', 'handover_photo_missing',
      'qr_or_code_failure', 'identity_or_person_mismatch', 'unsafe_handover',
      'handover_confirmation_conflict'
    )) OR
    (case_type = 'active_rental' AND case_subtype IN (
      'item_failure_or_defect', 'unsafe_product_or_injury', 'loss_or_theft',
      'usage_or_accessory_issue', 'extension_request', 'early_return_request',
      'contact_or_harassment'
    )) OR
    (case_type = 'active_return' AND case_subtype IN (
      'party_not_present', 'return_location_or_time', 'return_photo_missing',
      'qr_or_code_failure', 'condition_disagreement', 'accessory_or_part_missing',
      'unsafe_return', 'return_confirmation_conflict'
    )) OR
    (case_type = 'post_return_dispute' AND case_subtype IN (
      'damage_report', 'missing_item_report', 'late_return_dispute',
      'cleaning_or_condition_dispute', 'new_evidence_after_completion'
    )) OR
    (case_type = 'cancellation_no_show' AND case_subtype IN (
      'renter_cancellation', 'owner_cancellation', 'mutual_cancellation',
      'handover_no_show', 'return_no_show',
      'short_notice_acceptance_or_grace_period'
    )) OR
    (case_type = 'money_case' AND case_subtype IN (
      'payment_failed_or_requires_action', 'duplicate_or_unrecognized_charge',
      'refund_request_or_review', 'refund_processing_or_failure',
      'payout_eligibility_or_hold', 'payout_processing_or_failure',
      'chargeback_or_payment_dispute', 'invoice_amount_or_fee'
    )) OR
    (case_type = 'trust_safety' AND case_subtype IN (
      'threat_or_violence', 'harassment_or_stalking',
      'suspected_fraud_or_impersonation', 'account_takeover',
      'dangerous_item_or_injury', 'self_harm_or_harm_threat',
      'repeated_abuse_or_evasion', 'immediate_physical_danger'
    )) OR
    (case_type = 'moderation_content' AND case_subtype IN (
      'illegal_content_notice', 'prohibited_or_restricted_listing',
      'misleading_listing', 'image_or_text_violation',
      'listing_visibility_or_removal', 'account_or_service_restriction',
      'appeal_against_platform_action'
    )) OR
    (case_type = 'privacy_security' AND case_subtype IN (
      'access_or_copy_request', 'correction_or_deletion_request',
      'objection_or_restriction_request', 'unauthorized_data_exposure',
      'suspected_personal_data_breach', 'wrong_recipient_or_wrong_account',
      'identity_verification_for_rights_request'
    )) OR
    (case_type = 'legal_authority' AND case_subtype IN (
      'law_enforcement_or_court_request',
      'regulator_or_data_protection_authority', 'formal_legal_notice',
      'consumer_dispute_information', 'policy_or_legal_ambiguity',
      'media_or_public_statement'
    )) OR
    (case_type = 'listing_quality' AND case_subtype IN (
      'missing_required_information', 'unclear_condition_or_accessories',
      'photo_quality', 'category_or_pricing_clarification',
      'marketplace_improvement_guidance'
    ))
  ),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received', 'acknowledged', 'waiting_for_user', 'waiting_for_other_party',
    'under_review', 'escalated', 'decision_pending_approval', 'decided',
    'implementation_pending', 'resolved', 'closed', 'reopened'
  )),
  priority TEXT NOT NULL CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  source_channel TEXT NOT NULL CHECK (source_channel IN (
    'app', 'web', 'email', 'phone', 'internal', 'api'
  )),
  operating_mode TEXT NOT NULL CHECK (operating_mode IN ('simulation', 'internal_testing')),
  locale TEXT NOT NULL DEFAULT 'de-DE' CHECK (locale = 'de-DE'),
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reporter_role TEXT NOT NULL CHECK (reporter_role IN ('user', 'support', 'admin', 'system')),
  affected_user_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT,
  linked_listing_id TEXT REFERENCES listings(id) ON DELETE RESTRICT,
  linked_payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
  linked_refund_id UUID REFERENCES refunds(id) ON DELETE RESTRICT,
  linked_payout_id UUID REFERENCES payouts(id) ON DELETE RESTRICT,
  current_owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  current_owner_role TEXT NOT NULL CHECK (current_owner_role IN (
    'triage_owner', 'general_support_owner', 'booking_operations_owner',
    'finance_owner', 'trust_safety_owner', 'moderation_owner', 'privacy_owner',
    'legal_authority_owner', 'founder_approval'
  )),
  escalation_target_role TEXT CHECK (escalation_target_role IS NULL OR escalation_target_role IN (
    'triage_owner', 'general_support_owner', 'booking_operations_owner',
    'finance_owner', 'trust_safety_owner', 'moderation_owner', 'privacy_owner',
    'legal_authority_owner', 'founder_approval'
  )),
  approval_level TEXT NOT NULL CHECK (approval_level IN (
    'green_automatic', 'yellow_human_review', 'red_explicit_decision'
  )),
  waiting_on TEXT NOT NULL CHECK (waiting_on IN (
    'none', 'reporter', 'other_party', 'support_owner', 'finance_owner',
    'trust_safety_owner', 'privacy_owner', 'legal_authority_owner',
    'external_processor'
  )),
  waiting_reason TEXT,
  next_action TEXT CHECK (next_action IS NULL OR char_length(next_action) BETWEEN 3 AND 2000),
  response_due_at TIMESTAMPTZ,
  evidence_due_at TIMESTAMPTZ,
  next_update_at TIMESTAMPTZ,
  user_facing_summary TEXT NOT NULL CHECK (char_length(user_facing_summary) BETWEEN 3 AND 2000),
  internal_summary TEXT CHECK (internal_summary IS NULL OR char_length(internal_summary) <= 8000),
  safety_flag BOOLEAN NOT NULL DEFAULT false,
  privacy_flag BOOLEAN NOT NULL DEFAULT false,
  dsa_flag BOOLEAN NOT NULL DEFAULT false,
  authority_flag BOOLEAN NOT NULL DEFAULT false,
  money_flag BOOLEAN NOT NULL DEFAULT false,
  account_takeover_flag BOOLEAN NOT NULL DEFAULT false,
  policy_snapshot_id UUID REFERENCES support_policy_snapshots(id) ON DELETE RESTRICT,
  decision_id UUID,
  implementation_pending_action TEXT,
  resolution_reference TEXT,
  appeal_available BOOLEAN NOT NULL DEFAULT false,
  appeal_deadline TIMESTAMPTZ,
  appeal_id UUID,
  closure_reason TEXT CHECK (closure_reason IS NULL OR closure_reason IN (
    'resolved_action_completed', 'information_provided', 'user_withdrew',
    'duplicate_merged', 'no_response_after_clear_deadline', 'outside_scope_with_route'
  )),
  reopen_reason TEXT,
  idempotency_key TEXT NOT NULL,
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  UNIQUE (reporter_user_id, idempotency_key),
  CHECK (next_update_at IS NULL OR next_update_at > created_at),
  CHECK (
    status IN ('resolved', 'closed')
    OR (next_action IS NOT NULL AND next_update_at IS NOT NULL)
  ),
  CHECK (
    status NOT IN ('resolved', 'closed')
    OR (next_action IS NULL AND next_update_at IS NULL AND waiting_on = 'none')
  ),
  CHECK (
    status NOT IN ('waiting_for_user', 'waiting_for_other_party')
    OR (waiting_reason IS NOT NULL AND char_length(waiting_reason) BETWEEN 3 AND 2000)
  ),
  CHECK (status <> 'escalated' OR escalation_target_role IS NOT NULL),
  CHECK (status <> 'decision_pending_approval' OR approval_level <> 'green_automatic'),
  CHECK (status <> 'decided' OR decision_id IS NOT NULL),
  CHECK (
    status <> 'implementation_pending'
    OR (implementation_pending_action IS NOT NULL
      AND char_length(implementation_pending_action) BETWEEN 3 AND 2000)
  ),
  CHECK (
    status NOT IN ('resolved', 'closed')
    OR (resolution_reference IS NOT NULL
      AND char_length(resolution_reference) BETWEEN 3 AND 2000)
  ),
  CHECK (status <> 'closed' OR (closure_reason IS NOT NULL AND closed_at IS NOT NULL)),
  CHECK (status <> 'reopened' OR (reopen_reason IS NOT NULL AND char_length(reopen_reason) >= 3)),
  CHECK ((appeal_available AND appeal_deadline IS NOT NULL) OR (NOT appeal_available))
);

CREATE INDEX support_cases_reporter_updated_idx
  ON support_cases(reporter_user_id, updated_at DESC, id DESC);
CREATE INDEX support_cases_owner_queue_idx
  ON support_cases(current_owner_role, priority, next_update_at, id)
  WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX support_cases_overdue_idx
  ON support_cases(next_update_at, priority, id)
  WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX support_cases_booking_idx
  ON support_cases(linked_booking_id, updated_at DESC, id)
  WHERE linked_booking_id IS NOT NULL;
CREATE INDEX support_cases_flags_idx
  ON support_cases(priority, safety_flag, privacy_flag, authority_flag, updated_at DESC);

CREATE TABLE support_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  decision_code TEXT NOT NULL CHECK (
    char_length(decision_code) BETWEEN 3 AND 120
    AND decision_code ~ '^[a-z0-9_.:-]+$'
  ),
  decision_scope TEXT NOT NULL CHECK (char_length(decision_scope) BETWEEN 3 AND 2000),
  confirmed_facts_considered JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(confirmed_facts_considered) = 'array'),
  material_uncertainties JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(material_uncertainties) = 'array'),
  policy_snapshot_id UUID NOT NULL REFERENCES support_policy_snapshots(id) ON DELETE RESTRICT,
  rule_reference TEXT NOT NULL CHECK (char_length(rule_reference) BETWEEN 3 AND 500),
  measure_type TEXT,
  amount_minor BIGINT CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  duration TEXT,
  affected_entity_ids TEXT[] NOT NULL DEFAULT '{}',
  unaffected_areas JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(unaffected_areas) = 'array'),
  implementation_plan TEXT NOT NULL CHECK (char_length(implementation_plan) BETWEEN 3 AND 8000),
  automation_used BOOLEAN NOT NULL DEFAULT false,
  recommendation_id TEXT,
  decided_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_facing_reason TEXT NOT NULL CHECK (char_length(user_facing_reason) BETWEEN 3 AND 8000),
  internal_reason TEXT NOT NULL CHECK (char_length(internal_reason) BETWEEN 3 AND 8000),
  redress_route TEXT NOT NULL CHECK (char_length(redress_route) BETWEEN 3 AND 2000),
  implementation_status TEXT NOT NULL CHECK (implementation_status IN (
    'not_started', 'pending', 'succeeded', 'failed', 'reversed'
  )),
  idempotency_key TEXT NOT NULL UNIQUE,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  implemented_at TIMESTAMPTZ,
  communicated_at TIMESTAMPTZ,
  CHECK ((amount_minor IS NULL AND currency IS NULL) OR (amount_minor IS NOT NULL AND currency IS NOT NULL))
);

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_decision_fk
  FOREIGN KEY (decision_id) REFERENCES support_decisions(id) ON DELETE RESTRICT;

CREATE TABLE support_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (
    char_length(event_type) BETWEEN 3 AND 120
    AND event_type ~ '^[a-z0-9_.:-]+$'
  ),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'support', 'admin', 'system', 'service')),
  actor_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN (
    'received', 'acknowledged', 'waiting_for_user', 'waiting_for_other_party',
    'under_review', 'escalated', 'decision_pending_approval', 'decided',
    'implementation_pending', 'resolved', 'closed', 'reopened'
  )),
  to_status TEXT CHECK (to_status IS NULL OR to_status IN (
    'received', 'acknowledged', 'waiting_for_user', 'waiting_for_other_party',
    'under_review', 'escalated', 'decision_pending_approval', 'decided',
    'implementation_pending', 'resolved', 'closed', 'reopened'
  )),
  transition_reason TEXT,
  entity_type TEXT,
  entity_id TEXT,
  correlation_id TEXT,
  structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(structured_payload) = 'object'),
  automation_used BOOLEAN NOT NULL DEFAULT false,
  model_version TEXT,
  template_version TEXT,
  approval_id TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('internal', 'user_visible', 'restricted', 'legal_hold')),
  idempotency_key TEXT NOT NULL,
  source_system TEXT NOT NULL CHECK (char_length(source_system) BETWEEN 2 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, idempotency_key)
);

CREATE INDEX support_case_events_case_created_idx
  ON support_case_events(case_id, created_at, id);

CREATE TABLE support_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  evidence_class TEXT NOT NULL CHECK (evidence_class IN (
    'confirmed_system_fact', 'mutually_confirmed_fact', 'party_a_statement',
    'party_b_statement', 'uploaded_evidence', 'third_party_information',
    'contradiction', 'unverifiable_information', 'internal_inference',
    'final_platform_decision'
  )),
  submitter_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  file_reference TEXT,
  immutable_source_reference TEXT,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 3 AND 2000),
  purpose TEXT NOT NULL CHECK (char_length(purpose) BETWEEN 3 AND 1000),
  claimed_event_time TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT,
  linked_listing_id TEXT REFERENCES listings(id) ON DELETE RESTRICT,
  integrity_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(integrity_metadata) = 'object'),
  redacted_version_id UUID REFERENCES support_evidence(id) ON DELETE RESTRICT,
  third_party_data_flag BOOLEAN NOT NULL DEFAULT false,
  access_level TEXT NOT NULL CHECK (access_level IN ('user_visible', 'internal', 'restricted', 'legal_hold')),
  retention_category TEXT NOT NULL CHECK (char_length(retention_category) BETWEEN 3 AND 80),
  legal_hold_flag BOOLEAN NOT NULL DEFAULT false,
  reviewed_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  review_result TEXT,
  limitations TEXT,
  CHECK (file_reference IS NOT NULL OR immutable_source_reference IS NOT NULL)
);

CREATE INDEX support_evidence_case_received_idx
  ON support_evidence(case_id, received_at, id);

CREATE TABLE support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'support', 'system', 'assistant')),
  sender_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message_type TEXT NOT NULL CHECK (char_length(message_type) BETWEEN 3 AND 100),
  template_id TEXT,
  template_version TEXT,
  locale TEXT NOT NULL DEFAULT 'de-DE' CHECK (locale = 'de-DE'),
  rendered_content TEXT NOT NULL CHECK (char_length(rendered_content) BETWEEN 1 AND 8000),
  structured_variables JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(structured_variables) = 'object'),
  approval_level TEXT NOT NULL CHECK (approval_level IN (
    'green_automatic', 'yellow_human_review', 'red_explicit_decision'
  )),
  approved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  send_status TEXT NOT NULL DEFAULT 'draft' CHECK (send_status IN (
    'draft', 'pending_approval', 'approved', 'queued', 'sent', 'failed', 'suppressed'
  )),
  sent_at TIMESTAMPTZ,
  delivery_status TEXT,
  notification_ids TEXT[] NOT NULL DEFAULT '{}',
  ai_disclosure_included BOOLEAN NOT NULL DEFAULT false,
  human_handoff_available BOOLEAN NOT NULL DEFAULT true,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    approval_level = 'green_automatic'
    OR send_status IN ('draft', 'pending_approval')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE INDEX support_messages_case_created_idx
  ON support_messages(case_id, created_at, id);

CREATE TABLE support_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_decision_id UUID NOT NULL REFERENCES support_decisions(id) ON DELETE RESTRICT,
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  grounds TEXT NOT NULL CHECK (char_length(grounds) BETWEEN 3 AND 8000),
  new_evidence_ids UUID[] NOT NULL DEFAULT '{}',
  submitted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewer_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  independence_flag BOOLEAN,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'under_review', 'upheld', 'modified', 'reversed', 'closed'
  )),
  outcome TEXT,
  outcome_reason TEXT,
  implementation_changes JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(implementation_changes) = 'array'),
  communicated_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE
);

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_appeal_fk
  FOREIGN KEY (appeal_id) REFERENCES support_appeals(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION sit_reject_support_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'support audit records are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER support_policy_snapshots_append_only
BEFORE UPDATE OR DELETE ON support_policy_snapshots
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_audit_mutation();

CREATE TRIGGER support_case_events_append_only
BEFORE UPDATE OR DELETE ON support_case_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_audit_mutation();

CREATE OR REPLACE FUNCTION sit_validate_support_case_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'support_case_lock_version_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'received' AND NEW.status = 'acknowledged') OR
    (OLD.status = 'acknowledged' AND NEW.status IN ('waiting_for_user', 'waiting_for_other_party', 'under_review')) OR
    (OLD.status IN ('waiting_for_user', 'waiting_for_other_party') AND NEW.status = 'under_review') OR
    (OLD.status = 'under_review' AND NEW.status IN ('escalated', 'decision_pending_approval')) OR
    (OLD.status = 'escalated' AND NEW.status IN ('under_review', 'decision_pending_approval')) OR
    (OLD.status = 'decision_pending_approval' AND NEW.status IN ('decided', 'under_review')) OR
    (OLD.status = 'decided' AND NEW.status IN ('implementation_pending', 'resolved')) OR
    (OLD.status = 'implementation_pending' AND NEW.status IN ('resolved', 'under_review')) OR
    (OLD.status = 'resolved' AND NEW.status = 'closed') OR
    (OLD.status = 'closed' AND NEW.status = 'reopened') OR
    (OLD.status = 'reopened' AND NEW.status IN ('waiting_for_user', 'waiting_for_other_party', 'under_review'))
  ) THEN
    RAISE EXCEPTION 'support_case_transition_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'support_case_updated_at_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_cases_update_guard
BEFORE UPDATE ON support_cases
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_case_update();
