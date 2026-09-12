import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ownerDetail = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);

test('owner detail cannot read or act on disabled transport state', () => {
  for (const forbidden of [
    'getSavedDeliverySelection',
    'updateRentalRequestExpress',
    'expressRequested',
    'expressStatus',
    'expressFee',
    'ownerDeliversAtDropoffChosen',
    'ownerPicksUpAtReturnChosen',
    'deliveryAddressLine',
    'deliveryCity',
    'deliverySel',
    'ApproxLocationMap',
    'AddressPrivacy',
    'Prioritätslieferung',
  ]) {
    assert.doesNotMatch(ownerDetail, new RegExp(forbidden, 'u'));
  }
});

test('owner detail presents only private-pilot self pickup and return', () => {
  assert.match(ownerDetail, /Der Mieter holt den Artikel selbst ab\./u);
  assert.match(ownerDetail, /Der Mieter bringt den Artikel selbst zurück\./u);
  assert.doesNotMatch(ownerDetail, /Du lieferst den Artikel/u);
  assert.doesNotMatch(ownerDetail, /Du holst den Artikel wieder ab/u);
});

test('owner price snapshot no longer receives a transient transport selection', () => {
  assert.match(
    ownerDetail,
    /DataService\.priceBreakdownForRequest\(item: item, req: req\)/u,
  );
  assert.match(ownerDetail, /final totalPaid = breakdown\.totalRenter/u);
  assert.match(ownerDetail, /final fee = breakdown\.platformFee/u);
});

test('binding acceptance and decline actions remain active', () => {
  assert.match(ownerDetail, /_ownerAcceptanceDeadlineValid\(req\)/u);
  assert.match(ownerDetail, /showPrivatePilotOwnerAcceptanceDialog\(/u);
  assert.match(ownerDetail, /commitPrivatePilotOwnerAcceptance\(/u);
  assert.match(ownerDetail, /DataService\.updateRentalRequestStatus\(/u);
  assert.match(ownerDetail, /requestId: req\.id,[\s\S]*?status: 'declined'/u);
});

test('secure pickup return cancellation and review flows remain active', () => {
  assert.equal(
    (ownerDetail.match(/ReturnHandoverStepperSheet\.push\(/gu) ?? []).length,
    2,
  );
  assert.match(ownerDetail, /issueBookingConfirmationChallenge\(/u);
  assert.match(ownerDetail, /verifyBookingConfirmationChallenge\(/u);
  assert.match(ownerDetail, /confirmReturnTransition\(/u);
  assert.match(ownerDetail, /confirmationContextVerified: true/u);
  assert.match(ownerDetail, /updateRentalRequestStatusWithActor\(/u);
  assert.match(ownerDetail, /cancelledBy: 'owner'/u);
  assert.match(ownerDetail, /ReviewPromptSheet\.show\(/u);
});

test('confirmed handover and return locations remain visible', () => {
  assert.match(ownerDetail, /_confirmedLocationText\(false\)/u);
  assert.match(ownerDetail, /_confirmedLocationText\(true\)/u);
  assert.match(ownerDetail, /_confirmedLocationMapsUrl\(false\)/u);
  assert.match(ownerDetail, /_confirmedLocationMapsUrl\(true\)/u);
});
