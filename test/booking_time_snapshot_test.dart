import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/booking_time_snapshot.dart';
import 'package:lendify/models/rental_request.dart';

void main() {
  test('Berlin spring transition rejects the nonexistent 02:xx hour', () {
    expect(
      () => BookingTimeSnapshot.fromLocal(
        handover: DateTime.utc(2026, 3, 29, 2, 30),
        returned: DateTime.utc(2026, 3, 30, 10),
      ),
      throwsFormatException,
    );
  });

  test('Berlin DST boundaries serialize explicit UTC instants', () {
    final before = BookingTimeSnapshot.fromLocal(
      handover: DateTime.utc(2026, 3, 29, 1, 30),
      returned: DateTime.utc(2026, 3, 29, 3, 30),
    );
    expect(before.handoverAt, DateTime.utc(2026, 3, 29, 0, 30));
    expect(before.returnAt, DateTime.utc(2026, 3, 29, 1, 30));
    expect(before.toJson()['handoverAt'], '2026-03-29T00:30:00.000Z');
    expect(before.toJson()['returnAt'], '2026-03-29T01:30:00.000Z');

    expect(
      () => BookingTimeSnapshot.fromLocal(
        handover: DateTime.utc(2026, 10, 25, 2, 30),
        returned: DateTime.utc(2026, 10, 26, 10),
      ),
      throwsFormatException,
    );
  });

  test('DST rules remain correct across year boundaries', () {
    final snapshot = BookingTimeSnapshot.fromLocal(
      handover: DateTime.utc(2027, 1, 1, 9),
      returned: DateTime.utc(2027, 7, 1, 9),
    );
    expect(snapshot.handoverAt, DateTime.utc(2027, 1, 1, 8));
    expect(snapshot.returnAt, DateTime.utc(2027, 7, 1, 7));
  });

  test('readback rejects floating instants and old versions', () {
    expect(
      () => BookingTimeSnapshot.fromJson({
        'version': BookingTimeSnapshot.version,
        'timezone': BookingTimeSnapshot.timezone,
        'handoverAt': '2026-09-01T09:00:00',
        'returnAt': '2026-09-02T09:00:00Z',
      }),
      throwsFormatException,
    );
    expect(
      () => BookingTimeSnapshot.fromJson({
        'version': 'booking-time-old',
        'timezone': BookingTimeSnapshot.timezone,
        'handoverAt': '2026-09-01T07:00:00Z',
        'returnAt': '2026-09-02T07:00:00Z',
      }),
      throwsFormatException,
    );
  });

  test('rental request serializes and restores the same quote-bound snapshot',
      () {
    final snapshot = BookingTimeSnapshot.fromLocal(
      handover: DateTime.utc(2026, 9, 1, 9),
      returned: DateTime.utc(2026, 9, 2, 17),
    );
    final request = RentalRequest(
      id: 'request-1',
      itemId: 'item-1',
      ownerId: 'owner-1',
      renterId: 'renter-1',
      start: DateTime.utc(2026, 9, 1),
      end: DateTime.utc(2026, 9, 2),
      timeSnapshot: snapshot,
    );
    final restored = RentalRequest.fromJson(request.toJson());
    expect(restored.timeSnapshot?.toJson(), snapshot.toJson());
  });

  test('quote readback must echo the exact selected snapshot', () {
    final expected = BookingTimeSnapshot.fromLocal(
      handover: DateTime.utc(2026, 9, 1, 9),
      returned: DateTime.utc(2026, 9, 2, 17),
    );
    expect(
      () => requireMatchingBookingTimeSnapshot(
        expected: expected,
        actual: null,
      ),
      throwsFormatException,
    );
    expect(
      () => requireMatchingBookingTimeSnapshot(
        expected: expected,
        actual: expected.toJson()..['handoverAt'] = '2026-09-01T08:00:00.000Z',
      ),
      throwsFormatException,
    );
    expect(
      requireMatchingBookingTimeSnapshot(
        expected: expected,
        actual: expected.toJson(),
      ).toJson(),
      expected.toJson(),
    );
  });
}
