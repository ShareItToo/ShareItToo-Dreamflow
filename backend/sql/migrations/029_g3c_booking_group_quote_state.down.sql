-- G3C rollback is fail-closed after any group quote, decision or command
-- evidence exists. Before use it removes only additive G3C objects.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM booking_group_commands)
    OR EXISTS (SELECT 1 FROM booking_group_state_events)
    OR EXISTS (SELECT 1 FROM booking_group_quote_positions)
    OR EXISTS (SELECT 1 FROM booking_group_quotes)
  THEN
    RAISE EXCEPTION 'G3C rollback blocked: booking group quote or state data exists';
  END IF;
END;
$$;

DROP TRIGGER booking_group_quotes_context_guard ON booking_group_quotes;
DROP TRIGGER booking_group_quote_positions_context_guard
  ON booking_group_quote_positions;
DROP TRIGGER booking_group_quotes_balance_guard ON booking_group_quotes;
DROP TRIGGER booking_group_quote_positions_balance_guard
  ON booking_group_quote_positions;
DROP TRIGGER booking_group_state_events_context_guard ON booking_group_state_events;

DROP FUNCTION sit_validate_booking_group_quote();
DROP FUNCTION sit_validate_booking_group_quote_position();
DROP FUNCTION sit_validate_booking_group_quote_balance();
DROP FUNCTION sit_validate_booking_group_state_event();

DROP TABLE booking_group_commands;
DROP TABLE booking_group_state_events;
DROP TABLE booking_group_quote_positions;
DROP TABLE booking_group_quotes;
