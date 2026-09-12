import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/bookings_screen.dart', import.meta.url),
  'utf8',
);
const reviewAction = source.match(
  /Widget\? _buildSmallInlineAction[\s\S]*?\n  \(String, String\) _splitDatesText/u,
)?.[0];

assert.ok(reviewAction, 'expected renter booking inline-review action');

test('booking-card navigation proves the exact item context after read mutation', () => {
  assert.match(
    source,
    /await DataService\.markRequestAsRead\([\s\S]*?\}\s+\}\s+if \(!context\.mounted\) return;\s+await Navigator\.of\(context\)\.push\(/u,
  );
});

test('inline review stops after user lookup when its screen state is disposed', () => {
  assert.match(
    reviewAction,
    /final current = await DataService\.getCurrentUser\(\);\s+if \(current == null \|\| !_canReviewCompletedBooking\(booking\)\) \{\s+return;\s+\}\s+if \(!mounted\) return;[\s\S]*?await ReviewPromptSheet\.show\(\s+context,/u,
  );
});

test('bookings lifecycle fix contains no timing or lint accommodation', () => {
  assert.doesNotMatch(source, /ignore:\s*use_build_context_synchronously/u);
  assert.doesNotMatch(reviewAction, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
