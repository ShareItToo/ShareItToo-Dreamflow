/// Platform-independent contract for accepted persistence notifications.
abstract final class SharedPersistenceKeys {
  static const rentalRequestsKey = 'rental_requests';
  static const messageThreadsKey = 'message_threads_v1';
  static const handoverReturnStateKey = 'handover_return_state_v1';
  static const savedItemsKey = 'saved_items';
  static const wishlistStateKey = 'wishlist_state_v3';
  static const rentalCartKey = 'rental_cart_v2';
  static const localSafetyPrivacyStateKey = 'local_safety_privacy_state_v1';
  static const listingCatalogKey = 'items';
  static const reviewReputationKey = 'multi_reviews_v1';
  static const accountSecurityStateKey = 'account_security_state_v1';
  static const profileStateKey = 'profile_state_v1';
  static const legacyWishlistStateKey = 'wishlist_state_v2';
  static const legacyRentalCartKey = 'rental_cart_v1';

  static const sharedKeys = <String>{
    rentalRequestsKey,
    messageThreadsKey,
    handoverReturnStateKey,
    savedItemsKey,
    wishlistStateKey,
    rentalCartKey,
    localSafetyPrivacyStateKey,
    listingCatalogKey,
    reviewReputationKey,
    accountSecurityStateKey,
    profileStateKey,
    legacyWishlistStateKey,
    legacyRentalCartKey,
  };

  static String canonicalKey(String key) => switch (key) {
        legacyWishlistStateKey => wishlistStateKey,
        legacyRentalCartKey => rentalCartKey,
        _ => key,
      };
}
