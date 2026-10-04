import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

const accountActions = read('backend/src/account_actions.js');
const authSessions = read('backend/src/auth_session_actions.js');
const supportCases = read('backend/src/support_case_workflow.js');
const app = read('backend/src/app.js');
const up = read('backend/sql/migrations/057_account_recovery_session_integrity.up.sql');
const down = read('backend/sql/migrations/057_account_recovery_session_integrity.down.sql');
const retention = read('backend/src/retention_inventory.js');

test('SUP-097 binds credential recovery to the target account and durable audit', () => {
  assert.match(authSessions, /revokeAllSessionsForCredentialChange/u);
  assert.match(authSessions, /WHERE user_id = \$1[\s\S]*RETURNING id/u);
  assert.match(authSessions, /DELETE FROM push_devices[\s\S]*WHERE user_id = \$1/u);
  assert.match(accountActions, /FROM users[\s\S]*FOR UPDATE/u);
  assert.match(accountActions, /case_subtype = 'account_takeover'/u);
  assert.match(supportCases, /SELECT id FROM users[\s\S]*FOR UPDATE/u);
  assert.match(app, /scope: 'target_account_only'/u);
  assert.match(app, /action: 'auth\.password_reset'/u);
  assert.match(app, /replacementSessionIssued: false/u);
  assert.match(supportCases, /compromisedEmailResetBlocked: true/u);
  assert.match(app, /auth\.password_reset_email_blocked_account_takeover/u);
});

test('SUP-098 keeps reset tokens hashed single-use expiring and immutable', () => {
  assert.match(accountActions, /hashActionToken\(token\)/u);
  assert.match(accountActions, /aat\.consumed_at IS NULL AND aat\.expires_at > now\(\)/u);
  assert.match(accountActions, /consumed_at IS NULL[\s\S]*RETURNING id/u);
  assert.match(up, /auth_action_tokens_one_live_user_kind_idx/u);
  assert.match(up, /expires_at <= created_at \+ interval '30 minutes'/u);
  assert.match(up, /auth_action_token_identity_immutable/u);
  assert.match(down, /Cannot roll back account recovery session integrity/u);
  assert.match(retention, /'auth_action_tokens'/u);
});
