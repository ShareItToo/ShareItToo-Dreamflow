import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';

const {
  createAccountLegalHold,
  listAccountLegalHolds,
  releaseAccountLegalHold,
} = await import('../src/moderation_workflow.js');

const admin = { id: 'admin-id', role: 'admin' };
const createdAt = new Date('2026-08-15T17:00:00.000Z');

function scriptedClient(steps) {
  const calls = [];
  return {
    calls,
    async query(statement, values = []) {
      calls.push({ statement, values });
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${statement}`);
      assert.match(statement, step.pattern);
      return step.result;
    },
  };
}

test('an admin creates an idempotent account legal hold and the audit omits the private note', async () => {
  const heldRow = {
    id: 'hold-id',
    user_id: 'user-id',
    reason_code: 'regulatory_request',
    note: 'private case detail',
    placed_by: admin.id,
    created_at: createdAt,
    released_at: null,
    released_by: null,
    release_reason_code: null,
  };
  const client = scriptedClient([
    { pattern: /FROM account_legal_holds WHERE idempotency_key/u, result: { rowCount: 0, rows: [] } },
    { pattern: /FROM users WHERE id = \$1 FOR UPDATE/u, result: { rowCount: 1, rows: [{ id: 'user-id', role: 'user', deactivated_at: null }] } },
    { pattern: /released_at IS NULL FOR UPDATE/u, result: { rowCount: 0, rows: [] } },
    { pattern: /INSERT INTO account_legal_holds/u, result: { rowCount: 1, rows: [heldRow] } },
    { pattern: /INSERT INTO audit_log/u, result: { rowCount: 1, rows: [] } },
  ]);

  const result = await createAccountLegalHold(client, {
    actor: admin,
    userId: 'user-id',
    raw: { reasonCode: 'REGULATORY_REQUEST', note: heldRow.note },
    idempotencyKey: 'case-123',
  });

  assert.equal(result.replayed, false);
  assert.equal(result.legalHold.reasonCode, 'regulatory_request');
  assert.equal(Object.hasOwn(result.legalHold, 'note'), false);
  assert.equal(client.calls[3].values[4], 'account.legal_hold:case-123');
  assert.doesNotMatch(client.calls[4].values[5], /private case detail/u);
});

test('support cannot create, release or list legal holds', async () => {
  const client = scriptedClient([]);
  const actor = { id: 'support-id', role: 'support' };
  await assert.rejects(
    createAccountLegalHold(client, { actor, userId: 'user-id', raw: {}, idempotencyKey: 'x' }),
    (error) => error.status === 403 && error.code === 'admin_role_required',
  );
  await assert.rejects(
    releaseAccountLegalHold(client, { actor, legalHoldId: 'hold-id', raw: {}, idempotencyKey: 'x' }),
    (error) => error.status === 403 && error.code === 'admin_role_required',
  );
  await assert.rejects(
    listAccountLegalHolds(client, { actor }),
    (error) => error.status === 403 && error.code === 'admin_role_required',
  );
  assert.equal(client.calls.length, 0);
});

test('an admin releases a legal hold with a separate idempotency key and audit event', async () => {
  const heldRow = {
    id: 'hold-id', user_id: 'user-id', reason_code: 'regulatory_request',
    placed_by: admin.id, created_at: createdAt, released_at: null,
    released_by: null, release_reason_code: null, release_idempotency_key: null,
  };
  const releasedAt = new Date('2026-08-15T18:00:00.000Z');
  const releasedRow = {
    ...heldRow,
    released_at: releasedAt,
    released_by: admin.id,
    release_reason_code: 'authority_cleared',
    release_idempotency_key: 'account.legal_hold.release:release-123',
  };
  const client = scriptedClient([
    { pattern: /FROM account_legal_holds WHERE id::text = \$1 FOR UPDATE/u, result: { rowCount: 1, rows: [heldRow] } },
    { pattern: /UPDATE account_legal_holds/u, result: { rowCount: 1, rows: [releasedRow] } },
    { pattern: /INSERT INTO audit_log/u, result: { rowCount: 1, rows: [] } },
  ]);

  const result = await releaseAccountLegalHold(client, {
    actor: admin,
    legalHoldId: 'hold-id',
    raw: { reasonCode: 'AUTHORITY_CLEARED' },
    idempotencyKey: 'release-123',
  });
  assert.equal(result.replayed, false);
  assert.equal(result.legalHold.releasedAt, releasedAt.toISOString());
  assert.equal(client.calls[1].values[3], 'account.legal_hold.release:release-123');
});

test('schema and account-erasure preflight enforce one active hold per account', () => {
  const migration = readFileSync(new URL('../sql/migrations/014_account_legal_holds.up.sql', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS account_legal_holds_one_active_per_user_idx[\s\S]*WHERE released_at IS NULL/u);
  assert.match(migration, /release_idempotency_key TEXT UNIQUE/u);
  assert.match(app, /FROM account_legal_holds[\s\S]*user_id = \$1 AND released_at IS NULL/u);
  assert.match(app, /\['active_legal_holds', 'Rechtliche Aufbewahrungssperre'\]/u);
  assert.match(app, /\/v1\/admin\/users\/:id\/legal-holds/u);
  assert.match(app, /\/v1\/admin\/legal-holds\/:id\/release/u);
});
