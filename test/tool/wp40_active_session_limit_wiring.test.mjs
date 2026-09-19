import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../backend/src/app.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../../backend/src/config.js', import.meta.url), 'utf8');
const service = readFileSync(
  new URL('../../lib/services/account_security_service.dart', import.meta.url),
  'utf8',
);

test('new password and social logins cannot outgrow the strict client session inventory', () => {
  const issueSession = app.match(
    /async function issueSession\([\s\S]*?\n\}\n\nasync function/u,
  )?.[0] ?? '';
  assert.match(issueSession, /if \(!sessionId\) \{[\s\S]*enforceActiveSessionLimitBeforeIssue/u);
  assert.match(issueSession, /maximumActiveSessions: config\.maximumActiveSessionsPerUser/u);
  assert.match(issueSession, /enforceActiveSessionLimitBeforeIssue[\s\S]*INSERT INTO auth_sessions/u);
  assert.match(config, /maximumActiveSessionsPerUser: 100/u);
  assert.match(service, /static const int _maxSessions = 100;/u);
});

test('refresh rotation reuses its existing session instead of consuming another slot', () => {
  assert.match(app, /issueSession\(client, row, \{[\s\S]*sessionId: row\.session_id/u);
});
