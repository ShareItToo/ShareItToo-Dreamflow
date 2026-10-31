import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/private_shelf_item.dart';

const _itemId = 'shelf_item_11111111-1111-4111-8111-111111111111';
const _mediaId = '22222222-2222-4222-8222-222222222222';

Map<String, dynamic> _row() => <String, dynamic>{
      'shelfItemId': _itemId,
      'domainVersion': privateShelfDomainVersion,
      'title': 'Bohrmaschine',
      'categoryKey': 'werkzeug',
      'condition': 'good',
      'media': <Map<String, dynamic>>[
        <String, dynamic>{
          'mediaId': _mediaId,
          'mimeType': 'image/webp',
          'width': 800,
          'height': 600,
          'fullUrl': '/v1/private-shelf/$_itemId/media/$_mediaId/full',
          'thumbnailUrl':
              '/v1/private-shelf/$_itemId/media/$_mediaId/thumbnail',
          'createdAt': '2026-10-01T08:00:00.000Z',
        },
      ],
      'visibility': 'private_owner_only',
      'publicListingCreated': false,
      'reservationCreated': false,
      'bookingCreated': false,
      'paymentCreated': false,
      'externalGenerativeAiUsed': false,
      'createdAt': '2026-10-01T08:00:00.000Z',
      'updatedAt': '2026-10-01T08:00:00.000Z',
    };

void main() {
  test('accepts exact private server truth and bound media routes', () {
    final item = PrivateShelfItem.fromJson(_row());
    expect(item.shelfItemId, _itemId);
    expect(item.media.single.mediaId, _mediaId);
    expect(item.media.single.mimeType, 'image/webp');
    expect(item.condition, PrivateShelfCondition.good);
  });

  test('rejects every binding or public capability', () {
    for (final key in <String>[
      'publicListingCreated',
      'reservationCreated',
      'bookingCreated',
      'paymentCreated',
      'externalGenerativeAiUsed',
    ]) {
      expect(
        () => PrivateShelfItem.fromJson(<String, dynamic>{
          ..._row(),
          key: true,
        }),
        throwsFormatException,
        reason: key,
      );
    }
    expect(
      () => PrivateShelfItem.fromJson(<String, dynamic>{
        ..._row(),
        'visibility': 'public',
      }),
      throwsFormatException,
    );
  });

  test('rejects missing, extra and malformed server fields', () {
    final missing = _row()..remove('paymentCreated');
    expect(() => PrivateShelfItem.fromJson(missing), throwsFormatException);
    expect(
      () => PrivateShelfItem.fromJson(<String, dynamic>{
        ..._row(),
        'ownerId': 'leak',
      }),
      throwsFormatException,
    );
    expect(
      () => PrivateShelfItem.fromJson(<String, dynamic>{
        ..._row(),
        'condition': 'unknown',
      }),
      throwsFormatException,
    );
  });

  test('rejects forged private media paths and duplicate media ids', () {
    final forged = _row();
    forged['media'] = <Map<String, dynamic>>[
      <String, dynamic>{
        ...(forged['media'] as List).single as Map,
        'fullUrl': '/v1/uploads/public.webp',
      },
    ];
    expect(() => PrivateShelfItem.fromJson(forged), throwsFormatException);

    final duplicate = _row();
    duplicate['media'] = <dynamic>[
      ...duplicate['media'] as List,
      ...(duplicate['media'] as List),
    ];
    expect(() => PrivateShelfItem.fromJson(duplicate), throwsFormatException);
  });
}
