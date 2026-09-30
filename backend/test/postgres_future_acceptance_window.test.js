import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { futureBerlinBookingWindow } from './future_booking_fixture.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const integrationSource = fs.readFileSync(
  path.resolve(currentDirectory, 'postgres_foundation.integration.test.js'),
  'utf8',
);

test('parallel acceptance scenario derives one safely future shared booking window', () => {
  assert.match(
    integrationSource,
    /function futureAcceptanceWindow\(\{[\s\S]+?daysAhead = 30,[\s\S]+?durationDays = 2,[\s\S]+?\}\s*=\s*\{\}\)\s*\{/u,
  );
  assert.match(
    integrationSource,
    /const acceptanceWindow = futureAcceptanceWindow\(\);[\s\S]+?start: acceptanceWindow\.start,[\s\S]+?end: acceptanceWindow\.end,/u,
  );
  assert.doesNotMatch(
    integrationSource,
    /start:\s*'2026-09-10T10:00:00\.000Z'/u,
  );
});

test('B6 quote and booking scenario binds every dependent date to one future Berlin window', () => {
  assert.match(
    integrationSource,
    /const b6Window = futureBerlinBookingWindow\(\);[\s\S]+?const quotePayload = \{[\s\S]+?startDate: b6Window\.startDate,[\s\S]+?endDate: b6Window\.endDate,/u,
  );
  for (const binding of [
    'handoverAt: b6Window.handoverAt',
    'returnAt: b6Window.returnAt',
    'endDate: b6Window.amendedEndDate',
    'startDate: b6Window.conflictStartDate',
    'endDate: b6Window.conflictEndDate',
    'b6Window.flowPickupAt',
    'b6Window.confirmedPickupAt',
    "['b6-flow', b6Window.startDate]",
  ]) {
    assert.ok(integrationSource.includes(binding), `missing B6 future-date binding: ${binding}`);
  }
  assert.doesNotMatch(
    integrationSource,
    /(?:startDate|endDate|handoverAt|returnAt):\s*'2026-10-0[1-5]/u,
  );
});

test('future Berlin fixture stays ahead after local midnight and keeps relative B6 dates', () => {
  const now = new Date('2026-09-30T22:45:33.526Z');
  const window = futureBerlinBookingWindow({ now });

  assert.equal(window.timezone, 'Europe/Berlin');
  assert.equal(window.startDate, '2027-01-28');
  assert.equal(window.endDate, '2027-01-30');
  assert.equal(window.amendedEndDate, '2027-01-31');
  assert.equal(window.conflictStartDate, '2027-01-29');
  assert.equal(window.conflictEndDate, '2027-02-01');
  assert.ok(Date.parse(window.periodStartAt) > now.getTime() + (118 * 86_400_000));
});

test('future Berlin fixture resolves spring and autumn DST instants through the canonical helper', () => {
  const spring = futureBerlinBookingWindow({
    now: new Date('2026-03-29T12:00:00.000Z'),
    daysAhead: 0,
  });
  assert.equal(spring.periodStartAt, '2026-03-28T23:00:00.000Z');
  assert.equal(spring.periodEndAt, '2026-03-30T22:00:00.000Z');
  assert.equal(spring.handoverAt, '2026-03-29T08:00:00.000Z');
  assert.equal(spring.returnAt, '2026-03-31T14:00:00.000Z');

  const autumn = futureBerlinBookingWindow({
    now: new Date('2026-10-25T12:00:00.000Z'),
    daysAhead: 0,
  });
  assert.equal(autumn.periodStartAt, '2026-10-24T22:00:00.000Z');
  assert.equal(autumn.periodEndAt, '2026-10-26T23:00:00.000Z');
  assert.equal(autumn.handoverAt, '2026-10-25T09:00:00.000Z');
  assert.equal(autumn.returnAt, '2026-10-27T15:00:00.000Z');
});
