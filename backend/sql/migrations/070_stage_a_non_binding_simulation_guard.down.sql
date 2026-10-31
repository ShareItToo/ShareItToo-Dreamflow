DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bookings WHERE simulation_only IS TRUE
  ) THEN
    RAISE EXCEPTION
      'Stage A simulation rollback blocked: simulation bookings exist';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS financial_documents_reject_simulation_booking ON financial_documents;
DROP TRIGGER IF EXISTS v52_actual_loss_reject_simulation_booking ON v52_actual_loss_cases;
DROP TRIGGER IF EXISTS v51_cancellation_refund_reject_simulation_booking ON v51_cancellation_refund_obligations;
DROP TRIGGER IF EXISTS v51_refund_obligations_reject_simulation_booking ON v51_refund_obligations;
DROP TRIGGER IF EXISTS deposit_charges_reject_simulation_booking ON deposit_charges;
DROP TRIGGER IF EXISTS deposit_mandates_reject_simulation_booking ON deposit_mandates;
DROP TRIGGER IF EXISTS platform_contracts_reject_simulation_booking ON platform_contracts;
DROP TRIGGER IF EXISTS payment_commands_reject_simulation_booking ON payment_commands;
DROP TRIGGER IF EXISTS disputes_reject_simulation_booking ON disputes;
DROP TRIGGER IF EXISTS payouts_reject_simulation_booking ON payouts;
DROP TRIGGER IF EXISTS payments_reject_simulation_booking ON payments;

DROP FUNCTION IF EXISTS sit_reject_simulation_booking_side_effect();
DROP INDEX IF EXISTS bookings_simulation_participant_created_idx;
ALTER TABLE bookings DROP COLUMN IF EXISTS simulation_only;
