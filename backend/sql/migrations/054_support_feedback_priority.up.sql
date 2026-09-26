-- S4D / SUP-030: explicitly non-urgent feedback is a P4 support intake.
-- This adds no public SLA, automatic escalation, external delivery or live
-- product action. Risk-bearing reports must use their dedicated support lane.

ALTER TABLE support_cases
  ADD COLUMN feedback_context JSONB;

ALTER TABLE support_cases
  DROP CONSTRAINT support_cases_check,
  ADD CONSTRAINT support_cases_check CHECK (
    (case_type = 'general_help' AND case_subtype IN (
      'login_or_registration', 'profile_or_verification', 'notification_or_push',
      'invoice_or_document', 'app_error_or_display', 'accessibility_or_usability',
      'general_how_to', 'feedback_or_improvement'
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
  );

ALTER TABLE support_cases
  DROP CONSTRAINT support_cases_priority_check,
  ADD CONSTRAINT support_cases_priority_check CHECK (
    priority IN ('p0', 'p1', 'p2', 'p3', 'p4')
  ),
  ADD CONSTRAINT support_cases_feedback_context_shape_check CHECK (
    feedback_context IS NULL OR (
      jsonb_typeof(feedback_context) = 'object'
      AND feedback_context ?& ARRAY[
        'version', 'feedbackKind', 'productArea', 'nonUrgentConfirmed'
      ]
      AND (
        feedback_context
          - 'version'
          - 'feedbackKind'
          - 'productArea'
          - 'nonUrgentConfirmed'
      ) = '{}'::jsonb
      AND feedback_context ->> 'version' = 'sit_support_feedback_context_v1'
      AND feedback_context ->> 'feedbackKind' IN (
        'improvement_suggestion', 'non_urgent_explanation', 'general_feedback'
      )
      AND feedback_context ->> 'productArea' IN (
        'app_experience', 'listing_and_catalog', 'booking_and_schedule',
        'handover_and_return', 'payments_and_documents',
        'messages_and_notifications', 'profile_and_account', 'accessibility',
        'other'
      )
      AND feedback_context -> 'nonUrgentConfirmed' = 'true'::jsonb
    )
  ),
  ADD CONSTRAINT support_cases_feedback_route_check CHECK (
    (
      case_type = 'general_help'
      AND case_subtype = 'feedback_or_improvement'
      AND feedback_context IS NOT NULL
      AND priority = 'p4'
      AND severity = 'low'
      AND current_owner_role = 'general_support_owner'
      AND approval_level = 'green_automatic'
      AND affected_user_ids = '{}'
      AND linked_booking_id IS NULL
      AND linked_listing_id IS NULL
      AND linked_payment_id IS NULL
      AND linked_refund_id IS NULL
      AND linked_payout_id IS NULL
      AND NOT safety_flag
      AND NOT privacy_flag
      AND NOT dsa_flag
      AND NOT authority_flag
      AND NOT article18_candidate_flag
      AND NOT money_flag
      AND NOT account_takeover_flag
    ) OR (
      NOT (
        case_type = 'general_help'
        AND case_subtype = 'feedback_or_improvement'
      )
      AND feedback_context IS NULL
      AND priority <> 'p4'
    )
  );

CREATE FUNCTION sit_validate_support_feedback_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.feedback_context IS DISTINCT FROM OLD.feedback_context
  THEN
    RAISE EXCEPTION 'support_feedback_context_immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_cases_feedback_context_guard
BEFORE UPDATE ON support_cases
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_feedback_context();
