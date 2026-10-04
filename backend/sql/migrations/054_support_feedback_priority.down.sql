-- Rollback is permitted only before a P4 feedback intake has been persisted.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM support_cases
     WHERE feedback_context IS NOT NULL
        OR case_subtype = 'feedback_or_improvement'
        OR priority = 'p4'
  ) THEN
    RAISE EXCEPTION 'Refusing to drop retained support feedback context';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_cases_feedback_context_guard ON support_cases;
DROP FUNCTION IF EXISTS sit_validate_support_feedback_context();

ALTER TABLE support_cases
  DROP CONSTRAINT support_cases_feedback_route_check,
  DROP CONSTRAINT support_cases_feedback_context_shape_check,
  DROP CONSTRAINT support_cases_priority_check,
  DROP CONSTRAINT support_cases_check,
  DROP COLUMN feedback_context;

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_priority_check CHECK (
    priority IN ('p0', 'p1', 'p2', 'p3')
  ),
  ADD CONSTRAINT support_cases_check CHECK (
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
  );
