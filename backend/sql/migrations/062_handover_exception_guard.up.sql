-- S4L / SUP-052 through SUP-054: server-owned handover exception intake.
-- A report creates a neutral P1 review case only. It cannot complete a
-- handover, change a booking, decide money, determine guilt, or apply an
-- account/listing measure.

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
      'suspected_fraud_or_impersonation', 'offplatform_deposit_request',
      'account_takeover', 'dangerous_item_or_injury',
      'self_harm_or_harm_threat', 'repeated_abuse_or_evasion',
      'immediate_physical_danger'
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

CREATE UNIQUE INDEX audit_log_handover_exception_request_idx
  ON audit_log(actor_id, request_id, action)
  WHERE action = 'booking.handover_exception_reported';

CREATE FUNCTION sit_validate_handover_exception_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_booking bookings%ROWTYPE;
  target_request rental_requests%ROWTYPE;
  target_case support_cases%ROWTYPE;
  expected_case_type TEXT;
  expected_case_subtype TEXT;
  expected_owner_role TEXT;
  expected_safety BOOLEAN;
  appointment_at TIMESTAMPTZ;
  requested_by TEXT;
  confirmed_by TEXT;
  contact_attempt_count INTEGER;
BEGIN
  IF NEW.action <> 'booking.handover_exception_reported' THEN
    RETURN NEW;
  END IF;

  IF NEW.resource_type <> 'booking'
     OR NEW.actor_id IS NULL
     OR NEW.actor_role <> 'user'
     OR NEW.request_id IS NULL
     OR NEW.request_id !~ '^booking[.]handover_exception:[A-Za-z0-9_.:-]{8,160}$'
     OR jsonb_typeof(NEW.metadata) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.metadata)) <> 19
     OR NOT NEW.metadata ?& ARRAY[
       'version', 'kind', 'supportCaseId', 'supportCaseType',
       'supportCaseSubtype', 'priority', 'workflowStatus',
       'counterpartyConfirmedAppointment', 'contactAttemptCount',
       'safeAbortGuidanceAcknowledged', 'doNotPayGuidanceAcknowledged',
       'trustSafetyReviewRequired', 'handoverCompletionChanged',
       'bookingStatusChanged', 'moneyOutcomeDecided', 'guiltDetermined',
       'accountMeasureTaken', 'listingMeasureTaken', 'requestFingerprint'
     ]
     OR NEW.metadata ->> 'version' <> 'v52_handover_exception_v1'
     OR NEW.metadata ->> 'kind' NOT IN (
       'item_mismatch', 'offplatform_deposit_request', 'party_no_show'
     )
     OR NEW.metadata ->> 'priority' <> 'p1'
     OR NEW.metadata ->> 'contactAttemptCount' !~ '^[0-9]+$'
     OR NEW.metadata -> 'handoverCompletionChanged' <> 'false'::jsonb
     OR NEW.metadata -> 'bookingStatusChanged' <> 'false'::jsonb
     OR NEW.metadata -> 'moneyOutcomeDecided' <> 'false'::jsonb
     OR NEW.metadata -> 'guiltDetermined' <> 'false'::jsonb
     OR NEW.metadata -> 'accountMeasureTaken' <> 'false'::jsonb
     OR NEW.metadata -> 'listingMeasureTaken' <> 'false'::jsonb
     OR NEW.metadata ->> 'requestFingerprint' !~ '^[0-9a-f]{64}$'
     OR NEW.metadata ?| ARRAY[
       'details', 'summary', 'messageBody', 'address', 'exactAddress',
       'ownerId', 'renterId', 'otherPartyId', 'paymentId', 'refundId'
     ]
  THEN
    RAISE EXCEPTION 'handover exception audit must remain exact, minimized, and non-decisional'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO target_booking FROM bookings WHERE id = NEW.resource_id;
  SELECT * INTO target_request FROM rental_requests WHERE id = NEW.resource_id;
  SELECT * INTO target_case
    FROM support_cases
   WHERE id::text = NEW.metadata ->> 'supportCaseId';
  IF target_booking.id IS NULL
     OR target_request.id IS NULL
     OR target_case.id IS NULL
     OR NEW.actor_id NOT IN (target_booking.owner_id, target_booking.renter_id)
     OR target_booking.workflow_version <> 1
     OR target_booking.workflow_status NOT IN ('accepted', 'confirmed')
     OR NEW.metadata ->> 'workflowStatus' <> target_booking.workflow_status
     OR target_case.reporter_user_id <> NEW.actor_id
     OR target_case.linked_booking_id <> target_booking.id
     OR target_case.linked_listing_id <> target_booking.listing_id
     OR target_case.priority <> 'p1'
     OR target_case.severity <> 'high'
     OR target_case.approval_level <> 'yellow_human_review'
     OR target_case.money_flag
     OR target_case.account_takeover_flag
  THEN
    RAISE EXCEPTION 'handover exception audit requires its current participant booking and neutral P1 case'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.metadata ->> 'kind' = 'item_mismatch' THEN
    expected_case_type := 'active_handover';
    expected_case_subtype := 'item_not_as_listed';
    expected_owner_role := 'booking_operations_owner';
    expected_safety := false;
    IF NEW.metadata -> 'safeAbortGuidanceAcknowledged' <> 'true'::jsonb
       OR NEW.metadata -> 'doNotPayGuidanceAcknowledged' <> 'false'::jsonb
       OR NEW.metadata -> 'trustSafetyReviewRequired' <> 'false'::jsonb
       OR NEW.metadata -> 'counterpartyConfirmedAppointment' <> 'false'::jsonb
       OR (NEW.metadata ->> 'contactAttemptCount')::integer <> 0
    THEN
      RAISE EXCEPTION 'item mismatch requires safe-abort guidance only'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.metadata ->> 'kind' = 'offplatform_deposit_request' THEN
    expected_case_type := 'trust_safety';
    expected_case_subtype := 'offplatform_deposit_request';
    expected_owner_role := 'trust_safety_owner';
    expected_safety := true;
    IF NEW.metadata -> 'safeAbortGuidanceAcknowledged' <> 'false'::jsonb
       OR NEW.metadata -> 'doNotPayGuidanceAcknowledged' <> 'true'::jsonb
       OR NEW.metadata -> 'trustSafetyReviewRequired' <> 'true'::jsonb
       OR NEW.metadata -> 'counterpartyConfirmedAppointment' <> 'false'::jsonb
       OR (NEW.metadata ->> 'contactAttemptCount')::integer <> 0
    THEN
      RAISE EXCEPTION 'deposit request requires do-not-pay guidance and Trust review only'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    expected_case_type := 'cancellation_no_show';
    expected_case_subtype := 'handover_no_show';
    expected_owner_role := 'booking_operations_owner';
    expected_safety := false;
    contact_attempt_count := (NEW.metadata ->> 'contactAttemptCount')::integer;
    appointment_at := sit_try_timestamptz(target_request.payload ->> 'handoverTimeIso');
    requested_by := target_request.payload ->> 'handoverTimeRequestedByUserId';
    confirmed_by := target_request.payload ->> 'handoverTimeConfirmedByUserId';
    IF NEW.metadata -> 'safeAbortGuidanceAcknowledged' <> 'false'::jsonb
       OR NEW.metadata -> 'doNotPayGuidanceAcknowledged' <> 'false'::jsonb
       OR NEW.metadata -> 'trustSafetyReviewRequired' <> 'false'::jsonb
       OR NEW.metadata -> 'counterpartyConfirmedAppointment' <> 'true'::jsonb
       OR contact_attempt_count < 1
       OR target_request.payload -> 'handoverTimeConfirmed' <> 'true'::jsonb
       OR sit_try_timestamptz(target_request.payload ->> 'handoverTimeConfirmedAt') IS NULL
       OR appointment_at IS NULL
       OR requested_by NOT IN (target_booking.owner_id, target_booking.renter_id)
       OR confirmed_by NOT IN (target_booking.owner_id, target_booking.renter_id)
       OR requested_by = confirmed_by
       OR (appointment_at AT TIME ZONE target_booking.rental_timezone)::date
          <> target_booking.rental_start_date
       OR appointment_at > NEW.created_at
       OR contact_attempt_count <> (
         SELECT count(*)::integer
           FROM messages AS message
           JOIN message_threads AS thread ON thread.id = message.thread_id
          WHERE COALESCE(thread.booking_id, thread.request_id) = target_booking.id
            AND message.sender_type = 'user'
            AND message.sender_id = NEW.actor_id
            AND message.created_at >= appointment_at
            AND message.created_at <= NEW.created_at
       )
    THEN
      RAISE EXCEPTION 'no-show requires reached counterparty-confirmed appointment and server-visible contact attempt'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.metadata ->> 'supportCaseType' <> expected_case_type
     OR NEW.metadata ->> 'supportCaseSubtype' <> expected_case_subtype
     OR target_case.case_type <> expected_case_type
     OR target_case.case_subtype <> expected_case_subtype
     OR target_case.current_owner_role <> expected_owner_role
     OR target_case.safety_flag <> expected_safety
  THEN
    RAISE EXCEPTION 'handover exception case route must be server-owned'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_handover_exception_guard
BEFORE INSERT ON audit_log
FOR EACH ROW EXECUTE FUNCTION sit_validate_handover_exception_audit();
