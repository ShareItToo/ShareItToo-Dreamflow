import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/backend_config.dart';

void main() {
  const managedFull =
      'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp';
  const managedThumb =
      'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-thumb.webp';

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
