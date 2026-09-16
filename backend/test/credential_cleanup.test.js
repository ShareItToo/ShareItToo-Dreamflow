import assert from 'node:assert/strict';
import test from 'node:test';

import {
  credentialCleanupIntervalMs,
  purgeExpiredCredentials,
  startCredentialCleanupWorker,
} from '../src/credential_cleanup.js';

test('purges only expired or already consumed credential material', async () => {
  let statement = '';
  const result = await purgeExpiredCredentials({
    client: {
      async query(sql) {
        statement = sql;
        return {
          rows: [{
            deleted_action_tokens: 2,
            deleted_refresh_tokens: 3,
            deleted_staff_elevations: 1,
            scrubbed_booking_challenges: 4,
          }],
        };
      },
    },
  });

  assert.deepEqual(result, {
    deletedActionTokens: 2,
    deletedRefreshTokens: 3,
    deletedStaffElevations: 1,
    scrubbedBookingChallenges: 4,
  });
  assert.match(statement, /DELETE FROM auth_action_tokens[\s\S]*expires_at <= now\(\)/u);
  assert.match(statement, /DELETE FROM refresh_tokens[\s\S]*expires_at <= now\(\)/u);
  assert.match(statement, /DELETE FROM staff_elevations[\s\S]*expires_at <= now\(\)/u);
  assert.match(statement, /UPDATE booking_confirmation_challenges[\s\S]*code_digest = repeat\('0', 64\)/u);
  assert.match(statement, /consumed_at IS NOT NULL OR revoked_at IS NOT NULL/u);
});

test('cleanup worker starts immediately and bounds its interval', async () => {
  let calls = 0;
  const stop = startCredentialCleanupWorker({
    client: {
      async query() {
        calls += 1;
        return { rows: [{}] };
      },
    },
    intervalMs: 60_000,
  });
  await new Promise((resolve) => setImmediate(resolve));
  stop();
  assert.equal(calls, 1);
  assert.equal(credentialCleanupIntervalMs, 6 * 60 * 60 * 1000);
  assert.throws(
    () => startCredentialCleanupWorker({ intervalMs: 59_999 }),
    /between one minute and 24 hours/u,
  );
  assert.throws(
    () => startCredentialCleanupWorker({ intervalMs: 24 * 60 * 60 * 1000 + 1 }),
    /between one minute and 24 hours/u,
  );
});
