import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/synthetic_clone_booking_service.dart';

const _bookingId = '11111111-1111-4111-8111-111111111111';
const _challengeId = '22222222-2222-4222-8222-222222222222';

Map<String, dynamic> _marker() => <String, dynamic>{
      'syntheticTestOnly': true,
      'binding': 'non-binding',
      'contractEligible': false,
      'monetaryEffectMinor': 0,
      'externalSideEffects': false,
    };

Map<String, dynamic> _booking({
  String status = 'requested',
  List<String> pickup = const [],
  List<String> returned = const [],
}) {
  Map<String, dynamic> photoList(List<String> slots) => <String, dynamic>{
        'pickup': slots
            .map((slot) => <String, dynamic>{'slot': slot})
            .toList(),
        'return': returned
            .map((slot) => <String, dynamic>{'slot': slot})
            .toList(),
      };
  return <String, dynamic>{
    'id': _bookingId,
    'listingId': 'synthetic_clone_listing_wp255',
    'ownerId': '33333333-3333-4333-8333-333333333333',
    'renterId': '44444444-4444-4444-8444-444444444444',
    'status': status,
    'marker': _marker(),
    'listing': <String, dynamic>{'id': 'synthetic_clone_listing_wp255'},
    'photos': photoList(pickup),
    'confirmations': <String, dynamic>{},
  };
}

void main() {
  test('accepts exact QR-v3 and rejects wrong segment or role', () {
    final qr =
        'shareittoo:v3:pickup:owner:$_challengeId:246810:$_bookingId';
    expect(
      SyntheticCloneBookingService.isValidV3QrPayload(
        qr,
        bookingId: _bookingId,
        challengeId: _challengeId,
      ),
      isTrue,
    );
    expect(
      SyntheticCloneBookingService.isValidV3QrPayload(
        qr.replaceFirst(':pickup:', ':handover:'),
      ),
      isFalse,
    );
    expect(
      SyntheticCloneBookingService.isValidV3QrPayload(
        qr.replaceFirst(':owner:', ':staff:'),
      ),
      isFalse,
    );
  });

  test('rejects invalid marker, duplicate slots, and incomplete returned lane', () {
    expect(
      () => SyntheticCloneBooking.fromJson({..._booking(), 'marker': {}}),
      throwsFormatException,
    );
    expect(
      () => SyntheticCloneBooking.fromJson(
        _booking(pickup: const ['overview', 'overview']),
      ),
      throwsFormatException,
    );
    expect(
      () => SyntheticCloneBooking.fromJson(
        _booking(status: 'returned', pickup: syntheticClonePhotoSlots),
      ),
      throwsFormatException,
    );
  });

  test('accepts requested and fully documented returned envelope', () {
    final requested = SyntheticCloneBooking.fromJson(_booking());
    expect(requested.status, 'requested');
    expect(requested.isComplete, isFalse);
    final returned = SyntheticCloneBooking.fromJson(
      _booking(
        status: 'returned',
        pickup: syntheticClonePhotoSlots,
        returned: syntheticClonePhotoSlots,
      ),
    );
    expect(returned.isComplete, isTrue);
  });
}
