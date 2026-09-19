ALTER TABLE booking_commands
  DROP CONSTRAINT IF EXISTS booking_commands_command_type_check;

ALTER TABLE booking_commands
  ADD CONSTRAINT booking_commands_command_type_check CHECK (command_type IN (
    'booking.create',
    'booking.amend',
    'booking.transition',
    'booking.review'
  ));
