import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url), 'utf8');
const resolver = readFileSync(new URL('../../lib/utils/booking_date_range.dart', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};

test('instance and completion paths share the sole strict ISO resolver', () => {
  assert.match(source, /_parseDateRange\(\) =>\s*resolveBookingDateRange\(widget.booking\) \?\? \(null, null\)/);
  assert.match(source, /_parseStaticDateRange\([\s\S]*?=> resolveBookingDateRange\(booking\) \?\? \(null, null\)/);
  assert.doesNotMatch(source, /_parseGermanDateTime|Assume current year|end\.difference\(start\)\.inDays/);
  assert.doesNotMatch(resolver, /booking\['dates'\]|DateTime\.now/);
});

test('pickup and return fail visibly before constructing or pushing a request', () => {
  for (const [start, end] of [
    ['Future<void> _startOwnerReturnFlow()', 'Future<void> _startPickupFlow()'],
    ['Future<void> _startPickupFlow()', 'Future<void> _startScanRenterQrForReturn()'],
  ]) {
    const flow = section(start, end);
    assert.match(flow, /if \(start == null \|\| end == null\) \{\s*_showUnavailableBookingDates\(\);\s*return;\s*\}/);
    assert.ok(flow.indexOf('_showUnavailableBookingDates') < flow.indexOf('final req = RentalRequest'));
    assert.match(flow, /start: start,\s*end: end,/);
    assert.doesNotMatch(flow, /start \?\?|end \?\?/);
  }
});

test('time confirmation and time management reject missing dates before lookup or mutation', () => {
  for (const [start, end] of [
    ['Future<void> _manageBookingTime(', 'Future<bool> _timeConfirmedForStart('],
    ['Future<bool> _timeConfirmedForStart(', 'String? _confirmedLocationText('],
  ]) {
    const flow = section(start, end);
    assert.ok(flow.indexOf('resolveBookingDateRange') < flow.indexOf('await DataService'));
    assert.doesNotMatch(flow, /start \?\?|end \?\?/);
  }
  assert.match(source, /DateTime\? _handoverCodeStart\(\) => resolveBookingDateRange\(widget.booking\)\?\.\$1/);
  assert.match(source, /final start = _handoverCodeStart\(\);\s*if \(start == null\) return '';/);
});
