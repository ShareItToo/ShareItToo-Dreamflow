import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const {
  inspectRetentionInventory,
} = await import('../src/retention_inventory.js');

const admin = { id: 'admin-id', role: 'admin' };

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

test('admin receives a count-only retention inventory while every policy remains open', async () => {
  const client = scriptedClient([
    {
      pattern: /WITH inventory\(category, dataset, row_count, oldest_at, newest_at\)/u,
      result: {
        rowCount: 4,
        rows: [
          { category: 'accounts', dataset: 'user_accounts', row_count: '3', oldest_at: new Date('2026-01-01T00:00:00Z'), newest_at: new Date('2026-08-15T00:00:00Z') },
          { category: 'communications', dataset: 'messages', row_count: '7', oldest_at: new Date('2026-02-01T00:00:00Z'), newest_at: new Date('2026-08-14T00:00:00Z') },
          { category: 'legalHold', dataset: 'account_legal_holds', row_count: '0', oldest_at: null, newest_at: null },
          { category: 'securityAudit', dataset: 'audit_log', row_count: '11', oldest_at: new Date('2026-03-01T00:00:00Z'), newest_at: new Date('2026-08-15T01:00:00Z') },
        ],
      },
    },
    { pattern: /privacy\.retention_inventory_viewed/u, result: { rowCount: 1, rows: [] } },
  ]);

  const result = await inspectRetentionInventory(client, { actor: admin });
  assert.equal(result.status, 'policy-open-inventory-only');
  assert.equal(result.containsIdentifiers, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.retentionPeriodsApplied, false);
  assert.equal(result.eligibleRowsCalculated, false);
  assert.equal(result.categories.find((entry) => entry.category === 'accounts').decisionKey, 'inactiveAccountPeriod');
  assert.equal(result.categories.find((entry) => entry.category === 'communications').totalRows, 7);
  assert.equal(result.categories.find((entry) => entry.category === 'legalHold').datasets[0].oldestAt, null);
  assert.deepEqual(JSON.parse(client.calls[1].values[2]), {
    categoryCount: 4,
    datasetCount: 4,
    totalRows: 21,
    executionEnabled: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /admin-id|email|user-id/u);
});

test('support cannot inspect retention inventory', async () => {
  const client = scriptedClient([]);
  await assert.rejects(
    inspectRetentionInventory(client, { actor: { id: 'support-id', role: 'support' } }),
    (error) => error.status === 403 && error.code === 'admin_role_required',
  );
  assert.equal(client.calls.length, 0);
});

test('retention inventory is read-only, step-up routed and covers every local decision category', () => {
  const source = readFileSync(new URL('../src/retention_inventory.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /DELETE\s+FROM|UPDATE\s+[a-z_]+\s+SET/iu);
  for (const marker of [
    "accounts: 'inactiveAccountPeriod'",
    "transactions: 'transactionalRecordPeriod'",
    "communications: 'communicationPeriod'",
    "privacyRights: 'privacyRightsPeriod'",
    "moderation: 'moderationEvidencePeriod'",
    "securityAudit: 'auditSecurityLogPeriod'",
    "legalHold: 'legalHoldProcess'",
    "executionEnabled: false",
    "eligibleRowsCalculated: false",
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.match(app, /\/v1\/admin\/privacy\/retention-inventory[\s\S]*requireStaffElevation/u);
  assert.match(source, /'communications', 'support_legacy_imports'/u);
  assert.match(source, /'communications', 'support_legacy_history_entries'/u);
  assert.match(source, /'communications', 'support_case_progress_updates'/u);
  assert.match(source, /'transactions', 'dispute_transfer_recoveries'/u);
});
