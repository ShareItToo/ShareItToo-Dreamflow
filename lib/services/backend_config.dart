import 'package:flutter/foundation.dart';

class BackendConfig {
  // Dedicated server-allowlisted illustration, never authentic listing proof.
  static const _syntheticCatalogImageStorageName =
      'synthetic_web_catalog_placeholder_v1.webp';

  static const bool enabled = bool.fromEnvironment(
    'SIT_BACKEND_ENABLED',
    defaultValue: kReleaseMode,
  );

  static const String apiBaseUrl = String.fromEnvironment(
    'SIT_API_BASE_URL',
    defaultValue: 'https://shareittoo.com/api/v1',
  );

  static Uri uri(String path) {
    final base = apiBaseUrl.endsWith('/')
        ? apiBaseUrl.substring(0, apiBaseUrl.length - 1)
        : apiBaseUrl;
    final suffix = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$suffix');
  }

  static bool isManagedListingImageUrl(String value) {
    return _isManagedUploadImageUrl(value, allowThumbnail: false);
  }

  /// Anonymous catalog reads accept only exact managed full-image URLs or the
  /// dedicated synthetic illustration, without credentials, query parameters,
  /// fragments, or alternate encodings.
  /// The upload endpoint, not this URL check, authorizes public visibility.
  static bool isPublicCatalogImageUrl(String value) {
    if (_isSyntheticCatalogImageUrl(value)) return true;
    if (!isManagedListingImageUrl(value)) return false;
    final candidate = Uri.parse(value);
    return value == uri('/uploads/${candidate.pathSegments.last}').toString();
  }

  static bool isManagedImageUrl(String value) {
    // Classify the exact fixture as managed so private/debug surfaces retain
    // their credential gate; only explicit public catalog opt-in is anonymous.
    return _isSyntheticCatalogImageUrl(value) ||
        _isManagedUploadImageUrl(value, allowThumbnail: true);
  }

  static bool _isSyntheticCatalogImageUrl(String value) =>
      value == uri('/uploads/$_syntheticCatalogImageStorageName').toString();

  /// Release builds may fetch image bytes only from SIT's managed upload
  /// origin. Private reads remain authenticated; public catalog reads also
  /// require [isPublicCatalogImageUrl]. Debug builds retain demo-image support
  /// for local QA, but that exception can never be enabled at runtime in a
  /// signed release build.
  static bool isPermittedRuntimeImageUrl(
    String value, {
    bool? releaseMode,
  }) {
    if (isManagedImageUrl(value)) return true;
    final isRelease = releaseMode ?? kReleaseMode;
    if (isRelease) return false;
    try {
      final candidate = Uri.parse(value);
      return candidate.scheme == 'https' || candidate.scheme == 'http';
    } catch (_) {
      return false;
    }
  }

  static String? managedMessageImageUrl(String? storageName) {
    final value = (storageName ?? '').trim();
    if (!RegExp(
      r'^[0-9a-f-]{36}-(?:full|thumb)\.(?:webp|jpe?g|png)$',
      caseSensitive: false,
    ).hasMatch(value)) {
      return null;
    }
    return uri('/uploads/${Uri.encodeComponent(value)}').toString();
  }

  static bool _isManagedUploadImageUrl(
    String value, {
    required bool allowThumbnail,
  }) {
    try {
      final candidate = Uri.parse(value);
      final base = Uri.parse(apiBaseUrl);
      final basePath = base.path.endsWith('/')
          ? base.path.substring(0, base.path.length - 1)
          : base.path;
      final prefix = '$basePath/uploads/';
      if (candidate.scheme != base.scheme ||
          candidate.host != base.host ||
          candidate.port != base.port ||
          !candidate.path.startsWith(prefix)) {
        return false;
      }
      final storageName =
          Uri.decodeComponent(candidate.path.substring(prefix.length));
      final variant = allowThumbnail ? r'(?:full|thumb)' : 'full';
      return RegExp(
        '^[0-9a-f-]{36}-$variant\\.(?:webp|jpe?g|png)\$',
        caseSensitive: false,
      ).hasMatch(storageName);
    } catch (_) {
      return false;
    }
  }

  static Uri get realtimeUri {
    final httpUri = uri('/realtime');
    return httpUri.replace(scheme: httpUri.scheme == 'https' ? 'wss' : 'ws');
  }
}
