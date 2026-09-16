import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dataService = readFileSync('lib/services/data_service.dart', 'utf8');
const ownerDetail = readFileSync(
  'lib/screens/ongoing_owner_detail_screen.dart',
  'utf8',
);

test('pilot runtime cannot persist or consume ride compensation', () => {
  const combined = `${dataService}\n${ownerDetail}`;
  assert.doesNotMatch(
    combined,
    /ride_compensation_v1|setRideCompensationDecision|getRideCompensationDecision|ride_comp_release|ride_comp_cancel|Fahrtvergütung/,
  );
});

test('owner return completion keeps its fail-closed evidence transition', () => {
  const start = ownerDetail.indexOf(
    'Future<void> _completeOwnerReturnWithSideEffects({',
  );
  const end = ownerDetail.indexOf(
    'Future<void> _startPickupFlowOwner(',
    start,
  );
  assert.ok(start >= 0 && end > start);
  const completion = ownerDetail.slice(start, end);

  assert.match(completion, /_guardAuthenticatedOwner\(req\.ownerId\)/);
  assert.match(completion, /_canCompleteOwnerReturn\(req\)/);
  assert.match(completion, /_guardActiveFlow\(req\.id, isReturn: true\)/);
  assert.match(completion, /_guardRequiredReturnPhotos\(req\.id\)/);
  assert.match(completion, /_acknowledgeGalleryEvidenceIfNeeded\(/);
  assert.match(completion, /DataService\.confirmReturnTransition\(/);
  assert.match(completion, /confirmationContextVerified: true/);
});

test('receipt notification refresh and owner review reminder remain active', () => {
  const start = ownerDetail.indexOf(
    'Future<void> _completeOwnerReturnWithSideEffects({',
  );
  const end = ownerDetail.indexOf(
    'Future<void> _startPickupFlowOwner(',
    start,
  );
  assert.ok(start >= 0 && end > start);
  const completion = ownerDetail.slice(start, end);

  assert.match(completion, /DataService\.addNotification\(/);
  assert.match(completion, /title: 'Buchung abgeschlossen'/);
  assert.match(completion, /AppPopup\.toast\(context, icon: Icons\.receipt_long/);
  assert.match(completion, /await _load\(\);/);
  assert.match(completion, /DataService\.scheduleReviewReminder\(/);
  assert.match(completion, /direction: 'owner_to_renter'/);
});
