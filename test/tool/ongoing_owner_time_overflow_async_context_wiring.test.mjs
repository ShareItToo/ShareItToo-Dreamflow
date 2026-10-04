import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);
const timeManagement = source.match(
  /Future<void> _manageBookingTime[\s\S]*?\n  Future<bool> _timeConfirmedForStart/u,
)?.[0];
const overflowMenu = source.match(
  /final picked = await showSITOverflowMenu<String>[\s\S]*?case 'issue':/u,
)?.[0];

assert.ok(timeManagement, 'expected owner time-management section');
assert.ok(overflowMenu, 'expected owner overflow-menu section');

test('time management rechecks lifecycle after flow-state lookup', () => {
  assert.match(
    timeManagement,
    /final state = await DataService\.getHandoverReturnState\(req\.id\);\s+if \(!mounted\) return;[\s\S]*?final action = await showDialog<String>\(\s+context: context,/u,
  );
  assert.match(
    timeManagement,
    /final picked = await SitGlassTimePicker\.show\(\s+context,/u,
  );
});

test('accepted time stops before feedback when persistence disposed the screen', () => {
  assert.match(
    timeManagement,
    /await DataService\.confirmFlowTime\([\s\S]*?await DataService\.addSystemMessageToThread\([\s\S]*?if \(!mounted\) return;\s+AppPopup\.toast\(\s+context,\s+icon: Icons\.check_circle_outline/u,
  );
});

test('new time request stops before feedback when persistence disposed the screen', () => {
  assert.match(
    timeManagement,
    /await DataService\.requestFlowTime\([\s\S]*?await DataService\.addSystemMessageToThread\([\s\S]*?if \(!mounted\) return;\s+AppPopup\.toast\(context, icon: Icons\.schedule/u,
  );
});

test('overflow selection proves the exact builder context before every branch', () => {
  assert.match(
    overflowMenu,
    /final picked = await showSITOverflowMenu<String>\([\s\S]*?\);\s+if \(!context\.mounted\) return;\s+switch \(picked\)/u,
  );
  assert.match(
    overflowMenu,
    /case 'view':\s+ItemDetailsOverlay\.showFullPage\(context, item: item\);[\s\S]*?case 'cancel':\s+await AppPopup\.show\(\s+context,/u,
  );
});

test('cancellation proves the exact builder context after both mutations', () => {
  assert.match(
    overflowMenu,
    /await DataService[\s\S]*?\.updateRentalRequestStatusWithActor\([\s\S]*?await DataService\.addTimelineEvent\([\s\S]*?if \(!context\.mounted\) return;\s+AppPopup\.toast\(\s+context,/u,
  );
});

test('owner time and overflow fixes contain no timing or lint accommodation', () => {
  for (const value of [timeManagement, overflowMenu]) {
    assert.doesNotMatch(value, /ignore:\s*use_build_context_synchronously/u);
    assert.doesNotMatch(value, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
  }
});
