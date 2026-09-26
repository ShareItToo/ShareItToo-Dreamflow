import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync('backend/src/config.js', 'utf8');
const notifications = readFileSync('backend/src/notifications.js', 'utf8');
const push = readFileSync('backend/src/push_sender.js', 'utf8');

test('external staging transports fail closed without explicit recipient allowlists', () => {
  for (const marker of [
    'SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS',
    'SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS',
    'SIT_STAGING_NOTIFICATION_ALLOWED_PUSH_TOKEN_HASHES',
    'required for external staging notifications',
    'required for staging SMTP',
    'required for staging FCM',
  ]) assert.match(config, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'u'), marker);
});

test('worker gates every external delivery and push filters to the approved token hashes', () => {
  assert.match(notifications, /externalRecipientAllowedForTest\(row, context\)/u);
  assert.match(notifications, /provider: 'staging_recipient_gate'/u);
  assert.match(push, /token_hash = ANY\(\$3::text\[\]\)/u);
  assert.match(push, /externalRecipientGate\.pushTokenHashes/u);
});
