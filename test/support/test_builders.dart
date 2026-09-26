import 'dart:convert';

import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/user.dart';
import 'package:shared_preferences/shared_preferences.dart';

User buildTestUser(
  String id, {
  required String name,
  String city = 'Berlin',
  String? email,
}) =>
    User(
      id: id,
      displayName: name,
      email: email ?? '$id@example.com',
      city: city,
      preferredLanguage: 'de',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 4.8,
      reviewCount: 12,
      createdAt: DateTime(2026, 1, 1),
    );

Item buildTestItem({
  required String id,
  required String ownerId,
  String title = 'Bosch Bohrmaschine',
  double pricePerDay = 20,
  double lat = 52.52,
  double lng = 13.405,
  String cancellationPolicy = 'unified',
}) =>
    Item(
      id: id,
      ownerId: ownerId,
      title: title,
      description: 'Test item',
      categoryId: 'tools',
      subcategory: 'drills',
      tags: const [],
      pricePerDay: pricePerDay,
      currency: 'EUR',
      priceUnit: 'day',
      priceRaw: pricePerDay,
      autoApplyDiscounts: false,
      longRentalDiscounts: const [],
      photos: const ['https://example.com/item.png'],
      locationText: 'Berlin',
      lat: lat,
      lng: lng,
      geohash: 'u33dc1',
      condition: 'gut',
      minDays: 1,
      maxDays: 30,
      createdAt: DateTime(2026, 1, 1),
      isActive: true,
      verificationStatus: 'verified',
      city: 'Berlin',
      country: 'DE',
      status: 'active',
      timesLent: 0,
      cancellationPolicy: cancellationPolicy,
      offersDeliveryAtDropoff: true,
      offersPickupAtReturn: true,
      offersExpressAtDropoff: true,
      maxDeliveryKmAtDropoff: 100,
      maxPickupKmAtReturn: 100,
    );

RentalRequest buildTestRequest({
  required String id,
  required String itemId,
  required String ownerId,
  required String renterId,
  String status = 'accepted',
  DateTime? start,
  DateTime? end,
  bool needsReview = false,
  String? cancelledBy,
  bool expressRequested = false,
  String? expressStatus,
  bool ownerPicksUpAtReturnChosen = false,
  String? deliveryAddressLine,
  String? deliveryCity,
  double? deliveryLat,
  double? deliveryLng,
  String? returnAddressLine,
  String? returnCity,
  double? returnLat,
  double? returnLng,
  int? quotedRentalSubtotalMinor,
  int? quotedPlatformFeeMinor,
  int? quotedTotalMinor,
}) =>
    RentalRequest(
      id: id,
      itemId: itemId,
      ownerId: ownerId,
      renterId: renterId,
      start: start ?? DateTime(2026, 7, 29, 12),
      end: end ?? DateTime(2026, 7, 31, 12),
      status: status,
      message: 'Test request',
      createdAt: DateTime(2026, 7, 20, 9),
      needsReview: needsReview,
      cancelledBy: cancelledBy,
      expressRequested: expressRequested,
      expressStatus: expressStatus,
      ownerPicksUpAtReturnChosen: ownerPicksUpAtReturnChosen,
      deliveryAddressLine: deliveryAddressLine,
      deliveryCity: deliveryCity,
      deliveryLat: deliveryLat,
      deliveryLng: deliveryLng,
      returnAddressLine: returnAddressLine,
      returnCity: returnCity,
      returnLat: returnLat,
      returnLng: returnLng,
      quotedRentalSubtotalMinor: quotedRentalSubtotalMinor,
      quotedPlatformFeeMinor: quotedPlatformFeeMinor,
      quotedTotalMinor: quotedTotalMinor,
    );

Future<void> seedCoreBookingState({
  required User owner,
  required User renter,
  required Item item,
  required List<RentalRequest> requests,
  User? currentUser,
}) async {
  SharedPreferences.setMockInitialValues({
    'users': jsonEncode([owner.toJson(), renter.toJson()]),
    'items': jsonEncode([item.toJson()]),
    'rental_requests': jsonEncode(requests.map((e) => e.toJson()).toList()),
    'qa_messages_notifs_seeded_v3_for_${owner.id}': true,
    'qa_messages_notifs_seeded_v3_for_${renter.id}': true,
    if (currentUser != null) 'currentUser': jsonEncode(currentUser.toJson()),
  });
}
