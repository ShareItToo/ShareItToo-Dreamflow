import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('obsolete owner handover gate cannot return', () => {
  assert.doesNotMatch(source, /\b_canStartOwnerHandover\b/);
});

test('upcoming action still requires the confirmed start time', () => {
  const upcoming = between(
    "if (category == 'upcoming') ...[",
    "] else if (category == 'ongoing' && !req.needsReview) ...[",
  );
  assert.match(
    upcoming,
    /if \(!await _timeConfirmedForStart\(\s*req: req,\s*isReturn: false,\s*\)\) \{\s*return;\s*\}/,
  );
  assert.match(upcoming, /await _startPickupFlowOwner\(/);
});

test('pickup keeps challenge, code, QR and pickup stepper wiring', () => {
  const pickup = between(
    'Future<void> _startPickupFlowOwner(',
    'Future<void> _showReviewSheet(',
  );
  assert.match(pickup, /DataService\.issueBookingConfirmationChallenge\(/);
  assert.match(pickup, /segment: HandoverCodeService\.segmentPickup/);
  assert.match(pickup, /handoverCode: challenge\['code'\]/);
  assert.match(pickup, /qrPayload: challenge\['qrPayload'\]/);
  assert.match(pickup, /mode: ReturnFlowMode\.pickupFlow/);

  const stepperCalls =
    source.match(/ReturnHandoverStepperSheet\.push\(/g) ?? [];
  assert.equal(stepperCalls.length, 2);
});

test('return keeps active status, counterparty and evidence guards', () => {
  assert.match(source, /bool _canCompleteOwnerReturn\(RentalRequest req\)/);
  const completion = between(
    'Future<void> _completeOwnerReturnWithSideEffects(',
    'Future<void> _startPickupFlowOwner(',
  );
  assert.match(completion, /if \(!_canCompleteOwnerReturn\(req\)\)/);
  assert.match(completion, /_guardRequiredReturnPhotos\(req\.id\)/);
  assert.match(completion, /_acknowledgeGalleryEvidenceIfNeeded\(/);
  assert.match(completion, /DataService\.confirmReturnTransition\(/);
  assert.match(completion, /confirmationContextVerified: true/);

  const returnFlow = between(
    'Future<void> _startReturnFlow(',
    'Future<void> _completeOwnerReturnWithSideEffects(',
  );
  assert.match(returnFlow, /DataService\.verifyBookingConfirmationChallenge\(/);
  assert.match(returnFlow, /segment: HandoverCodeService\.segmentReturn/);
  assert.match(
    returnFlow,
    /presenterRole: HandoverCodeService\.presenterRenter/,
  );
  assert.match(returnFlow, /mode: ReturnFlowMode\.returnFlow/);
});

test('owner cancellation remains actor-bound', () => {
  const cancellation = between('final cat = _categoryFor(req);', '                  default:');
  assert.match(cancellation, /case 'cancel':/);
  assert.match(cancellation, /DataService\s*\.updateRentalRequestStatusWithActor\(/);
  assert.match(cancellation, /status: 'cancelled'/);
  assert.match(cancellation, /cancelledBy: 'owner'/);
});

test('owner review remains role-bound', () => {
  const review = between(
    'Future<void> _showReviewSheet(',
    '\n}\n\n/// Small non-collapsible card',
  );
  assert.match(review, /ReviewPromptSheet\.show\(/);
  assert.match(review, /reviewerId: owner\.id/);
  assert.match(review, /reviewedUserId: renter\.id/);
  assert.match(review, /direction: 'owner_to_renter'/);
});
