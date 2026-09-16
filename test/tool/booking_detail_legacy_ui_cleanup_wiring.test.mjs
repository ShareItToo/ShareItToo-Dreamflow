import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bookingDetail = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);
const ownerDetail = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);

test('renter detail cannot regain superseded presentation widgets', () => {
  assert.doesNotMatch(bookingDetail, /return_reminder_picker_sheet\.dart/);
  for (const removedSymbol of [
    '_returnReminderMinutes',
    '_humanizeReminder',
    '_InfoRow',
    '_MapLink',
    '_CounterpartyRow',
    '_PrimaryCTA',
    '_SecondaryCTA',
    '_ListerCard',
    '_ReturnReminderCard',
    '_Timeline',
    '_StepState',
    '_StepChip',
  ]) {
    assert.doesNotMatch(bookingDetail, new RegExp(`\\b${removedSymbol}\\b`));
  }
});

test('renter detail keeps the active modern cards and critical flows', () => {
  for (const activeSymbol of [
    '_ModernDetailsCard',
    '_InfoRowModern',
    '_MapActions',
    '_CounterpartyInlineRow',
    '_CancellationPolicyCard',
    '_CompletionSummaryCard',
    '_InlineTimeActionButton',
  ]) {
    assert.match(bookingDetail, new RegExp(`\\b${activeSymbol}\\b`));
  }
  assert.match(bookingDetail, /Future<void> _startPickupFlow\(\) async/);
  assert.match(bookingDetail, /Future<void> _startOwnerReturnFlow\(\) async/);
  assert.match(bookingDetail, /ReturnHandoverStepperSheet\.push\(/);
  assert.match(bookingDetail, /updateRentalRequestStatusWithActor\(/);
  assert.match(bookingDetail, /ReviewPromptSheet\.show\(/);
  assert.match(
    bookingDetail,
    /onPressed: \(\) async \{\s+if \(!await _timeConfirmedForStart\(isReturn: false\)\) return;\s+await _startPickupFlow\(\);\s+\},[\s\S]*?label: const Text\('Übergabe starten'\)/,
  );
  assert.match(
    bookingDetail,
    /onPressed: \(\) async \{\s+if \(!await _timeConfirmedForStart\(isReturn: true\)\) return;\s+await _startOwnerReturnFlow\(\);\s+\},[\s\S]*?Rückgabe starten/,
  );
  assert.match(bookingDetail, /case 'cancel':\s+await _confirmCancelUpcoming\(\)/);
  assert.match(
    bookingDetail,
    /status: 'cancelled',\s+cancelledBy: 'renter'/,
  );
  assert.match(
    bookingDetail,
    /onPressed: _reviewAlreadySubmitted[\s\S]*?ReviewPromptSheet\.show\([\s\S]*?direction: 'renter_to_owner'/,
  );
});

test('owner detail cannot regain superseded presentation widgets', () => {
  for (const removedSymbol of [
    '_OwnerStatusCard',
    '_MapLink',
    '_PrimaryCTA',
    '_SecondaryCTA',
    '_Timeline',
    '_StepState',
    '_StepChip',
  ]) {
    assert.doesNotMatch(ownerDetail, new RegExp(`\\b${removedSymbol}\\b`));
  }
});

test('owner detail keeps active facts counterpart and handover flows', () => {
  for (const activeSymbol of [
    '_InfoRow',
    '_CounterpartyRow',
    '_AmountRow',
    '_FactRow',
    '_InlineTimeActionButton',
  ]) {
    assert.match(ownerDetail, new RegExp(`\\b${activeSymbol}\\b`));
  }
  assert.match(ownerDetail, /Future<void> _startPickupFlowOwner\(/);
  assert.match(ownerDetail, /Future<void> _startReturnFlow\(/);
  assert.match(ownerDetail, /ReturnHandoverStepperSheet\.push\(/);
  assert.match(ownerDetail, /ReviewPromptSheet\.show\(/);
  assert.match(
    ownerDetail,
    /onPressed: \(\) async \{[\s\S]*?_timeConfirmedForStart\(\s+req: req,\s+isReturn: false,[\s\S]*?await _startPickupFlowOwner\(\s+context,\s+req,\s+item,\s+renter,[\s\S]*?label: const Text\('Übergabe starten'\)/,
  );
  assert.match(
    ownerDetail,
    /onPressed: \(\) async \{[\s\S]*?_timeConfirmedForStart\(\s+req: req,\s+isReturn: true,[\s\S]*?await _startReturnFlow\(context, req, item, renter\);[\s\S]*?label: const Text\('Rückgabe starten'\)/,
  );
  assert.match(ownerDetail, /status: 'cancelled',\s+cancelledBy: 'owner'/);
  assert.match(
    ownerDetail,
    /onPressed: \(\) => _showReviewSheet\(context, rn\)[\s\S]*?direction: 'owner_to_renter'/,
  );
});
