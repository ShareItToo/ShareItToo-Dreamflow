-- G3B rollback is intentionally fail-closed once any group evidence exists.
-- Before public activation this removes only the additive G3B foundation.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM booking_group_positions)
    OR EXISTS (SELECT 1 FROM booking_groups)
  THEN
    RAISE EXCEPTION 'G3B rollback blocked: booking group data exists';
  END IF;
END;
$$;

DROP TRIGGER booking_group_positions_context_guard
ON booking_group_positions;

DROP FUNCTION sit_validate_booking_group_position();

DROP TABLE booking_group_positions;
DROP TABLE booking_groups;
