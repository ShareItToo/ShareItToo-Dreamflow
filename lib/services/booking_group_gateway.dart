import 'package:flutter/foundation.dart';

import '../models/booking_group.dart';
import 'backend_repository.dart';

abstract class BookingGroupGateway {
  Future<BookingGroupSnapshot> requestGroup(
    RentalCartGroupCandidate candidate,
  );

  Future<BookingGroupSnapshot> loadGroup(String bookingGroupId);

  Future<BookingGroupSnapshot> acceptCounteroffer(
    BookingGroupSnapshot snapshot,
  );

  Future<BookingGroupHandover> loadHandover(String bookingGroupId);
}

class BackendBookingGroupGateway implements BookingGroupGateway {
  const BackendBookingGroupGateway();

  @override
  Future<BookingGroupSnapshot> requestGroup(
    RentalCartGroupCandidate candidate,
  ) async {
    final response = await BackendRepository.requestBookingGroup(
      listingIds: candidate.listingIds,
      startDate: _date(candidate.startDate),
      endDate: _date(candidate.endDate),
      idempotencyKey: _idempotencyKey('request'),
    );
    return BookingGroupSnapshot.fromJson(response);
  }

  @override
  Future<BookingGroupSnapshot> loadGroup(String bookingGroupId) async {
    final response = await BackendRepository.getBookingGroup(bookingGroupId);
    return BookingGroupSnapshot.fromJson(response);
  }

  @override
  Future<BookingGroupSnapshot> acceptCounteroffer(
    BookingGroupSnapshot snapshot,
  ) async {
    if (!snapshot.requiresCounterofferConsent ||
        snapshot.previousQuote == null) {
      throw StateError('No exact counteroffer is awaiting consent.');
    }
    await BackendRepository.acceptBookingGroupCounteroffer(
      id: snapshot.id,
      quoteId: snapshot.quote.id,
      quoteHash: snapshot.quote.quoteHash,
      idempotencyKey: _idempotencyKey('consent'),
    );
    return loadGroup(snapshot.id);
  }

  @override
  Future<BookingGroupHandover> loadHandover(String bookingGroupId) async {
    final response =
        await BackendRepository.getBookingGroupHandoverReturn(bookingGroupId);
    return BookingGroupHandover.fromJson(response);
  }
}

@visibleForTesting
String bookingGroupTechnicalIdempotencyKey(String action, int micros) {
  final safeAction = action.replaceAll(RegExp(r'[^A-Za-z0-9_.:-]'), '_');
  return 'g3e_${safeAction}_$micros';
}

String _idempotencyKey(String action) => bookingGroupTechnicalIdempotencyKey(
      action,
      DateTime.now().microsecondsSinceEpoch,
    );

String _date(DateTime value) => DateTime(value.year, value.month, value.day)
    .toIso8601String()
    .substring(0, 10);
