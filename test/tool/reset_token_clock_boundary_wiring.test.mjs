import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(
  new URL('../../scripts/test_reset_token_clock_boundary.sh', import.meta.url),
  'utf8',
);
const accountActions = readFileSync(
  new URL('../../backend/src/account_actions.js', import.meta.url),
  'utf8',
);
const accountSecurity = readFileSync(
  new URL('../../backend/test/account_security.test.js', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../../backend/sql/migrations/057_account_recovery_session_integrity.up.sql', import.meta.url),
  'utf8',
);

test('reset-token issuance persists one timestamp with an exact 30-minute lifetime', () => {
  assert.match(accountActions, /const createdAt = new Date\(\)/u);
  assert.match(accountActions, /new Date\(createdAt\.getTime\(\) \+ lifetimeMs\)/u);
  assert.match(
    accountActions,
    /INSERT INTO auth_action_tokens \([\s\S]*expires_at, payload, created_at[\s\S]*expiresAt,[\s\S]*createdAt/u,
  );
  assert.match(
    accountSecurity,
    /insert\.parameters\[3\]\.getTime\(\) - insert\.parameters\[5\]\.getTime\(\),[\s\S]*30 \* 60 \* 1000/u,
  );
});

test('PostgreSQL independently caps reset-token lifetime at 30 minutes', () => {
  assert.match(migration, /auth_action_tokens_lifetime_check/u);
  assert.match(
    migration,
    /expires_at > created_at[\s\S]*kind <> 'reset_password'[\s\S]*expires_at <= created_at \+ interval '30 minutes'/u,
  );
  assert.match(migration, /VALIDATE CONSTRAINT auth_action_tokens_lifetime_check/u);
});

test('boundary proof repeats clean unit and fresh PostgreSQL runs without timing accommodation', () => {
  assert.match(script, /^UNIT_RUNS=5$/mu);
  assert.match(script, /^POSTGRES_RUNS=2$/mu);
  assert.match(script, /git status --porcelain/u);
  assert.match(script, /password-reset lifetime uses one deterministic issuance timestamp/u);
  assert.match(script, /pnpm --dir backend run test:postgres:local/u);
  assert.match(script, /"clock":"single-issued-at"/u);
  assert.doesNotMatch(script, /sleep|retry|SIT_FLUTTER_TEST_CONCURRENCY|--concurrency/u);
});
