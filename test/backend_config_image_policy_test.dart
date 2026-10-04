import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/backend_config.dart';

void main() {
  const managedFull =
      'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp';
  const managedThumb =
      'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-thumb.webp';

  test('dedicated synthetic image uses the exact configured public URL only',
      () {
    final photo = BackendConfig.uri(
      '/uploads/synthetic_web_catalog_placeholder_v1.webp',
    ).toString();
    expect(BackendConfig.isPublicCatalogImageUrl(photo), isTrue);
    expect(BackendConfig.isManagedImageUrl(photo), isTrue,
        reason: 'private AppImage must use its credential gate, even in debug');
    expect(BackendConfig.isPermittedRuntimeImageUrl(photo, releaseMode: true),
        isTrue);
    expect(BackendConfig.isManagedListingImageUrl(photo), isFalse,
        reason: 'a synthetic illustration is not a managed product proof');
    expect(BackendConfig.isPublicCatalogImageUrl(managedFull), isTrue);
    expect(BackendConfig.isPublicCatalogImageUrl(managedThumb), isFalse);
    for (final denied in [
      photo.replaceFirst('_v1.', '_v2.'),
      photo.replaceFirst('_v1.', '_v1-full.'),
      photo.replaceFirst('_v1.', '_v1-thumb.'),
      photo.replaceFirst('synthetic_', 'prefix_synthetic_'),
      '$photo.extra',
      '$photo?token=x',
      '$photo?',
      '$photo#x',
      '$photo#',
      photo.replaceFirst('synthetic_', '%73ynthetic_'),
      photo.replaceFirst('.webp', '%2ewebp'),
      photo.replaceFirst('/uploads/', '/uploads/../uploads/'),
      photo.replaceFirst('/uploads/', '/uploads//'),
      photo.replaceFirst('/uploads/', '/private/'),
      photo.replaceFirst('://', '://user@'),
      photo.replaceFirst('shareittoo.com', 'foreign.invalid'),
      photo.replaceFirst('synthetic_web_catalog_placeholder_v1', 'arbitrary'),
    ]) {
      expect(BackendConfig.isPublicCatalogImageUrl(denied), isFalse,
          reason: denied);
      expect(BackendConfig.isManagedImageUrl(denied), isFalse, reason: denied);
    }
  });

  test('release image policy accepts only SIT-managed upload variants', () {
    expect(
      BackendConfig.isPermittedRuntimeImageUrl(
        managedFull,
        releaseMode: true,
      ),
      isTrue,
    );
    expect(
      BackendConfig.isPermittedRuntimeImageUrl(
        managedThumb,
        releaseMode: true,
      ),
      isTrue,
    );
    expect(
      BackendConfig.isPermittedRuntimeImageUrl(
        'https://images.unsplash.com/example.jpg',
        releaseMode: true,
      ),
      isFalse,
    );
    expect(
      BackendConfig.isPermittedRuntimeImageUrl(
        'https://attacker.invalid/example.jpg',
        releaseMode: true,
      ),
      isFalse,
    );
  });

  test('debug image exception is limited to explicit http transports', () {
    expect(
      BackendConfig.isPermittedRuntimeImageUrl(
        'https://images.unsplash.com/example.jpg',
        releaseMode: false,
      ),
      isTrue,
    );
    expect(
      BackendConfig.isPermittedRuntimeImageUrl(
        'javascript:alert(1)',
        releaseMode: false,
      ),
      isFalse,
    );
    expect(
      BackendConfig.isPermittedRuntimeImageUrl(
        'ftp://example.invalid/example.jpg',
        releaseMode: false,
      ),
      isFalse,
    );
  });
}
