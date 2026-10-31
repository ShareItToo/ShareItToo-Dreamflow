-- S4K / SUP-046 through SUP-048: the exact listing address can leave the
-- server only for a booking participant after a counterparty-confirmed
-- appointment enters its six-hour window and while no safety hold is active.

CREATE UNIQUE INDEX audit_log_booking_address_request_idx
  ON audit_log(actor_id, request_id, action)
  WHERE action IN (
    'booking.exact_address_revealed',
    'booking.exact_address_access_hidden',
    'booking.exact_address_access_denied'
  );

CREATE OR REPLACE FUNCTION sit_validate_booking_address_access_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_booking bookings%ROWTYPE;
  target_request rental_requests%ROWTYPE;
  appointment_at TIMESTAMPTZ;
  expected_date DATE;
  requested_by TEXT;
  confirmed_by TEXT;
BEGIN
  IF NEW.action NOT IN (
    'booking.exact_address_revealed',
    'booking.exact_address_access_hidden',
    'booking.exact_address_access_denied'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.resource_type <> 'booking'
     OR NEW.actor_id IS NULL
     OR NEW.request_id IS NULL
     OR NEW.actor_role <> 'user'
     OR jsonb_typeof(NEW.metadata) <> 'object'
     OR NEW.metadata ->> 'version' <> 'v52_booking_address_reveal_v1'
     OR NEW.metadata ->> 'segment' NOT IN ('pickup', 'return')
     OR NEW.metadata ?| ARRAY[
       'address', 'exactAddress', 'locationText', 'latitude', 'longitude',
       'ownerId', 'renterId'
     ]
  THEN
    RAISE EXCEPTION 'booking address access audit must remain minimized'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO target_booking FROM bookings WHERE id = NEW.resource_id;

  IF NEW.action = 'booking.exact_address_access_denied' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(NEW.metadata)) <> 5
       OR NOT NEW.metadata ?& ARRAY[
         'version', 'segment', 'result', 'reason', 'exactAddressReturned'
       ]
       OR NEW.metadata ->> 'result' <> 'denied'
       OR NEW.metadata ->> 'reason' <> 'not_found_or_not_participant'
       OR NEW.metadata -> 'exactAddressReturned' <> 'false'::jsonb
       OR (
         target_booking.id IS NOT NULL
         AND NEW.actor_id IN (target_booking.owner_id, target_booking.renter_id)
       )
    THEN
      RAISE EXCEPTION 'booking address denied audit must be truthful'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF target_booking.id IS NULL
     OR NEW.actor_id NOT IN (target_booking.owner_id, target_booking.renter_id)
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.metadata)) <> 9
     OR NOT NEW.metadata ?& ARRAY[
       'version', 'segment', 'result', 'reason', 'workflowStatus',
       'appointmentAt', 'revealFromAt', 'safetyHold', 'exactAddressReturned'
     ]
     OR NEW.metadata ->> 'workflowStatus' <> target_booking.workflow_status
  THEN
    RAISE EXCEPTION 'booking address participant audit must match booking truth'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.action = 'booking.exact_address_access_hidden' THEN
    IF NEW.metadata ->> 'result' <> 'hidden'
       OR NEW.metadata -> 'exactAddressReturned' <> 'false'::jsonb
       OR NEW.metadata ->> 'reason' NOT IN (
         'booking_state_ineligible',
         'safety_review_required',
         'appointment_not_counterparty_confirmed',
         'reveal_window_not_open',
         'exact_address_unavailable'
       )
    THEN
      RAISE EXCEPTION 'hidden booking address audit must remain non-disclosing'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO target_request FROM rental_requests WHERE id = target_booking.id;
  IF NEW.metadata ->> 'segment' = 'pickup' THEN
    appointment_at := sit_try_timestamptz(target_request.payload ->> 'handoverTimeIso');
    expected_date := target_booking.rental_start_date;
    requested_by := target_request.payload ->> 'handoverTimeRequestedByUserId';
    confirmed_by := target_request.payload ->> 'handoverTimeConfirmedByUserId';
    IF target_request.payload -> 'handoverTimeConfirmed' <> 'true'::jsonb
       OR sit_try_timestamptz(target_request.payload ->> 'handoverTimeConfirmedAt') IS NULL
    THEN
      RAISE EXCEPTION 'revealed booking address requires confirmed pickup'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    appointment_at := sit_try_timestamptz(target_request.payload ->> 'returnTimeIso');
    expected_date := target_booking.rental_end_date;
    requested_by := target_request.payload ->> 'returnTimeRequestedByUserId';
    confirmed_by := target_request.payload ->> 'returnTimeConfirmedByUserId';
    IF target_request.payload -> 'returnTimeConfirmed' <> 'true'::jsonb
       OR sit_try_timestamptz(target_request.payload ->> 'returnTimeConfirmedAt') IS NULL
    THEN
      RAISE EXCEPTION 'revealed booking address requires confirmed return'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.metadata ->> 'result' <> 'revealed'
     OR NEW.metadata ->> 'reason' <> 'counterparty_confirmed_window_open'
     OR NEW.metadata -> 'safetyHold' <> 'false'::jsonb
     OR NEW.metadata -> 'exactAddressReturned' <> 'true'::jsonb
     OR target_booking.workflow_version <> 1
     OR target_booking.workflow_status NOT IN (
       'accepted', 'payment_pending', 'confirmed', 'active',
       'withdrawalReturnRequired', 'returned'
     )
     OR appointment_at IS NULL
     OR requested_by NOT IN (target_booking.owner_id, target_booking.renter_id)
     OR confirmed_by NOT IN (target_booking.owner_id, target_booking.renter_id)
     OR requested_by = confirmed_by
     OR (appointment_at AT TIME ZONE target_booking.rental_timezone)::date <> expected_date
     OR NEW.created_at < appointment_at - INTERVAL '6 hours'
     OR NEW.metadata ->> 'appointmentAt' <> to_char(
       appointment_at AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
     )
     OR NEW.metadata ->> 'revealFromAt' <> to_char(
       (appointment_at - INTERVAL '6 hours') AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
     )
     OR NOT EXISTS (
       SELECT 1 FROM listings
        WHERE id = target_booking.listing_id
          AND NULLIF(btrim(location_text), '') IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM support_cases AS support_case
        WHERE support_case.status NOT IN ('resolved', 'closed')
          AND support_case.safety_flag
          AND (
            support_case.linked_booking_id = target_booking.id
            OR support_case.linked_listing_id = target_booking.listing_id
          )
     )
     OR EXISTS (
       SELECT 1 FROM user_suspensions AS suspension
        WHERE suspension.user_id IN (target_booking.owner_id, target_booking.renter_id)
          AND suspension.scope = 'account'
          AND suspension.lifted_at IS NULL
          AND suspension.starts_at <= NEW.created_at
          AND (suspension.ends_at IS NULL OR suspension.ends_at > NEW.created_at)
     )
  THEN
    RAISE EXCEPTION 'revealed booking address audit requires current reveal authority'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_booking_address_access_guard
BEFORE INSERT ON audit_log
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_address_access_audit();
