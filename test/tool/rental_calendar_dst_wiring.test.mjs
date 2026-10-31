import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('both item-details variants retain the seven-day exclusive range', () => {
  const source = read('lib/widgets/item_details_overlay.dart');
  assert.equal(source.match(/final end = addRentalCalendarDays\(start, 7\);/g)?.length, 2);
  assert.match(source, /rentalCalendarDays\(range.start, range.end\)/);
  assert.doesNotMatch(source, /Duration\(days: 6\)|\.inDays\b/);
});

test('calendar selection, highlighting and confirmation never use elapsed-day arithmetic', () => {
  const source = read('lib/screens/select_rental_duration_screen.dart');
  assert.doesNotMatch(source, /Duration\(days:|\.inDays\b/);
  assert.match(source, /final end = _end \?\? _selectionEnd\(_start!, 1\);/);
  assert.match(source, /end: end\);[\s\S]*DateTimeRange\(start: start, end: end\)/);
  assert.match(source, /widget.item.priceUnit == 'week' \? 7 : days/);
});

test('checkout uses calendar days without changing exact contract instants', () => {
  const source = read('lib/screens/private_pilot_checkout_screen.dart');
  assert.match(source, /int get _days => rentalCalendarDays\(widget.range.start, widget.range.end\)/);
  assert.match(source, /BookingTimeSnapshot.fromLocal/);
});

test('request acceptance preview uses the same rental calendar-day count', () => {
  const source = read('lib/screens/request_detail_screen.dart');
  assert.match(source, /int _rentalDays\(RentalRequest request\) =>\s*rentalCalendarDays\(request.start, request.end\)/);
  assert.match(source, /days: _rentalDays\(req\)/);
});
