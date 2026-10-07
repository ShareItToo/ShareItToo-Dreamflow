import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/rental_request.dart';

void main() {
  test('platform contract receipt metadata survives JSON and copy operations',
      () {
    final request = RentalRequest.fromJson({
      'id': 'booking-1',
      'itemId': 'item-1',
      'ownerId': 'owner-1',
      'renterId': 'renter-1',
      'start': '2026-09-01T00:00:00.000Z',
      'end': '2026-09-02T00:00:00.000Z',
      'platformContract': {
        'id': 'contract-1',
        'state': 'platformContractAccepted',
        'contractVersion': 'V5.2-2026-08-16',
        'receipt': {
          'artifactSha256':
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'downloadPath': '/v1/platform-contracts/contract-1/receipt',
        },
      },
    });

    expect(
      request.platformContract?['state'],
      'platformContractAccepted',
    );
    expect(
      (request.toJson()['platformContract'] as Map)['contractVersion'],
      'V5.2-2026-08-16',
    );
    expect(
      request.copyWith().platformContract?['id'],
      'contract-1',
    );
  });
}
