import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detail = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);

test('booking detail cannot read or recreate disabled transport state', () => {
  for (const forbidden of [
    'ownerDeliversAtDropoffChosen',
    'ownerPicksUpAtReturnChosen',
    'expressRequested',
    'expressStatus',
    'expressFee',
    'deliveryAddressLine',
    'deliveryCity',
    'deliveryLat',
    'deliveryLng',
    'estimateDistanceKm',
    'getRideCompensationDecision',
    'ride_comp_',
    'Fahrtvergütung',
    'Prioritätszuschlag',
    'Lieferung (Abgabe)',
  ]) {
    assert.doesNotMatch(detail, new RegExp(forbidden, 'u'));
  }
});

test('booking detail consistently presents self pickup and self return', () => {
  assert.match(detail, /Du holst den Artikel selbst ab\./u);
  assert.match(
    detail,
    /Du holst den Artikel selbst ab, wenn deine Anfrage akzeptiert wird\./u,
  );
  assert.match(detail, /Du bringst den Artikel selbst zurück\./u);
  assert.match(detail, /modeLabel: 'Abholung'/u);
  assert.doesNotMatch(detail, /Der Vermieter bringt dir den Artikel/u);
  assert.doesNotMatch(detail, /Der Vermieter holt den Artikel wieder ab/u);
});

test('pickup and return maps keep the exact-address privacy boundary', () => {
  assert.ok((detail.match(/ApproxLocationMap\(/gu) ?? []).length >= 3);
  assert.doesNotMatch(detail, /AddressPrivacy\.shouldRevealExactAddress\(/u);
  assert.match(detail, /widget\.booking\['exactAddressRevealed'\] == true/u);
  assert.match(detail, /AddressPrivacy\.privacyNoticePickup\(\)/u);
  assert.match(detail, /_confirmedLocationText\(false\)/u);
  assert.match(detail, /_confirmedLocationText\(true\)/u);
});

test('local fallback price has rent and platform contribution only', () => {
  assert.match(
    detail,
    /\(rentalSubtotalLocal \+ feeLocal\)\.toStringAsFixed\(2\)/u,
  );
  assert.match(
    detail,
    /final payoutEst = boundPrice\?\.ownerPayout \?\?\s*double\.parse\(rentalSubtotalLocal\.toStringAsFixed\(2\)\)/u,
  );
  assert.match(
    detail,
    /final payoutOwner = boundPrice\?\.ownerPayout \?\?\s*double\.parse\(rentalSubtotal\.toStringAsFixed\(2\)\)/u,
  );
  assert.match(detail, /'Inkl\. Plattformbeitrag\.'/u);
});

test('secure pickup and return remain bound to photos challenges and roles', () => {
  assert.equal(
    (detail.match(/ReturnHandoverStepperSheet\.push\(/gu) ?? []).length,
    2,
  );
  assert.match(detail, /issueBookingConfirmationChallenge\(/u);
  assert.match(detail, /verifyBookingConfirmationChallenge\(/u);
  assert.match(detail, /_acknowledgeGalleryEvidenceIfNeeded\(/u);
  assert.match(detail, /_finalizePickupTransition\(/u);
  assert.match(detail, /_finalizeReturnTransition\(/u);
  assert.match(detail, /confirmationContextVerified:/u);
  assert.match(detail, /HandoverCodeService\.segmentPickup/u);
  assert.match(detail, /HandoverCodeService\.segmentReturn/u);
});

test('chat cancellation review and immutable price snapshot remain active', () => {
  assert.match(detail, /MessageThreadScreen\(/u);
  assert.match(detail, /updateRentalRequestStatusWithActor\(/u);
  assert.match(detail, /cancelledBy: 'renter'/u);
  assert.match(detail, /ReviewPromptSheet\.show\(/u);
  assert.match(detail, /class _BoundBookingPriceSnapshot/u);
  assert.match(detail, /boundPrice\?\.total/u);
  assert.match(detail, /boundPrice\?\.ownerPayout/u);
});
