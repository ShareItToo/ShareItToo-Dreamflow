import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSupportOperationalMetrics,
  supportOperationalMetricsVersion,
} from '../src/support_operational_metrics.js';

const now = new Date('2026-08-22T10:00:00.000Z');
const admin = { id: 'admin-1', role: 'admin' };

test('support operational metrics are admin-only before any query runs', async () => {
  let queried = false;
  await assert.rejects(
    getSupportOperationalMetrics({ query: async () => {
      queried = true;
      return { rows: [] };
    } }, { actor: { id: 'support-1', role: 'support' }, now }),
    /support_operational_metrics_forbidden/u,
  );
  assert.equal(queried, false);
});

test('support operational metrics reject invalid, future and oversized windows', async () => {
  const client = { query: async () => ({ rows: [] }) };
  await assert.rejects(
    getSupportOperationalMetrics(client, { actor: admin, from: 'invalid', now }),
    /support_operational_metrics_from_invalid/u,
  );
  await assert.rejects(
    getSupportOperationalMetrics(client, {
      actor: admin,
      from: ['2026-08-22T09:00:00.000Z'],
      now,
    }),
    /support_operational_metrics_from_invalid/u,
  );
  await assert.rejects(
    getSupportOperationalMetrics(client, {
      actor: admin,
      from: '2026-08-01',
      now,
    }),
    /support_operational_metrics_from_invalid/u,
  );
  await assert.rejects(
    getSupportOperationalMetrics(client, {
      actor: admin,
      from: '2026-08-22T09:00:00.000Z',
      to: '2026-08-22T11:00:00.000Z',
      now,
    }),
    /support_operational_metrics_future_window_forbidden/u,
  );
  await assert.rejects(
    getSupportOperationalMetrics(client, {
      actor: admin,
      from: '2026-05-01T00:00:00.000Z',
      to: now,
      now,
    }),
    /support_operational_metrics_window_too_large/u,
  );
});

test('metrics use a bounded closed-case cohort and return aggregates only', async () => {
  const client = {
    async query(sql, params) {
      assert.match(sql, /WITH closed_case_cohort/u);
      assert.match(sql, /SELECT DISTINCT closed_case\.case_id/u);
      assert.match(sql, /event\.to_status = 'reopened'/u);
      assert.match(sql, /count\(\*\) FILTER \(WHERE next_update_at <= \$3\)/u);
      assert.doesNotMatch(
        sql,
        /reporter_user_id|affected_user_ids|user_facing_summary|internal_summary|structured_payload|actor_id/iu,
      );
      assert.deepEqual(params, [
        new Date('2026-07-23T10:00:00.000Z'),
        now,
        now,
      ]);
      return {
        rows: [{
          closed_case_count: 8,
          reopened_case_count: 2,
          active_case_count: 10,
          overdue_active_case_count: 3,
        }],
      };
    },
  };
  const result = await getSupportOperationalMetrics(client, { actor: admin, now });
  assert.deepEqual(result, {
    definitionVersion: supportOperationalMetricsVersion,
    window: {
      from: '2026-07-23T10:00:00.000Z',
      to: '2026-08-22T10:00:00.000Z',
      boundary: 'from_inclusive_to_exclusive',
    },
    reopenRate: {
      closedCaseCohort: 8,
      reopenedCases: 2,
      basisPoints: 2500,
    },
    lateUpdateRate: {
      asOf: '2026-08-22T10:00:00.000Z',
      activeCases: 10,
      overdueActiveCases: 3,
      basisPoints: 3000,
    },
    privacy: {
      aggregateOnly: true,
      containsPersonalData: false,
      externalAnalyticsSent: false,
    },
  });
  assert.equal(JSON.stringify(result).includes('caseId'), false);
  assert.equal(JSON.stringify(result).includes('userId'), false);
});

test('zero cohorts produce exact zero rates without division artifacts', async () => {
  const result = await getSupportOperationalMetrics({
    query: async () => ({ rows: [{}] }),
  }, { actor: admin, now });
  assert.equal(result.reopenRate.basisPoints, 0);
  assert.equal(result.lateUpdateRate.basisPoints, 0);
});
