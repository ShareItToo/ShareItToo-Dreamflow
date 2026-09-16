import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('obsolete local return-renter code helper cannot return', () => {
  assert.doesNotMatch(source, /\b_returnRenterCode\b/);
});

test('active pickup-owner code remains booking bound', () => {
  const helper = between(
    'String _confirmationCode({',
    'Future<Map<String, dynamic>?> _issueSecureChallenge(',
  );
  assert.match(helper, /HandoverCodeService\.codeForTitleAndStart\(/);
  assert.match(helper, /bookingId: _computeBookingId\(\)/);
  assert.match(helper, /String _pickupOwnerCode\(\) => _confirmationCode\(/);
  assert.match(helper, /segment: HandoverCodeService\.segmentPickup/);
  assert.match(helper, /presenterRole: HandoverCodeService\.presenterOwner/);
  assert.ok((source.match(/_pickupOwnerCode\(\)/g) ?? []).length > 1);
});

test('owner return stepper uses the server challenge and verifier', () => {
  const flow = between(
    'Future<void> _startOwnerReturnFlow() async',
    'Future<void> _startPickupFlow() async',
  );
  assert.match(
    flow,
    /challenge = await _issueSecureChallenge\(\s*HandoverCodeService\.segmentReturn/,
  );
  assert.match(flow, /ReturnHandoverStepperSheet\.push\(/);
  assert.match(flow, /handoverCode: challenge\?\['code'\]/);
  assert.match(flow, /qrPayload: challenge\?\['qrPayload'\]/);
  assert.match(flow, /_verifySecureChallenge\(/);
  assert.match(flow, /segment: HandoverCodeService\.segmentReturn/);
  assert.match(flow, /presenterRole: HandoverCodeService\.presenterRenter/);
  assert.match(flow, /mode: ReturnFlowMode\.returnFlow/);
});

test('direct return QR path remains server verified', () => {
  const scan = between(
    'Future<void> _startScanRenterQrForReturn() async',
    'Future<void> _confirmManualReturnByCode() async',
  );
  assert.match(scan, /if \(!_canCompleteBookingReturn\)/);
  assert.match(scan, /_verifySecureChallenge\(/);
  assert.match(scan, /segment: HandoverCodeService\.segmentReturn/);
  assert.match(scan, /presenterRole: HandoverCodeService\.presenterRenter/);
  assert.match(scan, /confirmationContextVerified: true/);
});

test('direct return manual-code path remains server verified', () => {
  const manual = between(
    'Future<void> _confirmManualReturnByCode() async',
    'Future<bool> _acknowledgeGalleryEvidenceIfNeeded(',
  );
  assert.match(manual, /if \(!_canCompleteBookingReturn\)/);
  assert.match(manual, /_verifySecureChallenge\(/);
  assert.match(manual, /segment: HandoverCodeService\.segmentReturn/);
  assert.match(manual, /presenterRole: HandoverCodeService\.presenterRenter/);
  assert.match(manual, /code: entered/);
  assert.match(manual, /confirmationContextVerified: true/);
});
