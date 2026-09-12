import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

const domain = read('backend/src/support_account_recovery_domain.js');
const messageDomain = read('backend/src/support_message_domain.js');
const messageWorkflow = read('backend/src/support_message_workflow.js');
const app = read('backend/src/app.js');
const up = read('backend/sql/migrations/056_support_account_recovery_guard.up.sql');
const down = read('backend/sql/migrations/056_support_account_recovery_guard.down.sql');
const privacy = read('store/privacy-disclosures.json');
const retention = read('store/retention-deletion-readiness.json');

test('SUP-022 excludes the reported email channel and requires current alternate auth', () => {
  assert.match(domain, /E-Mail-Kanal allein wird nicht akzeptiert/u);
  assert.match(domain, /activeAuthenticatedSession !== true/u);
  assert.match(domain, /passwordReauthenticationAvailable !== true/u);
  assert.match(messageDomain, /support_account_recovery_workflow_required/u);
  assert.match(messageWorkflow, /accountRecoveryDraft/u);
  assert.match(messageWorkflow, /recipient_active_authenticated_session/u);
  assert.match(app, /account-recovery-guidance/u);
});

test('SUP-023 blocks credential requests and keeps T-035 reviewed non-live guidance only', () => {
  assert.match(messageDomain, /credentialSolicitationPatterns/u);
  assert.match(messageDomain, /support_message_credential_request_blocked/u);
  assert.match(domain, /password_or_pin_requested: false/u);
  assert.match(domain, /recovery_action_executed: false/u);
  assert.match(domain, /session_revocation_executed: false/u);
  assert.match(up, /compromised_channel_used/u);
  assert.match(up, /password_or_pin_requested/u);
  assert.match(up, /count\(\*\) FROM jsonb_object_keys\(NEW\.structured_variables\)\) <> 12/u);
  assert.match(up, /NEW\.rendered_content IS DISTINCT FROM expected_rendered_content/u);
  assert.match(up, /BEFORE UPDATE OF send_status ON support_messages/u);
  assert.match(down, /Cannot roll back account recovery guidance while retained message evidence exists/u);
  assert.match(privacy, /support_account_recovery_domain\.js/u);
  assert.match(privacy, /056_support_account_recovery_guard\.up\.sql/u);
  assert.match(retention, /056_support_account_recovery_guard\.down\.sql/u);
});
