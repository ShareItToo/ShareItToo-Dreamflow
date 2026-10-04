import { resolveZonedCalendarInstant } from '../src/return_calendar_policy.js';

export const berlinBookingFixtureTimezone = 'Europe/Berlin';

const berlinDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: berlinBookingFixtureTimezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const berlinWeekdayFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: berlinBookingFixtureTimezone,
  weekday: 'long',
});

function validInstant(value) {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('invalid_booking_fixture_now');
  return parsed;
}

function addCalendarDays(value, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match || !Number.isSafeInteger(days)) {
    throw new Error('invalid_booking_fixture_date');
  }
  return new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + days,
  )).toISOString().slice(0, 10);
}

export function futureBerlinBookingWindow({
  now = new Date(),
  daysAhead = 120,
} = {}) {
  const current = validInstant(now);
  if (!Number.isSafeInteger(daysAhead) || daysAhead < 0 || daysAhead > 3_650) {
    throw new Error('invalid_booking_fixture_days_ahead');
  }
  const anchor = new Date(current.getTime() + (daysAhead * 86_400_000));
  const startDate = berlinDateFormatter.format(anchor);
  const endDate = addCalendarDays(startDate, 2);
  const instantAt = (date, time) => resolveZonedCalendarInstant({
    date,
    time,
    timezone: berlinBookingFixtureTimezone,
  });
  const periodStartAt = instantAt(startDate, '00:00');
  const periodEndAt = instantAt(endDate, '00:00');
  const handoverAt = instantAt(startDate, '10:00');
  const returnAt = instantAt(endDate, '16:00');
  const flowPickupAt = instantAt(startDate, '10:15');
  const confirmedPickupAt = instantAt(startDate, '18:00');
  const weekday = berlinWeekdayFormatter.format(handoverAt);

  return Object.freeze({
    timezone: berlinBookingFixtureTimezone,
    startDate,
    endDate,
    amendedEndDate: addCalendarDays(startDate, 3),
    conflictStartDate: addCalendarDays(startDate, 1),
    conflictEndDate: addCalendarDays(startDate, 4),
    periodStartAt: periodStartAt.toISOString(),
    periodEndAt: periodEndAt.toISOString(),
    handoverAt: handoverAt.toISOString(),
    returnAt: returnAt.toISOString(),
    flowPickupAt: flowPickupAt.toISOString(),
    confirmedPickupAt: confirmedPickupAt.toISOString(),
    weekday,
  });
}
