import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';

const {
  deletePushDevicesForSession,
  enforceActiveSessionLimitBeforeIssue,
  revokeAllSessionsForCredentialChange,
  revokeSessionByRefreshToken,
} = await import('../src/auth_session_actions.js');

test('new login prunes only excess oldest sessions before issuing the bounded replacement', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (calls.length === 2) {
        return {
          rows: [
            { id: '11111111-1111-4111-8111-111111111111' },
            { id: '22222222-2222-4222-8222-222222222222' },
          ],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: calls.length - 2 };
    },
  };

  const result = await enforceActiveSessionLimitBeforeIssue(client, {
    userId: 'target-user',
    maximumActiveSessions: 100,
  });

  assert.deepEqual(result, {
    revokedSessionCount: 1,
    revokedRefreshTokenCount: 2,
    deletedPushDeviceCount: 3,
  });
  assert.equal(calls.length, 5);
  assert.match(calls[0].sql, /SELECT id FROM users WHERE id = \$1 FOR UPDATE/u);
  assert.match(calls[1].sql, /ORDER BY last_seen_at DESC, created_at DESC, id DESC/u);
  assert.match(calls[1].sql, /OFFSET \$2[\s\S]*FOR UPDATE/u);
  assert.deepEqual(calls[1].parameters, ['target-user', 99]);
  for (const call of calls.slice(2)) {
    assert.match(call.sql, /ANY\(\$1::uuid\[\]\)[\s\S]*user_id = \$2/u);
    assert.deepEqual(call.parameters, [[
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ], 'target-user']);
  }
  assert.match(calls[2].sql, /revoked_reason = COALESCE\(revoked_reason, 'session_limit'\)/u);
  assert.match(calls[3].sql, /revoked_reason = COALESCE\(revoked_reason, 'session_limit'\)/u);
  assert.match(calls[4].sql, /DELETE FROM push_devices/u);
});

test('session limit performs no revocation when existing sessions leave room for the new one', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return { rows: [], rowCount: 0 };
    },
  };
  const result = await enforceActiveSessionLimitBeforeIssue(client, {
    userId: 'target-user',
    maximumActiveSessions: 100,
  });
  assert.deepEqual(result, {
    revokedSessionCount: 0,
    revokedRefreshTokenCount: 0,
    deletedPushDeviceCount: 0,
  });
  assert.equal(calls.length, 2);
});

test('session limit rejects unbounded or unscoped cleanup', async () => {
  const client = { query: async () => assert.fail() };
  await assert.rejects(
    enforceActiveSessionLimitBeforeIssue(client, {
      userId: '',
      maximumActiveSessions: 100,
    }),
    /invalid_active_session_limit_scope/u,
  );
  await assert.rejects(
    enforceActiveSessionLimitBeforeIssue(client, {
      userId: 'target-user',
      maximumActiveSessions: 1001,
    }),
    /invalid_active_session_limit_scope/u,
  );
});

test('logout revokes the session and removes its push devices', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (calls.length === 1) return { rows: [{ session_id: 'session-1' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };

  const revoked = await revokeSessionByRefreshToken(client, 'refresh-token');

  assert.equal(revoked, true);
  assert.equal(calls.length, 4);
  assert.match(calls[0].sql, /SELECT session_id FROM refresh_tokens/);
  assert.match(calls[1].sql, /UPDATE auth_sessions/);
  assert.match(calls[2].sql, /UPDATE refresh_tokens/);
  assert.match(calls[3].sql, /DELETE FROM push_devices[\s\S]*session_id = \$1/);
  assert.deepEqual(calls.slice(1).map((call) => call.parameters), [
    ['session-1'],
    ['session-1'],
    ['session-1', null],
  ]);
});

test('current-session cleanup is user-bound and idempotent', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return { rows: [], rowCount: 0 };
    },
  };

  const deleted = await deletePushDevicesForSession(client, {
    sessionId: 'session-1',
    userId: '11111111-1111-1111-1111-111111111111',
  });

  assert.equal(deleted, 0);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /session_id = \$1/);
  assert.match(calls[0].sql, /\$2::text IS NULL/);
  assert.match(calls[0].sql, /user_id = \$2::text/);
  assert.doesNotMatch(calls[0].sql, /user_id = \$2::uuid/);
  assert.match(calls[0].sql, /RETURNING id/);
  assert.deepEqual(calls[0].parameters, [
    'session-1',
    '11111111-1111-1111-1111-111111111111',
  ]);
});

test('unknown refresh tokens stay enumeration-safe and do not delete devices', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return { rows: [], rowCount: 0 };
    },
  };

  const revoked = await revokeSessionByRefreshToken(client, 'unknown-refresh-token');

  assert.equal(revoked, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FOR UPDATE/);
});

test('credential recovery revokes only the target account and removes its push devices', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return { rows: [], rowCount: calls.length };
    },
  };

  const result = await revokeAllSessionsForCredentialChange(client, {
    userId: 'target-user',
    reason: 'password_reset',
  });

  assert.deepEqual(result, {
    userId: 'target-user',
    reason: 'password_reset',
    revokedSessionCount: 1,
    revokedRefreshTokenCount: 2,
    deletedPushDeviceCount: 3,
  });
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /UPDATE auth_sessions[\s\S]*WHERE user_id = \$1 AND revoked_at IS NULL/u);
  assert.match(calls[1].sql, /UPDATE refresh_tokens[\s\S]*WHERE user_id = \$1 AND revoked_at IS NULL/u);
  assert.match(calls[2].sql, /DELETE FROM push_devices[\s\S]*WHERE user_id = \$1/u);
  assert.deepEqual(calls.map((call) => call.parameters), [
    ['target-user', 'password_reset'],
    ['target-user', 'password_reset'],
    ['target-user'],
  ]);
  assert.ok(calls.every((call) => !call.sql.includes('email')));
});

test('credential recovery rejects caller-selected revocation reasons', async () => {
  await assert.rejects(
    revokeAllSessionsForCredentialChange({ query: async () => assert.fail() }, {
      userId: 'target-user',
      reason: 'support_override',
    }),
    /invalid_account_credential_change_scope/u,
  );
});
