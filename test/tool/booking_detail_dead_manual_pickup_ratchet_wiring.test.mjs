import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);
const stepper = readFileSync(
  new URL('../../lib/widgets/return_handover_stepper_sheet.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('booking detail cannot regain its dead direct manual-pickup chain', () => {
  for (const name of [
    '_ownerPickupFailCount',
    '_manualPickupAllowed',
    '_showManualPickupEntry',
    '_manualPickupCodeCtrl',
    '_canStartBookingHandover',
    '_startScanOwnerQr',
    '_hasRequiredHandoverPhotos',
    '_hasRequiredReturnPhotos',
    '_guardRequiredHandoverPhotos',
    '_guardRequiredReturnPhotos',
    '_guardActiveFlow',
    '_confirmManualPickupAsRenter',
    '_confirmManualPickupByCode',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`, 'u'));
  }
  assert.doesNotMatch(source, /getPickupFailCountForBooking\(/u);
  assert.doesNotMatch(source, /ignore:\s*unused_(?:element|field)/u);
});

test('active pickup remains one server-verified stepper flow', () => {
  const pickup = between(
    'Future<void> _startPickupFlow() async',
    'Future<void> _downloadReceiptPdf() async',
  );
  assert.match(pickup, /ReturnHandoverStepperSheet\.push\(/u);
  assert.match(pickup, /mode: ReturnFlowMode\.pickupFlow/u);
  assert.match(pickup, /_issueSecureChallenge\(/u);
  assert.match(pickup, /_verifySecureChallenge\(/u);
  assert.match(pickup, /segment: HandoverCodeService\.segmentPickup/u);
  assert.match(pickup, /presenterRole: HandoverCodeService\.presenterOwner/u);
  assert.match(pickup, /_guardAuthenticatedRenter\(\)/u);
  assert.match(pickup, /_acknowledgeGalleryEvidenceIfNeeded\(/u);
  assert.match(pickup, /_finalizePickupTransition\(/u);
  assert.match(pickup, /confirmationContextVerified: counterpartyConfirmed/u);
});

test('return QR and manual-code controls remain active and role-bound', () => {
  assert.match(source, /onPressed: _startScanRenterQrForReturn/u);
  assert.match(source, /onPressed: _confirmManualReturnByCode/u);

  const returnQr = between(
    'Future<void> _startScanRenterQrForReturn() async',
    'Future<void> _confirmManualReturnByCode() async',
  );
  const returnManual = between(
    'Future<void> _confirmManualReturnByCode() async',
    'Future<bool> _acknowledgeGalleryEvidenceIfNeeded(',
  );
  for (const value of [returnQr, returnManual]) {
    assert.match(value, /presenterRole: HandoverCodeService\.presenterRenter/u);
    assert.match(value, /_finalizeReturnTransition\(/u);
    assert.match(value, /confirmationContextVerified: true/u);
  }
});

test('stepper still hard-gates four role-bound evidence photos', () => {
  assert.match(stepper, /enum _StepKind \{ photos, damage, codes \}/u);
  assert.match(stepper, /_presenterEvidenceCount \+ _checkoutPhotos\.length >= 4/u);
  assert.match(stepper, /if \(_presenterEvidenceCount < 4\) return false/u);
});

test('manual-pickup ratchet is permanently registered', () => {
  assert.match(
    regression,
    /node --test test\/tool\/booking_detail_dead_manual_pickup_ratchet_wiring\.test\.mjs/u,
  );
});
