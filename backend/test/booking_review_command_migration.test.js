import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('090 booking review rollback fails closed before changing the constraint', async () => {
  const sql = await readFile(
    new URL('../sql/migrations/090_booking_review_command_type.down.sql', import.meta.url),
    'utf8',
  );
  const guard = sql.indexOf("RAISE EXCEPTION 'booking_review_commands_exist'");
  const drop = sql.indexOf('DROP CONSTRAINT IF EXISTS booking_commands_command_type_check');
  assert.notEqual(guard, -1);
  assert.notEqual(drop, -1);
  assert.ok(guard < drop, 'rollback must check existing booking.review rows first');
  assert.match(sql, /FROM booking_commands WHERE command_type = 'booking\.review'/u);
});
