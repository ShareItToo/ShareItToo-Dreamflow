import 'dart:async';

import 'package:shared_preferences/shared_preferences.dart';

import 'shared_persistence_sync_stub.dart'
    if (dart.library.html) 'shared_persistence_sync_web.dart';

class SharedPersistenceSync {
  static const String rentalRequestsKey = 'rental_requests';
  static const String messageThreadsKey = 'message_threads_v1';
  static const String handoverReturnStateKey = 'handover_return_state_v1';
  static const String savedItemsKey = 'saved_items';
  static const String wishlistStateKey = 'wishlist_state_v3';
  static const String rentalCartKey = 'rental_cart_v2';
  static const String localSafetyPrivacyStateKey =
      'local_safety_privacy_state_v1';
  static const String listingCatalogKey = 'items';
  static const String reviewReputationKey = 'multi_reviews_v1';
  static const String accountSecurityStateKey = 'account_security_state_v1';
  static const String legacyWishlistStateKey = 'wishlist_state_v2';
  static const String legacyRentalCartKey = 'rental_cart_v1';

  static const Set<String> _bookingKeys = {
    rentalRequestsKey,
    messageThreadsKey,
    handoverReturnStateKey,
  };

  static const Set<String> _sharedKeys = {
    ..._bookingKeys,
    savedItemsKey,
    wishlistStateKey,
    rentalCartKey,
    localSafetyPrivacyStateKey,
    listingCatalogKey,
    reviewReputationKey,
    accountSecurityStateKey,
    legacyWishlistStateKey,
    legacyRentalCartKey,
  };

  static final Map<String, Timer> _catchUpRetryTimers = <String, Timer>{};

  static Stream<String> get changes => sharedPersistenceChanges;

  static void notify(String key) {
    if (isSharedPersistenceKey(key)) {
      notifySharedPersistenceChange(key);
    }
  }

  /// Emits a refresh immediately and once more after a short recovery window.
  ///
  /// A phone can report that a transport is back before authenticated HTTP is
  /// fully usable. Screens serialize and coalesce these notifications, so the
  /// delayed pulse becomes one bounded retry instead of concurrent reloads.
  static void notifyWithCatchUpRetry(
    String key, {
    Duration retryDelay = const Duration(seconds: 4),
  }) {
    notify(key);
    if (!affectsBookingSync(key)) return;
    _catchUpRetryTimers.remove(key)?.cancel();
    _catchUpRetryTimers[key] = Timer(retryDelay, () {
      _catchUpRetryTimers.remove(key);
      notify(key);
    });
  }

  static void cancelCatchUpRetries() {
    for (final timer in _catchUpRetryTimers.values) {
      timer.cancel();
    }
    _catchUpRetryTimers.clear();
  }

  static bool affectsBookingSync(String key) => _bookingKeys.contains(key);

  static bool affectsCommunicationSync(String key) =>
      affectsBookingSync(key) ||
      key == localSafetyPrivacyStateKey ||
      key == accountSecurityStateKey;

  static bool isSharedPersistenceKey(String key) => _sharedKeys.contains(key);

  /// Converts the browser storage key used by shared_preferences_web back to
  /// the logical SharedPreferences key consumed by the app.
  static String? logicalKeyFromStorageKey(String? storageKey) {
    final value = storageKey?.trim() ?? '';
    if (value.isEmpty) return null;
    if (_sharedKeys.contains(value)) return _canonicalLogicalKey(value);

    const prefix = 'flutter.';
    if (!value.startsWith(prefix)) return null;
    final logicalKey = value.substring(prefix.length);
    return _sharedKeys.contains(logicalKey)
        ? _canonicalLogicalKey(logicalKey)
        : null;
  }

  static String _canonicalLogicalKey(String key) => switch (key) {
        legacyWishlistStateKey => wishlistStateKey,
        legacyRentalCartKey => rentalCartKey,
        _ => key,
      };

  /// SharedPreferences keeps an in-memory cache. A storage event from another
  /// browser tab must refresh that cache before screens read the new values.
  static Future<void> reloadPreferences() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
  }
}

/// Serializes screen refreshes and coalesces events that arrive while a reload
/// is already running. This prevents concurrent setState/load races without
/// dropping the final state.
class SharedPersistenceRefreshCoordinator {
  bool _inFlight = false;
  bool _queued = false;
  bool _disposed = false;

  Future<void> schedule(Future<void> Function() refresh) async {
    if (_disposed) return;
    if (_inFlight) {
      _queued = true;
      return;
    }

    _inFlight = true;
    try {
      do {
        _queued = false;
        await refresh();
      } while (!_disposed && _queued);
    } finally {
      _inFlight = false;
    }
  }

  void dispose() {
    _disposed = true;
    _queued = false;
  }
}
