import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

test('closed support account migration guards message creation and publication', async () => {
  const [up, down] = await Promise.all([
    readFile(path.resolve(
      currentDir,
      '../sql/migrations/041_support_closed_account_access_guard.up.sql',
    ), 'utf8'),
    readFile(path.resolve(
      currentDir,
      '../sql/migrations/041_support_closed_account_access_guard.down.sql',
    ), 'utf8'),
  ]);

  assert.match(up, /account_status <> 'active'/u);
  assert.match(up, /deactivated_at IS NOT NULL/u);
  assert.match(up, /FOR KEY SHARE/u);
  assert.match(up, /BEFORE INSERT ON support_messages/u);
  assert.match(up, /BEFORE UPDATE OF send_status ON support_messages/u);
  assert.match(up, /NEW\.send_status = 'sent'/u);
  assert.match(down, /DROP TRIGGER IF EXISTS support_message_active_recipient_publish_guard/u);
  assert.match(down, /DROP FUNCTION IF EXISTS sit_require_active_support_message_recipient/u);
});
