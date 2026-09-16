import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ownerDetail = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);
const returnStepper = readFileSync(
  new URL('../../lib/widgets/return_handover_stepper_sheet.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('owner detail cannot regain its dead remnants or transitive orphan', () => {
  for (const name of [
    '_reviewAlreadySubmitted',
    '_openMaps',
    '_confirmationCode',
    '_handoverCode',
    '_guardRequiredHandoverPhotos',
    '_confirmManualHandover',
    '_showQrOverlay',
    '_toast',
  ]) {
    assert.doesNotMatch(ownerDetail, new RegExp(`\\b${name}\\b`, 'u'));
  }
  assert.doesNotMatch(ownerDetail, /package:qr_flutter\/qr_flutter\.dart/u);
  assert.doesNotMatch(ownerDetail, /ignore:\s*unused_(?:element|field)/u);
});

test('active pickup and return keep server challenge and verification truth', () => {
  const pickup = between(
    ownerDetail,
    'Future<void> _startPickupFlowOwner(',
    'Future<void> _showReviewSheet(',
  );
  assert.match(pickup, /DataService\.issueBookingConfirmationChallenge\(/u);
  assert.match(pickup, /segment: HandoverCodeService\.segmentPickup/u);
  assert.match(pickup, /handoverCode: challenge\['code'\]/u);
  assert.match(pickup, /qrPayload: challenge\['qrPayload'\]/u);
  assert.match(pickup, /mode: ReturnFlowMode\.pickupFlow/u);

  const returnFlow = between(
    ownerDetail,
    'Future<void> _startReturnFlow(',
    'Future<void> _completeOwnerReturnWithSideEffects(',
  );
  assert.match(returnFlow, /DataService\.verifyBookingConfirmationChallenge\(/u);
  assert.match(returnFlow, /segment: HandoverCodeService\.segmentReturn/u);
  assert.match(returnFlow, /presenterRole: HandoverCodeService\.presenterRenter/u);
  assert.match(returnFlow, /mode: ReturnFlowMode\.returnFlow/u);
});

test('active return completion keeps evidence, actor and transition guards', () => {
  const completion = between(
    ownerDetail,
    'Future<void> _completeOwnerReturnWithSideEffects(',
    'Future<void> _startPickupFlowOwner(',
  );
  assert.match(completion, /_guardAuthenticatedOwner\(req\.ownerId\)/u);
  assert.match(completion, /_guardActiveFlow\(req\.id, isReturn: true\)/u);
  assert.match(completion, /_guardRequiredReturnPhotos\(req\.id\)/u);
  assert.match(completion, /_acknowledgeGalleryEvidenceIfNeeded\(/u);
  assert.match(completion, /DataService\.confirmReturnTransition\(/u);
  assert.match(completion, /confirmationContextVerified: true/u);
  assert.match(completion, /galleryAcknowledged: galleryAcknowledged/u);
});

test('stepper remains the single active QR display owner', () => {
  assert.match(returnStepper, /void _showQrOverlay\(BuildContext context, String data\)/u);
  assert.match(returnStepper, /onTap: \(\) => _showQrOverlay\(context, qrData\)/u);
  assert.match(returnStepper, /QrImageView\(/u);
});

test('owner review remains role-bound without dead local submission state', () => {
  const review = between(
    ownerDetail,
    'Future<void> _showReviewSheet(',
    '\n}\n\n/// Small non-collapsible card',
  );
  assert.match(review, /ReviewPromptSheet\.show\(/u);
  assert.match(review, /reviewerId: owner\.id/u);
  assert.match(review, /reviewedUserId: renter\.id/u);
  assert.match(review, /direction: 'owner_to_renter'/u);
  assert.match(review, /title: 'Danke für deine Bewertung!'/u);
  assert.match(review, /title: 'Bewertung abgegeben'/u);
});

test('owner-detail dead-code ratchet is permanently registered', () => {
  assert.match(
    regression,
    /node --test test\/tool\/ongoing_owner_detail_dead_code_ratchet_wiring\.test\.mjs/u,
  );
});
