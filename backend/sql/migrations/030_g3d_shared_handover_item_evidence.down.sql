-- G3D rollback is fail-closed after any binding, shared appointment or command
-- evidence exists. Empty additive objects can be removed without touching V5.2.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM booking_group_appointments)
    OR EXISTS (SELECT 1 FROM booking_group_appointment_commands)
    OR EXISTS (SELECT 1 FROM booking_group_position_booking_bindings)
  THEN
    RAISE EXCEPTION 'G3D rollback blocked: booking group handover data exists';
  END IF;
END;
$$;

DROP TRIGGER booking_group_position_bindings_context_guard
  ON booking_group_position_booking_bindings;
DROP TRIGGER booking_group_appointments_context_guard ON booking_group_appointments;
DROP TRIGGER booking_group_appointments_set_guard ON booking_group_appointments;

DROP FUNCTION sit_validate_booking_group_position_binding();
DROP FUNCTION sit_validate_booking_group_appointment();
DROP FUNCTION sit_validate_booking_group_appointment_set();

DROP TABLE booking_group_appointments;
DROP TABLE booking_group_appointment_commands;
DROP TABLE booking_group_position_booking_bindings;
