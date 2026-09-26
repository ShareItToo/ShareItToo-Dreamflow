DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM booking_commands WHERE command_type = 'booking.review') THEN
    RAISE EXCEPTION 'booking_review_commands_exist';
  END IF;
END;
$$;

ALTER TABLE booking_commands
  DROP CONSTRAINT IF EXISTS booking_commands_command_type_check;

ALTER TABLE booking_commands
  ADD CONSTRAINT booking_commands_command_type_check CHECK (command_type IN (
    'booking.create',
    'booking.amend',
    'booking.transition'
  ));
