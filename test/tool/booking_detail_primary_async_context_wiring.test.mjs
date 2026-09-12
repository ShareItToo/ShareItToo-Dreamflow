import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);
const timeManagement = source.match(
  /Future<void> _manageBookingTime[\s\S]*?\n  Future<bool> _timeConfirmedForStart/u,
)?.[0];
const listingLookup = source.match(
  /Future<void> _viewListing[\s\S]*?\n  String _pageTitle/u,
)?.[0];
const overflowMenu = source.match(
  /final picked = await showSITOverflowMenu<String>[\s\S]*?\n                default:/u,
)?.[0];
const reviewAction = source.match(
  /onPressed: _reviewAlreadySubmitted[\s\S]*?\n                icon: Icon/u,
)?.[0];

assert.ok(timeManagement, 'expected renter time-management section');
assert.ok(listingLookup, 'expected listing lookup section');
assert.ok(overflowMenu, 'expected booking overflow-menu section');
assert.ok(reviewAction, 'expected completed-booking review action');

test('time management rechecks State after every context-relevant lookup', () => {
  assert.match(
    timeManagement,
    /createOrGetThreadForRequest\(requestId\);\s+if \(!mounted\) return;\s+if \(thread == null\)[\s\S]*?getHandoverReturnState\(requestId\);\s+if \(!mounted\) return;/u,
  );
  assert.match(
    timeManagement,
    /addSystemMessageToThread\([\s\S]*?best\u00e4tigt:[\s\S]*?\);\s+if \(!mounted\) return;\s+AppPopup\.toast\(\s+context,/u,
  );
  assert.match(
    timeManagement,
    /\n    \}\n    if \(!mounted\) return;\s+final \(start, end\)[\s\S]*?SitGlassTimePicker\.show\(\s+context,/u,
  );
});

test('listing lookup uses the owning State context only after its lifecycle proof', () => {
  assert.match(
    listingLookup,
    /getPublicItems\(\);[\s\S]*?if \(!mounted\) return;\s+if \(bestItem == null\) \{\s+await showDialog<void>\(\s+context: context,/u,
  );
  assert.match(
    listingLookup,
    /ItemDetailsOverlay\.showFullPage\(context, item: bestItem\)/u,
  );
  assert.doesNotMatch(listingLookup, /final ctx = context/u);
});

test('overflow selection proves the exact build context before every branch', () => {
  assert.match(
    overflowMenu,
    /showSITOverflowMenu<String>\([\s\S]*?\);\s+if \(!context\.mounted\) return;\s+switch \(picked\)/u,
  );
  assert.match(
    overflowMenu,
    /case 'payment':[\s\S]*?if \(requestId\.isNotEmpty\) \{\s+await Navigator\.of\(context\)\.push<void>/u,
  );
});

test('review result UI proves both State and exact builder context', () => {
  const lifecycleProof = /if \(!mounted \|\| !context\.mounted\) return;/gu;
  assert.equal(reviewAction.match(lifecycleProof)?.length, 2);
  assert.match(
    reviewAction,
    /if \(!mounted \|\| !context\.mounted\) return;\s+final ok = await ReviewPromptSheet\.show\(\s+context,[\s\S]*?if \(!mounted \|\| !context\.mounted\) return;\s+if \(ok == true\)/u,
  );
  assert.doesNotMatch(reviewAction, /ok == (?:true|false) && mounted/u);
});

test('primary booking-context fixes add no timing or lint accommodation', () => {
  for (const value of [timeManagement, listingLookup, overflowMenu, reviewAction]) {
    assert.doesNotMatch(value, /ignore:\s*use_build_context_synchronously/u);
    assert.doesNotMatch(value, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
  }
});
