import assert from 'node:assert/strict';
import test from 'node:test';

import { validateP0BOpsHistoricalSnapshot } from '../../tool/validate_p0b_ops_historical_snapshot.mjs';

test('validates the immutable P0B operations snapshot from its pinned source revision', () => {
  assert.deepEqual(validateP0BOpsHistoricalSnapshot(), {
    revision: '2bfc3ce027d8a5dea09b401744fc86be6900b467',
    version: 'P0B-OPS-2026-08-21.1',
    state: 'hold-external-assignments-and-human-absence-tests',
    requiredRoles: 6,
    assignedRoles: 0,
    soleFounderPrimaryRoleMappings: 6,
    technicalRehearsalsPassed: 4,
    humanAbsenceTestsPassed: 0,
    operationsReady: false,
  });
});

test('uses the supplied repository root and fails closed outside the checkout', () => {
  assert.throws(
    () => validateP0BOpsHistoricalSnapshot({ repositoryRoot: '/tmp' }),
    /ENOENT|Historical P0B manifest/u,
  );
});
