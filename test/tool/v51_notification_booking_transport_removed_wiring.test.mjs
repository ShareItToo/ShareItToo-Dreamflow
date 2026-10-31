import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('lib/screens/notifications_screen.dart', 'utf8');

test('notification booking navigation cannot reload pilot transport state', () => {
  assert.doesNotMatch(
    source,
    /getSavedDeliverySelection|deliverySel|expressRequested|expressStatus|ownerDeliversAtDropoffChosen|ownerPicksUpAtReturnChosen|deliveryAddressLine|deliveryCity|deliveryLat|deliveryLng/,
  );
});

test('both resolved and fallback booking targets still navigate safely', () => {
  assert.match(source, /case NotificationTargetKind\.renterBookingDetail:/);
  assert.match(source, /DataService\.getRentalRequestById\(requestId\)/);
  assert.match(source, /DataService\.getItemById\(req\.itemId\)/);
  assert.match(source, /DataService\.getUserById\(req\.ownerId\)/);
  assert.match(source, /BookingDetailScreen\(booking: booking\)/);
  assert.match(
    source,
    /BookingDetailScreen\(\s*booking: booking,\s*viewerIsOwner: uid == req\.ownerId\)/,
  );
});

test('booking projection keeps status price policy and immutable quote facts', () => {
  assert.match(
    source,
    /DataService\.priceBreakdownForRequest\(item: it, req: req\)/,
  );
  assert.match(source, /'requestId': req\.id/);
  assert.match(source, /'rawStatus': req\.status/);
  assert.match(source, /'quotedTotalRenter': total/);
  assert.match(source, /'quotedTotalMinor': req\.quotedTotalMinor/);
  assert.match(source, /'startIso': req\.start\.toIso8601String\(\)/);
  assert.match(source, /'endIso': req\.end\.toIso8601String\(\)/);
  assert.match(source, /'policy': it\.cancellationPolicy/);
});
