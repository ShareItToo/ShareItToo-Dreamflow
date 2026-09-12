import test from 'node:test';
import assert from 'node:assert/strict';

import { postgresDateText } from '../src/postgres_date.js';

test('PostgreSQL DATE keeps its local calendar identity instead of the UTC day', () => {
  const value = new Date(2026, 9, 1);
  assert.equal(postgresDateText(value), '2026-10-01');
});

test('PostgreSQL DATE accepts exact text and rejects normalized or invalid dates', () => {
  assert.equal(postgresDateText('2026-10-01'), '2026-10-01');
  for (const value of ['2026-02-30', '2026-13-01', '', null]) {
    assert.throws(() => postgresDateText(value), /invalid_postgres_date/u);
  }
});
