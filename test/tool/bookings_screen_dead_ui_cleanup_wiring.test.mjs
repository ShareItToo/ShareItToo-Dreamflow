import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bookings = readFileSync(
  new URL('../../lib/screens/bookings_screen.dart', import.meta.url),
  'utf8',
);
const bookingDetail = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);
const ownerRequests = readFileSync(
  new URL('../../lib/screens/owner_requests_screen.dart', import.meta.url),
  'utf8',
);

test('bookings list cannot regain superseded parallel actions and helpers', () => {
  for (const removedSymbol of [
    '_canCancelUpcomingBooking',
    '_openItemListing',
    '_buildQuickActionsRow',
    '_privacyHintForCard',
    '_formatTwoUnitsCountdown',
    '_formatGermanDateTime',
    '_getStatusColor',
  ]) {
    assert.doesNotMatch(bookings, new RegExp(`\\b${removedSymbol}\\b`));
  }
  assert.doesNotMatch(bookings, /updateRentalRequestStatusWithActor/);
});

test('active booking list loading navigation statuses and reviews stay wired', () => {
  assert.match(bookings, /DataService\.getRentalRequestsForRenter\(user\.id\)/);
  assert.match(bookings, /BookingDetailScreen\(booking: booking\)/);
  assert.match(bookings, /if \(status == 'accepted'\) return 'upcoming'/);
  assert.match(bookings, /if \(status == 'running'\) return 'ongoing'/);
  assert.match(
    bookings,
    /status == 'completed'\s+\|\|\s+status == 'cancelled'\s+\|\|\s+status == 'declined'/,
  );
  assert.match(bookings, /Widget\? _buildSmallInlineAction/);
  assert.match(bookings, /ReviewPromptSheet\.show\(/);
});

test('renter booking list cannot reintroduce disabled transport state', () => {
  for (const forbidden of [
    'getSavedDeliverySelection',
    'deliveryByItemId',
    'deliverySel',
    'expressRequested',
    'expressStatus',
    'expressRequestedAt',
    'offersDeliveryAtDropoff',
    'offersPickupAtReturn',
    'ownerDeliversAtDropoffChosen',
    'ownerPicksUpAtReturnChosen',
    'deliveryAddressLine',
    'deliveryCity',
    'deliveryLat',
    'deliveryLng',
  ]) {
    assert.doesNotMatch(bookings, new RegExp(forbidden, 'u'));
  }
  assert.match(
    bookings,
    /DataService\.priceBreakdownForRequest\(item: it, req: r\)/u,
  );
  assert.match(bookings, /handoverLocationLabel/u);
  assert.match(bookings, /returnLocationLabel/u);
});

test('renter cancellation remains in the canonical booking detail flow', () => {
  assert.match(bookingDetail, /title: 'Buchung stornieren\?'/);
  assert.match(
    bookingDetail,
    /DataService\.updateRentalRequestStatusWithActor\([\s\S]*?status: 'cancelled',[\s\S]*?cancelledBy: 'renter'/,
  );
  assert.match(bookingDetail, /title: 'Buchung storniert'/);
});

test('owner list cannot regain superseded privacy and formatting helpers', () => {
  for (const removedSymbol of [
    '_deliveryByItemId',
    '_privacyHintForOwner',
    '_openItemOverlay',
    '_formatTwoUnits',
    'deliverySelections',
  ]) {
    assert.doesNotMatch(ownerRequests, new RegExp(`\\b${removedSymbol}\\b`));
  }
  assert.doesNotMatch(ownerRequests, /getSavedDeliverySelection/);
});

test('active owner booking decisions details and reviews stay wired', () => {
  assert.match(ownerRequests, /DataService\.getRentalRequestsForOwner\(owner\.id\)/);
  assert.match(ownerRequests, /Widget _buildStatusChipForCard\(/);
  assert.match(ownerRequests, /Widget\? _buildInlineAction\(/);
  assert.match(ownerRequests, /showPrivatePilotOwnerAcceptanceDialog\(/);
  assert.match(ownerRequests, /OngoingOwnerDetailScreen\(/);
  assert.match(ownerRequests, /ReviewPromptSheet\.show\(/);
});
