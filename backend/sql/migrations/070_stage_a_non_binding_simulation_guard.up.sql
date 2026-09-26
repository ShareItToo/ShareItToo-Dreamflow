-- Stage-A requests exercise the real account, catalogue, request, acceptance,
-- messaging and notification paths without creating a contract, reservation,
-- payment, payout, refund or dispute. The database guard is deliberately
-- independent from application code so later regressions fail closed.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS simulation_only BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS bookings_simulation_participant_created_idx
  ON bookings(simulation_only, owner_id, renter_id, created_at DESC);

CREATE OR REPLACE FUNCTION sit_reject_simulation_booking_side_effect()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_booking_id TEXT;
  target_simulation_only BOOLEAN;
BEGIN
  target_booking_id := NEW.booking_id;
  IF target_booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT simulation_only
    INTO target_simulation_only
    FROM bookings
   WHERE id = target_booking_id;

  IF target_simulation_only IS TRUE THEN
    RAISE EXCEPTION 'stage_a_simulation_side_effect_forbidden'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_reject_simulation_booking ON payments;
CREATE TRIGGER payments_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON payments
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS payouts_reject_simulation_booking ON payouts;
CREATE TRIGGER payouts_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON payouts
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS disputes_reject_simulation_booking ON disputes;
CREATE TRIGGER disputes_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON disputes
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS payment_commands_reject_simulation_booking ON payment_commands;
CREATE TRIGGER payment_commands_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON payment_commands
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS platform_contracts_reject_simulation_booking ON platform_contracts;
CREATE TRIGGER platform_contracts_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON platform_contracts
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS deposit_mandates_reject_simulation_booking ON deposit_mandates;
CREATE TRIGGER deposit_mandates_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON deposit_mandates
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS deposit_charges_reject_simulation_booking ON deposit_charges;
CREATE TRIGGER deposit_charges_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON deposit_charges
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS v51_refund_obligations_reject_simulation_booking ON v51_refund_obligations;
CREATE TRIGGER v51_refund_obligations_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON v51_refund_obligations
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS v51_cancellation_refund_reject_simulation_booking ON v51_cancellation_refund_obligations;
CREATE TRIGGER v51_cancellation_refund_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON v51_cancellation_refund_obligations
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS v52_actual_loss_reject_simulation_booking ON v52_actual_loss_cases;
CREATE TRIGGER v52_actual_loss_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON v52_actual_loss_cases
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();

DROP TRIGGER IF EXISTS financial_documents_reject_simulation_booking ON financial_documents;
CREATE TRIGGER financial_documents_reject_simulation_booking
BEFORE INSERT OR UPDATE OF booking_id ON financial_documents
FOR EACH ROW EXECUTE FUNCTION sit_reject_simulation_booking_side_effect();
