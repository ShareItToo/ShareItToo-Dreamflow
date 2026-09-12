import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addReturnPolicyCalendarDays,
  returnPolicyTimeZone,
} from '../src/return_calendar_policy.js';

test('calendar deadlines preserve Berlin wall-clock time across spring DST', () => {
  const openedAt = new Date('2026-03-27T11:00:00.000Z'); // 12:00 CET
  assert.equal(
    addReturnPolicyCalendarDays(openedAt, 5, 'Europe/Berlin').toISOString(),
    '2026-04-01T10:00:00.000Z', // 12:00 CEST, 119 elapsed hours
  );
});

test('calendar deadlines preserve Berlin wall-clock time across autumn DST', () => {
  const openedAt = new Date('2026-10-23T10:00:00.000Z'); // 12:00 CEST
  assert.equal(
    addReturnPolicyCalendarDays(openedAt, 5, 'Europe/Berlin').toISOString(),
    '2026-10-28T11:00:00.000Z', // 12:00 CET, 121 elapsed hours
  );
});

test('invalid timezone and duration inputs fail closed', () => {
  assert.throws(
    () => returnPolicyTimeZone('Not/A_Real_Zone'),
    /invalid_return_policy_timezone/u,
  );
  assert.throws(
    () => addReturnPolicyCalendarDays(new Date(), -1, 'Europe/Berlin'),
    /invalid_return_policy_calendar_days/u,
  );
});
