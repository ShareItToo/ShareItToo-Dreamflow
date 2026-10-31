import assert from 'node:assert/strict';
import test from 'node:test';

import {
  newHumanReadableAppealNumber,
  normalizeSupportAppealInput,
  supportAppealIdempotencyKey,
  supportAppealNextUpdateAt,
  supportAppealStatuses,
} from '../src/support_appeal_domain.js';

const now = new Date('2026-08-21T10:00:00.000Z');

test('appeal input requires a bounded reason and optimistic case version', () => {
  assert.deepEqual(
    normalizeSupportAppealInput({ expectedVersion: 7, grounds: '  Bitte erneut menschlich prüfen.  ' }),
    { expectedVersion: 7, grounds: 'Bitte erneut menschlich prüfen.' },
  );
  for (const raw of [
    null,
    { expectedVersion: 0, grounds: 'Begründung' },
    { expectedVersion: 1, grounds: '  ' },
    { expectedVersion: 1, grounds: 'a'.repeat(8001) },
  ]) assert.throws(() => normalizeSupportAppealInput(raw), /support_appeal/u);
});

test('appeal references and checkpoints are deterministic and ambiguity-safe', () => {
  const number = newHumanReadableAppealNumber(Buffer.alloc(9, 0));
  assert.equal(number, 'SIT-R-AAAAAAAAAAAA');
  assert.match(number, /^SIT-R-[A-HJ-NP-Z2-9]{12}$/u);
  assert.equal(
    supportAppealNextUpdateAt('p0', now).toISOString(),
    '2026-08-21T10:15:00.000Z',
  );
  assert.equal(
    supportAppealNextUpdateAt('p3', now).toISOString(),
    '2026-08-22T10:00:00.000Z',
  );
  assert.equal(
    supportAppealNextUpdateAt('p4', now).toISOString(),
    '2026-08-22T10:00:00.000Z',
  );
  assert.throws(() => supportAppealNextUpdateAt('urgent', now), /support_appeal_priority_invalid/u);
  assert.equal(
    supportAppealIdempotencyKey('appeal-1'),
    'support.appeal.submit:appeal-1',
  );
  assert.deepEqual(supportAppealStatuses, [
    'submitted',
    'under_review',
    'upheld',
    'modified',
    'reversed',
    'closed',
  ]);
});
