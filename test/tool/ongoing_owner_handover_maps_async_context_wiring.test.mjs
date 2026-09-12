import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);
const body = source.match(
  /Widget _buildOngoingBody[\s\S]*?\n  Future<void> _downloadReceiptPdf/u,
)?.[0];
const confirmedLocation = source.match(
  /Future<void> _openConfirmedLocationUrl[\s\S]*?\n  Future<void> _openSupportFlow/u,
)?.[0];
const completion = source.match(
  /Future<void> _completeOwnerReturnWithSideEffects[\s\S]*?\n  Future<void> _startPickupFlowOwner/u,
)?.[0];
const pickup = source.match(
  /Future<void> _startPickupFlowOwner[\s\S]*?\n  Future<void> _showReviewSheet/u,
)?.[0];

assert.ok(body, 'expected owner detail body');
assert.ok(confirmedLocation, 'expected confirmed-location helper');
assert.ok(completion, 'expected owner return completion helper');
assert.ok(pickup, 'expected owner pickup helper');

test('both handover starters prove the exact body context after time lookup', () => {
  assert.match(
    body,
    /if \(!await _timeConfirmedForStart\([\s\S]*?isReturn: false,[\s\S]*?\)\) \{\s+return;\s+\}\s+if \(!context\.mounted\) return;\s+await _startPickupFlowOwner\(\s+context,/u,
  );
  assert.match(
    body,
    /if \(!await _timeConfirmedForStart\([\s\S]*?isReturn: true,[\s\S]*?\)\) \{\s+return;\s+\}\s+if \(!context\.mounted\) return;\s+await _startReturnFlow\(context,/u,
  );
});

test('confirmed-location launch remains active without the obsolete maps helper', () => {
  assert.doesNotMatch(source, /Future<void> _openMaps\(/u);
  assert.match(
    confirmedLocation,
    /await launchUrl\(uri, mode: LaunchMode\.externalApplication\);/u,
  );
});

test('owner return completion uses its owning State lifecycle', () => {
  assert.match(
    completion,
    /final ownerUserId = await _guardAuthenticatedOwner\(req\.ownerId\);\s+if \(!mounted\) return;\s+if \(ownerUserId == null\) return;/u,
  );
});

test('pickup challenge proves its exact caller context before the stepper', () => {
  assert.match(
    pickup,
    /if \(challenge == null\) \{\s+if \(!context\.mounted\) return;[\s\S]*?return;\s+\}\s+if \(!context\.mounted\) return;\s+await ReturnHandoverStepperSheet\.push\(\s+context,/u,
  );
});

test('handover and confirmed-location paths contain no timing or lint accommodation', () => {
  assert.doesNotMatch(body, /ignore:\s*use_build_context_synchronously/u);
  for (const value of [confirmedLocation, completion, pickup]) {
    assert.doesNotMatch(value, /ignore:\s*use_build_context_synchronously/u);
    assert.doesNotMatch(value, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
  }
});
