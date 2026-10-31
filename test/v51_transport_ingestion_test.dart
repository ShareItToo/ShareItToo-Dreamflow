import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';

void main() {
  test('legacy listing transport offers are neutralized when read', () {
    final item = Item.fromJson({
      'id': 'listing-transport-tamper',
      'ownerId': 'owner',
      'title': 'Bohrmaschine',
      'description': 'Test',
      'categoryId': 'tools',
      'subcategory': 'drills',
      'tags': <String>[],
      'pricePerDay': 10,
      'currency': 'EUR',
      'photos': <String>[],
      'locationText': 'Berlin',
      'lat': 52.52,
      'lng': 13.405,
      'geohash': 'u33',
      'condition': 'good',
      'createdAt': '2026-08-17T00:00:00.000Z',
      'isActive': true,
      'verificationStatus': 'approved',
      'city': 'Berlin',
      'country': 'DE',
      'offersDeliveryAtDropoff': true,
      'offersPickupAtReturn': true,
      'offersExpressAtDropoff': true,
      'maxDeliveryKmAtDropoff': 500,
      'maxPickupKmAtReturn': 500,
    });

    expect(item.offersDeliveryAtDropoff, isFalse);
    expect(item.offersPickupAtReturn, isFalse);
    expect(item.offersExpressAtDropoff, isFalse);
    expect(item.maxDeliveryKmAtDropoff, isNull);
    expect(item.maxPickupKmAtReturn, isNull);
    expect(item.toJson(), containsPair('offersDeliveryAtDropoff', false));
  });

  test('legacy booking transport and express state are neutralized when read', () {
    final request = RentalRequest.fromJson({
      'id': 'booking-transport-tamper',
      'itemId': 'listing',
      'ownerId': 'owner',
      'renterId': 'renter',
      'start': '2026-08-20T10:00:00.000Z',
      'end': '2026-08-21T10:00:00.000Z',
      'status': 'accepted',
      'ownerDeliversAtDropoffChosen': true,
      'ownerPicksUpAtReturnChosen': true,
      'expressRequested': true,
      'expressStatus': 'accepted',
      'expressFee': 999,
      'expressRequestedAt': '2026-08-17T10:00:00.000Z',
      'expressConfirmedAt': '2026-08-17T10:01:00.000Z',
    });

    expect(request.ownerDeliversAtDropoffChosen, isFalse);
    expect(request.ownerPicksUpAtReturnChosen, isFalse);
    expect(request.expressRequested, isFalse);
    expect(request.expressStatus, isNull);
    expect(request.expressFee, 0);
    expect(request.expressRequestedAt, isNull);
    expect(request.expressConfirmedAt, isNull);
    expect(request.toJson(), containsPair('expressRequested', false));
    expect(request.toJson(), containsPair('expressStatus', null));
  });
}
