import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const bookings = readFileSync(
  new URL('../../lib/screens/bookings_screen.dart', import.meta.url),
  'utf8',
);
const ownerDetail = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);
const dateStepper = readFileSync(
  new URL('../../lib/widgets/modern_datetime_stepper_sheet.dart', import.meta.url),
  'utf8',
);
const searchOverlay = readFileSync(
  new URL('../../lib/widgets/search_overlay.dart', import.meta.url),
  'utf8',
);

test('booking helpers keep their only-used color and pulse duration', () => {
  const tinyButton = section(bookings, 'class _TinyTextButton', 'class _BlinkHighlight');
  const blink = section(bookings, 'class _BlinkHighlight', 'class _BlinkHighlightState');
  assert.doesNotMatch(tinyButton, /Color\? color|this\.color/);
  assert.match(tinyButton, /final fg = Theme\.of\(context\)\.colorScheme\.primary/);
  assert.doesNotMatch(blink, /final Duration totalDuration|this\.totalDuration/);
  assert.match(blink, /static const totalDuration = Duration\(milliseconds: 6500\)/);
});

test('owner info rows no longer expose an unused trailing slot', () => {
  const infoRow = section(ownerDetail, 'class _InfoRow', 'class _CounterpartyRow');
  assert.doesNotMatch(infoRow, /Widget\? trailing|this\.trailing|trailing != null/);
});

test('date-only step no longer exposes its never-used clear controls', () => {
  const dateOnly = section(dateStepper, 'class _DateOnlyStep', 'class _DateOnlyStepState');
  assert.doesNotMatch(dateOnly, /showClear|onClear/);
});

test('superseded search helpers cannot reintroduce optional defaults', () => {
  assert.doesNotMatch(searchOverlay, /class _NearbyCard|class _SuggestionsPanel/);
});
