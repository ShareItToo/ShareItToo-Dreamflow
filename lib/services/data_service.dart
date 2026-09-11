import 'dart:convert';
import 'dart:async';
import 'dart:collection';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter/foundation.dart'
    show debugPrint, kDebugMode, listEquals, visibleForTesting;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/address_privacy.dart';
import 'package:lendify/services/handover_code.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/blocked_users_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/services/private_pilot_pricing.dart';
import 'package:lendify/services/private_pilot_cancellation_policy.dart';
import 'package:lendify/services/private_pilot_return_policy.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/models/category.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/rental_cart.dart';
import 'package:lendify/models/review.dart';
import 'package:lendify/models/multi_criteria_review.dart';
import 'package:lendify/services/review_metrics_service.dart';
import 'package:lendify/models/message.dart';
import 'package:lendify/utils/booking_flow_policy.dart';
import 'package:lendify/utils/total_subtitle.dart';

class _QueuedLocalMutation {
  final Future<Object?> Function() operation;
  final void Function(Object? value) complete;
  final void Function(Object error, StackTrace stackTrace) completeError;

  const _QueuedLocalMutation({
    required this.operation,
    required this.complete,
    required this.completeError,
  });
}

class _LocalMutationQueue {
  final Queue<_QueuedLocalMutation> _pending = Queue<_QueuedLocalMutation>();
  bool _running = false;

  Future<T> run<T>(Future<T> Function() operation) {
    final result = Completer<T>();
    _pending.add(_QueuedLocalMutation(
      operation: () async => operation(),
      complete: (value) => result.complete(value as T),
      completeError: result.completeError,
    ));
    _startIfIdle();
    return result.future;
  }

  void _startIfIdle() {
    if (_running) return;
    _running = true;
    unawaited(_drain());
  }

  Future<void> _drain() async {
    while (_pending.isNotEmpty) {
      final queued = _pending.removeFirst();
      Object? value;
      Object? failure;
      StackTrace? failureStack;
      try {
        value = await queued.operation();
      } catch (error, stackTrace) {
        failure = error;
        failureStack = stackTrace;
      }
      final becameIdle = _pending.isEmpty;
      if (becameIdle) _running = false;
      if (failure != null) {
        queued.completeError(failure, failureStack!);
      } else {
        queued.complete(value);
      }
      if (becameIdle) {
        if (_pending.isNotEmpty) _startIfIdle();
        return;
      }
    }
    _running = false;
  }
}

/// Mutable fields of the device-local profile fallback.
///
/// Identity, authorization, verification, moderation, payout and reputation
/// fields are intentionally absent. A `null` map value is an explicit clear.
enum CurrentUserProfileField {
  displayName,
  phone,
  photoURL,
  bio,
  city,
  country,
  preferredLanguage,
  languages,
  interests,
  workTitle,
  hobbies,
  homeLocation,
  favoriteSong,
  showWork,
  showHobbies,
  showHomeLocation,
  showBioPublic,
  showLanguagesPublic,
  showInterestsPublic,
  showFavoriteSong,
  homeLat,
  homeLng,
  birthDate,
  socialX,
  socialFacebook,
  socialInstagram,
  socialTiktok,
  socialSnapchat,
  addressStreet,
  addressHouseNumber,
  addressPostalCode,
  addressCity,
  addressCountry,
  addressExtra,
}

enum AccountProfileMutationFailureKind {
  rejected,
  localUnavailable,
  outcomeUnknown,
  principalChanged,
}

class AccountProfileMutationFailure implements Exception {
  final AccountProfileMutationFailureKind kind;
  final String? code;
  final bool remoteAccepted;

  const AccountProfileMutationFailure._(
    this.kind, {
    this.code,
    this.remoteAccepted = false,
  });

  const AccountProfileMutationFailure.rejected(String code)
      : this._(AccountProfileMutationFailureKind.rejected, code: code);

  const AccountProfileMutationFailure.localUnavailable(
    String? code, {
    bool remoteAccepted = false,
  }) : this._(
          AccountProfileMutationFailureKind.localUnavailable,
          code: code,
          remoteAccepted: remoteAccepted,
        );

  const AccountProfileMutationFailure.outcomeUnknown([String? code])
      : this._(AccountProfileMutationFailureKind.outcomeUnknown, code: code);

  const AccountProfileMutationFailure.principalChanged({
    bool remoteAccepted = false,
  }) : this._(
          AccountProfileMutationFailureKind.principalChanged,
          remoteAccepted: remoteAccepted,
        );
}

class AccountProfileMutationResult {
  final User user;
  final bool remoteAccepted;

  const AccountProfileMutationResult({
    required this.user,
    required this.remoteAccepted,
  });
}

enum AccountListingMutationFailureKind {
  rejected,
  localUnavailable,
  outcomeUnknown,
  principalChanged,
}

class AccountListingMutationFailure implements Exception {
  final AccountListingMutationFailureKind kind;
  final String? code;
  final bool remoteAccepted;

  const AccountListingMutationFailure._(
    this.kind, {
    this.code,
    this.remoteAccepted = false,
  });

  const AccountListingMutationFailure.rejected(String code)
      : this._(AccountListingMutationFailureKind.rejected, code: code);

  const AccountListingMutationFailure.localUnavailable(
    String? code, {
    bool remoteAccepted = false,
  }) : this._(
          AccountListingMutationFailureKind.localUnavailable,
          code: code,
          remoteAccepted: remoteAccepted,
        );

  const AccountListingMutationFailure.outcomeUnknown([String? code])
      : this._(AccountListingMutationFailureKind.outcomeUnknown, code: code);

  const AccountListingMutationFailure.principalChanged({
    bool remoteAccepted = false,
  }) : this._(
          AccountListingMutationFailureKind.principalChanged,
          remoteAccepted: remoteAccepted,
        );
}

class AccountListingMutationResult {
  final Item? item;
  final bool remoteAccepted;

  const AccountListingMutationResult({
    required this.item,
    required this.remoteAccepted,
  });
}

class _OwnedListingCreateEvent {
  final AuthSessionOwner owner;
  final Item item;
  final bool draft;

  const _OwnedListingCreateEvent({
    required this.owner,
    required this.item,
    required this.draft,
  });
}

class _AccountListingMutationAttempt {
  bool remoteAccepted = false;
}

class _LocalWishlistState {
  final int revision;
  final List<Map<String, dynamic>> lists;
  final Map<String, String> assignments;
  final Set<String> savedItemIds;

  const _LocalWishlistState({
    required this.revision,
    required this.lists,
    required this.assignments,
    this.savedItemIds = const <String>{},
  });
}

class _LocalWishlistRegistry {
  final int revision;
  final Map<String, _LocalWishlistState> principals;
  final Map<String, dynamic> quarantinedPrincipals;
  final bool legacyGuestQuarantined;

  _LocalWishlistRegistry({
    required this.revision,
    required this.principals,
    Map<String, dynamic> quarantinedPrincipals = const <String, dynamic>{},
    this.legacyGuestQuarantined = false,
  }) : quarantinedPrincipals = Map<String, dynamic>.from(
          quarantinedPrincipals,
        );
}

class _LocalRentalCartBucket {
  final RentalCart cart;
  final String? syncOwnerToken;

  const _LocalRentalCartBucket({
    required this.cart,
    this.syncOwnerToken,
  });
}

class _LocalRentalCartRegistry {
  final int revision;
  final Map<String, _LocalRentalCartBucket> principals;
  final Map<String, dynamic> quarantinedPrincipals;
  final bool legacyGuestQuarantined;

  _LocalRentalCartRegistry({
    required this.revision,
    required this.principals,
    Map<String, dynamic> quarantinedPrincipals = const <String, dynamic>{},
    this.legacyGuestQuarantined = false,
  }) : quarantinedPrincipals = Map<String, dynamic>.from(
          quarantinedPrincipals,
        );
}

class _LocalBookingSelectionRegistry {
  final int revision;
  final Map<String, Map<String, dynamic>> principals;
  final Map<String, dynamic> quarantinedPrincipals;
  final bool legacyGuestQuarantined;

  _LocalBookingSelectionRegistry({
    required this.revision,
    required this.principals,
    Map<String, dynamic> quarantinedPrincipals = const <String, dynamic>{},
    this.legacyGuestQuarantined = false,
  }) : quarantinedPrincipals = Map<String, dynamic>.from(
          quarantinedPrincipals,
        );
}

class RentalRequestTransitionResult {
  final bool success;
  final bool pausedForReview;
  final String? errorMessage;

  const RentalRequestTransitionResult._({
    required this.success,
    required this.pausedForReview,
    this.errorMessage,
  });

  const RentalRequestTransitionResult.success()
      : this._(success: true, pausedForReview: false);

  const RentalRequestTransitionResult.failure(String message)
      : this._(success: false, pausedForReview: false, errorMessage: message);

  const RentalRequestTransitionResult.paused(String message)
      : this._(success: false, pausedForReview: true, errorMessage: message);
}

class DataService {
  static const bool _allowDemoSeedDataInRuntime = false;
  static const int _maxLocalStageAPrincipals = 12;
  static const String _categoriesKey = 'categories';
  static const String _itemsKey = 'items';
  static const String _usersKey = 'users';
  static const String _currentUserKey = 'currentUser';
  static const String _accountDeletedKey = 'account_deleted_v1';
  static const String _bookingSelectionsKey = 'booking_selections';
  static const String _bookingSelectionPrincipalStateKey =
      'booking_selections_v2';
  static const String _rentalRequestsKey = 'rental_requests';
  static const String _timelineEventsKey = 'timeline_events';
  static const String _notificationsKey = 'notifications';
  static const String _reviewRemindersKey = 'review_reminders_v1';
  static const String _reviewsKey = 'reviews';
  static const String _multiReviewsKey = 'multi_reviews_v1';
  static const String _feedbacksKey = 'feedbacks';
  static const String _seedFiveFlagKey = 'seed_five_showcase_applied';
  static const String _purgedToOwnedFlagKey = 'purged_to_owned_once';
  static const String _requestsLastSeenKey = 'requests_last_seen_by_owner';
  static const String _readRequestsKey =
      'read_requests_v1'; // userId -> Set<requestId>
  static const String _handoverFailCountsKey = 'handover_fail_counts';
  static const String _handoverBannersKey = 'handover_banners';
  // Wishlists
  static const String _wishlistsMetaKey = 'wishlists_meta_v1';
  static const String _wishlistAssignKey = 'wishlist_assign_v1';
  static const String _wishlistStateKey = 'wishlist_state_v2';
  static const String _wishlistPrincipalStateKey = 'wishlist_state_v3';
  static const String _rentalCartKey = 'rental_cart_v1';
  static const String _projectCartKey = 'project_cart_v1';
  static const String _rentalCartSyncOwnerKey = 'rental_cart_sync_owner_v1';
  static const String _rentalCartPrincipalStateKey = 'rental_cart_v2';
  static const String _messageThreadsKey = 'message_threads_v1';
  static const int _maxLocalMessageThreads = 1000;
  static const int _maxMessagesPerThread = 5000;
  static const int _maxLocalNotifications = 5000;
  static const int _maxLocalTimelineEvents = 5000;
  static const int _maxLocalRentalRequests = 1000;
  static const int _maxLocalListings = 1000;
  static const int _maxLocalListingDocumentBytes = 32 * 1024 * 1024;
  static const int _maxLocalReviews = 1000;
  static const int _maxLocalReviewDocumentBytes = 8 * 1024 * 1024;
  static const int _maxLocalReviewNoteLength = 2000;
  static const int _maxLocalUsers = 1000;
  static const int _maxLocalUserDocumentBytes = 16 * 1024 * 1024;
  static const int _maxLocalProfileStringLength = 10000;
  static const int _maxLocalProfilePhotoUrlLength = 8 * 1024 * 1024;
  static const int _maxLocalProfileListEntries = 100;
  static const String _qaMessagesAndNotifsSeedFlagPrefix =
      'qa_messages_notifs_seeded_v3_for_';
  static final Set<String> _qaSeedUsersInProgress = <String>{};
  static final _LocalMutationQueue _wishlistMutationQueue =
      _LocalMutationQueue();
  static final _LocalMutationQueue _rentalCartMutationQueue =
      _LocalMutationQueue();
  static final _LocalMutationQueue _bookingSelectionMutationQueue =
      _LocalMutationQueue();
  static final _LocalMutationQueue _operationalMutationQueue =
      _LocalMutationQueue();
  static final _LocalMutationQueue _rentalRequestMutationQueue =
      _LocalMutationQueue();
  static final _LocalMutationQueue _handoverMutationQueue =
      _LocalMutationQueue();
  static final _LocalMutationQueue _listingMutationQueue =
      _LocalMutationQueue();
  static final _LocalMutationQueue _reviewMutationQueue = _LocalMutationQueue();
  static final _LocalMutationQueue _accountProfileMutationQueue =
      _LocalMutationQueue();
  static bool _failNextListingPersistenceForTesting = false;
  static bool _clearSessionDuringNextListingPersistenceForTesting = false;
  static bool _failNextReviewPersistenceForTesting = false;
  static bool _failNextAccountProfilePersistenceForTesting = false;
  static bool _clearSessionDuringNextAccountProfilePersistenceForTesting =
      false;

  @visibleForTesting
  static int get maxLocalReviewsForTesting => _maxLocalReviews;

  @visibleForTesting
  static int get maxLocalUsersForTesting => _maxLocalUsers;

  static Future<T> _runWishlistForCurrentPrincipal<T>(
    Future<T> Function(LocalPrincipalIdentity principal) operation, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    if (expectedOwner != null) {
      await expectedOwner.assertCurrent();
      return _wishlistMutationQueue.run(() async {
        await expectedOwner.assertCurrent();
        final result = await operation(expectedOwner.principal);
        await expectedOwner.assertCurrent();
        return result;
      });
    }
    final principal = await _currentLocalPrincipal();
    return _wishlistMutationQueue.run(() => operation(principal));
  }

  static Future<LocalPrincipalIdentity> _currentLocalPrincipal() =>
      LocalPrincipalScope.current();

  static Future<User> _requireCurrentOperationalUser({
    String? requestedUserId,
  }) async {
    final current = await getCurrentUser();
    if (current == null || current.id.trim().isEmpty) {
      throw StateError(
          'Für lokale Kontodaten ist eine Anmeldung erforderlich.');
    }
    if (current.isDeactivated) {
      throw StateError('Das lokale Konto ist deaktiviert.');
    }
    if (!QaRuntimeService.isEnabled) {
      final session = await AuthService.readSession();
      if (!_sessionMatchesOperationalUser(
        session,
        userId: current.id,
        email: current.email,
      )) {
        throw StateError(
          'Das lokale Profil gehört nicht zur aktuellen Kontositzung.',
        );
      }
    }
    final requested = requestedUserId?.trim();
    if (requested != null &&
        requested.isNotEmpty &&
        requested != current.id.trim()) {
      throw StateError('Lokale Kontodaten gehören zu einem anderen Konto.');
    }
    return current;
  }

  static bool _sessionMatchesOperationalUser(
    AuthSession? session, {
    required String userId,
    required String email,
  }) {
    if (session == null) return false;
    final sessionUserId = (session.userId ?? '').trim();
    if (sessionUserId.isNotEmpty) return sessionUserId == userId.trim();
    if (BackendConfig.enabled) return false;
    final normalizedEmail = email.trim().toLowerCase();
    return normalizedEmail.isNotEmpty &&
        session.email.trim().toLowerCase() == normalizedEmail;
  }

  /// Side-effect-free session recheck for queued or remote work. Unlike
  /// [getCurrentUser], this never initializes QA fixtures while another local
  /// mutation queue is already held.
  static Future<void> _assertCurrentOperationalUserId(
    String expectedUserId, {
    String? expectedEmail,
  }) async {
    final expected = expectedUserId.trim();
    if (expected.isEmpty) {
      throw StateError(
          'Für lokale Kontodaten ist eine Anmeldung erforderlich.');
    }
    if (QaRuntimeService.isEnabled) {
      final runtimeUser = QaRuntimeService.runtimeUserJson;
      if (runtimeUser == null ||
          (runtimeUser['id'] ?? '').toString().trim() != expected) {
        throw StateError('Die lokale Kontositzung hat sich geändert.');
      }
      return;
    }
    final session = await AuthService.readSession();
    final sessionUserId = (session?.userId ?? '').trim();
    var normalizedEmail = expectedEmail?.trim().toLowerCase() ?? '';
    User? localCurrent;
    if (sessionUserId.isEmpty && !BackendConfig.enabled) {
      // Local debug accounts historically bind the authenticated principal by
      // normalized email. Recheck the exact cached profile without triggering
      // fixture initialization while the caller's mutation queue is held.
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_currentUserKey);
      if (raw == null || raw.isEmpty) {
        throw StateError('Die lokale Kontositzung hat sich geändert.');
      }
      try {
        final decoded = jsonDecode(raw);
        if (decoded is! Map) {
          throw const FormatException('Invalid current user');
        }
        localCurrent = User.fromJson(Map<String, dynamic>.from(decoded));
        final currentEmail = localCurrent.email.trim().toLowerCase();
        if (localCurrent.id.trim() != expected ||
            currentEmail.isEmpty ||
            (normalizedEmail.isNotEmpty && currentEmail != normalizedEmail)) {
          throw StateError('Die lokale Kontositzung hat sich geändert.');
        }
        normalizedEmail = currentEmail;
      } catch (error) {
        if (error is StateError) rethrow;
        throw StateError('Die lokale Kontositzung hat sich geändert.');
      }
    }
    if (!_sessionMatchesOperationalUser(
      session,
      userId: expected,
      email: normalizedEmail,
    )) {
      throw StateError('Die lokale Kontositzung hat sich geändert.');
    }
    if (sessionUserId.isNotEmpty) return;
    if (localCurrent == null) {
      throw StateError('Die lokale Kontositzung hat sich geändert.');
    }
  }

  static Future<User> _assertSessionOwnerOperationalUser(
    AuthSessionOwner owner,
    String expectedUserId,
  ) async {
    final normalizedUserId = expectedUserId.trim();
    if (normalizedUserId.isEmpty ||
        !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw StateError('Die lokale Kontositzung hat sich geändert.');
    }
    final current = await readCurrentUserForSessionTransition();
    final ownerUserId = (owner.userId ?? '').trim();
    final ownerEmail = owner.email.trim().toLowerCase();
    if (current == null ||
        current.isDeactivated ||
        current.id.trim() != normalizedUserId ||
        ownerUserId.isNotEmpty && ownerUserId != normalizedUserId ||
        ownerEmail.isEmpty ||
        current.email.trim().toLowerCase() != ownerEmail ||
        !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw StateError('Die lokale Kontositzung hat sich geändert.');
    }
    return current;
  }

  static RentalRequest _requireCachedRequestParticipant(
    List<RentalRequest> requests, {
    required String requestId,
    required String userId,
  }) {
    for (final request in requests) {
      if (request.id == requestId) {
        if (!_isRequestParticipant(request, userId)) {
          throw StateError('Die lokale Buchung gehört zu einem anderen Konto.');
        }
        return request;
      }
    }
    throw StateError('Die lokale Buchung wurde nicht gefunden.');
  }

  static bool _isRequestParticipant(RentalRequest request, String userId) =>
      request.ownerId == userId || request.renterId == userId;

  static bool _isThreadParticipant(MessageThread thread, String userId) =>
      thread.user1Id == userId || thread.user2Id == userId;

  static Future<(User, RentalRequest)> _requireCurrentRequestParticipant(
    String requestId,
  ) async {
    final current = await _requireCurrentOperationalUser();
    final requests = await _getAllRentalRequests();
    RentalRequest? request;
    for (final candidate in requests) {
      if (candidate.id == requestId) {
        request = candidate;
        break;
      }
    }
    if (request == null) {
      throw StateError('Die lokale Buchung wurde nicht gefunden.');
    }
    if (!_isRequestParticipant(request, current.id)) {
      throw StateError('Die lokale Buchung gehört zu einem anderen Konto.');
    }
    return (current, request);
  }

  static Future<T> _runHandoverForParticipant<T>(
    (User, RentalRequest) participant,
    Future<T> Function() operation,
  ) =>
      _handoverMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(participant.$1.id);
        return operation();
      });

  @visibleForTesting
  static String localPrincipalTokenForSession(AuthSession? session) =>
      LocalPrincipalScope.tokenForSession(session);

  static Future<void> _writePreferenceString(
    SharedPreferences prefs,
    String key,
    String value,
  ) async {
    final accepted = await prefs.setString(key, value);
    if (!accepted || prefs.getString(key) != value) {
      throw StateError('Local persistence failed for $key.');
    }
  }

  static Future<void> _removePreferenceKey(
    SharedPreferences prefs,
    String key,
  ) async {
    final accepted = await prefs.remove(key);
    if (!accepted || prefs.containsKey(key)) {
      throw StateError('Local persistence removal failed for $key.');
    }
  }

  static List<Item> _decodeListingsStrict(String raw) {
    if (utf8.encode(raw).length > _maxLocalListingDocumentBytes) {
      throw const FormatException('Invalid local listings document');
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List || decoded.length > _maxLocalListings) {
        throw const FormatException('Invalid local listings document');
      }
      final ids = <String>{};
      final items = <Item>[];
      for (final entry in decoded) {
        if (entry is! Map) {
          throw const FormatException('Invalid local listing entry');
        }
        final map = Map<String, dynamic>.from(entry);
        final tags = map['tags'];
        final photos = map['photos'];
        final discounts = map['longRentalDiscounts'];
        if (tags != null &&
            (tags is! List ||
                tags.length > 50 ||
                tags.any((value) => value is! String || value.length > 200))) {
          throw const FormatException('Invalid local listing tags');
        }
        if (photos != null &&
            (photos is! List ||
                photos.length > 20 ||
                photos.any((value) => value is! String))) {
          throw const FormatException('Invalid local listing photos');
        }
        if (discounts != null) {
          if (discounts is! List || discounts.length > 20) {
            throw const FormatException('Invalid local listing discounts');
          }
          for (final value in discounts) {
            if (value is! Map ||
                value['days'] is! num ||
                value['discountPercent'] is! num) {
              throw const FormatException('Invalid local listing discount');
            }
            final days = (value['days'] as num).toInt();
            final percent = (value['discountPercent'] as num).toDouble();
            if (days <= 0 ||
                !percent.isFinite ||
                percent < 0 ||
                percent > 100) {
              throw const FormatException('Invalid local listing discount');
            }
          }
        }
        final item = Item.fromJson(map);
        if (item.id.trim().isEmpty ||
            item.id.length > 256 ||
            !ids.add(item.id) ||
            item.ownerId.trim().isEmpty ||
            item.ownerId.length > 256 ||
            item.title.trim().isEmpty ||
            item.title.length > 300 ||
            item.description.length > 20000 ||
            item.categoryId.trim().isEmpty ||
            item.categoryId.length > 256 ||
            item.subcategory.length > 256 ||
            item.locationText.length > 1000 ||
            item.city.length > 256 ||
            item.country.length > 32 ||
            !item.pricePerDay.isFinite ||
            item.pricePerDay < 0 ||
            !item.priceRaw.isFinite ||
            item.priceRaw < 0 ||
            !item.lat.isFinite ||
            !item.lng.isFinite ||
            item.catalogRevision < 1 ||
            !const <String>{'active', 'paused', 'ended', 'draft'}
                .contains(item.status)) {
          throw const FormatException('Invalid local listing entry');
        }
        items.add(item);
      }
      return items;
    } catch (error) {
      if (error is FormatException) rethrow;
      throw const FormatException('Invalid local listings document');
    }
  }

  static Future<void> _persistListings(
    SharedPreferences prefs,
    List<Item> items, {
    Future<void> Function()? verifyAuthorization,
  }) async {
    if (items.length > _maxLocalListings) {
      throw StateError('Der lokale Anzeigenkatalog ist voll.');
    }
    final encoded = jsonEncode(items.map((item) => item.toJson()).toList());
    _decodeListingsStrict(encoded);
    final previous = prefs.getString(_itemsKey);
    try {
      await verifyAuthorization?.call();
      if (_failNextListingPersistenceForTesting) {
        _failNextListingPersistenceForTesting = false;
        throw StateError('Synthetic local listing persistence failure.');
      }
      await _writePreferenceString(prefs, _itemsKey, encoded);
      if (_clearSessionDuringNextListingPersistenceForTesting) {
        _clearSessionDuringNextListingPersistenceForTesting = false;
        await AuthService.clearSession();
      }
      await verifyAuthorization?.call();
    } catch (_) {
      final current = prefs.getString(_itemsKey);
      if (current != previous) {
        final restored = previous == null
            ? await prefs.remove(_itemsKey)
            : await prefs.setString(_itemsKey, previous);
        if (!restored || prefs.getString(_itemsKey) != previous) {
          throw StateError(
            'Lokale Anzeigen konnten nicht gespeichert oder wiederhergestellt werden.',
          );
        }
      }
      rethrow;
    }
  }

  static List<Item> _readListingsStrict(SharedPreferences prefs) {
    final raw = prefs.getString(_itemsKey);
    return raw == null ? <Item>[] : _decodeListingsStrict(raw);
  }

  @visibleForTesting
  static void failNextListingPersistenceForTesting() {
    _failNextListingPersistenceForTesting = true;
  }

  @visibleForTesting
  static void clearSessionDuringNextListingPersistenceForTesting() {
    _clearSessionDuringNextListingPersistenceForTesting = true;
  }

  /// Read-only backend refreshes update the local cache but must not announce
  /// another logical data change. Announcing those cache writes makes every
  /// listening screen fetch again, which can create a refresh feedback loop.
  @visibleForTesting
  static bool shouldAnnounceMessageThreadCacheWrite({
    required bool readOnlyRemoteRefresh,
  }) =>
      !readOnlyRemoteRefresh;

  @visibleForTesting
  static bool canExposeCachedCurrentUser({
    required bool backendEnabled,
    required bool hasSession,
  }) =>
      !backendEnabled || hasSession;

  @visibleForTesting
  static User? cachedCurrentUserForSession({
    required String? encodedUser,
    required AuthSession? session,
  }) {
    if (session == null || encodedUser == null || encodedUser.isEmpty) {
      return null;
    }
    try {
      final decoded = jsonDecode(encodedUser);
      if (decoded is! Map) return null;
      final user = User.fromJson(Map<String, dynamic>.from(decoded));
      final sessionUserId = (session.userId ?? '').trim();
      if (sessionUserId.isEmpty || user.id.trim() != sessionUserId) return null;
      final sessionEmail = session.email.trim().toLowerCase();
      if (sessionEmail.isEmpty ||
          user.email.trim().toLowerCase() != sessionEmail) {
        return null;
      }
      return user;
    } catch (_) {
      return null;
    }
  }

  static Future<User?> getCachedCurrentUserForSession(
      AuthSession? session) async {
    if (session == null) return null;
    try {
      final prefs = await SharedPreferences.getInstance();
      return cachedCurrentUserForSession(
        encodedUser: prefs.getString(_currentUserKey),
        session: session,
      );
    } catch (_) {
      return null;
    }
  }

  static Future<void> _persistMessageThreads(
    SharedPreferences prefs,
    List<dynamic> threads, {
    bool announceChange = true,
  }) async {
    if (threads.length > _maxLocalMessageThreads ||
        threads.any((entry) => entry is! Map)) {
      throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
    }
    final payload = threads
        .map((entry) => Map<String, dynamic>.from(entry as Map))
        .toList(growable: false);
    final parsed = payload.map(_parseMessageThreadStrict).toList();
    if (parsed.map((entry) => entry.id).toSet().length != parsed.length) {
      throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
    }
    await _writePreferenceString(
      prefs,
      _messageThreadsKey,
      jsonEncode(payload),
    );
    if (announceChange) {
      SharedPersistenceSync.notify(SharedPersistenceSync.messageThreadsKey);
    }
  }

  static Future<String?> _readMessageThreads(
    SharedPreferences prefs, {
    Duration remoteTimeout = const Duration(seconds: 20),
  }) async {
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      try {
        final remote = await BackendRepository.getMessageThreads(
          timeout: remoteTimeout,
        );
        final encoded = jsonEncode(remote);
        _decodeMessageThreadsStrict(encoded);
        await _persistMessageThreads(
          prefs,
          remote,
          announceChange: shouldAnnounceMessageThreadCacheWrite(
            readOnlyRemoteRefresh: true,
          ),
        );
        return encoded;
      } catch (error) {
        debugPrint('[DataService] remote message load failed: $error');
      }
    }
    return prefs.getString(_messageThreadsKey);
  }

  static List<MessageThread> _decodeMessageThreadsStrict(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! List || decoded.length > _maxLocalMessageThreads) {
      throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
    }
    try {
      final parsed = decoded
          .map(
            (entry) => _parseMessageThreadStrict(
              Map<String, dynamic>.from(entry as Map),
            ),
          )
          .toList();
      if (parsed.map((entry) => entry.id).toSet().length != parsed.length) {
        throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
      }
      return parsed;
    } catch (error) {
      if (error is FormatException) rethrow;
      throw FormatException(
        'Ungültiger lokaler Nachrichtenverlauf.',
        error,
      );
    }
  }

  static MessageThread _parseMessageThreadStrict(
    Map<String, dynamic> raw,
  ) {
    const requiredStringKeys = <String>{
      'id',
      'requestId',
      'itemId',
      'itemTitle',
      'user1Id',
      'user2Id',
      'createdAt',
    };
    if (requiredStringKeys.any((key) => raw[key] is! String)) {
      throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
    }
    final id = (raw['id'] as String).trim();
    final user1Id = (raw['user1Id'] as String).trim();
    final user2Id = (raw['user2Id'] as String).trim();
    final threadType = (raw['threadType'] as String?)?.trim().toLowerCase();
    final isSupport = threadType == 'support';
    if (id.isEmpty ||
        id.length > 256 ||
        user1Id.isEmpty ||
        user2Id.isEmpty ||
        user1Id == user2Id ||
        (raw['itemTitle'] as String).length > 500 ||
        (!isSupport &&
            ((raw['requestId'] as String).trim().isEmpty ||
                (raw['itemId'] as String).trim().isEmpty))) {
      throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
    }
    if (DateTime.tryParse(raw['createdAt'] as String) == null ||
        (raw['lastMessageAt'] != null &&
            DateTime.tryParse(raw['lastMessageAt'].toString()) == null) ||
        (raw['handoverAt'] != null &&
            DateTime.tryParse(raw['handoverAt'].toString()) == null) ||
        (raw['returnAt'] != null &&
            DateTime.tryParse(raw['returnAt'].toString()) == null) ||
        (raw['otherUserLastActive'] != null &&
            DateTime.tryParse(raw['otherUserLastActive'].toString()) == null)) {
      throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
    }
    final messages = raw['messages'];
    final archived = raw['archivedForUserIds'];
    final deleted = raw['deletedForUserIds'];
    if (messages is! List ||
        messages.length > _maxMessagesPerThread ||
        messages.any((entry) => entry is! Map) ||
        (archived != null &&
            (archived is! List || archived.any((entry) => entry is! String))) ||
        (deleted != null &&
            (deleted is! List || deleted.any((entry) => entry is! String)))) {
      throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
    }
    final participants = <String>{user1Id, user2Id};
    final archivedIds = (archived as List? ?? const <dynamic>[])
        .map((entry) => (entry as String).trim())
        .toList(growable: false);
    final deletedIds = (deleted as List? ?? const <dynamic>[])
        .map((entry) => (entry as String).trim())
        .toList(growable: false);
    if (archivedIds.toSet().length != archivedIds.length ||
        deletedIds.toSet().length != deletedIds.length ||
        archivedIds.any((entry) => !participants.contains(entry)) ||
        deletedIds.any((entry) => !participants.contains(entry))) {
      throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
    }
    final messageIds = <String>{};
    for (final entry in messages) {
      final message = Map<String, dynamic>.from(entry as Map);
      if (message['id'] is! String ||
          message['senderId'] is! String ||
          message['text'] is! String ||
          message['timestamp'] is! String ||
          message['isRead'] != null && message['isRead'] is! bool) {
        throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
      }
      final messageId = (message['id'] as String).trim();
      final senderId = (message['senderId'] as String).trim();
      final attachments = message['attachments'];
      if (messageId.isEmpty ||
          messageId.length > 256 ||
          !messageIds.add(messageId) ||
          senderId.isEmpty ||
          senderId.length > 256 ||
          (message['text'] as String).length > 20000 ||
          DateTime.tryParse(message['timestamp'] as String) == null ||
          (attachments != null &&
              (attachments is! List ||
                  attachments.length > 16 ||
                  attachments.any((attachment) => attachment is! Map)))) {
        throw const FormatException('Ungültiger lokaler Nachrichtenverlauf.');
      }
    }
    return MessageThread.fromJson(raw);
  }

  // Runtime timers for express confirmation deadlines (not persisted). We also
  // run a sweep on data fetch to enforce timeouts across sessions.
  static final Map<String, Timer> _expressTimers = {};

  // Transient event to communicate that a listing was created or saved as draft.
  // Consumed by ExploreScreen to show a confirmation popup after navigation.
  static (Item item, bool draft)? _lastCreateEvent;
  static _OwnedListingCreateEvent? _lastOwnedCreateEvent;
  static void setLastCreateEvent(Item item, {required bool draft}) {
    _lastCreateEvent = (item, draft);
  }

  static bool _sameAuthSessionOwner(
    AuthSessionOwner left,
    AuthSessionOwner right,
  ) =>
      left.userId == right.userId &&
      left.sessionId == right.sessionId &&
      left.email.trim().toLowerCase() == right.email.trim().toLowerCase() &&
      left.createdAt == right.createdAt &&
      left.epoch == right.epoch;

  static void setLastCreateEventForOwner(
    AuthSessionOwner owner,
    Item item, {
    required bool draft,
  }) {
    _lastCreateEvent = null;
    _lastOwnedCreateEvent = _OwnedListingCreateEvent(
      owner: owner,
      item: item,
      draft: draft,
    );
  }

  static Map<String, dynamic> _decodeHandoverFailCountsStrict(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! Map || decoded.length > 1000) {
      throw const FormatException('Ungültige lokale Übergabe-Fehlversuche.');
    }
    final map = Map<String, dynamic>.from(decoded);
    for (final entry in map.entries) {
      if (entry.key.trim().isEmpty ||
          entry.key.length > 256 ||
          entry.value is! int ||
          (entry.value as int) < 0 ||
          (entry.value as int) > 100) {
        throw const FormatException('Ungültige lokale Übergabe-Fehlversuche.');
      }
    }
    return map;
  }

  /// Participant-scoped pickup/handover confirmation failure counter.
  static Future<int> getPickupFailCountForBooking(String requestId) async {
    final id = requestId.trim();
    if (id.isEmpty) return 0;
    final participant = await _requireCurrentRequestParticipant(id);
    return _runHandoverForParticipant(participant, () async {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_handoverFailCountsKey);
      if (raw == null) return 0;
      final map = _decodeHandoverFailCountsStrict(raw);
      return map[id] as int? ?? 0;
    });
  }

  static Future<int> incrementPickupFailForBooking(String requestId) async {
    final id = requestId.trim();
    if (id.isEmpty) return 0;
    final participant = await _requireCurrentRequestParticipant(id);
    return _runHandoverForParticipant(participant, () async {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_handoverFailCountsKey);
      final map = raw == null
          ? <String, dynamic>{}
          : _decodeHandoverFailCountsStrict(raw);
      if (!map.containsKey(id) && map.length >= 1000) {
        throw StateError('Die lokalen Übergabe-Fehlversuche sind voll.');
      }
      final current = map[id] as int? ?? 0;
      if (current >= 100) {
        throw StateError('Zu viele lokale Übergabe-Fehlversuche.');
      }
      final next = current + 1;
      map[id] = next;
      await _writePreferenceString(
        prefs,
        _handoverFailCountsKey,
        jsonEncode(map),
      );
      return next;
    });
  }

  static (Item, bool)? takeLastCreateEvent() {
    final e = _lastCreateEvent;
    _lastCreateEvent = null;
    return e;
  }

  static (Item, bool)? takeLastCreateEventForOwner(AuthSessionOwner owner) {
    final event = _lastOwnedCreateEvent;
    _lastOwnedCreateEvent = null;
    if (event == null || !_sameAuthSessionOwner(event.owner, owner)) {
      return null;
    }
    return (event.item, event.draft);
  }

  static Map<String, dynamic> _decodeHandoverBannersStrict(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! Map || decoded.length > 1000) {
      throw const FormatException('Ungültige lokale Übergabehinweise.');
    }
    final map = Map<String, dynamic>.from(decoded);
    for (final entry in map.entries) {
      final value = entry.value;
      if (entry.key.trim().isEmpty ||
          entry.key.length > 256 ||
          value is! Map ||
          value['msg'] is! String ||
          (value['msg'] as String).trim().isEmpty ||
          (value['msg'] as String).length > 2000 ||
          value['ts'] is! String ||
          DateTime.tryParse(value['ts'] as String) == null) {
        throw const FormatException('Ungültige lokale Übergabehinweise.');
      }
    }
    return map;
  }

  /// Sets a participant-scoped one-time banner for the shared request.
  static Future<void> setHandoverBanner({
    required String requestId,
    required String message,
  }) async {
    final id = requestId.trim();
    final normalizedMessage = message.trim();
    if (id.isEmpty ||
        id.length > 256 ||
        normalizedMessage.isEmpty ||
        normalizedMessage.length > 2000) {
      throw ArgumentError('Ungültiger lokaler Übergabehinweis.');
    }
    final participant = await _requireCurrentRequestParticipant(id);
    await _runHandoverForParticipant(participant, () async {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_handoverBannersKey);
      final map =
          raw == null ? <String, dynamic>{} : _decodeHandoverBannersStrict(raw);
      if (!map.containsKey(id) && map.length >= 1000) {
        throw StateError('Die lokalen Übergabehinweise sind voll.');
      }
      map[id] = <String, dynamic>{
        'msg': normalizedMessage,
        'ts': DateTime.now().toIso8601String(),
      };
      await _writePreferenceString(prefs, _handoverBannersKey, jsonEncode(map));
    });
  }

  /// Returns and removes the banner text for a booking if present.
  static Future<String?> takeHandoverBanner(String requestId) async {
    final id = requestId.trim();
    if (id.isEmpty) return null;
    final participant = await _requireCurrentRequestParticipant(id);
    return _runHandoverForParticipant(participant, () async {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_handoverBannersKey);
      if (raw == null) return null;
      final map = _decodeHandoverBannersStrict(raw);
      final entry = map[id];
      if (entry is Map) {
        final msg = entry['msg'] as String;
        map.remove(id);
        await _writePreferenceString(
          prefs,
          _handoverBannersKey,
          jsonEncode(map),
        );
        return msg;
      }
      return null;
    });
  }

  static bool _isValidBookingSelectionToken(Object? value) =>
      value is String &&
      (value == LocalPrincipalIdentity.guest.token ||
          RegExp(r'^p_[a-f0-9]{64}$').hasMatch(value));

  static Map<String, dynamic> _decodeBookingSelectionBucket(Object? raw) {
    if (raw is! Map || raw.length > 1000) {
      throw const FormatException('Invalid local booking selections');
    }
    final bucket = <String, dynamic>{};
    for (final entry in raw.entries) {
      final itemId = entry.key;
      final value = entry.value;
      if (itemId is! String ||
          itemId.trim().isEmpty ||
          itemId.length > 256 ||
          value is! Map ||
          value.keys.any((key) =>
              key is! String ||
              !const {'start', 'end', 'delivery'}.contains(key))) {
        throw const FormatException('Invalid local booking selection entry');
      }
      final selection = Map<String, dynamic>.from(value);
      for (final key in const <String>['start', 'end']) {
        final field = selection[key];
        if (field != null &&
            (field is! String ||
                field.length > 64 ||
                DateTime.tryParse(field) == null)) {
          throw const FormatException('Invalid local booking selection date');
        }
      }
      final delivery = selection['delivery'];
      if (delivery != null) {
        if (delivery is! Map || delivery.length > 20) {
          throw const FormatException(
            'Invalid local booking delivery selection',
          );
        }
        const booleanKeys = <String>{'hinweg', 'rueckweg', 'express'};
        const stringKeys = <String>{
          'city',
          'addressLine',
          'deliveryAddressLine',
          'deliveryCity',
          'returnAddressLine',
          'returnCity',
        };
        const coordinateKeys = <String>{
          'lat',
          'lng',
          'deliveryLat',
          'deliveryLng',
          'returnLat',
          'returnLng',
        };
        for (final field in delivery.entries) {
          final key = field.key;
          final fieldValue = field.value;
          if (key is! String ||
              (!booleanKeys.contains(key) &&
                  !stringKeys.contains(key) &&
                  !coordinateKeys.contains(key))) {
            throw const FormatException(
              'Invalid local booking delivery selection',
            );
          }
          if (booleanKeys.contains(key) && fieldValue is! bool) {
            throw const FormatException(
              'Invalid local booking delivery selection',
            );
          }
          if (stringKeys.contains(key) &&
              (fieldValue is! String || fieldValue.length > 500)) {
            throw const FormatException(
              'Invalid local booking delivery selection',
            );
          }
          if (coordinateKeys.contains(key) &&
              fieldValue != null &&
              (fieldValue is! num || !fieldValue.isFinite)) {
            throw const FormatException(
              'Invalid local booking delivery selection',
            );
          }
        }
        selection['delivery'] = Map<String, dynamic>.from(delivery);
      }
      bucket[itemId] = selection;
    }
    return bucket;
  }

  static _LocalBookingSelectionRegistry _readBookingSelectionRegistry(
    SharedPreferences prefs,
  ) {
    final raw = prefs.getString(_bookingSelectionPrincipalStateKey);
    if (raw == null) {
      final legacyRaw = prefs.getString(_bookingSelectionsKey);
      if (legacyRaw == null) {
        return _LocalBookingSelectionRegistry(
          revision: 0,
          principals: <String, Map<String, dynamic>>{},
        );
      }
      try {
        final legacy = _decodeBookingSelectionBucket(jsonDecode(legacyRaw));
        return _LocalBookingSelectionRegistry(
          revision: 0,
          principals: <String, Map<String, dynamic>>{
            LocalPrincipalIdentity.guest.token: legacy,
          },
        );
      } catch (_) {
        return _LocalBookingSelectionRegistry(
          revision: 0,
          principals: <String, Map<String, dynamic>>{},
          legacyGuestQuarantined: true,
        );
      }
    }
    if (raw.isEmpty) {
      throw const FormatException('Invalid booking selection registry');
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      throw const FormatException('Invalid booking selection registry');
    }
    if (decoded is! Map ||
        decoded['schemaVersion'] != 1 ||
        decoded['revision'] is! int ||
        (decoded['revision'] as int) < 1 ||
        decoded['legacyGuestQuarantined'] is! bool ||
        decoded['principals'] is! Map ||
        decoded['quarantinedPrincipals'] is! Map) {
      throw const FormatException('Invalid booking selection registry');
    }
    final principals = <String, Map<String, dynamic>>{};
    final quarantined = <String, dynamic>{};
    for (final entry in (decoded['principals'] as Map).entries) {
      if (!_isValidBookingSelectionToken(entry.key)) {
        throw const FormatException('Invalid booking selection principal');
      }
      try {
        principals[entry.key as String] =
            _decodeBookingSelectionBucket(entry.value);
      } catch (_) {
        quarantined[entry.key as String] = entry.value;
      }
    }
    for (final entry in (decoded['quarantinedPrincipals'] as Map).entries) {
      if (!_isValidBookingSelectionToken(entry.key) ||
          principals.containsKey(entry.key)) {
        throw const FormatException('Invalid booking selection quarantine');
      }
      quarantined[entry.key as String] = entry.value;
    }
    if (principals.length + quarantined.length > _maxLocalStageAPrincipals) {
      throw const FormatException('Invalid booking selection registry');
    }
    return _LocalBookingSelectionRegistry(
      revision: decoded['revision'] as int,
      principals: principals,
      quarantinedPrincipals: quarantined,
      legacyGuestQuarantined: decoded['legacyGuestQuarantined'] as bool,
    );
  }

  static Map<String, dynamic> _bookingSelectionBucketForPrincipal(
    _LocalBookingSelectionRegistry registry,
    LocalPrincipalIdentity principal,
  ) {
    if (!principal.authenticated && registry.legacyGuestQuarantined) {
      throw const FormatException(
        'Unattributed legacy booking selections are quarantined',
      );
    }
    if (registry.quarantinedPrincipals.containsKey(principal.token)) {
      throw const FormatException(
        'Principal booking selections are quarantined',
      );
    }
    return Map<String, dynamic>.from(
      registry.principals[principal.token] ?? const <String, dynamic>{},
    );
  }

  static Future<void> _writeBookingSelectionBucket(
    SharedPreferences prefs,
    _LocalBookingSelectionRegistry registry,
    LocalPrincipalIdentity principal,
    Map<String, dynamic> bucket,
  ) async {
    if (registry.quarantinedPrincipals.containsKey(principal.token) ||
        (!principal.authenticated && registry.legacyGuestQuarantined)) {
      throw const FormatException(
        'Principal booking selections are quarantined',
      );
    }
    if (!registry.principals.containsKey(principal.token) &&
        registry.principals.length + registry.quarantinedPrincipals.length >=
            _maxLocalStageAPrincipals) {
      throw StateError('Local principal capacity reached.');
    }
    final validated = _decodeBookingSelectionBucket(bucket);
    if (validated.isEmpty) {
      registry.principals.remove(principal.token);
    } else {
      registry.principals[principal.token] = validated;
    }
    final encoded = jsonEncode(<String, dynamic>{
      'schemaVersion': 1,
      'revision': max(1, registry.revision + 1),
      'legacyGuestQuarantined': registry.legacyGuestQuarantined,
      'principals': registry.principals,
      'quarantinedPrincipals': registry.quarantinedPrincipals,
    });
    await _writePreferenceString(
      prefs,
      _bookingSelectionPrincipalStateKey,
      encoded,
    );
  }

  static Future<T> _withCurrentBookingSelectionBucket<T>(
    Future<T> Function(
      SharedPreferences prefs,
      _LocalBookingSelectionRegistry registry,
      LocalPrincipalIdentity principal,
      Map<String, dynamic> bucket,
    ) operation, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final principal =
        expectedOwner?.principal ?? await _currentLocalPrincipal();
    await expectedOwner?.assertCurrent();
    return _bookingSelectionMutationQueue.run(() async {
      await expectedOwner?.assertCurrent();
      await LocalPrincipalScope.assertCurrent(principal);
      final prefs = await SharedPreferences.getInstance();
      final registry = _readBookingSelectionRegistry(prefs);
      final bucket = _bookingSelectionBucketForPrincipal(registry, principal);
      await expectedOwner?.assertCurrent();
      final result = await operation(prefs, registry, principal, bucket);
      await expectedOwner?.assertCurrent();
      await LocalPrincipalScope.assertCurrent(principal);
      return result;
    });
  }

  // Persisted availability selection, isolated by the current local principal.
  static Future<(DateTime? start, DateTime? end)> getSavedDateRange(
    String itemId, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final id = itemId.trim();
    if (id.isEmpty) return (null, null);
    return _withCurrentBookingSelectionBucket((_, __, ___, bucket) async {
      final entry = bucket[id];
      if (entry is! Map) return (null, null);
      final start = entry['start'] as String?;
      final end = entry['end'] as String?;
      return (
        start == null ? null : DateTime.parse(start),
        end == null ? null : DateTime.parse(end),
      );
    }, expectedOwner: expectedOwner);
  }

  static Future<void> setSavedDateRange(
    String itemId, {
    required DateTime start,
    required DateTime end,
  }) async {
    final id = itemId.trim();
    if (id.isEmpty || id.length > 256 || end.isBefore(start)) {
      throw ArgumentError('Invalid local booking date selection.');
    }
    await _withCurrentBookingSelectionBucket(
      (prefs, registry, principal, bucket) async {
        final existing = bucket[id] is Map
            ? Map<String, dynamic>.from(bucket[id] as Map)
            : <String, dynamic>{};
        existing['start'] = start.toIso8601String();
        existing['end'] = end.toIso8601String();
        bucket[id] = existing;
        await _writeBookingSelectionBucket(
          prefs,
          registry,
          principal,
          bucket,
        );
      },
    );
  }

  static Future<void> clearSavedDateRange(
    String itemId, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final id = itemId.trim();
    if (id.isEmpty) return;
    await _withCurrentBookingSelectionBucket(
      (prefs, registry, principal, bucket) async {
        final raw = bucket[id];
        if (raw is! Map) return;
        final existing = Map<String, dynamic>.from(raw)
          ..remove('start')
          ..remove('end');
        if (existing.isEmpty) {
          bucket.remove(id);
        } else {
          bucket[id] = existing;
        }
        await _writeBookingSelectionBucket(
          prefs,
          registry,
          principal,
          bucket,
        );
      },
      expectedOwner: expectedOwner,
    );
  }

  /// Clears only the saved delivery selection for a given item without
  /// touching another item or local principal.
  static Future<void> clearSavedDeliverySelection(
    String itemId, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final id = itemId.trim();
    if (id.isEmpty) return;
    await _withCurrentBookingSelectionBucket(
      (prefs, registry, principal, bucket) async {
        final raw = bucket[id];
        if (raw is! Map || !raw.containsKey('delivery')) return;
        final existing = Map<String, dynamic>.from(raw)..remove('delivery');
        if (existing.isEmpty) {
          bucket.remove(id);
        } else {
          bucket[id] = existing;
        }
        await _writeBookingSelectionBucket(
          prefs,
          registry,
          principal,
          bucket,
        );
      },
      expectedOwner: expectedOwner,
    );
  }

  /// Computes long-term discount for a given item and rental length.
  /// Returns a tuple: (finalTotal, baseTotal, appliedPercent, discountAmount).
  /// - baseTotal = item.pricePerDay * days
  /// - appliedPercent is 0 when no tier matches or disabled
  /// - discountAmount is positive value in EUR
  static (
    double finalTotal,
    double baseTotal,
    double appliedPercent,
    double discountAmount,
  ) computeTotalWithDiscounts({required Item item, required int days}) {
    final quote = PrivatePilotPricing.quoteForItem(item: item, days: days);
    return (
      PrivatePilotPricing.minorToEuros(quote.rentalSubtotalMinor),
      PrivatePilotPricing.minorToEuros(quote.baseRentalMinor),
      quote.discountBasisPoints / 100,
      PrivatePilotPricing.minorToEuros(quote.discountMinor),
    );
  }

  /// Platform contribution ("Plattformbeitrag").
  /// Input: rentalSubtotal (after any rental discounts), excluding delivery/express.
  /// The private-pilot contribution is always exactly 10% of the discounted
  /// rental subtotal. It is calculated in integer cents with one documented
  /// half-up rounding step and has no minimum fee.
  static double platformContributionForRental(double rentalSubtotal) {
    final rentalMinor = PrivatePilotPricing.eurosToMinor(rentalSubtotal);
    return PrivatePilotPricing.minorToEuros(
      PrivatePilotPricing.platformFeeMinor(rentalMinor),
    );
  }

  /// Unified pricing breakdown for an existing rental request.
  ///
  /// Returns a record with:
  /// - days: number of rental days (min 1)
  /// - basePerDay, baseTotal, discountAmount, rentalSubtotal
  /// - platformFee (computed ONLY on rentalSubtotal)
  /// - dropoffFee (owner delivers at pickup) and returnFee (owner picks up at return)
  /// - expressApplied: For the RENTER total we include Express immediately
  ///   when selected/requested (transient deliverySel.express, req.expressRequested
  ///   or already accepted). This makes the renter’s Gesamtbetrag stable across
  ///   Ausstehend → Kommend → Laufend → Abgeschlossen.
  ///   For OWNER payout we only count Express when it is accepted.
  /// - total includes additional 10% applied on Express surcharge (if applied)
  /// - totalRenter (what renter pays)
  /// - payoutOwner (what owner receives; platform fee does not reduce delivery/express)
  static ({
    int days,
    double basePerDay,
    double baseTotal,
    double discountAmount,
    double rentalSubtotal,
    double platformFee,
    double dropoffFee,
    double returnFee,
    double expressApplied,
    double totalRenter,
    double payoutOwner,
  }) priceBreakdownForRequest({
    required Item item,
    required RentalRequest req,
    Map<String, dynamic>? deliverySel,
  }) {
    // Days
    final int days = (req.end.difference(req.start).inHours / 24).ceil().clamp(
          1,
          365,
        );
    final priced = computeTotalWithDiscounts(item: item, days: days);
    final double basePerDay = item.pricePerDay;
    final double baseTotal = priced.$2; // before discount
    final double discountAmount = priced.$4; // absolute EUR
    final double rentalSubtotal = priced.$1; // after discount
    final double platformFee = platformContributionForRental(rentalSubtotal);

    // Infer delivery responsibilities robustly (persisted flags first, then fallbacks)
    final bool inferredOwnerDeliversByTransient =
        (deliverySel?['hinweg'] == true);
    final bool inferredOwnerDeliversByExpress =
        req.expressRequested || (req.expressStatus != null);
    final bool inferredOwnerDeliversByAddress =
        ((req.deliveryAddressLine ?? '').toString().trim().isNotEmpty) ||
            ((req.deliveryCity ?? '').toString().trim().isNotEmpty);
    final bool ownerDelivers = req.ownerDeliversAtDropoffChosen ||
        inferredOwnerDeliversByTransient ||
        inferredOwnerDeliversByExpress ||
        inferredOwnerDeliversByAddress;

    final bool inferredOwnerPicksUpByTransient =
        (deliverySel?['rueckweg'] == true);
    final bool ownerPicksUp =
        req.ownerPicksUpAtReturnChosen || inferredOwnerPicksUpByTransient;

    double estimateKm({double? lat, double? lng, String? line, String? city}) {
      if (lat != null && lng != null) {
        return estimateDistanceKm(item.lat, item.lng, lat, lng);
      }
      if ((line ?? '').trim().isNotEmpty) {
        return estimateDistanceKmFromAddressLine(
          item.lat,
          item.lng,
          line!.trim(),
        );
      }
      if ((city ?? '').trim().isNotEmpty) {
        return estimateDistanceKmToCity(item.lat, item.lng, city!.trim());
      }
      return 0.0;
    }

    final double dropoffKm = estimateKm(
      lat: req.deliveryLat ??
          (deliverySel?['deliveryLat'] as num?)?.toDouble() ??
          (deliverySel?['lat'] as num?)?.toDouble(),
      lng: req.deliveryLng ??
          (deliverySel?['deliveryLng'] as num?)?.toDouble() ??
          (deliverySel?['lng'] as num?)?.toDouble(),
      line: req.deliveryAddressLine ??
          (deliverySel?['deliveryAddressLine'] as String?) ??
          (deliverySel?['addressLine'] as String?),
      city: req.deliveryCity ??
          (deliverySel?['deliveryCity'] as String?) ??
          (deliverySel?['city'] as String?),
    );
    final double returnKm = estimateKm(
      lat: req.returnLat ??
          (deliverySel?['returnLat'] as num?)?.toDouble() ??
          req.deliveryLat ??
          (deliverySel?['lat'] as num?)?.toDouble(),
      lng: req.returnLng ??
          (deliverySel?['returnLng'] as num?)?.toDouble() ??
          req.deliveryLng ??
          (deliverySel?['lng'] as num?)?.toDouble(),
      line: req.returnAddressLine ??
          (deliverySel?['returnAddressLine'] as String?) ??
          req.deliveryAddressLine ??
          (deliverySel?['addressLine'] as String?),
      city: req.returnCity ??
          (deliverySel?['returnCity'] as String?) ??
          req.deliveryCity ??
          (deliverySel?['city'] as String?),
    );

    double dropoffFee = 0.0;
    double returnFee = 0.0;
    if (PrivatePilotConfig.deliveryEnabled && ownerDelivers) {
      dropoffFee = deliveryFeeForDistanceKm(dropoffKm);
    }
    if (PrivatePilotConfig.deliveryEnabled && ownerPicksUp) {
      returnFee = deliveryFeeForDistanceKm(returnKm);
    }

    // Express: renter sees the surcharge as soon as it is selected/requested.
    // We consider three sources:
    //  - transient UI selection deliverySel['express']
    //  - request.expressRequested (persisted)
    //  - request.expressStatus == 'accepted' (persisted)
    final bool expressSelectedTransient = (deliverySel?['express'] == true);
    final bool expressAccepted =
        req.expressRequested && (req.expressStatus == 'accepted');
    final bool expressRequestedOrSelected =
        expressSelectedTransient || req.expressRequested || expressAccepted;
    final double expressApplied =
        PrivatePilotConfig.deliveryEnabled && expressRequestedOrSelected
            ? req.expressFee
            : 0.0;
    // New rule: add 10% of the Express surcharge to the renter total
    final double expressPlatformPart = expressApplied > 0
        ? double.parse((expressApplied * 0.10).toStringAsFixed(2))
        : 0.0;

    final double totalRenter = double.parse(
      (rentalSubtotal +
              platformFee +
              dropoffFee +
              returnFee +
              expressApplied +
              expressPlatformPart)
          .toStringAsFixed(2),
    );
    // Owner payout should only include express when accepted
    final double payoutOwner = double.parse(
      (rentalSubtotal +
              dropoffFee +
              returnFee +
              (PrivatePilotConfig.deliveryEnabled && expressAccepted
                  ? req.expressFee
                  : 0.0))
          .toStringAsFixed(2),
    );

    return (
      days: days,
      basePerDay: basePerDay,
      baseTotal: double.parse(baseTotal.toStringAsFixed(2)),
      discountAmount: double.parse(discountAmount.toStringAsFixed(2)),
      rentalSubtotal: double.parse(rentalSubtotal.toStringAsFixed(2)),
      platformFee: double.parse(platformFee.toStringAsFixed(2)),
      dropoffFee: dropoffFee,
      returnFee: returnFee,
      expressApplied: double.parse(expressApplied.toStringAsFixed(2)),
      totalRenter: totalRenter,
      payoutOwner: payoutOwner,
    );
  }

  static Future<AccountListingMutationResult> _runListingMutationForOwner({
    required AuthSessionOwner owner,
    required String expectedOwnerId,
    required Future<Item?> Function(
      User captured,
      Future<void> Function() verifyOwner,
      _AccountListingMutationAttempt attempt,
    ) operation,
  }) async {
    if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw const AccountListingMutationFailure.principalChanged();
    }
    User captured;
    try {
      captured = await _requireCurrentOperationalUser(
        requestedUserId: expectedOwnerId,
      );
    } catch (_) {
      throw const AccountListingMutationFailure.principalChanged();
    }
    if (!_sessionMatchesOperationalUser(
          AuthSession(
            userId: owner.userId,
            sessionId: owner.sessionId,
            email: owner.email,
            createdAt: owner.createdAt,
          ),
          userId: captured.id,
          email: captured.email,
        ) ||
        !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw const AccountListingMutationFailure.principalChanged();
    }

    return _listingMutationQueue.run(() async {
      final attempt = _AccountListingMutationAttempt();

      Future<void> verifyOwner() async {
        if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          throw AccountListingMutationFailure.principalChanged(
            remoteAccepted: attempt.remoteAccepted,
          );
        }
        try {
          await _assertCurrentOperationalUserId(
            captured.id,
            expectedEmail: captured.email,
          );
        } catch (_) {
          throw AccountListingMutationFailure.principalChanged(
            remoteAccepted: attempt.remoteAccepted,
          );
        }
      }

      try {
        await verifyOwner();
        final item = await operation(captured, verifyOwner, attempt);
        await verifyOwner();
        return AccountListingMutationResult(
          item: item,
          remoteAccepted: attempt.remoteAccepted,
        );
      } on AccountListingMutationFailure {
        rethrow;
      } on BackendException catch (error) {
        if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          throw AccountListingMutationFailure.principalChanged(
            remoteAccepted: attempt.remoteAccepted,
          );
        }
        throw _accountListingBackendFailure(error);
      } catch (_) {
        if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          throw AccountListingMutationFailure.principalChanged(
            remoteAccepted: attempt.remoteAccepted,
          );
        }
        throw AccountListingMutationFailure.localUnavailable(
          'local_listing_persistence_failed',
          remoteAccepted: attempt.remoteAccepted,
        );
      }
    });
  }

  static AccountListingMutationFailure _accountListingBackendFailure(
    BackendException error,
  ) {
    const rejected = <int, Set<String>>{
      400: <String>{
        'invalid_listing',
        'listing_title_required',
        'listing_description_too_short',
        'listing_category_required',
        'invalid_listing_condition',
        'invalid_listing_price',
        'listing_location_required',
        'invalid_listing_coordinates',
        'invalid_listing_duration',
        'invalid_handover_radius',
        'listing_photo_required',
        'listing_photo_must_be_uploaded',
        'listing_photo_not_found',
        'listing_photo_not_approved',
        'invalid_listing_status',
        'listing_revision_required',
        'private_pilot_listing_declaration_required',
        'private_pilot_category_not_allowed',
        'private_pilot_subcategory_not_allowed',
        'private_pilot_country_not_allowed',
        'private_pilot_region_not_allowed',
      },
      401: <String>{
        'authentication_required',
        'invalid_or_expired_session',
        'account_not_active',
      },
      403: <String>{
        'listing_forbidden',
        'listing_photo_forbidden',
        'action_blocked_by_moderation',
      },
      404: <String>{'listing_not_found', 'user_not_found'},
      409: <String>{
        'listing_revision_conflict',
        'listing_locked_by_moderation',
        'listing_photo_already_used',
        'private_pilot_account_declaration_required',
        'private_pilot_commercial_review_blocked',
        'private_pilot_listing_declaration_required',
        'private_pilot_category_not_allowed',
        'private_pilot_subcategory_not_allowed',
        'private_pilot_country_not_allowed',
        'private_pilot_region_not_allowed',
        'private_pilot_listing_region_unbound',
      },
      429: <String>{'rate_limit_exceeded'},
    };
    if (rejected[error.statusCode]?.contains(error.code) == true) {
      return AccountListingMutationFailure.rejected(error.code);
    }
    return AccountListingMutationFailure.outcomeUnknown(error.code);
  }

  // Add or update an item in local storage
  static Future<Item> addItem(
    Item item, {
    Map<String, dynamic>? supplyEnrichmentLink,
    String? blueOceanDraftId,
    Map<String, dynamic>? blueOceanReview,
  }) async {
    final current = await _requireCurrentOperationalUser(
      requestedUserId: item.ownerId,
    );
    return _listingMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final items = _readListingsStrict(prefs);
      if (items.length >= _maxLocalListings) {
        throw StateError('Der lokale Anzeigenkatalog ist voll.');
      }

      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final remote = blueOceanDraftId != null && blueOceanReview != null
            ? await BackendRepository.publishBlueOceanListing(
                draftId: blueOceanDraftId,
                review: blueOceanReview,
                listing: item.toJson(),
                supplyEnrichmentLink: supplyEnrichmentLink,
              )
            : await BackendRepository.createListing(
                item.toJson(),
                supplyEnrichmentLink: supplyEnrichmentLink,
              );
        await _assertCurrentOperationalUserId(
          current.id,
          expectedEmail: current.email,
        );
        final saved = Item.fromJson(remote);
        if (saved.ownerId != current.id) {
          throw StateError(
              'Die gespeicherte Anzeige gehört zu einem anderen Konto.');
        }
        items.removeWhere((entry) => entry.id == saved.id);
        items.add(saved);
        await _persistListings(prefs, items);
        SharedPersistenceSync.notify(SharedPersistenceSync.listingCatalogKey);
        return saved;
      }

      var maxId = 0;
      for (final entry in items) {
        final id = int.tryParse(entry.id) ?? 0;
        if (id > maxId) maxId = id;
      }
      final toStore = Item.fromJson(<String, dynamic>{
        ...item.toJson(),
        'id': (maxId + 1).toString(),
        'ownerId': current.id,
        'catalogRevision': 1,
      });
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      items.add(toStore);
      await _persistListings(prefs, items);
      SharedPersistenceSync.notify(SharedPersistenceSync.listingCatalogKey);
      return toStore;
    });
  }

  static Future<AccountListingMutationResult> addItemForOwner({
    required AuthSessionOwner owner,
    required Item item,
    Map<String, dynamic>? supplyEnrichmentLink,
    String? blueOceanDraftId,
    Map<String, dynamic>? blueOceanReview,
  }) =>
      _runListingMutationForOwner(
        owner: owner,
        expectedOwnerId: item.ownerId,
        operation: (captured, verifyOwner, attempt) async {
          final prefs = await SharedPreferences.getInstance();
          final items = _readListingsStrict(prefs);
          if (items.length >= _maxLocalListings) {
            throw StateError('Der lokale Anzeigenkatalog ist voll.');
          }
          Item saved;
          if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
            await verifyOwner();
            final remote = blueOceanDraftId != null && blueOceanReview != null
                ? await BackendRepository.publishBlueOceanListingForOwner(
                    owner: owner,
                    draftId: blueOceanDraftId,
                    review: blueOceanReview,
                    listing: item.toJson(),
                    supplyEnrichmentLink: supplyEnrichmentLink,
                  )
                : await BackendRepository.createListingForOwner(
                    owner: owner,
                    listing: item.toJson(),
                    supplyEnrichmentLink: supplyEnrichmentLink,
                  );
            attempt.remoteAccepted = true;
            await verifyOwner();
            saved = Item.fromJson(remote);
            if (saved.ownerId != captured.id) {
              throw StateError(
                'Die gespeicherte Anzeige gehört zu einem anderen Konto.',
              );
            }
          } else {
            var maxId = 0;
            for (final entry in items) {
              final id = int.tryParse(entry.id) ?? 0;
              if (id > maxId) maxId = id;
            }
            saved = Item.fromJson(<String, dynamic>{
              ...item.toJson(),
              'id': (maxId + 1).toString(),
              'ownerId': captured.id,
              'catalogRevision': 1,
            });
          }
          items.removeWhere((entry) => entry.id == saved.id);
          items.add(saved);
          await verifyOwner();
          await _persistListings(
            prefs,
            items,
            verifyAuthorization: verifyOwner,
          );
          SharedPersistenceSync.notify(
            SharedPersistenceSync.listingCatalogKey,
          );
          return saved;
        },
      );

  static Future<List<Category>> getCategories() async {
    final prefs = await SharedPreferences.getInstance();
    final categoriesJson = prefs.getString(_categoriesKey);
    final categories = <Category>[];
    var mutated = categoriesJson == null;
    if (categoriesJson != null) {
      try {
        final decoded = jsonDecode(categoriesJson);
        if (decoded is! List) {
          throw const FormatException('Invalid category reference document');
        }
        for (final entry in decoded) {
          if (entry is! Map) {
            throw const FormatException('Invalid category reference entry');
          }
          categories.add(Category.fromJson(Map<String, dynamic>.from(entry)));
        }
      } catch (error) {
        // Categories are reconstructible application reference data. A corrupt
        // cache may be replaced, but no user/account/listing store is touched.
        debugPrint(
          '[DataService] rebuilding invalid category cache '
          '(${error.runtimeType})',
        );
        categories.clear();
        mutated = true;
      }
    }

    // Categories are application reference data. Recreate only that cache:
    // the historical all-demo initializer also rewrote users, listings,
    // reviews and currentUser, so a missing category key could destroy an
    // otherwise intact migrated/local account state.

    // Ensure newly added demo categories are present for all users (no lazy backfill).
    final seeds = _buildDemoCategories();
    final orderById = {for (int i = 0; i < seeds.length; i++) seeds[i].id: i};

    for (final seed in seeds) {
      final index = categories.indexWhere((category) => category.id == seed.id);
      if (index < 0) {
        categories.add(seed);
        mutated = true;
      } else {
        final current = categories[index];
        if (current.name != seed.name ||
            current.slug != seed.slug ||
            current.iconName != seed.iconName ||
            !listEquals(current.subcategories, seed.subcategories)) {
          categories[index] = seed;
          mutated = true;
        }
      }
    }

    categories.sort((a, b) {
      final ai = orderById[a.id] ?? seeds.length;
      final bi = orderById[b.id] ?? seeds.length;
      if (ai != bi) return ai.compareTo(bi);
      return a.name.compareTo(b.name);
    });

    if (mutated) {
      await _writePreferenceString(
        prefs,
        _categoriesKey,
        jsonEncode(categories.map((c) => c.toJson()).toList()),
      );
    }

    if (PrivatePilotConfig.enabled) {
      return categories
          .where((category) => PrivatePilotConfig.categoryAllowed(category.id))
          .toList(growable: false);
    }
    return categories;
  }

  static Future<List<Item>> getItems() async {
    final prefs = await SharedPreferences.getInstance();
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      try {
        final remote = await BackendRepository.getListings();
        final items = _decodeListingsStrict(jsonEncode(remote));
        items.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        await _persistListings(prefs, items);
        return items;
      } catch (error) {
        debugPrint('[DataService] remote listings load failed: $error');
        rethrow;
      }
    }
    final itemsJson = prefs.getString(_itemsKey);
    if (itemsJson == null) {
      if (!_allowDemoSeedDataInRuntime) return const <Item>[];
      await _initializeSampleData();
      return getItems();
    }
    List<Item> items;
    try {
      items = _decodeListingsStrict(itemsJson);
    } catch (error) {
      if (!_allowDemoSeedDataInRuntime) {
        throw const FormatException('Invalid local listings document');
      }
      await _initializeSampleData();
      return getItems();
    }

    if (items.isEmpty) {
      // An empty catalog is a valid migrated, first-run or intentionally
      // purged state. Never turn it into demo data in a real runtime.
      if (!_allowDemoSeedDataInRuntime) return const <Item>[];
      try {
        await resetItemsAndSeedFive(force: true);
      } catch (e) {
        debugPrint('[DataService] getItems reseed-on-empty failed: $e');
        await _initializeSampleData();
      }
      return getItems();
    }

    items.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return items;
  }

  /// One-time operation: delete all existing items and keep only those owned by the
  /// current user. Used to switch the app into a mode where only user-created
  /// listings are present and tested.
  static Future<void> ensureOnlyUserItemsOnce() async {
    if (!_allowDemoSeedDataInRuntime) {
      debugPrint(
        '[DataService] ensureOnlyUserItemsOnce skipped (demo seed disabled)',
      );
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final done = prefs.getBool(_purgedToOwnedFlagKey) ?? false;
    if (done) return;

    // Clear all items; from now on, only user-created listings will populate this store.
    await prefs.setString(_itemsKey, jsonEncode([]));

    // Clear related stores so UI/state doesn't reference removed items.
    await prefs.remove(_rentalRequestsKey);
    await prefs.remove(_bookingSelectionsKey);
    await prefs.remove(_bookingSelectionPrincipalStateKey);
    await prefs.remove(_timelineEventsKey);
    await prefs.remove(_savedItemsKey);

    await prefs.setBool(_purgedToOwnedFlagKey, true);
  }

  /// Ensures the local store contains at least some listings.
  ///
  /// This is a safety net for cases where a previous debug build purged the demo
  /// dataset (resulting in an empty Explore feed).
  ///
  /// - If items are missing: normal demo init will happen on first read.
  /// - If items exist but are an empty list: we seed a small showcase dataset.
  static Future<void> ensureListingsSeededIfEmpty() async {
    if (!_allowDemoSeedDataInRuntime) {
      debugPrint(
        '[DataService] ensureListingsSeededIfEmpty skipped (demo seed disabled)',
      );
      return;
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_itemsKey);
      if (raw == null || raw.trim().isEmpty) {
        debugPrint('[DataService] No items found -> seeding showcase listings');
        await prefs.setBool(_purgedToOwnedFlagKey, false);
        await resetItemsAndSeedFive(force: true);
        return;
      }
      final decoded = jsonDecode(raw);
      if (decoded is List && decoded.isEmpty) {
        debugPrint(
          '[DataService] Items store empty -> seeding showcase listings',
        );
        await prefs.setBool(_purgedToOwnedFlagKey, false);
        await resetItemsAndSeedFive(force: true);
      }
    } catch (e) {
      debugPrint('[DataService] ensureListingsSeededIfEmpty failed: $e');
    }
  }

  /// Clears all persisted listings and seeds exactly five showcase items
  /// that reflect the latest delivery/return and express logic.
  /// If [force] is false, it will only run once per device based on a flag.
  static Future<void> resetItemsAndSeedFive({bool force = false}) async {
    if (!_allowDemoSeedDataInRuntime) {
      debugPrint(
        '[DataService] resetItemsAndSeedFive skipped (demo seed disabled)',
      );
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final already = prefs.getBool(_seedFiveFlagKey) ?? false;
    if (!force && already) return;

    // Ensure categories and users exist
    if (prefs.getString(_categoriesKey) == null ||
        prefs.getString(_usersKey) == null) {
      await _initializeSampleData();
    }

    // Load needed references
    await getCategories();
    final users = await getUsers();

    // Build five curated items
    final five = _buildFiveShowcaseItems(users);

    await prefs.setString(
      _itemsKey,
      jsonEncode(five.map((e) => e.toJson()).toList()),
    );
    // Clear related volatile demo stores so UI reflects new dataset
    await prefs.remove(_rentalRequestsKey);
    await prefs.remove(_bookingSelectionsKey);
    await prefs.remove(_bookingSelectionPrincipalStateKey);
    await prefs.remove(_timelineEventsKey);
    await prefs.remove(_savedItemsKey);

    await prefs.setBool(_seedFiveFlagKey, true);
  }

  static User _decodeLocalUserStrict(
    Object? raw, {
    required String context,
  }) {
    if (raw is! Map) {
      throw FormatException('$context enthält keinen Profildatensatz.');
    }
    final map = Map<String, dynamic>.from(raw);
    String requiredString(String key) {
      final value = map[key];
      if (value is! String ||
          value.trim().isEmpty ||
          value.length > _maxLocalProfileStringLength) {
        throw FormatException('$context enthält ein ungültiges Feld: $key.');
      }
      return value;
    }

    requiredString('id');
    requiredString('displayName');
    requiredString('email');
    requiredString('preferredLanguage');
    requiredString('role');
    final createdAt = map['createdAt'];
    if (createdAt is! String || DateTime.tryParse(createdAt) == null) {
      throw FormatException('$context enthält keinen gültigen Zeitstempel.');
    }
    for (final key in const <String>[
      'emailVerified',
      'phoneVerified',
      'isVerified',
      'isBanned',
      'isDeactivated',
      'showWork',
      'showHobbies',
      'showHomeLocation',
      'showBioPublic',
      'showLanguagesPublic',
      'showInterestsPublic',
      'showFavoriteSong',
    ]) {
      if (map.containsKey(key) && map[key] is! bool) {
        throw FormatException('$context enthält ein ungültiges Feld: $key.');
      }
    }
    final rating = map['avgRating'];
    if (rating is! num || !rating.toDouble().isFinite) {
      throw FormatException('$context enthält eine ungültige Bewertung.');
    }
    final reviewCount = map['reviewCount'];
    if (reviewCount is! num ||
        reviewCount.toInt() != reviewCount ||
        reviewCount.toInt() < 0) {
      throw FormatException('$context enthält eine ungültige Bewertungszahl.');
    }
    for (final key in const <String>['homeLat', 'homeLng']) {
      final value = map[key];
      if (value != null && (value is! num || !value.toDouble().isFinite)) {
        throw FormatException('$context enthält ein ungültiges Feld: $key.');
      }
    }
    for (final key in const <String>['birthDate', 'deactivatedAt']) {
      final value = map[key];
      if (value != null &&
          (value is! String || DateTime.tryParse(value) == null)) {
        throw FormatException('$context enthält ein ungültiges Feld: $key.');
      }
    }
    for (final key in const <String>['languages', 'interests']) {
      final value = map[key];
      if (value is! List || value.length > _maxLocalProfileListEntries) {
        throw FormatException('$context enthält eine ungültige Liste: $key.');
      }
      for (final entry in value) {
        if (entry is! String || entry.length > _maxLocalProfileStringLength) {
          throw FormatException('$context enthält eine ungültige Liste: $key.');
        }
      }
    }
    for (final entry in map.entries) {
      if (entry.value is String &&
          (entry.value as String).length > _maxLocalProfileStringLength &&
          entry.key != 'photoURL') {
        throw FormatException(
          '$context enthält ein zu langes Feld: ${entry.key}.',
        );
      }
    }
    return User.fromJson(map);
  }

  static List<User> _decodeLocalUsersStrict(String raw) {
    if (utf8.encode(raw).length > _maxLocalUserDocumentBytes) {
      throw const FormatException('Der lokale Profilbestand ist zu groß.');
    }
    final decoded = jsonDecode(raw);
    if (decoded is! List || decoded.length > _maxLocalUsers) {
      throw const FormatException('Der lokale Profilbestand ist ungültig.');
    }
    final users = <User>[];
    final ids = <String>{};
    final emails = <String>{};
    for (var index = 0; index < decoded.length; index++) {
      final user = _decodeLocalUserStrict(
        decoded[index],
        context: 'Lokales Profil ${index + 1}',
      );
      final id = user.id.trim();
      final email = user.email.trim().toLowerCase();
      if (!ids.add(id) || !emails.add(email)) {
        throw const FormatException(
          'Der lokale Profilbestand enthält mehrdeutige Konten.',
        );
      }
      users.add(user);
    }
    return users;
  }

  static User _decodeCurrentUserStrict(String raw) {
    if (utf8.encode(raw).length > _maxLocalUserDocumentBytes) {
      throw const FormatException('Das lokale Kontoprofil ist zu groß.');
    }
    return _decodeLocalUserStrict(
      jsonDecode(raw),
      context: 'Lokales Kontoprofil',
    );
  }

  static bool _sameLocalUserDocument(User left, User right) =>
      jsonEncode(left.toJson()) == jsonEncode(right.toJson());

  static Future<bool> _restorePreferenceString(
    SharedPreferences prefs,
    String key,
    String? value,
  ) =>
      value == null ? prefs.remove(key) : prefs.setString(key, value);

  static Future<void> _persistAccountProfileDocumentsVerified({
    required SharedPreferences prefs,
    required User current,
    required List<User> users,
    Future<void> Function()? verifyAuthorization,
  }) async {
    final previousCurrent = prefs.getString(_currentUserKey);
    final previousUsers = prefs.getString(_usersKey);
    final hadDeletedMarker = prefs.containsKey(_accountDeletedKey);
    final previousDeletedMarker = prefs.getBool(_accountDeletedKey);
    final nextCurrent = jsonEncode(current.toJson());
    final nextUsers = jsonEncode(users.map((entry) => entry.toJson()).toList());
    _decodeCurrentUserStrict(nextCurrent);
    final validatedUsers = _decodeLocalUsersStrict(nextUsers);
    if (!validatedUsers.any((entry) => entry.id == current.id)) {
      throw StateError('Das aktuelle Profil fehlt im lokalen Profilbestand.');
    }
    try {
      await verifyAuthorization?.call();
      final usersWritten = await prefs.setString(_usersKey, nextUsers);
      if (!usersWritten || prefs.getString(_usersKey) != nextUsers) {
        throw StateError('Der lokale Profilbestand wurde nicht gespeichert.');
      }
      if (_clearSessionDuringNextAccountProfilePersistenceForTesting) {
        _clearSessionDuringNextAccountProfilePersistenceForTesting = false;
        await AuthService.clearSession();
      }
      if (_failNextAccountProfilePersistenceForTesting) {
        _failNextAccountProfilePersistenceForTesting = false;
        throw StateError(
            'Synthetic local account profile persistence failure.');
      }
      final currentWritten =
          await prefs.setString(_currentUserKey, nextCurrent);
      if (!currentWritten || prefs.getString(_currentUserKey) != nextCurrent) {
        throw StateError('Das lokale Kontoprofil wurde nicht gespeichert.');
      }
      if (!await prefs.remove(_accountDeletedKey) ||
          prefs.containsKey(_accountDeletedKey)) {
        throw StateError(
          'Der kontogebundene Löschstatus konnte nicht zurückgesetzt werden.',
        );
      }
      _decodeLocalUsersStrict(prefs.getString(_usersKey)!);
      final persistedCurrent =
          _decodeCurrentUserStrict(prefs.getString(_currentUserKey)!);
      if (persistedCurrent.id != current.id) {
        throw StateError('Das lokale Kontoprofil ist nicht konsistent.');
      }
      await verifyAuthorization?.call();
    } catch (error) {
      final usersRestored = await _restorePreferenceString(
        prefs,
        _usersKey,
        previousUsers,
      );
      final currentRestored = await _restorePreferenceString(
        prefs,
        _currentUserKey,
        previousCurrent,
      );
      final deletedMarkerRestored = hadDeletedMarker
          ? await prefs.setBool(_accountDeletedKey, previousDeletedMarker!)
          : await prefs.remove(_accountDeletedKey);
      if (!usersRestored ||
          !currentRestored ||
          !deletedMarkerRestored ||
          prefs.getString(_usersKey) != previousUsers ||
          prefs.getString(_currentUserKey) != previousCurrent ||
          (hadDeletedMarker
              ? prefs.getBool(_accountDeletedKey) != previousDeletedMarker
              : prefs.containsKey(_accountDeletedKey))) {
        throw StateError(
          'Profil-Speicherfehler; der vorherige Stand konnte nicht vollständig wiederhergestellt werden.',
        );
      }
      rethrow;
    }
  }

  static Future<List<User>> getUsers() async {
    final prefs = await SharedPreferences.getInstance();
    final usersJson = prefs.getString(_usersKey);
    if (usersJson == null) {
      if (!_allowDemoSeedDataInRuntime) return const <User>[];
      await _initializeSampleData();
      return getUsers();
    }
    final users = _decodeLocalUsersStrict(usersJson);
    // Reputation is derived for presentation only. Reads never rewrite the
    // account document or normalize malformed user-owned state.
    return _applyCentralReviewStatsToUsers(users);
  }

  static Future<User?> getCurrentUser() async {
    if (QaRuntimeService.isEnabled) {
      final runtimeUser = QaRuntimeService.runtimeUserJson;
      if (runtimeUser != null) {
        final user = User.fromJson(runtimeUser);
        await _ensureQaMessagesAndNotificationsForUserOnce(user.id);
        return user;
      }

      final users = await getUsers();
      final user = users.firstWhere(
        (candidate) => candidate.id == QaRuntimeService.personaId,
        orElse: () => users.firstWhere((candidate) => candidate.id == 'u1'),
      );
      QaRuntimeService.setRuntimeUserJson(user.toJson());
      await _ensureQaMessagesAndNotificationsForUserOnce(user.id);
      return user;
    }

    // Developer preview mode: allow simulating guest/first launch without touching persisted user data.
    try {
      final preview = await DeveloperPreviewController.readStateOnce();
      if (preview == DeveloperUserState.firstLaunch ||
          preview == DeveloperUserState.loggedOut) {
        return null;
      }
    } catch (_) {}

    final prefs = await SharedPreferences.getInstance();
    final deleted = prefs.getBool(_accountDeletedKey) ?? false;
    if (deleted) {
      // When the user has deleted their account, do not re-seed demo data.
      return null;
    }

    Future<String?> safeReadCurrentUser() async {
      return prefs.getString(_currentUserKey);
    }

    String? userJson = await safeReadCurrentUser();
    AuthSession? backendSession;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final session = await AuthService.readSession();
      backendSession = session;
      if (!canExposeCachedCurrentUser(
        backendEnabled: true,
        hasSession: session != null,
      )) {
        if (userJson != null && userJson.isNotEmpty) {
          await prefs.remove(_currentUserKey);
        }
        return null;
      }
      if (session == null) return null;
      var localUserId = '';
      if (userJson != null && userJson.isNotEmpty) {
        try {
          localUserId = (jsonDecode(userJson) as Map)['id']?.toString() ?? '';
        } catch (_) {}
      }
      if (localUserId != session.userId) {
        await syncCurrentUserForSessionEmail(session.email);
        userJson = await safeReadCurrentUser();
      }
    }
    if (userJson == null || userJson.isEmpty) {
      final session = backendSession ?? await AuthService.readSession();
      if (session != null) {
        await syncCurrentUserForSessionEmail(session.email);
        userJson = await safeReadCurrentUser();
      }
    }
    if (userJson == null || userJson.isEmpty) {
      if (!_allowDemoSeedDataInRuntime) {
        debugPrint(
          '[DataService] getCurrentUser skipped demo init (demo seed disabled)',
        );
        return null;
      }
      try {
        await _initializeSampleData();
      } catch (e) {
        debugPrint('[DataService] getCurrentUser init demo failed: $e');
      }
      final again = await safeReadCurrentUser();
      if (again == null || again.isEmpty) return null;
      return _decodeCurrentUserStrict(again);
    }

    var user = _decodeCurrentUserStrict(userJson);

    try {
      final users = await getUsers();
      final corrected = users
          .where((u) => u.id == user.id)
          .cast<User?>()
          .firstWhere((u) => u != null, orElse: () => null);
      if (corrected != null &&
          (corrected.avgRating != user.avgRating ||
              corrected.reviewCount != user.reviewCount)) {
        user = user.copyWith(
          avgRating: corrected.avgRating,
          reviewCount: corrected.reviewCount,
        );
      }
    } catch (_) {}

    // Developer preview mode: optionally force verification flag on the current user.
    try {
      final preview = await DeveloperPreviewController.readStateOnce();
      if (preview == DeveloperUserState.verifiedUser &&
          user.isVerified != true) {
        user = user.copyWith(
          isVerified: true,
          emailVerified: true,
          phoneVerified: true,
        );
      }
      if (preview == DeveloperUserState.loggedIn && user.isVerified == true) {
        user = user.copyWith(isVerified: false);
      }
    } catch (_) {}
    await _ensureQaMessagesAndNotificationsForUserOnce(user.id);
    return user;
  }

  static Future<void> applyQaFixturesForScreenAudit() async {
    final me = await getCurrentUser();
    if (me == null || me.id.isEmpty || !kDebugMode) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$_qaMessagesAndNotifsSeedFlagPrefix${me.id}');
    await _ensureQaMessagesAndNotificationsForUserOnce(me.id);
  }

  static const bool _launchQaSeedingEnabled = true;

  static Future<void> _ensureQaMessagesAndNotificationsForUserOnce(
    String userId,
  ) async {
    if (userId.isEmpty || !kDebugMode || !_launchQaSeedingEnabled) return;
    if (_qaSeedUsersInProgress.contains(userId)) return;
    _qaSeedUsersInProgress.add(userId);
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_qaMessagesAndNotifsSeedFlagPrefix$userId';
      final done = prefs.getBool(key) ?? false;
      if (done) return;

      User? me;
      if (QaRuntimeService.isEnabled) {
        final runtimeUser = QaRuntimeService.runtimeUserJson;
        if (runtimeUser != null) {
          try {
            me = User.fromJson(runtimeUser);
          } catch (_) {}
        }
      } else {
        final rawCurrentUser = prefs.getString(_currentUserKey);
        if (rawCurrentUser == null || rawCurrentUser.isEmpty) return;
        try {
          me = User.fromJson(
            Map<String, dynamic>.from(jsonDecode(rawCurrentUser) as Map),
          );
        } catch (_) {}
      }
      if (me == null || me.id != userId) return;

      final users = await getUsers();
      final items = await getItems();
      if (users.isEmpty || items.isEmpty) return;

      final otherUsers = users.where((u) => u.id != userId).toList();
      if (otherUsers.isEmpty) return;

      final User ownerA = otherUsers[0];
      final User ownerB = otherUsers.length > 1 ? otherUsers[1] : otherUsers[0];
      final User ownerC = otherUsers.length > 2 ? otherUsers[2] : otherUsers[0];
      final User renterA = otherUsers.length > 3 ? otherUsers[3] : ownerB;

      Item? firstOwnedBy(String ownerId) {
        for (final item in items) {
          if (item.ownerId == ownerId) return item;
        }
        return null;
      }

      Item? firstOwnedByWithPhoto(String ownerId) {
        for (final item in items) {
          if (item.ownerId == ownerId && item.photos.isNotEmpty) return item;
        }
        return firstOwnedBy(ownerId);
      }

      final acceptedItem = firstOwnedByWithPhoto(ownerA.id) ?? items.first;
      final runningItem = firstOwnedByWithPhoto(ownerB.id) ?? acceptedItem;
      final completedItem = firstOwnedBy(ownerC.id) ?? runningItem;
      if (acceptedItem.ownerId == userId ||
          runningItem.ownerId == userId ||
          completedItem.ownerId == userId) {
        // Sparse unit-test/demo catalogs cannot form valid two-party fixtures.
        return;
      }
      final ownerTemplate =
          firstOwnedByWithPhoto(me.id) ?? firstOwnedBy(me.id) ?? items.first;
      final now = DateTime.now();

      Item ownerQaItem({
        required String id,
        required String title,
        bool offersDeliveryAtDropoff = false,
        bool offersPickupAtReturn = false,
      }) {
        return Item(
          id: id,
          ownerId: userId,
          title: title,
          description: 'Lokaler QA-Fixture-Artikel für Owner-Screen-Audits.',
          categoryId: ownerTemplate.categoryId,
          subcategory: ownerTemplate.subcategory,
          tags: ownerTemplate.tags,
          pricePerDay: ownerTemplate.pricePerDay,
          currency: ownerTemplate.currency,
          priceUnit: ownerTemplate.priceUnit,
          priceRaw: ownerTemplate.priceRaw,
          autoApplyDiscounts: ownerTemplate.autoApplyDiscounts,
          longRentalDiscounts: ownerTemplate.longRentalDiscounts,
          photos: ownerTemplate.photos,
          locationText: ownerTemplate.locationText,
          lat: ownerTemplate.lat,
          lng: ownerTemplate.lng,
          geohash: ownerTemplate.geohash,
          condition: ownerTemplate.condition,
          minDays: ownerTemplate.minDays,
          maxDays: ownerTemplate.maxDays,
          createdAt: now.subtract(const Duration(days: 1)),
          isActive: true,
          verificationStatus: ownerTemplate.verificationStatus,
          city: ownerTemplate.city,
          country: ownerTemplate.country,
          status: 'active',
          timesLent: ownerTemplate.timesLent,
          offersDeliveryAtDropoff: offersDeliveryAtDropoff,
          offersPickupAtReturn: offersPickupAtReturn,
          offersExpressAtDropoff: ownerTemplate.offersExpressAtDropoff,
          maxDeliveryKmAtDropoff: ownerTemplate.maxDeliveryKmAtDropoff,
          maxPickupKmAtReturn: ownerTemplate.maxPickupKmAtReturn,
          cancellationPolicy: ownerTemplate.cancellationPolicy,
        );
      }

      final ownerPendingItem = ownerQaItem(
        id: 'qa_owner_item_pending_$userId',
        title: 'QNAP NAS',
      );
      final ownerUpcomingPickupItem = ownerQaItem(
        id: 'qa_owner_item_upcoming_pickup_$userId',
        title: 'QA Werkzeug Abholung durch Mieter',
      );
      final ownerUpcomingDeliveryItem = ownerQaItem(
        id: 'qa_owner_item_upcoming_delivery_$userId',
        title: 'QA Monitor Lieferung durch Vermieter',
        offersDeliveryAtDropoff: true,
      );
      final ownerRunningItem = ownerQaItem(
        id: 'qa_owner_item_running_$userId',
        title: 'QA Stativ laufende Anmietung',
        offersDeliveryAtDropoff: true,
        offersPickupAtReturn: true,
      );
      final ownerCompletedCleanItem = ownerQaItem(
        id: 'qa_owner_item_completed_clean_$userId',
        title: 'QA Kamera abgeschlossen',
      );
      final ownerCompletedProblemItem = ownerQaItem(
        id: 'qa_owner_item_completed_problem_$userId',
        title: 'QA E-Scooter Prüfung läuft',
      );

      final User? sharedOwner = users
          .where((u) => u.id == 'u1')
          .cast<User?>()
          .firstWhere((u) => u != null, orElse: () => null);
      final User? sharedRenter = users
          .where((u) => u.id == 'u2')
          .cast<User?>()
          .firstWhere((u) => u != null, orElse: () => null);
      final Item? sharedOwnerTemplate = sharedOwner == null
          ? null
          : (firstOwnedByWithPhoto(sharedOwner.id) ??
              firstOwnedBy(sharedOwner.id));
      final sharedItem = (sharedOwner != null && sharedRenter != null)
          ? Item(
              id: 'qa_shared_item_u1_u2',
              ownerId: sharedOwner.id,
              title: 'QA Gemeinsame Übergabe Abholung',
              description:
                  'Lokaler QA-Fixture-Artikel für den gemeinsamen Owner↔Renter-Verifikationsfall.',
              categoryId: (sharedOwnerTemplate ?? acceptedItem).categoryId,
              subcategory: (sharedOwnerTemplate ?? acceptedItem).subcategory,
              tags: (sharedOwnerTemplate ?? acceptedItem).tags,
              pricePerDay: (sharedOwnerTemplate ?? acceptedItem).pricePerDay,
              currency: (sharedOwnerTemplate ?? acceptedItem).currency,
              priceUnit: (sharedOwnerTemplate ?? acceptedItem).priceUnit,
              priceRaw: (sharedOwnerTemplate ?? acceptedItem).priceRaw,
              autoApplyDiscounts:
                  (sharedOwnerTemplate ?? acceptedItem).autoApplyDiscounts,
              longRentalDiscounts:
                  (sharedOwnerTemplate ?? acceptedItem).longRentalDiscounts,
              photos: (sharedOwnerTemplate ?? acceptedItem).photos,
              locationText: (sharedOwnerTemplate ?? acceptedItem).locationText,
              lat: (sharedOwnerTemplate ?? acceptedItem).lat,
              lng: (sharedOwnerTemplate ?? acceptedItem).lng,
              geohash: (sharedOwnerTemplate ?? acceptedItem).geohash,
              condition: (sharedOwnerTemplate ?? acceptedItem).condition,
              minDays: (sharedOwnerTemplate ?? acceptedItem).minDays,
              maxDays: (sharedOwnerTemplate ?? acceptedItem).maxDays,
              createdAt: now.subtract(const Duration(days: 1, hours: 2)),
              isActive: true,
              verificationStatus:
                  (sharedOwnerTemplate ?? acceptedItem).verificationStatus,
              city: (sharedOwnerTemplate ?? acceptedItem).city,
              country: (sharedOwnerTemplate ?? acceptedItem).country,
              status: 'active',
              timesLent: (sharedOwnerTemplate ?? acceptedItem).timesLent,
              offersDeliveryAtDropoff: false,
              offersPickupAtReturn: false,
              offersExpressAtDropoff:
                  (sharedOwnerTemplate ?? acceptedItem).offersExpressAtDropoff,
              maxDeliveryKmAtDropoff:
                  (sharedOwnerTemplate ?? acceptedItem).maxDeliveryKmAtDropoff,
              maxPickupKmAtReturn:
                  (sharedOwnerTemplate ?? acceptedItem).maxPickupKmAtReturn,
              cancellationPolicy:
                  (sharedOwnerTemplate ?? acceptedItem).cancellationPolicy,
            )
          : null;

      final acceptedRequest = RentalRequest(
        id: 'qa_req_accepted_$userId',
        itemId: acceptedItem.id,
        ownerId: acceptedItem.ownerId,
        renterId: userId,
        start: now.add(const Duration(days: 2, hours: 4)),
        end: now.add(const Duration(days: 5, hours: 2)),
        status: 'accepted',
        message:
            'QA PS5 Lieferung — bestätigter Kommend-Testfall für den lokalen Screen-Audit.',
        deliveryAddressLine: 'Torstraße 17',
        deliveryCity: 'Berlin',
        createdAt: now.subtract(const Duration(days: 1, hours: 4)),
        quotedTotalRenter: 89.0,
        quotedSubtitle: 'inkl. SIT-Servicegebühr',
      );
      final runningRequest = RentalRequest(
        id: 'qa_req_running_$userId',
        itemId: runningItem.id,
        ownerId: runningItem.ownerId,
        renterId: userId,
        start: now.subtract(const Duration(days: 1, hours: 2)),
        end: now.add(const Duration(days: 2, hours: 6)),
        status: 'running',
        message:
            'qa_booking_running — laufender Audit-Fall mit sichtbarer Abholung und Rückgabe.',
        deliveryAddressLine: 'Rosenthaler Straße 44',
        deliveryCity: 'Berlin',
        createdAt: now.subtract(const Duration(days: 3)),
        handoverConfirmation: {
          'confirmedAt':
              now.subtract(const Duration(days: 1, hours: 3)).toIso8601String(),
          'method': 'manual',
        },
        quotedTotalRenter: 126.0,
        quotedSubtitle: 'inkl. SIT-Servicegebühr',
      );
      final completedRequest = RentalRequest(
        id: 'qa_req_completed_$userId',
        itemId: completedItem.id,
        ownerId: completedItem.ownerId,
        renterId: userId,
        start: now.subtract(const Duration(days: 10)),
        end: now.subtract(const Duration(days: 7, hours: 3)),
        status: 'completed',
        message:
            'Danke nochmal — das Licht hat für das Shooting perfekt funktioniert.',
        createdAt: now.subtract(const Duration(days: 12)),
        returnConfirmation: {
          'confirmedAt':
              now.subtract(const Duration(days: 7, hours: 2)).toIso8601String(),
          'method': 'manual',
        },
        quotedTotalRenter: 74.0,
        quotedSubtitle: 'historischer Testfall',
        quotedRentalSubtotalMinor: 6727,
        quotedPlatformFeeMinor: 673,
        quotedTotalMinor: 7400,
      );
      final needsReviewRequest = RentalRequest(
        id: 'qa_req_review_$userId',
        itemId: completedItem.id,
        ownerId: completedItem.ownerId,
        renterId: userId,
        start: now.subtract(const Duration(days: 6)),
        end: now.subtract(const Duration(days: 4, hours: 4)),
        status: 'completed',
        message:
            'QA E-Scooter Prüfung läuft — abgeschlossener Vorgang mit Review-Hold.',
        createdAt: now.subtract(const Duration(days: 6, hours: 8)),
        needsReview: true,
        reviewReason: 'Zusätzliche Prüfung nach Rückgabe',
        reviewSource: 'qa_demo_seed',
        reviewRequestedAt: now.subtract(const Duration(days: 4, hours: 2)),
        quotedTotalRenter: 61.0,
        quotedSubtitle: 'mit Review-Hold Testfall',
        quotedRentalSubtotalMinor: 5545,
        quotedPlatformFeeMinor: 555,
        quotedTotalMinor: 6100,
      );
      final pendingRequest = RentalRequest(
        id: 'qa_req_pending_$userId',
        itemId: acceptedItem.id,
        ownerId: acceptedItem.ownerId,
        renterId: userId,
        start: now.add(const Duration(days: 4)),
        end: now.add(const Duration(days: 6, hours: 8)),
        status: 'pending',
        message: 'Wäre Abholung am Freitag gegen 18:30 für dich passend?',
        createdAt: now.subtract(const Duration(hours: 2, minutes: 20)),
        quotedTotalRenter: 58.0,
        quotedSubtitle: 'Anfrage noch offen',
      );
      final ownerPendingRequest = RentalRequest(
        id: 'qa_owner_pending_$userId',
        itemId: ownerPendingItem.id,
        ownerId: userId,
        renterId: renterA.id,
        start: now.add(const Duration(days: 3, hours: 6)),
        end: now.add(const Duration(days: 5, hours: 12)),
        status: 'pending',
        message: 'Neue Mietanfrage für den lokalen Owner-Audit.',
        createdAt: now.subtract(const Duration(hours: 1, minutes: 35)),
        quotedTotalRenter: 67.0,
        quotedSubtitle: 'eingehende Mietanfrage',
      );
      final ownerUpcomingPickupRequest = RentalRequest(
        id: 'qa_owner_upcoming_pickup_$userId',
        itemId: ownerUpcomingPickupItem.id,
        ownerId: userId,
        renterId: ownerA.id,
        start: now.add(const Duration(days: 1, hours: 4)),
        end: now.add(const Duration(days: 3, hours: 4)),
        status: 'accepted',
        message:
            'Bestätigte Owner-Anmietung mit Selbstabholung durch den Mieter.',
        createdAt: now.subtract(const Duration(days: 1, hours: 6)),
        ownerDeliversAtDropoffChosen: false,
        quotedTotalRenter: 82.0,
        quotedSubtitle: 'kommend / abholung',
      );
      final ownerUpcomingDeliveryRequest = RentalRequest(
        id: 'qa_owner_upcoming_delivery_$userId',
        itemId: ownerUpcomingDeliveryItem.id,
        ownerId: userId,
        renterId: ownerB.id,
        start: now.add(const Duration(days: 2, hours: 2)),
        end: now.add(const Duration(days: 4, hours: 8)),
        status: 'accepted',
        message:
            'Bestätigte Owner-Anmietung mit Lieferung durch den Vermieter.',
        createdAt: now.subtract(const Duration(days: 1, hours: 2)),
        ownerDeliversAtDropoffChosen: true,
        quotedTotalRenter: 119.0,
        quotedSubtitle: 'kommend / lieferung',
      );
      final ownerRunningRequest = RentalRequest(
        id: 'qa_owner_running_$userId',
        itemId: ownerRunningItem.id,
        ownerId: userId,
        renterId: ownerC.id,
        start: now.subtract(const Duration(days: 1, hours: 3)),
        end: now.add(const Duration(days: 1, hours: 10)),
        status: 'running',
        message: 'Laufende Owner-Anmietung für den Audit.',
        createdAt: now.subtract(const Duration(days: 2, hours: 6)),
        ownerDeliversAtDropoffChosen: true,
        ownerPicksUpAtReturnChosen: true,
        handoverConfirmation: {
          'confirmedAt':
              now.subtract(const Duration(days: 1, hours: 4)).toIso8601String(),
          'method': 'manual',
        },
        quotedTotalRenter: 134.0,
        quotedSubtitle: 'laufend',
      );
      final ownerCompletedCleanRequest = RentalRequest(
        id: 'qa_owner_completed_clean_$userId',
        itemId: ownerCompletedCleanItem.id,
        ownerId: userId,
        renterId: renterA.id,
        start: now.subtract(const Duration(days: 8)),
        end: now.subtract(const Duration(days: 5, hours: 2)),
        status: 'completed',
        message: 'Sauber abgeschlossene Owner-Anmietung für den Audit.',
        createdAt: now.subtract(const Duration(days: 9, hours: 1)),
        returnConfirmation: {
          'confirmedAt':
              now.subtract(const Duration(days: 5, hours: 1)).toIso8601String(),
          'method': 'manual',
        },
        needsReview: false,
        quotedTotalRenter: 73.0,
        quotedSubtitle: 'abgeschlossen / clean',
        quotedRentalSubtotalMinor: 6636,
        quotedPlatformFeeMinor: 664,
        quotedTotalMinor: 7300,
      );
      final ownerCompletedProblemRequest = RentalRequest(
        id: 'qa_owner_completed_problem_$userId',
        itemId: ownerCompletedProblemItem.id,
        ownerId: userId,
        renterId: ownerB.id,
        start: now.subtract(const Duration(days: 6, hours: 4)),
        end: now.subtract(const Duration(days: 3, hours: 6)),
        status: 'completed',
        message: 'Owner-Review-Hold-Fall für den Audit.',
        createdAt: now.subtract(const Duration(days: 6, hours: 8)),
        returnConfirmation: {
          'confirmedAt':
              now.subtract(const Duration(days: 3, hours: 5)).toIso8601String(),
          'method': 'manual',
        },
        needsReview: true,
        reviewReason: 'Zusätzliche Prüfung nach Rückgabe',
        reviewSource: 'qa_demo_seed',
        reviewRequestedAt: now.subtract(const Duration(days: 3, hours: 4)),
        quotedTotalRenter: 96.0,
        quotedSubtitle: 'abgeschlossen / prüfung',
        quotedRentalSubtotalMinor: 8727,
        quotedPlatformFeeMinor: 873,
        quotedTotalMinor: 9600,
      );

      final sharedOwnerRenterRequest =
          (sharedOwner != null && sharedRenter != null && sharedItem != null)
              ? RentalRequest(
                  id: 'qa_shared_request_u1_u2',
                  itemId: sharedItem.id,
                  ownerId: sharedOwner.id,
                  renterId: sharedRenter.id,
                  start: now.add(const Duration(days: 1, hours: 3)),
                  end: now.add(const Duration(days: 3, hours: 2)),
                  status: 'accepted',
                  message:
                      'Gemeinsamer QA-Fall für Owner↔Renter-Live-Verifikation mit Abholung durch den Mieter.',
                  createdAt: now.subtract(const Duration(hours: 20)),
                  ownerDeliversAtDropoffChosen: false,
                  quotedTotalRenter: 88.0,
                  quotedSubtitle: 'shared qa / pickup',
                )
              : null;

      final itemJson = prefs.getString(_itemsKey);
      final List<dynamic> itemList = itemJson != null && itemJson.isNotEmpty
          ? List<dynamic>.from(jsonDecode(itemJson) as List)
          : <dynamic>[];
      itemList.removeWhere((e) {
        if (e is! Map) return false;
        final id = (e['id'] ?? '').toString();
        return id.startsWith('qa_owner_item_') &&
            ((e['ownerId'] ?? '').toString() == userId);
      });
      itemList.removeWhere((e) {
        if (e is! Map) return false;
        return (e['id'] ?? '').toString() == 'qa_shared_item_u1_u2';
      });
      itemList.addAll([
        ownerPendingItem.toJson(),
        ownerUpcomingPickupItem.toJson(),
        ownerUpcomingDeliveryItem.toJson(),
        ownerRunningItem.toJson(),
        ownerCompletedCleanItem.toJson(),
        ownerCompletedProblemItem.toJson(),
        if (sharedItem != null) sharedItem.toJson(),
      ]);
      await prefs.setString(_itemsKey, jsonEncode(itemList));

      await _rentalRequestMutationQueue.run(() async {
        final requests = await _getAllRentalRequests();
        requests.removeWhere((r) {
          final isRenterOrOwnerQa = r.id.startsWith('qa_req_') &&
              (r.renterId == userId || r.ownerId == userId);
          final isOwnerQa = r.id.startsWith('qa_owner_') && r.ownerId == userId;
          return isRenterOrOwnerQa || isOwnerQa;
        });
        requests.removeWhere((r) => r.id == 'qa_shared_request_u1_u2');
        requests.addAll([
          acceptedRequest,
          runningRequest,
          completedRequest,
          needsReviewRequest,
          pendingRequest,
          ownerPendingRequest,
          ownerUpcomingPickupRequest,
          ownerUpcomingDeliveryRequest,
          ownerRunningRequest,
          ownerCompletedCleanRequest,
          ownerCompletedProblemRequest,
          if (sharedOwnerRenterRequest != null) sharedOwnerRenterRequest,
        ]);
        await _saveAllRentalRequests(requests);
      });

      final rawThreads = await _readMessageThreads(prefs);
      final List<dynamic> threadList =
          rawThreads != null && rawThreads.isNotEmpty
              ? List<dynamic>.from(jsonDecode(rawThreads) as List)
              : <dynamic>[];
      threadList.removeWhere((e) {
        if (e is! Map) return false;
        final id = (e['id'] ?? '').toString();
        return id.startsWith('qa_thread_') ||
            id.startsWith('qa_support_thread_');
      });

      MessageThread buildThread({
        required String id,
        required String requestId,
        required String itemId,
        required String itemTitle,
        required String user1Id,
        required String user2Id,
        String? threadType,
        String? bookingStatus,
        DateTime? handoverAt,
        DateTime? returnAt,
        bool? otherUserOnline,
        DateTime? otherUserLastActive,
        List<String> archivedForUserIds = const <String>[],
        required List<Message> messages,
        required DateTime createdAt,
        DateTime? lastMessageAt,
      }) =>
          MessageThread(
            id: id,
            requestId: requestId,
            itemId: itemId,
            itemTitle: itemTitle,
            user1Id: user1Id,
            user2Id: user2Id,
            threadType: threadType,
            bookingStatus: bookingStatus,
            handoverAt: handoverAt,
            returnAt: returnAt,
            otherUserOnline: otherUserOnline,
            otherUserLastActive: otherUserLastActive,
            archivedForUserIds: archivedForUserIds,
            messages: messages,
            createdAt: createdAt,
            lastMessageAt: lastMessageAt,
          );

      final acceptedMsgs = <Message>[
        Message(
          id: 'qa_msg_acc_1',
          senderId: 'system',
          text: 'Buchung bestätigt — ihr könnt jetzt die Übergabe planen.',
          timestamp: now.subtract(const Duration(hours: 9)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_acc_2',
          senderId: ownerA.id,
          text:
              'Hi Walid, ich habe alles vorbereitet. Passt dir Donnerstag 18:30 für die Übergabe?',
          timestamp: now.subtract(const Duration(hours: 8, minutes: 40)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_acc_3',
          senderId: userId,
          text: 'Ja, perfekt. Ich bin pünktlich da.',
          timestamp: now.subtract(const Duration(hours: 8, minutes: 12)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_acc_4',
          senderId: ownerA.id,
          text:
              'Super — die Adresse bleibt bis kurz vor der Übergabe geschützt sichtbar. Ich schicke dir rechtzeitig die letzten Details.',
          timestamp: now.subtract(const Duration(hours: 7, minutes: 50)),
          isRead: false,
        ),
      ];
      final runningMsgs = <Message>[
        Message(
          id: 'qa_msg_run_1',
          senderId: 'system',
          text:
              'Übergabe bestätigt — dieser Chat eignet sich für Rückgabezeit und kurze Abstimmung.',
          timestamp: now.subtract(const Duration(days: 1, hours: 4)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_run_2',
          senderId: ownerB.id,
          text: 'Zeitvorschlag Rückgabe: Samstag 11:00 vor dem Studioeingang.',
          timestamp: now.subtract(const Duration(hours: 20)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_run_3',
          senderId: userId,
          text: 'Klappt. Ich bin 10 Minuten früher da.',
          timestamp: now.subtract(const Duration(hours: 19, minutes: 42)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_run_4',
          senderId: 'system',
          text:
              'Hinweis: Teile sensible Adressdaten nur im vorgesehenen Übergabe-Kontext. Der Kernprozess bleibt über ShareItToo dokumentiert.',
          timestamp: now.subtract(const Duration(hours: 19, minutes: 10)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_run_5',
          senderId: ownerB.id,
          text:
              'Falls du unterwegs festhängst, gib einfach kurz Bescheid. Ich kann notfalls 15 Minuten warten, damit die Rückgabe trotzdem sauber dokumentiert bleibt und wir keine Hektik kurz vor Schluss haben.',
          timestamp: now.subtract(const Duration(hours: 18, minutes: 55)),
          isRead: false,
        ),
      ];
      final completedMsgs = <Message>[
        Message(
          id: 'qa_msg_compl_1',
          senderId: 'system',
          text:
              'Diese Miete ist abgeschlossen. Bewertungen und Dokumentation bleiben weiterhin einsehbar.',
          timestamp: now.subtract(const Duration(days: 7, hours: 3)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_compl_2',
          senderId: ownerC.id,
          text: 'Danke dir — alles kam vollständig zurück.',
          timestamp: now.subtract(
            const Duration(days: 7, hours: 2, minutes: 40),
          ),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_compl_3',
          senderId: userId,
          text: 'Top, danke für die unkomplizierte Übergabe.',
          timestamp: now.subtract(
            const Duration(days: 7, hours: 2, minutes: 10),
          ),
          isRead: true,
        ),
      ];
      final supportMsgs = <Message>[
        Message(
          id: 'qa_msg_sup_1',
          senderId: 'support',
          text: 'Hallo Walid, wir haben dein Support-Thema aufgenommen.',
          timestamp: now.subtract(const Duration(hours: 6)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_sup_2',
          senderId: userId,
          text:
              'Danke. Ich wollte nur prüfen, ob die neue Benachrichtigungsansicht sauber reagiert.',
          timestamp: now.subtract(const Duration(hours: 5, minutes: 30)),
          isRead: true,
        ),
        Message(
          id: 'qa_msg_sup_3',
          senderId: 'support',
          text:
              'Perfekt — dieser QA-Fall ist bewusst lokal markiert und verschickt nichts extern.',
          timestamp: now.subtract(const Duration(hours: 5, minutes: 8)),
          isRead: false,
        ),
      ];
      final archivedMsgs = <Message>[
        Message(
          id: 'qa_msg_arch_1',
          senderId: ownerA.id,
          text:
              'Das ist ein archivierter Testfall mit langem Vorschautext, damit die Listenansicht Zeilenumbruch, Abschneiden und Status-Kontext sauber zeigt, auch wenn ein Artikelbild gerade nicht vorhanden ist.',
          timestamp: now.subtract(const Duration(days: 2, hours: 5)),
          isRead: true,
        ),
      ];

      final sharedMsgs = <Message>[
        Message(
          id: 'qa_msg_shared_1',
          senderId: 'system',
          text:
              'Gemeinsamer QA-Fall aktiviert — beide Seiten sollen denselben Thread und dieselbe Buchung sehen.',
          timestamp: now.subtract(const Duration(hours: 18)),
          isRead: true,
        ),
        if (sharedOwner != null)
          Message(
            id: 'qa_msg_shared_2',
            senderId: sharedOwner.id,
            text: 'Perfekt — ich bereite die Übergabe für morgen vor.',
            timestamp: now.subtract(const Duration(hours: 17, minutes: 24)),
            isRead: true,
          ),
        if (sharedRenter != null)
          Message(
            id: 'qa_msg_shared_3',
            senderId: sharedRenter.id,
            text: 'Top, ich hole den Artikel selbst ab und bestätige vor Ort.',
            timestamp: now.subtract(const Duration(hours: 17, minutes: 2)),
            isRead: true,
          ),
      ];

      final acceptedThread = buildThread(
        id: 'qa_thread_accepted_$userId',
        requestId: acceptedRequest.id,
        itemId: acceptedItem.id,
        itemTitle: acceptedItem.title,
        user1Id: userId,
        user2Id: acceptedItem.ownerId,
        bookingStatus: 'accepted',
        handoverAt: acceptedRequest.start.subtract(const Duration(hours: 1)),
        returnAt: acceptedRequest.end.subtract(const Duration(hours: 2)),
        otherUserOnline: true,
        messages: acceptedMsgs,
        createdAt: now.subtract(const Duration(days: 1)),
        lastMessageAt: acceptedMsgs.last.timestamp,
      );
      final runningThread = buildThread(
        id: 'qa_thread_running_$userId',
        requestId: runningRequest.id,
        itemId: runningItem.id,
        itemTitle: runningItem.title,
        user1Id: userId,
        user2Id: runningItem.ownerId,
        bookingStatus: 'running',
        handoverAt: runningRequest.start.subtract(const Duration(hours: 1)),
        returnAt: runningRequest.end.subtract(const Duration(hours: 3)),
        otherUserOnline: false,
        otherUserLastActive: now.subtract(const Duration(minutes: 14)),
        messages: runningMsgs,
        createdAt: now.subtract(const Duration(days: 3, hours: 1)),
        lastMessageAt: runningMsgs.last.timestamp,
      );
      final completedThread = buildThread(
        id: 'qa_thread_completed_$userId',
        requestId: completedRequest.id,
        itemId: completedItem.id,
        itemTitle: completedItem.title,
        user1Id: userId,
        user2Id: completedItem.ownerId,
        bookingStatus: 'completed',
        otherUserOnline: false,
        otherUserLastActive: now.subtract(const Duration(days: 6)),
        messages: completedMsgs,
        createdAt: now.subtract(const Duration(days: 8)),
        lastMessageAt: completedMsgs.last.timestamp,
      );
      final supportThread = buildThread(
        id: 'qa_support_thread_$userId',
        requestId: 'qa_support_request_$userId',
        itemId: 'support',
        itemTitle: 'Support',
        user1Id: userId,
        user2Id: 'support',
        threadType: 'support',
        otherUserOnline: true,
        messages: supportMsgs,
        createdAt: now.subtract(const Duration(hours: 7)),
        lastMessageAt: supportMsgs.last.timestamp,
      );
      final archivedThread = buildThread(
        id: 'qa_thread_archived_$userId',
        requestId: needsReviewRequest.id,
        itemId: 'qa_missing_item_$userId',
        itemTitle: 'Objektiv ohne Bildvorschau',
        user1Id: userId,
        user2Id: needsReviewRequest.ownerId,
        bookingStatus: 'completed',
        otherUserOnline: false,
        otherUserLastActive: now.subtract(const Duration(days: 2, hours: 1)),
        archivedForUserIds: [userId],
        messages: archivedMsgs,
        createdAt: now.subtract(const Duration(days: 2, hours: 6)),
        lastMessageAt: archivedMsgs.last.timestamp,
      );

      final sharedThread =
          (sharedOwnerRenterRequest != null && sharedItem != null)
              ? buildThread(
                  id: 'qa_shared_thread_u1_u2',
                  requestId: sharedOwnerRenterRequest.id,
                  itemId: sharedItem.id,
                  itemTitle: sharedItem.title,
                  user1Id: sharedOwner!.id,
                  user2Id: sharedRenter!.id,
                  bookingStatus: 'accepted',
                  handoverAt: sharedOwnerRenterRequest.start
                      .subtract(const Duration(hours: 1)),
                  returnAt: sharedOwnerRenterRequest.end
                      .subtract(const Duration(hours: 2)),
                  otherUserOnline: true,
                  messages: sharedMsgs,
                  createdAt: now.subtract(const Duration(hours: 19)),
                  lastMessageAt: sharedMsgs.last.timestamp,
                )
              : null;

      threadList.removeWhere((e) {
        if (e is! Map) return false;
        return (e['id'] ?? '').toString() == 'qa_shared_thread_u1_u2';
      });
      threadList.addAll([
        acceptedThread.toJson(),
        runningThread.toJson(),
        completedThread.toJson(),
        supportThread.toJson(),
        archivedThread.toJson(),
        if (sharedThread != null) sharedThread.toJson(),
      ]);
      await _persistMessageThreads(prefs, threadList);

      final rawNotifs = prefs.getString(_notificationsKey);
      final List<dynamic> notifList = rawNotifs != null && rawNotifs.isNotEmpty
          ? List<dynamic>.from(jsonDecode(rawNotifs) as List)
          : <dynamic>[];
      notifList.removeWhere((e) {
        if (e is! Map) return false;
        return ((e['id'] ?? '').toString().startsWith('qa_notif_')) ||
            (((e['entityId'] ?? '').toString().startsWith('qa_')) &&
                (e['userId']?.toString() == userId));
      });

      Map<String, dynamic> qaNotif({
        required String id,
        required String category,
        required int priority,
        required String title,
        required String body,
        required String entityType,
        required String entityId,
        required DateTime ts,
        bool read = false,
        bool critical = false,
        String? ctaLabel,
        Map<String, dynamic>? payload,
      }) =>
          {
            'id': id,
            'userId': userId,
            'category': category,
            'priority': priority,
            'title': title,
            'body': body,
            'entityType': entityType,
            'entityId': entityId,
            'ctaLabel': ctaLabel,
            ...?payload,
            'critical': critical,
            'archived': false,
            'ts': ts.toIso8601String(),
            'read': read,
          };

      notifList.addAll([
        qaNotif(
          id: 'qa_notif_pending_$userId',
          category: 'bookings',
          priority: 2,
          title: 'Neue Mietanfrage eingegangen',
          body:
              '${renterA.displayName} möchte „${ownerPendingItem.title}“ vom ${ownerPendingRequest.start.day.toString().padLeft(2, '0')}.${ownerPendingRequest.start.month.toString().padLeft(2, '0')}.${ownerPendingRequest.start.year} bis ${ownerPendingRequest.end.day.toString().padLeft(2, '0')}.${ownerPendingRequest.end.month.toString().padLeft(2, '0')}.${ownerPendingRequest.end.year} mieten.',
          entityType: 'booking',
          entityId: ownerPendingRequest.id,
          ts: now.subtract(const Duration(hours: 2, minutes: 10)),
          read: false,
          ctaLabel: 'Anfrage prüfen',
          payload: {
            'requestId': ownerPendingRequest.id,
            'listingId': ownerPendingItem.id,
            'counterpartyUserId': renterA.id,
            'counterpartyName': renterA.displayName,
            'role': 'owner',
          },
        ),
        qaNotif(
          id: 'qa_notif_accepted_$userId',
          category: 'bookings',
          priority: 2,
          title: 'Anfrage bestätigt',
          body:
              'Die Buchung für „${acceptedItem.title}“ ist bestätigt. Prüfe die Abstimmung im Chat.',
          entityType: 'booking',
          entityId: acceptedRequest.id,
          ts: now.subtract(const Duration(hours: 8, minutes: 30)),
          read: false,
          ctaLabel: 'Buchung öffnen',
        ),
        qaNotif(
          id: 'qa_notif_message_$userId',
          category: 'messages',
          priority: 3,
          title: 'Neue Nachricht erhalten',
          body:
              'Mila hat dir zur Rückgabe noch eine kurze Nachricht geschickt.',
          entityType: 'thread',
          entityId: runningThread.id,
          ts: now.subtract(const Duration(hours: 1, minutes: 12)),
          read: false,
          ctaLabel: 'Chat öffnen',
        ),
        qaNotif(
          id: 'qa_notif_handover_$userId',
          category: 'bookings',
          priority: 2,
          title: 'Übergabe-Erinnerung',
          body:
              'Die bestätigte Übergabe für „${acceptedItem.title}“ startet heute Abend.',
          entityType: 'booking',
          entityId: acceptedRequest.id,
          ts: now.subtract(const Duration(hours: 5, minutes: 40)),
          read: true,
          ctaLabel: 'Details ansehen',
        ),
        qaNotif(
          id: 'qa_notif_return_$userId',
          category: 'bookings',
          priority: 2,
          title: 'Rückgabe im Blick behalten',
          body:
              'Deine laufende Miete endet bald. Prüfe die geplante Rückgabezeit im Detail.',
          entityType: 'booking',
          entityId: runningRequest.id,
          ts: now.subtract(const Duration(hours: 3, minutes: 5)),
          read: false,
          ctaLabel: 'Rückgabe prüfen',
        ),
        qaNotif(
          id: 'qa_notif_payment_$userId',
          category: 'payments',
          priority: 2,
          title: 'Auszahlung & Zahlungsmittel',
          body:
              'Dieser lokale QA-Fall zeigt dir die Zahlungs- und Auszahlungseinstiege ohne echte Bewegung.',
          entityType: 'payment',
          entityId: 'payment_methods',
          ts: now.subtract(const Duration(days: 1, hours: 2)),
          read: true,
          ctaLabel: 'Zahlungen öffnen',
        ),
        qaNotif(
          id: 'qa_notif_security_$userId',
          category: 'security',
          priority: 1,
          title: 'Verifizierung prüfen',
          body:
              'Teste hier die Sicherheits- und Verifizierungsoberfläche mit einer klaren CTA.',
          entityType: 'verification',
          entityId: 'qa_verification',
          ts: now.subtract(const Duration(days: 1, hours: 6)),
          read: false,
          critical: true,
          ctaLabel: 'Sicherheit öffnen',
        ),
        qaNotif(
          id: 'qa_notif_support_$userId',
          category: 'support',
          priority: 3,
          title: 'Support-Status aktualisiert',
          body:
              'Der lokale QA-Supportfall hat neue Informationen für dich bereit.',
          entityType: 'support',
          entityId: 'qa_support_case',
          ts: now.subtract(const Duration(hours: 4, minutes: 15)),
          read: true,
          ctaLabel: 'Support öffnen',
        ),
        qaNotif(
          id: 'qa_notif_review_$userId',
          category: 'reviews',
          priority: 4,
          title: 'Vorgang wartet auf Prüfung',
          body:
              'Ein abgeschlossener Testfall bleibt vorerst im Review-Hold, damit du diese Oberfläche prüfen kannst.',
          entityType: 'booking',
          entityId: needsReviewRequest.id,
          ts: now.subtract(const Duration(days: 2, hours: 3)),
          read: false,
          ctaLabel: 'Fall öffnen',
        ),
      ]);

      await _persistNotifications(
        prefs,
        notifList
            .map((entry) => Map<String, dynamic>.from(entry as Map))
            .toList(),
      );
      await prefs.setBool(key, true);
    } catch (e) {
      debugPrint(
        '[DataService] _ensureQaMessagesAndNotificationsForUserOnce failed: $e',
      );
    } finally {
      _qaSeedUsersInProgress.remove(userId);
    }
  }

  static Future<void> setCurrentUser(
    User user, {
    bool recoverCorruptBackendProfileCache = false,
  }) async {
    // Trusted authentication/registration hydration path. User-facing profile
    // edits must use updateCurrentUserProfile so protected fields stay closed.
    if (QaRuntimeService.isEnabled) {
      QaRuntimeService.setRuntimeUserJson(user.toJson());
      return;
    }
    var effectiveUser = user;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final remote = await BackendRepository.updateCurrentProfile(
        user.toJson(),
      );
      effectiveUser = User.fromJson(remote);
    }
    await _accountProfileMutationQueue.run(() async {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_usersKey);
      late final List<User> users;
      try {
        users = raw == null
            ? <User>[]
            : List<User>.from(_decodeLocalUsersStrict(raw));
      } on FormatException catch (error) {
        if (!recoverCorruptBackendProfileCache) rethrow;
        // This opt-in is limited to authentication hydration after the
        // backend has returned the authoritative current profile. The local
        // users document is only a cache in that path; keeping malformed
        // entries active would leave a valid server session trapped behind a
        // failed login screen. Other reads and local mutations remain strict.
        debugPrint(
          '[DataService] replacing corrupt profile cache during '
          'authoritative authentication hydration (${error.runtimeType})',
        );
        users = <User>[];
      }
      final index = users.indexWhere((entry) => entry.id == effectiveUser.id);
      if (index >= 0) {
        users[index] = effectiveUser;
      } else {
        if (users.length >= _maxLocalUsers) {
          throw StateError('Der lokale Profilbestand ist voll.');
        }
        users.add(effectiveUser);
      }
      await _persistAccountProfileDocumentsVerified(
        prefs: prefs,
        current: effectiveUser,
        users: users,
      );
    });
  }

  static Object? _validatedProfileFieldValue(
    CurrentUserProfileField field,
    Object? value,
  ) {
    const nullableStrings = <CurrentUserProfileField>{
      CurrentUserProfileField.phone,
      CurrentUserProfileField.bio,
      CurrentUserProfileField.city,
      CurrentUserProfileField.country,
      CurrentUserProfileField.workTitle,
      CurrentUserProfileField.hobbies,
      CurrentUserProfileField.homeLocation,
      CurrentUserProfileField.favoriteSong,
      CurrentUserProfileField.socialX,
      CurrentUserProfileField.socialFacebook,
      CurrentUserProfileField.socialInstagram,
      CurrentUserProfileField.socialTiktok,
      CurrentUserProfileField.socialSnapchat,
      CurrentUserProfileField.addressStreet,
      CurrentUserProfileField.addressHouseNumber,
      CurrentUserProfileField.addressPostalCode,
      CurrentUserProfileField.addressCity,
      CurrentUserProfileField.addressCountry,
      CurrentUserProfileField.addressExtra,
    };
    const requiredStrings = <CurrentUserProfileField>{
      CurrentUserProfileField.displayName,
      CurrentUserProfileField.preferredLanguage,
    };
    const booleanFields = <CurrentUserProfileField>{
      CurrentUserProfileField.showWork,
      CurrentUserProfileField.showHobbies,
      CurrentUserProfileField.showHomeLocation,
      CurrentUserProfileField.showBioPublic,
      CurrentUserProfileField.showLanguagesPublic,
      CurrentUserProfileField.showInterestsPublic,
      CurrentUserProfileField.showFavoriteSong,
    };
    if (nullableStrings.contains(field)) {
      if (value != null &&
          (value is! String || value.length > _maxLocalProfileStringLength)) {
        throw ArgumentError('Ungültiger Profilwert für ${field.name}.');
      }
      return value;
    }
    if (field == CurrentUserProfileField.photoURL) {
      if (value != null &&
          (value is! String || value.length > _maxLocalProfilePhotoUrlLength)) {
        throw ArgumentError('Ungültiger Profilwert für ${field.name}.');
      }
      return value;
    }
    if (requiredStrings.contains(field)) {
      if (value is! String ||
          value.trim().isEmpty ||
          value.length > _maxLocalProfileStringLength) {
        throw ArgumentError('Ungültiger Profilwert für ${field.name}.');
      }
      return value.trim();
    }
    if (booleanFields.contains(field)) {
      if (value is! bool) {
        throw ArgumentError('Ungültiger Profilwert für ${field.name}.');
      }
      return value;
    }
    if (field == CurrentUserProfileField.languages ||
        field == CurrentUserProfileField.interests) {
      if (value is! List<String> ||
          value.length > _maxLocalProfileListEntries ||
          value.any((entry) => entry.length > _maxLocalProfileStringLength)) {
        throw ArgumentError('Ungültiger Profilwert für ${field.name}.');
      }
      return List<String>.unmodifiable(value);
    }
    if (field == CurrentUserProfileField.homeLat ||
        field == CurrentUserProfileField.homeLng) {
      if (value != null && (value is! num || !value.toDouble().isFinite)) {
        throw ArgumentError('Ungültiger Profilwert für ${field.name}.');
      }
      return value == null ? null : (value as num).toDouble();
    }
    if (field == CurrentUserProfileField.birthDate) {
      if (value != null && value is! DateTime) {
        throw ArgumentError('Ungültiger Profilwert für ${field.name}.');
      }
      return (value as DateTime?)?.toIso8601String();
    }
    throw ArgumentError('Nicht unterstütztes Profilfeld: ${field.name}.');
  }

  static Future<User> updateCurrentUserProfile({
    required String expectedUserId,
    required Map<CurrentUserProfileField, Object?> updates,
  }) async {
    final captured =
        await _requireCurrentOperationalUser(requestedUserId: expectedUserId);
    AuthSessionOwner? owner;
    if (!QaRuntimeService.isEnabled) {
      final session = await AuthService.readSession();
      if (session == null ||
          !_sessionMatchesOperationalUser(
            session,
            userId: captured.id,
            email: captured.email,
          )) {
        throw StateError('Die lokale Kontositzung hat sich geändert.');
      }
      owner = AuthService.captureSessionOwner(session);
      if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
        throw StateError('Die lokale Kontositzung hat sich geändert.');
      }
    }
    final result = await _updateCurrentUserProfileOwned(
      captured: captured,
      owner: owner,
      updates: updates,
      typedFailures: false,
    );
    return result.user;
  }

  static Future<AccountProfileMutationResult> updateCurrentUserProfileForOwner({
    required AuthSessionOwner owner,
    required String expectedUserId,
    required Map<CurrentUserProfileField, Object?> updates,
  }) async {
    if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw const AccountProfileMutationFailure.principalChanged();
    }
    final captured =
        await _requireCurrentOperationalUser(requestedUserId: expectedUserId);
    if (!_sessionMatchesOperationalUser(
          AuthSession(
            userId: owner.userId,
            sessionId: owner.sessionId,
            email: owner.email,
            createdAt: owner.createdAt,
          ),
          userId: captured.id,
          email: captured.email,
        ) ||
        !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw const AccountProfileMutationFailure.principalChanged();
    }
    return _updateCurrentUserProfileOwned(
      captured: captured,
      owner: owner,
      updates: updates,
      typedFailures: true,
    );
  }

  static Future<AccountProfileMutationResult> _updateCurrentUserProfileOwned({
    required User captured,
    required AuthSessionOwner? owner,
    required Map<CurrentUserProfileField, Object?> updates,
    required bool typedFailures,
  }) async {
    if (updates.isEmpty) {
      return AccountProfileMutationResult(
        user: captured,
        remoteAccepted: false,
      );
    }
    final validatedUpdates = <String, Object?>{};
    for (final entry in updates.entries) {
      validatedUpdates[entry.key.name] =
          _validatedProfileFieldValue(entry.key, entry.value);
    }
    return _accountProfileMutationQueue.run(() async {
      var remoteAccepted = false;

      Future<void> verifyOwner() async {
        if (owner != null &&
            !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          if (typedFailures) {
            throw AccountProfileMutationFailure.principalChanged(
              remoteAccepted: remoteAccepted,
            );
          }
          throw StateError('Die lokale Kontositzung hat sich geändert.');
        }
        await _assertCurrentOperationalUserId(
          captured.id,
          expectedEmail: captured.email,
        );
      }

      try {
        await verifyOwner();
        final prefs = await SharedPreferences.getInstance();
        final currentRaw = prefs.getString(_currentUserKey);
        final usersRaw = prefs.getString(_usersKey);
        if (currentRaw == null || usersRaw == null) {
          throw StateError('Der lokale Profilstand ist unvollständig.');
        }
        final current = _decodeCurrentUserStrict(currentRaw);
        if (current.id != captured.id ||
            current.email.trim().toLowerCase() !=
                captured.email.trim().toLowerCase()) {
          throw const AccountProfileMutationFailure.principalChanged();
        }
        final users = List<User>.from(_decodeLocalUsersStrict(usersRaw));
        final index = users.indexWhere((entry) => entry.id == current.id);
        if (index < 0 || !_sameLocalUserDocument(users[index], current)) {
          throw StateError(
            'Das aktuelle Profil fehlt oder weicht vom Profilbestand ab.',
          );
        }
        final nextJson = Map<String, dynamic>.from(current.toJson())
          ..addAll(validatedUpdates);
        if (validatedUpdates.containsKey(CurrentUserProfileField.phone.name) &&
            nextJson['phone'] != current.phone) {
          nextJson['phoneVerified'] = false;
        }
        var next = _decodeLocalUserStrict(
          nextJson,
          context: 'Aktualisiertes lokales Kontoprofil',
        );
        if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
          if (owner == null) {
            throw const AccountProfileMutationFailure.principalChanged();
          }
          await verifyOwner();
          final remote = await BackendRepository.updateCurrentProfileForOwner(
            owner,
            next.toJson(),
          );
          remoteAccepted = true;
          await verifyOwner();
          next = _decodeLocalUserStrict(
            remote,
            context: 'Aktualisiertes Backend-Kontoprofil',
          );
        }
        if (next.id != current.id ||
            next.email != current.email ||
            next.role != current.role ||
            next.isVerified != current.isVerified ||
            next.isBanned != current.isBanned ||
            next.payoutAccountId != current.payoutAccountId ||
            next.avgRating != current.avgRating ||
            next.reviewCount != current.reviewCount ||
            next.createdAt != current.createdAt ||
            next.isDeactivated != current.isDeactivated ||
            next.deactivatedAt != current.deactivatedAt ||
            next.emailVerified != current.emailVerified) {
          throw StateError(
              'Geschützte Kontofelder dürfen nicht geändert werden.');
        }
        users[index] = next;
        await verifyOwner();
        await _persistAccountProfileDocumentsVerified(
          prefs: prefs,
          current: next,
          users: users,
          verifyAuthorization: verifyOwner,
        );
        return AccountProfileMutationResult(
          user: next,
          remoteAccepted: remoteAccepted,
        );
      } on AccountProfileMutationFailure catch (failure) {
        if (typedFailures) rethrow;
        throw StateError(
          failure.kind == AccountProfileMutationFailureKind.principalChanged
              ? 'Die lokale Kontositzung hat sich geändert.'
              : 'Die Profiländerung konnte nicht abgeschlossen werden.',
        );
      } on BackendException catch (error) {
        if (owner != null &&
            !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          if (typedFailures) {
            throw AccountProfileMutationFailure.principalChanged(
              remoteAccepted: remoteAccepted,
            );
          }
          throw StateError('Die lokale Kontositzung hat sich geändert.');
        }
        if (typedFailures) throw _accountProfileBackendFailure(error);
        rethrow;
      } catch (error, stackTrace) {
        if (owner != null &&
            !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          if (typedFailures) {
            throw AccountProfileMutationFailure.principalChanged(
              remoteAccepted: remoteAccepted,
            );
          }
          throw StateError('Die lokale Kontositzung hat sich geändert.');
        }
        if (typedFailures) {
          throw AccountProfileMutationFailure.localUnavailable(
            'local_profile_persistence_failed',
            remoteAccepted: remoteAccepted,
          );
        }
        Error.throwWithStackTrace(error, stackTrace);
      }
    });
  }

  static AccountProfileMutationFailure _accountProfileBackendFailure(
    BackendException error,
  ) {
    const rejected = <int, Set<String>>{
      400: <String>{'minimum_age_required', 'invalid_phone'},
      401: <String>{
        'authentication_required',
        'invalid_or_expired_session',
        'account_not_active',
      },
      404: <String>{'user_not_found'},
    };
    if (rejected[error.statusCode]?.contains(error.code) == true) {
      return AccountProfileMutationFailure.rejected(error.code);
    }
    return AccountProfileMutationFailure.outcomeUnknown(error.code);
  }

  /// Device-local account/profile data for an owner-requested privacy export.
  /// Other cached public profiles and authentication-session material are
  /// intentionally excluded.
  static Future<Map<String, dynamic>>
      exportCurrentAccountProfileForPrivacy() async {
    final captured = await _requireCurrentOperationalUser();
    return _accountProfileMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        captured.id,
        expectedEmail: captured.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final currentRaw = prefs.getString(_currentUserKey);
      final usersRaw = prefs.getString(_usersKey);
      if (currentRaw == null || usersRaw == null) {
        throw StateError('Der lokale Profilstand ist unvollständig.');
      }
      final current = _decodeCurrentUserStrict(currentRaw);
      final users = _decodeLocalUsersStrict(usersRaw);
      final cached = users.where((entry) => entry.id == current.id).toList();
      if (current.id != captured.id ||
          current.email != captured.email ||
          cached.length != 1 ||
          !_sameLocalUserDocument(cached.single, current)) {
        throw StateError('Der lokale Profilstand ist nicht konsistent.');
      }
      await _assertCurrentOperationalUserId(
        captured.id,
        expectedEmail: captured.email,
      );
      return <String, dynamic>{
        'scope': 'current-authenticated-account',
        'accountId': current.id,
        'profile': current.toJson(),
        'otherCachedProfilesExcluded': true,
        'authenticationSessionExcluded': true,
        'sharedPublicReputationRetainedSeparately': true,
      };
    });
  }

  @visibleForTesting
  static void failNextAccountProfilePersistenceForTesting() {
    _failNextAccountProfilePersistenceForTesting = true;
  }

  @visibleForTesting
  static void clearSessionDuringNextAccountProfilePersistenceForTesting() {
    _clearSessionDuringNextAccountProfilePersistenceForTesting = true;
  }

  static Future<void> clearCurrentUser() async {
    if (QaRuntimeService.isEnabled) {
      QaRuntimeService.clearRuntimeUser();
      return;
    }
    await _accountProfileMutationQueue.run(() async {
      final prefs = await SharedPreferences.getInstance();
      if (!await prefs.remove(_currentUserKey) ||
          prefs.containsKey(_currentUserKey)) {
        throw StateError('Das lokale Kontoprofil wurde nicht entfernt.');
      }
    });
  }

  /// Removes the device-local current profile only when it still belongs to
  /// the captured principal. A missing profile is already clean; malformed or
  /// successor-principal state fails closed and is preserved.
  static Future<bool> clearCurrentUserIfMatches({
    required String userId,
    required String email,
  }) async {
    final expectedId = userId.trim();
    final expectedEmail = email.trim().toLowerCase();
    if (expectedId.isEmpty || expectedEmail.isEmpty) return false;
    if (QaRuntimeService.isEnabled) {
      final raw = QaRuntimeService.runtimeUserJson;
      if (raw == null) return true;
      try {
        final current = User.fromJson(raw);
        if (current.id.trim() != expectedId ||
            current.email.trim().toLowerCase() != expectedEmail) {
          return false;
        }
        QaRuntimeService.clearRuntimeUser();
        return QaRuntimeService.runtimeUserJson == null;
      } catch (_) {
        return false;
      }
    }
    return _accountProfileMutationQueue.run(() async {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_currentUserKey);
      if (raw == null) return true;
      User current;
      try {
        current = _decodeCurrentUserStrict(raw);
      } catch (_) {
        return false;
      }
      if (current.id.trim() != expectedId ||
          current.email.trim().toLowerCase() != expectedEmail) {
        return false;
      }
      final removed = await prefs.remove(_currentUserKey);
      return removed && !prefs.containsKey(_currentUserKey);
    });
  }

  /// Read-only current-profile snapshot for an already epoch-bound session
  /// transition. Unlike getCurrentUser this never seeds, hydrates or removes
  /// data based on a changing auth session.
  static Future<User?> readCurrentUserForSessionTransition() async {
    if (QaRuntimeService.isEnabled) {
      final raw = QaRuntimeService.runtimeUserJson;
      if (raw == null) return null;
      try {
        return User.fromJson(raw);
      } catch (_) {
        return null;
      }
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_currentUserKey);
      if (raw == null || raw.isEmpty) return null;
      return _decodeCurrentUserStrict(raw);
    } catch (_) {
      return null;
    }
  }

  /// Hydrates the current profile only while the exact captured session owner
  /// remains current. Remote reads never call the profile update endpoint, and
  /// the final local persistence repeats authorization inside the profile
  /// mutation queue.
  static Future<User?> syncCurrentUserForSessionOwner(
    AuthSessionOwner owner,
  ) async {
    if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) return null;

    User? match;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final remote = await BackendRepository.getCurrentProfileForOwner(owner);
      match = User.fromJson(remote);
    } else {
      final users = await getUsers();
      final normalized = owner.email.trim().toLowerCase();
      for (final user in users) {
        if (user.email.trim().toLowerCase() == normalized) {
          match = user;
          break;
        }
      }
      match ??= normalized == 'demo@shareittoo.app' && users.isNotEmpty
          ? users.first
          : null;
    }
    if (match == null ||
        match.email.trim().toLowerCase() != owner.email.trim().toLowerCase() ||
        ((owner.userId ?? '').trim().isNotEmpty &&
            match.id.trim() != owner.userId!.trim()) ||
        !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      return null;
    }

    if (QaRuntimeService.isEnabled) {
      QaRuntimeService.setRuntimeUserJson(match.toJson());
      return await AuthService.isSessionOwnerDefinitelyCurrent(owner)
          ? match
          : null;
    }
    final resolved = match;

    return _accountProfileMutationQueue.run(() async {
      Future<void> verifyOwner() async {
        if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          throw StateError('Die Kontositzung hat sich geändert.');
        }
      }

      await verifyOwner();
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_usersKey);
      final users = raw == null
          ? <User>[]
          : List<User>.from(_decodeLocalUsersStrict(raw));
      final index = users.indexWhere((entry) => entry.id == resolved.id);
      if (index >= 0) {
        users[index] = resolved;
      } else {
        if (users.length >= _maxLocalUsers) {
          throw StateError('Der lokale Profilbestand ist voll.');
        }
        users.add(resolved);
      }
      await _persistAccountProfileDocumentsVerified(
        prefs: prefs,
        current: resolved,
        users: users,
        verifyAuthorization: verifyOwner,
      );
      return resolved;
    });
  }

  static Future<void> syncCurrentUserForSessionEmail(String email) async {
    final normalized = email.trim().toLowerCase();
    if (normalized.isEmpty) return;

    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final remote = await BackendRepository.getCurrentProfile();
      final user = User.fromJson(remote);
      await setCurrentUser(
        user,
        recoverCorruptBackendProfileCache: true,
      );
      return;
    }

    final users = await getUsers();
    User? match;
    for (final user in users) {
      if (user.email.trim().toLowerCase() == normalized) {
        match = user;
        break;
      }
    }

    match ??= normalized == 'demo@shareittoo.app' && users.isNotEmpty
        ? users.first
        : null;

    if (match != null) {
      await setCurrentUser(match);
    }
  }

  static Future<void> clearCurrentUserAndMarkDeleted() async {
    await _accountProfileMutationQueue.run(() async {
      final prefs = await SharedPreferences.getInstance();
      final previousCurrent = prefs.getString(_currentUserKey);
      final hadDeletedMarker = prefs.containsKey(_accountDeletedKey);
      final previousDeletedMarker = prefs.getBool(_accountDeletedKey);
      try {
        if (!await prefs.setBool(_accountDeletedKey, true) ||
            prefs.getBool(_accountDeletedKey) != true ||
            !await prefs.remove(_currentUserKey) ||
            prefs.containsKey(_currentUserKey)) {
          throw StateError('Das lokale Kontoprofil wurde nicht entfernt.');
        }
      } catch (error) {
        await _restorePreferenceString(
          prefs,
          _currentUserKey,
          previousCurrent,
        );
        if (hadDeletedMarker) {
          await prefs.setBool(_accountDeletedKey, previousDeletedMarker!);
        } else {
          await prefs.remove(_accountDeletedKey);
        }
        rethrow;
      }
      debugPrint(
        '[DataService] Account marked deleted and current user cleared',
      );
    });
  }

  static User _anonymizedDeletedUser(User current) {
    final now = DateTime.now();
    return _decodeLocalUserStrict(
      <String, dynamic>{
        ...current.toJson(),
        'displayName': 'Gelöschter Nutzer',
        'email': 'deleted+${current.id}@shareittoo.invalid',
        'phone': null,
        'emailVerified': false,
        'phoneVerified': false,
        'photoURL': null,
        'bio': null,
        'city': null,
        'country': null,
        'isVerified': false,
        'payoutAccountId': null,
        'languages': const <String>[],
        'interests': const <String>[],
        'workTitle': null,
        'hobbies': null,
        'homeLocation': null,
        'favoriteSong': null,
        'showWork': false,
        'showHobbies': false,
        'showHomeLocation': false,
        'showBioPublic': false,
        'showLanguagesPublic': false,
        'showInterestsPublic': false,
        'showFavoriteSong': false,
        'homeLat': null,
        'homeLng': null,
        'birthDate': null,
        'socialX': null,
        'socialFacebook': null,
        'socialInstagram': null,
        'socialTiktok': null,
        'socialSnapchat': null,
        'addressStreet': null,
        'addressHouseNumber': null,
        'addressPostalCode': null,
        'addressCity': null,
        'addressCountry': null,
        'addressExtra': null,
        'isDeactivated': true,
        'deactivatedAt': now.toIso8601String(),
      },
      context: 'Anonymisiertes lokales Kontoprofil',
    );
  }

  /// Applies a server-confirmed account deletion to the exact cached profile.
  /// The deleted A profile is anonymized in the shared cache. The current
  /// profile and global deleted marker are changed only when they still belong
  /// to A, so a successor Account B remains fully usable.
  static Future<void> finalizeProfileForConfirmedAccountDeletion({
    required String userId,
    required String email,
  }) async {
    final expectedId = userId.trim();
    final expectedEmail = email.trim().toLowerCase();
    if (expectedId.isEmpty || expectedEmail.isEmpty) {
      throw ArgumentError('A confirmed deletion requires an exact profile.');
    }
    if (QaRuntimeService.isEnabled) {
      final raw = QaRuntimeService.runtimeUserJson;
      if (raw == null) return;
      final current = User.fromJson(raw);
      if (current.id.trim() == expectedId &&
          current.email.trim().toLowerCase() == expectedEmail) {
        QaRuntimeService.clearRuntimeUser();
      }
      return;
    }

    await _accountProfileMutationQueue.run(() async {
      final prefs = await SharedPreferences.getInstance();
      final previousUsers = prefs.getString(_usersKey);
      final previousCurrent = prefs.getString(_currentUserKey);
      final hadDeletedMarker = prefs.containsKey(_accountDeletedKey);
      final previousDeletedMarker = prefs.getBool(_accountDeletedKey);
      if (previousUsers == null) {
        throw StateError('Der lokale Profilbestand fehlt.');
      }
      final users = List<User>.from(_decodeLocalUsersStrict(previousUsers));
      final index = users.indexWhere((entry) =>
          entry.id.trim() == expectedId &&
          entry.email.trim().toLowerCase() == expectedEmail);
      if (index < 0) {
        throw StateError('Das bestätigte Löschprofil fehlt lokal.');
      }
      users[index] = _anonymizedDeletedUser(users[index]);

      var currentMatchesDeleted = false;
      if (previousCurrent != null) {
        final current = _decodeCurrentUserStrict(previousCurrent);
        currentMatchesDeleted = current.id.trim() == expectedId &&
            current.email.trim().toLowerCase() == expectedEmail;
      }
      final encodedUsers =
          jsonEncode(users.map((entry) => entry.toJson()).toList());
      _decodeLocalUsersStrict(encodedUsers);
      try {
        if (!await prefs.setString(_usersKey, encodedUsers) ||
            prefs.getString(_usersKey) != encodedUsers) {
          throw StateError('Das gelöschte Profil wurde nicht anonymisiert.');
        }
        if (currentMatchesDeleted) {
          if (!await prefs.setBool(_accountDeletedKey, true) ||
              prefs.getBool(_accountDeletedKey) != true ||
              !await prefs.remove(_currentUserKey) ||
              prefs.containsKey(_currentUserKey)) {
            throw StateError(
              'Das bestätigte Löschprofil wurde nicht finalisiert.',
            );
          }
        }
        _decodeLocalUsersStrict(prefs.getString(_usersKey)!);
        if (!currentMatchesDeleted &&
            prefs.getString(_currentUserKey) != previousCurrent) {
          throw StateError('Ein Nachfolgerprofil wurde verändert.');
        }
      } catch (error) {
        final usersRestored =
            await _restorePreferenceString(prefs, _usersKey, previousUsers);
        final currentRestored = await _restorePreferenceString(
          prefs,
          _currentUserKey,
          previousCurrent,
        );
        final markerRestored = hadDeletedMarker
            ? await prefs.setBool(_accountDeletedKey, previousDeletedMarker!)
            : await prefs.remove(_accountDeletedKey);
        if (!usersRestored || !currentRestored || !markerRestored) {
          throw StateError(
            'Profil-Löschfehler; der vorherige Stand konnte nicht vollständig wiederhergestellt werden.',
          );
        }
        rethrow;
      }
    });
  }

  static Future<void> anonymizeAndDeactivateUser({
    required String userId,
  }) async {
    final captured =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    await _accountProfileMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        captured.id,
        expectedEmail: captured.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final usersJson = prefs.getString(_usersKey);
      final currentJson = prefs.getString(_currentUserKey);
      if (usersJson == null || currentJson == null) {
        throw StateError('Der lokale Profilstand ist unvollständig.');
      }
      final current = _decodeCurrentUserStrict(currentJson);
      if (current.id != captured.id || current.email != captured.email) {
        throw StateError('Die lokale Kontositzung hat sich geändert.');
      }
      final users = List<User>.from(_decodeLocalUsersStrict(usersJson));
      final index = users.indexWhere((entry) => entry.id == captured.id);
      if (index < 0 || !_sameLocalUserDocument(users[index], current)) {
        throw StateError(
          'Das aktuelle Profil fehlt oder weicht vom Profilbestand ab.',
        );
      }
      final anonymized = _anonymizedDeletedUser(current);
      users[index] = anonymized;
      await _persistAccountProfileDocumentsVerified(
        prefs: prefs,
        current: anonymized,
        users: users,
      );
      debugPrint('[DataService] User $userId anonymized/deactivated');
    });
  }

  static Future<void> deactivateAllListingsForUser(String userId) async {
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    await _listingMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        userId,
        expectedEmail: current.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final items = _readListingsStrict(prefs);
      var mutated = false;
      final endedAt = DateTime.now().toIso8601String();
      for (var index = 0; index < items.length; index++) {
        final item = items[index];
        if (item.ownerId != userId || item.status == 'ended') continue;
        items[index] = Item.fromJson(<String, dynamic>{
          ...item.toJson(),
          'status': 'ended',
          'isActive': false,
          'endedAt': endedAt,
          'catalogRevision': item.catalogRevision + 1,
        });
        mutated = true;
      }
      if (mutated) {
        await _assertCurrentOperationalUserId(
          userId,
          expectedEmail: current.email,
        );
        await _persistListings(prefs, items);
        SharedPersistenceSync.notify(SharedPersistenceSync.listingCatalogKey);
        debugPrint('[DataService] Deactivated all listings for user $userId');
      }
    });
  }

  static Future<void> archiveAllMessageThreadsForUser(String userId) async {
    await _requireCurrentOperationalUser(requestedUserId: userId);
    await _operationalMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(userId);
      final prefs = await SharedPreferences.getInstance();
      final raw = BackendConfig.enabled && !QaRuntimeService.isEnabled
          ? prefs.getString(_messageThreadsKey)
          : await _readMessageThreads(prefs);
      if (raw == null) return;
      final threads = _decodeMessageThreadsStrict(raw);

      var mutated = false;
      for (var index = 0; index < threads.length; index++) {
        final thread = threads[index];
        if (!_isThreadParticipant(thread, userId)) continue;
        final archived = <String>{...thread.archivedForUserIds, userId};
        final deleted = <String>{...thread.deletedForUserIds, userId};
        if (archived.length != thread.archivedForUserIds.length ||
            deleted.length != thread.deletedForUserIds.length) {
          threads[index] = thread.copyWith(
            archivedForUserIds: archived.toList()..sort(),
            deletedForUserIds: deleted.toList()..sort(),
          );
          mutated = true;
        }
      }

      if (mutated) {
        await _persistMessageThreads(
          prefs,
          threads.map((entry) => entry.toJson()).toList(),
        );
        debugPrint(
          '[DataService] Archived all message threads for user $userId',
        );
      }
    });
  }

  static const String _savedItemsKey = 'saved_item_ids';

  static Future<void> updateItemStatus({
    required String itemId,
    required String status,
  }) async {
    if (!const <String>{'active', 'paused', 'ended', 'draft'}
        .contains(status)) {
      throw StateError('Ungültiger Anzeigenstatus.');
    }
    final current = await _requireCurrentOperationalUser();
    await _listingMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final items = _readListingsStrict(prefs);
      final index = items.indexWhere((item) => item.id == itemId);
      if (index < 0 && (!BackendConfig.enabled || QaRuntimeService.isEnabled)) {
        throw StateError('Die lokale Anzeige wurde nicht gefunden.');
      }
      if (index >= 0 && items[index].ownerId != current.id) {
        throw StateError('Die lokale Anzeige gehört zu einem anderen Konto.');
      }

      Item effective;
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final remote = await BackendRepository.updateListingStatus(
          id: itemId,
          status: status,
        );
        await _assertCurrentOperationalUserId(
          current.id,
          expectedEmail: current.email,
        );
        effective = Item.fromJson(remote);
        if (effective.ownerId != current.id) {
          throw StateError(
              'Die gespeicherte Anzeige gehört zu einem anderen Konto.');
        }
      } else {
        final existing = items[index];
        effective = Item.fromJson(<String, dynamic>{
          ...existing.toJson(),
          'status': status,
          'isActive': status == 'active',
          'endedAt':
              status == 'ended' ? DateTime.now().toIso8601String() : null,
          'catalogRevision': existing.catalogRevision + 1,
        });
      }
      if (index < 0) {
        if (items.length >= _maxLocalListings) {
          throw StateError('Der lokale Anzeigenkatalog ist voll.');
        }
        items.add(effective);
      } else {
        items[index] = effective;
      }
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      await _persistListings(prefs, items);
      SharedPersistenceSync.notify(SharedPersistenceSync.listingCatalogKey);
    });
  }

  static Future<Item> updateItem(Item updated) async {
    final current = await _requireCurrentOperationalUser(
      requestedUserId: updated.ownerId,
    );
    return _listingMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final items = _readListingsStrict(prefs);
      final index = items.indexWhere((item) => item.id == updated.id);
      if (index < 0 && (!BackendConfig.enabled || QaRuntimeService.isEnabled)) {
        throw StateError('Die lokale Anzeige wurde nicht gefunden.');
      }
      if (index >= 0 && items[index].ownerId != current.id) {
        throw StateError('Die lokale Anzeige gehört zu einem anderen Konto.');
      }

      Item effectiveUpdated;
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final remote = await BackendRepository.updateListing(updated.toJson());
        await _assertCurrentOperationalUserId(
          current.id,
          expectedEmail: current.email,
        );
        effectiveUpdated = Item.fromJson(remote);
        if (effectiveUpdated.ownerId != current.id) {
          throw StateError(
              'Die gespeicherte Anzeige gehört zu einem anderen Konto.');
        }
      } else {
        final existing = items[index];
        if (updated.catalogRevision != existing.catalogRevision) {
          throw StateError(
            'Die Anzeige wurde zwischenzeitlich geändert. Bitte neu laden.',
          );
        }
        effectiveUpdated = Item.fromJson(<String, dynamic>{
          ...updated.toJson(),
          'ownerId': existing.ownerId,
          'catalogRevision': existing.catalogRevision + 1,
        });
      }

      if (index < 0) {
        if (items.length >= _maxLocalListings) {
          throw StateError('Der lokale Anzeigenkatalog ist voll.');
        }
        items.add(effectiveUpdated);
      } else {
        items[index] = effectiveUpdated;
      }
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      await _persistListings(prefs, items);
      SharedPersistenceSync.notify(SharedPersistenceSync.listingCatalogKey);
      return effectiveUpdated;
    });
  }

  static Future<void> deleteItemById(String itemId) async {
    final current = await _requireCurrentOperationalUser();
    await _listingMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final items = _readListingsStrict(prefs);
      final index = items.indexWhere((item) => item.id == itemId);
      if (index < 0) {
        throw StateError('Die lokale Anzeige wurde nicht gefunden.');
      }
      if (items[index].ownerId != current.id) {
        throw StateError('Die lokale Anzeige gehört zu einem anderen Konto.');
      }
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        await BackendRepository.deleteListing(itemId);
        await _assertCurrentOperationalUserId(
          current.id,
          expectedEmail: current.email,
        );
      }
      items.removeAt(index);
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      await _persistListings(prefs, items);
      SharedPersistenceSync.notify(SharedPersistenceSync.listingCatalogKey);
    });
  }

  static Future<AccountListingMutationResult> updateItemForOwner({
    required AuthSessionOwner owner,
    required Item updated,
  }) =>
      _runListingMutationForOwner(
        owner: owner,
        expectedOwnerId: updated.ownerId,
        operation: (captured, verifyOwner, attempt) async {
          final prefs = await SharedPreferences.getInstance();
          final items = _readListingsStrict(prefs);
          final index = items.indexWhere((item) => item.id == updated.id);
          if (index < 0 &&
              (!BackendConfig.enabled || QaRuntimeService.isEnabled)) {
            throw StateError('Die lokale Anzeige wurde nicht gefunden.');
          }
          if (index >= 0 && items[index].ownerId != captured.id) {
            throw const AccountListingMutationFailure.principalChanged();
          }

          Item effective;
          if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
            await verifyOwner();
            final remote = await BackendRepository.updateListingForOwner(
              owner: owner,
              listing: updated.toJson(),
            );
            attempt.remoteAccepted = true;
            await verifyOwner();
            effective = Item.fromJson(remote);
            if (effective.ownerId != captured.id) {
              throw StateError(
                'Die gespeicherte Anzeige gehört zu einem anderen Konto.',
              );
            }
          } else {
            final existing = items[index];
            if (updated.catalogRevision != existing.catalogRevision) {
              throw StateError(
                'Die Anzeige wurde zwischenzeitlich geändert. Bitte neu laden.',
              );
            }
            effective = Item.fromJson(<String, dynamic>{
              ...updated.toJson(),
              'ownerId': existing.ownerId,
              'catalogRevision': existing.catalogRevision + 1,
            });
          }
          if (index < 0) {
            if (items.length >= _maxLocalListings) {
              throw StateError('Der lokale Anzeigenkatalog ist voll.');
            }
            items.add(effective);
          } else {
            items[index] = effective;
          }
          await verifyOwner();
          await _persistListings(
            prefs,
            items,
            verifyAuthorization: verifyOwner,
          );
          SharedPersistenceSync.notify(
            SharedPersistenceSync.listingCatalogKey,
          );
          return effective;
        },
      );

  static Future<AccountListingMutationResult> updateItemStatusForOwner({
    required AuthSessionOwner owner,
    required String expectedOwnerId,
    required String itemId,
    required String status,
  }) async {
    if (!const <String>{'active', 'paused', 'ended', 'draft'}
        .contains(status)) {
      throw const AccountListingMutationFailure.rejected(
        'invalid_listing_status',
      );
    }
    return _runListingMutationForOwner(
      owner: owner,
      expectedOwnerId: expectedOwnerId,
      operation: (captured, verifyOwner, attempt) async {
        final prefs = await SharedPreferences.getInstance();
        final items = _readListingsStrict(prefs);
        final index = items.indexWhere((item) => item.id == itemId);
        if (index < 0 &&
            (!BackendConfig.enabled || QaRuntimeService.isEnabled)) {
          throw StateError('Die lokale Anzeige wurde nicht gefunden.');
        }
        if (index >= 0 && items[index].ownerId != captured.id) {
          throw const AccountListingMutationFailure.principalChanged();
        }

        Item effective;
        if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
          await verifyOwner();
          final remote = await BackendRepository.updateListingStatusForOwner(
            owner: owner,
            id: itemId,
            status: status,
          );
          attempt.remoteAccepted = true;
          await verifyOwner();
          effective = Item.fromJson(remote);
          if (effective.ownerId != captured.id) {
            throw StateError(
              'Die gespeicherte Anzeige gehört zu einem anderen Konto.',
            );
          }
        } else {
          final existing = items[index];
          effective = Item.fromJson(<String, dynamic>{
            ...existing.toJson(),
            'status': status,
            'isActive': status == 'active',
            'endedAt':
                status == 'ended' ? DateTime.now().toIso8601String() : null,
            'catalogRevision': existing.catalogRevision + 1,
          });
        }
        if (index < 0) {
          if (items.length >= _maxLocalListings) {
            throw StateError('Der lokale Anzeigenkatalog ist voll.');
          }
          items.add(effective);
        } else {
          items[index] = effective;
        }
        await verifyOwner();
        await _persistListings(
          prefs,
          items,
          verifyAuthorization: verifyOwner,
        );
        SharedPersistenceSync.notify(
          SharedPersistenceSync.listingCatalogKey,
        );
        return effective;
      },
    );
  }

  static Future<AccountListingMutationResult> deleteItemByIdForOwner({
    required AuthSessionOwner owner,
    required String expectedOwnerId,
    required String itemId,
  }) =>
      _runListingMutationForOwner(
        owner: owner,
        expectedOwnerId: expectedOwnerId,
        operation: (captured, verifyOwner, attempt) async {
          final prefs = await SharedPreferences.getInstance();
          final items = _readListingsStrict(prefs);
          final index = items.indexWhere((item) => item.id == itemId);
          if (index < 0 &&
              (!BackendConfig.enabled || QaRuntimeService.isEnabled)) {
            throw StateError('Die lokale Anzeige wurde nicht gefunden.');
          }
          if (index >= 0 && items[index].ownerId != captured.id) {
            throw const AccountListingMutationFailure.principalChanged();
          }
          if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
            await verifyOwner();
            await BackendRepository.deleteListingForOwner(
              owner: owner,
              id: itemId,
            );
            attempt.remoteAccepted = true;
            await verifyOwner();
          }
          if (index >= 0) items.removeAt(index);
          await verifyOwner();
          await _persistListings(
            prefs,
            items,
            verifyAuthorization: verifyOwner,
          );
          SharedPersistenceSync.notify(
            SharedPersistenceSync.listingCatalogKey,
          );
          return null;
        },
      );

  static bool isPublicCatalogItem(Item item) =>
      item.status == 'active' && item.isActive == true;

  @visibleForTesting
  static bool shouldUseDedicatedPublicRemoteCatalog({
    required bool backendEnabled,
    required bool qaRuntimeEnabled,
  }) =>
      backendEnabled && !qaRuntimeEnabled;

  static Future<List<Item>> getPublicItems() async {
    final items = <Item>[];
    if (shouldUseDedicatedPublicRemoteCatalog(
      backendEnabled: BackendConfig.enabled,
      qaRuntimeEnabled: QaRuntimeService.isEnabled,
    )) {
      // Explore is a public-catalog surface. Do not route it through
      // getItems(), whose authenticated backend path deliberately merges
      // /listings/mine for owner-management screens. A slow account-scoped
      // owner request must never hold the public catalog spinner open.
      final remote = await BackendRepository.searchListings(
        sort: 'newest',
        limit: 100,
      );
      for (final entry in remote) {
        try {
          items.add(Item.fromJson(entry));
        } catch (error) {
          debugPrint('[DataService] skipped invalid public listing: $error');
        }
      }
    } else {
      items.addAll(await getItems());
    }
    final blockedUserIds =
        (await BlockedUsersService.getBlockedUserIds()).toSet();
    final filtered = items
        .where(isPublicCatalogItem)
        .where((item) => !blockedUserIds.contains(item.ownerId))
        .toList();
    filtered.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return filtered;
  }

  static Future<List<Item>> searchPublicItems({
    String? query,
    List<String> categoryIds = const <String>[],
    List<String> conditions = const <String>[],
    double? minPrice,
    double? maxPrice,
    double? latitude,
    double? longitude,
    double? radiusKm,
    String sort = 'newest',
    int limit = 100,
  }) async {
    List<Item> items;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final remote = await BackendRepository.searchListings(
        query: query,
        categoryIds: categoryIds,
        conditions: conditions,
        minPrice: minPrice,
        maxPrice: maxPrice,
        latitude: latitude,
        longitude: longitude,
        radiusKm: radiusKm,
        sort: sort,
        limit: limit,
      );
      items = <Item>[];
      for (final entry in remote) {
        try {
          items.add(Item.fromJson(entry));
        } catch (error) {
          debugPrint('[DataService] skipped invalid search result: $error');
        }
      }
    } else {
      final normalizedQuery = query?.trim().toLowerCase() ?? '';
      final boundedLimit = limit.clamp(1, 100).toInt();
      items = (await getPublicItems()).where((item) {
        if (normalizedQuery.isNotEmpty &&
            !item.title.toLowerCase().contains(normalizedQuery) &&
            !item.description.toLowerCase().contains(normalizedQuery) &&
            !item.tags
                .any((tag) => tag.toLowerCase().contains(normalizedQuery))) {
          return false;
        }
        if (categoryIds.isNotEmpty && !categoryIds.contains(item.categoryId)) {
          return false;
        }
        if (conditions.isNotEmpty && !conditions.contains(item.condition)) {
          return false;
        }
        if (minPrice != null && item.pricePerDay < minPrice) return false;
        if (maxPrice != null && item.pricePerDay > maxPrice) return false;
        if (latitude != null && longitude != null && radiusKm != null) {
          final distance =
              estimateDistanceKm(item.lat, item.lng, latitude, longitude);
          if (distance > radiusKm) return false;
        }
        return true;
      }).toList();
      if (sort == 'price_asc') {
        items.sort(
            (left, right) => left.pricePerDay.compareTo(right.pricePerDay));
      } else if (sort == 'price_desc') {
        items.sort(
            (left, right) => right.pricePerDay.compareTo(left.pricePerDay));
      } else if (sort == 'distance' && latitude != null && longitude != null) {
        items.sort((left, right) => estimateDistanceKm(
                left.lat, left.lng, latitude, longitude)
            .compareTo(
                estimateDistanceKm(right.lat, right.lng, latitude, longitude)));
      } else {
        items.sort((left, right) => right.createdAt.compareTo(left.createdAt));
      }
      items = items.take(boundedLimit).toList();
    }
    final blockedUserIds =
        (await BlockedUsersService.getBlockedUserIds()).toSet();
    return items
        .where((item) => !blockedUserIds.contains(item.ownerId))
        .toList();
  }

  static Future<RentalCart> _readLegacyLocalRentalCartUnlocked() async {
    final prefs = await SharedPreferences.getInstance();
    final itemsRaw = prefs.getString(_rentalCartKey);
    final projectsRaw = prefs.getString(_projectCartKey);
    final itemDocument = itemsRaw == null || itemsRaw.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(itemsRaw);
    final projectDocument = projectsRaw == null || projectsRaw.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(projectsRaw);
    if (itemDocument is! Map || projectDocument is! Map) {
      throw const FormatException('Invalid local rental cart document');
    }
    final items = itemDocument['items'];
    final canonicalProjects = itemDocument['projects'];
    final legacyProjects = projectDocument['projects'];
    if (items != null && items is! List) {
      throw const FormatException('Invalid local rental cart items');
    }
    if (canonicalProjects != null && canonicalProjects is! List) {
      throw const FormatException('Invalid local rental cart projects');
    }
    if (legacyProjects != null && legacyProjects is! List) {
      throw const FormatException('Invalid local rental cart projects');
    }

    // New writes keep the complete cart in the rental-cart document, which is
    // one atomic SharedPreferences value. The project document remains a
    // compatibility mirror only. This makes a process stop between the two
    // writes recoverable without combining different revisions.
    if (canonicalProjects is List) {
      return RentalCart.fromJson(<String, dynamic>{
        'schemaVersion': 1,
        'revision': (itemDocument['revision'] as num?)?.toInt() ?? 0,
        'reservationCreated': false,
        'projects': canonicalProjects,
        'items': items ?? const <dynamic>[],
      }, localDeviceOnly: true);
    }

    final itemRevision = (itemDocument['revision'] as num?)?.toInt();
    final projectRevision = (projectDocument['revision'] as num?)?.toInt();
    if (itemsRaw != null &&
        itemsRaw.isNotEmpty &&
        projectsRaw != null &&
        projectsRaw.isNotEmpty &&
        itemRevision != null &&
        projectRevision != null &&
        itemRevision != projectRevision) {
      throw const FormatException(
        'Mismatched legacy local rental cart revisions',
      );
    }
    return RentalCart.fromJson(<String, dynamic>{
      'schemaVersion': 1,
      'revision': max(
        itemRevision ?? 0,
        projectRevision ?? 0,
      ),
      'reservationCreated': false,
      'projects': legacyProjects ?? const <dynamic>[],
      'items': items ?? const <dynamic>[],
    }, localDeviceOnly: true);
  }

  static Future<_LocalRentalCartRegistry> _readLocalRentalCartRegistry(
    SharedPreferences prefs,
  ) async {
    final raw = prefs.getString(_rentalCartPrincipalStateKey);
    if (raw == null) {
      try {
        final legacyCart = await _readLegacyLocalRentalCartUnlocked();
        final pendingRaw = prefs.getString(_rentalCartSyncOwnerKey)?.trim();
        final pendingToken = pendingRaw == null || pendingRaw.isEmpty
            ? null
            : (RegExp(r'^p_[a-f0-9]{64}$').hasMatch(pendingRaw)
                ? pendingRaw
                : LocalPrincipalScope.tokenForUserId(pendingRaw));
        return _LocalRentalCartRegistry(
          revision: 0,
          principals: <String, _LocalRentalCartBucket>{
            LocalPrincipalIdentity.guest.token: _LocalRentalCartBucket(
              cart: legacyCart,
              syncOwnerToken: pendingToken,
            ),
          },
        );
      } on FormatException {
        return _LocalRentalCartRegistry(
          revision: 0,
          principals: <String, _LocalRentalCartBucket>{},
          legacyGuestQuarantined: true,
        );
      }
    }
    if (raw.isEmpty) {
      throw const FormatException('Invalid principal rental-cart registry');
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      throw const FormatException('Invalid principal rental-cart registry');
    }
    if (decoded is! Map ||
        decoded['schemaVersion'] != 1 ||
        decoded['revision'] is! int ||
        (decoded['revision'] as int) < 1 ||
        decoded['principals'] is! Map ||
        decoded['legacyGuestQuarantined'] is! bool) {
      throw const FormatException('Invalid principal rental-cart registry');
    }
    final principals = <String, _LocalRentalCartBucket>{};
    final quarantinedPrincipals = <String, dynamic>{};
    for (final entry in (decoded['principals'] as Map).entries) {
      final token = entry.key;
      final bucket = entry.value;
      if (token is! String ||
          (token != LocalPrincipalIdentity.guest.token &&
              !RegExp(r'^p_[a-f0-9]{64}$').hasMatch(token))) {
        throw const FormatException('Invalid principal rental-cart bucket');
      }
      try {
        if (bucket is! Map || bucket['cart'] is! Map) {
          throw const FormatException('Invalid principal rental-cart bucket');
        }
        final syncOwner = bucket['syncOwnerToken'];
        if (syncOwner != null &&
            (syncOwner is! String ||
                !RegExp(r'^p_[a-f0-9]{64}$').hasMatch(syncOwner))) {
          throw const FormatException('Invalid rental-cart sync owner');
        }
        principals[token] = _LocalRentalCartBucket(
          cart: _decodePrincipalRentalCart(
            Map<String, dynamic>.from(bucket['cart'] as Map),
          ),
          syncOwnerToken: syncOwner as String?,
        );
      } catch (_) {
        quarantinedPrincipals[token] = bucket;
      }
    }
    return _LocalRentalCartRegistry(
      revision: decoded['revision'] as int,
      principals: principals,
      quarantinedPrincipals: quarantinedPrincipals,
      legacyGuestQuarantined: decoded['legacyGuestQuarantined'] as bool,
    );
  }

  static RentalCart _decodePrincipalRentalCart(Map<String, dynamic> value) {
    final projects = value['projects'];
    final items = value['items'];
    if (value['schemaVersion'] != 1 ||
        value['revision'] is! int ||
        (value['revision'] as int) < 0 ||
        value['reservationCreated'] == true ||
        projects is! List ||
        items is! List ||
        projects.length > 20 ||
        items.length > 100) {
      throw const FormatException('Invalid principal rental cart');
    }
    final projectIds = <String>{};
    for (final entry in projects) {
      if (entry is! Map ||
          entry['id'] is! String ||
          (entry['id'] as String).trim().isEmpty ||
          !projectIds.add(entry['id'] as String) ||
          entry['title'] is! String ||
          (entry['title'] as String).trim().isEmpty ||
          (entry['answers'] != null && entry['answers'] is! Map)) {
        throw const FormatException('Invalid principal rental-cart project');
      }
    }
    final itemIds = <String>{};
    for (final entry in items) {
      if (entry is! Map ||
          entry['id'] is! String ||
          (entry['id'] as String).trim().isEmpty ||
          !itemIds.add(entry['id'] as String) ||
          entry['listingId'] is! String ||
          (entry['listingId'] as String).trim().isEmpty) {
        throw const FormatException('Invalid principal rental-cart item');
      }
      final projectId = entry['projectId']?.toString().trim() ?? '';
      if (projectId.isNotEmpty && !projectIds.contains(projectId)) {
        throw const FormatException('Unknown principal rental-cart project');
      }
      RentalCartItem.fromJson(Map<String, dynamic>.from(entry));
    }
    return RentalCart.fromJson(value, localDeviceOnly: true);
  }

  static Future<_LocalRentalCartBucket> _readLocalRentalCartBucketUnlocked(
    LocalPrincipalIdentity principal,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final registry = await _readLocalRentalCartRegistry(prefs);
    if (!principal.authenticated && registry.legacyGuestQuarantined) {
      throw const FormatException(
        'Unattributed legacy rental cart is quarantined',
      );
    }
    if (registry.quarantinedPrincipals.containsKey(principal.token)) {
      throw const FormatException('Principal rental cart is quarantined');
    }
    if (!registry.principals.containsKey(principal.token) &&
        registry.principals.length + registry.quarantinedPrincipals.length >=
            _maxLocalStageAPrincipals) {
      throw StateError('Local principal capacity reached.');
    }
    return registry.principals[principal.token] ??
        const _LocalRentalCartBucket(
          cart: RentalCart(
            reservationCreated: false,
            localDeviceOnly: true,
          ),
        );
  }

  static Future<RentalCart> _readLocalRentalCart(
    LocalPrincipalIdentity principal,
  ) =>
      _rentalCartMutationQueue.run(
        () async => (await _readLocalRentalCartBucketUnlocked(principal)).cart,
      );

  static Future<void> _writeLocalRentalCart(
    LocalPrincipalIdentity principal,
    RentalCart cart, {
    String? syncOwnerToken,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final revision = max(1, cart.revision);
    final registry = await _readLocalRentalCartRegistry(prefs);
    if (!principal.authenticated && registry.legacyGuestQuarantined) {
      throw const FormatException(
        'Unattributed legacy rental cart is quarantined',
      );
    }
    if (registry.quarantinedPrincipals.containsKey(principal.token)) {
      throw const FormatException('Principal rental cart is quarantined');
    }
    if (!registry.principals.containsKey(principal.token) &&
        registry.principals.length + registry.quarantinedPrincipals.length >=
            _maxLocalStageAPrincipals) {
      throw StateError('Local principal capacity reached.');
    }
    final normalizedCart = RentalCart(
      schemaVersion: cart.schemaVersion,
      revision: revision,
      reservationCreated: false,
      localDeviceOnly: true,
      syncPending: syncOwnerToken != null,
      projects: cart.projects,
      items: cart.items,
    );
    registry.principals[principal.token] = _LocalRentalCartBucket(
      cart: normalizedCart,
      syncOwnerToken: syncOwnerToken,
    );
    await _writePreferenceString(
      prefs,
      _rentalCartPrincipalStateKey,
      jsonEncode(<String, dynamic>{
        'schemaVersion': 1,
        'revision': max(1, registry.revision + 1),
        'legacyGuestQuarantined': registry.legacyGuestQuarantined,
        'principals': <String, dynamic>{
          for (final entry in registry.principals.entries)
            entry.key: <String, dynamic>{
              'cart': entry.value.cart.toJson(),
              'syncOwnerToken': entry.value.syncOwnerToken,
            },
          for (final entry in registry.quarantinedPrincipals.entries)
            entry.key: entry.value,
        },
      }),
    );
    if (principal.authenticated) {
      SharedPersistenceSync.notify(SharedPersistenceSync.rentalCartKey);
      return;
    }
    await _writePreferenceString(
      prefs,
      _rentalCartKey,
      jsonEncode(<String, dynamic>{
        'schemaVersion': 1,
        'revision': revision,
        'reservationCreated': false,
        'projects': cart.projects.map((project) => project.toJson()).toList(),
        'items': cart.items.map((item) => item.toJson()).toList(),
      }),
    );
    if (cart.items.isEmpty && cart.projects.isEmpty) {
      await prefs.remove(_rentalCartSyncOwnerKey);
    } else if (syncOwnerToken != null) {
      await prefs.setString(_rentalCartSyncOwnerKey, syncOwnerToken);
    }
    await _writePreferenceString(
      prefs,
      _projectCartKey,
      jsonEncode(<String, dynamic>{
        'schemaVersion': 1,
        'revision': revision,
        'projects': cart.projects.map((project) => project.toJson()).toList(),
      }),
    );
    SharedPersistenceSync.notify(SharedPersistenceSync.rentalCartKey);
  }

  static String _rentalCartClientId(String prefix) {
    final micros = DateTime.now().microsecondsSinceEpoch;
    final entropy = Random.secure().nextInt(0x7fffffff).toRadixString(16);
    return '${prefix}_${micros}_$entropy';
  }

  static String _rentalCartIntentClientId({
    required String listingId,
    required DateTime startDate,
    required DateTime endDate,
  }) {
    final canonical = jsonEncode(<String>[
      listingId,
      _rentalDate(startDate),
      _rentalDate(endDate),
    ]);
    final digest = crypto.sha256.convert(utf8.encode(canonical));
    return 'cartitem_$digest';
  }

  static bool _sameRentalCartIntent(
    RentalCartItem entry, {
    required String listingId,
    required DateTime startDate,
    required DateTime endDate,
  }) =>
      entry.listingId == listingId &&
      _rentalDate(entry.startDate) == _rentalDate(startDate) &&
      _rentalDate(entry.endDate) == _rentalDate(endDate);

  static RentalCart? _existingExactRentalCartIntent(
    RentalCart cart, {
    required String listingId,
    required DateTime startDate,
    required DateTime endDate,
  }) {
    final matches = cart.items
        .where((entry) => _sameRentalCartIntent(
              entry,
              listingId: listingId,
              startDate: startDate,
              endDate: endDate,
            ))
        .toList(growable: false);
    if (matches.length > 1) {
      throw StateError(
          'Der Mietkorb enthält mehrere identische Mietabsichten und muss vor einer Wiederholung geprüft werden.');
    }
    return matches.length == 1 ? cart : null;
  }

  static Future<bool> _hasBackendSession() async {
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) return false;
    return await AuthService.readSession() != null;
  }

  @visibleForTesting
  static bool canSyncGuestCartToAccount({
    required String? pendingAccountId,
    required String currentAccountId,
  }) {
    final pending = pendingAccountId?.trim() ?? '';
    final current = currentAccountId.trim();
    return current.isNotEmpty && (pending.isEmpty || pending == current);
  }

  @visibleForTesting
  static bool canReadLocalRentalCart({
    required String? pendingAccountId,
    required String? currentAccountId,
  }) {
    final pending = pendingAccountId?.trim() ?? '';
    final current = currentAccountId?.trim() ?? '';
    return pending.isEmpty || (current.isNotEmpty && pending == current);
  }

  static Future<_LocalRentalCartBucket> _assertReadableLocalRentalCart(
    LocalPrincipalIdentity principal,
  ) async {
    final bucket = await _readLocalRentalCartBucketUnlocked(principal);
    final pending = bucket.syncOwnerToken;
    if (pending != null && pending != principal.token) {
      throw StateError(
        'Ein ausstehender Kontosync muss zuerst mit dem zugeordneten Konto abgeschlossen werden.',
      );
    }
    return bucket;
  }

  static Future<void> _assertCurrentLocalPrincipal(
    LocalPrincipalIdentity expected,
  ) async {
    final current = await _currentLocalPrincipal();
    if (current.token != expected.token ||
        current.authenticated != expected.authenticated) {
      throw StateError(
        'Der Kontowechsel hat den laufenden Mietkorb-Abgleich gestoppt.',
      );
    }
  }

  /// Copies guest intent into the authenticated account. Local guest data is
  /// removed only after every idempotent server upsert has completed.
  static Future<bool> syncGuestRentalCartAfterAuthentication({
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final owner = expectedOwner ?? await LocalPrincipalActionOwner.capture();
    await owner.assertCurrent();
    return _rentalCartMutationQueue.run(
      () => _syncGuestRentalCartAfterAuthenticationUnlocked(owner),
    );
  }

  static Future<bool> _syncGuestRentalCartAfterAuthenticationUnlocked(
    LocalPrincipalActionOwner owner,
  ) async {
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) return false;
    final accountPrincipal = owner.principal;
    if (!accountPrincipal.authenticated) return false;
    await owner.assertCurrent();
    await _assertCurrentLocalPrincipal(accountPrincipal);
    final guest = LocalPrincipalIdentity.guest;
    final guestBucket = await _readLocalRentalCartBucketUnlocked(guest);
    final local = guestBucket.cart;
    if (local.projects.isEmpty && local.items.isEmpty) {
      if (guestBucket.syncOwnerToken != null) {
        await _writeLocalRentalCart(guest, local);
      }
      return true;
    }
    if (!canSyncGuestCartToAccount(
      pendingAccountId: guestBucket.syncOwnerToken,
      currentAccountId: accountPrincipal.token,
    )) {
      throw StateError(
        'Der lokale Mietkorb ist bereits einem anderen Kontosync zugeordnet.',
      );
    }
    await _writeLocalRentalCart(
      guest,
      local,
      syncOwnerToken: accountPrincipal.token,
    );
    for (final project in [...local.projects]
      ..sort((left, right) => left.sortOrder.compareTo(right.sortOrder))) {
      await owner.assertCurrent();
      await _assertCurrentLocalPrincipal(accountPrincipal);
      await BackendRepository.putRentalCartProjectForOwner(
        owner: owner.sessionOwner!,
        id: project.id,
        title: project.title,
        answers: project.answers,
        sortOrder: project.sortOrder,
      );
      await owner.assertCurrent();
      await _assertCurrentLocalPrincipal(accountPrincipal);
    }
    for (final item in [...local.items]
      ..sort((left, right) => left.sortOrder.compareTo(right.sortOrder))) {
      await owner.assertCurrent();
      await _assertCurrentLocalPrincipal(accountPrincipal);
      await BackendRepository.putRentalCartItemForOwner(
        owner: owner.sessionOwner!,
        id: item.id,
        listingId: item.listingId,
        startDate: _rentalDate(item.startDate),
        endDate: _rentalDate(item.endDate),
        projectId: item.projectId,
        sortOrder: item.sortOrder,
      );
      await owner.assertCurrent();
      await _assertCurrentLocalPrincipal(accountPrincipal);
    }
    await owner.assertCurrent();
    await _assertCurrentLocalPrincipal(accountPrincipal);
    await _writeLocalRentalCart(
      guest,
      const RentalCart(
        reservationCreated: false,
        localDeviceOnly: true,
      ),
    );
    return true;
  }

  static Future<RentalCart> getRentalCart({
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final owner = expectedOwner ?? await LocalPrincipalActionOwner.capture();
    await owner.assertCurrent();
    final principal = owner.principal;
    final hasBackendSession = await _hasBackendSession();
    await owner.assertCurrent();
    if (!hasBackendSession) {
      final bucket = await _readLocalRentalCartBucketUnlocked(principal);
      await owner.assertCurrent();
      if (bucket.syncOwnerToken != null &&
          bucket.syncOwnerToken != principal.token) {
        return const RentalCart(
          reservationCreated: false,
          localDeviceOnly: true,
          syncPending: true,
        );
      }
      return bucket.cart;
    }
    final guestBucket = await _readLocalRentalCart(
      LocalPrincipalIdentity.guest,
    );
    final registry = await _readLocalRentalCartRegistry(
      await SharedPreferences.getInstance(),
    );
    final pending =
        registry.principals[LocalPrincipalIdentity.guest.token]?.syncOwnerToken;
    await owner.assertCurrent();
    if (pending != null && pending != principal.token) {
      return _getBackendRentalCartForOwner(owner);
    }
    if (guestBucket.projects.isNotEmpty || guestBucket.items.isNotEmpty) {
      try {
        await syncGuestRentalCartAfterAuthentication(expectedOwner: owner);
      } catch (error) {
        // A stale action cannot expose the old guest copy in a new session.
        await owner.assertCurrent();
        debugPrint('[DataService] guest rental cart sync pending: $error');
        return RentalCart(
          schemaVersion: guestBucket.schemaVersion,
          revision: guestBucket.revision,
          reservationCreated: false,
          localDeviceOnly: true,
          syncPending: true,
          projects: guestBucket.projects,
          items: guestBucket.items,
        );
      }
    }
    return _getBackendRentalCartForOwner(owner);
  }

  static Future<RentalCart> _getBackendRentalCartForOwner(
    LocalPrincipalActionOwner owner,
  ) async {
    await owner.assertCurrent();
    final session = owner.sessionOwner;
    if (session == null) {
      throw StateError('Für diesen Mietkorb ist eine Anmeldung erforderlich.');
    }
    final cart = RentalCart.fromJson(
      await BackendRepository.getRentalCartForOwner(session),
    );
    await owner.assertCurrent();
    return cart;
  }

  static Future<RentalCart> addRentalCartItem({
    required Item item,
    required DateTimeRange range,
    String? projectId,
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final owner = expectedOwner ?? await LocalPrincipalActionOwner.capture();
    await owner.assertCurrent();
    final principal = owner.principal;
    if (BackendConfig.enabled &&
        !QaRuntimeService.isEnabled &&
        owner.sessionOwner != null) {
      return _rentalCartMutationQueue.run(() async {
        await owner.assertCurrent();
        await _syncGuestRentalCartAfterAuthenticationUnlocked(owner);
        await owner.assertCurrent();
        final current = await _getBackendRentalCartForOwner(owner);
        final existing = _existingExactRentalCartIntent(
          current,
          listingId: item.id,
          startDate: range.start,
          endDate: range.end,
        );
        if (existing != null) return existing;
        final id = _rentalCartIntentClientId(
          listingId: item.id,
          startDate: range.start,
          endDate: range.end,
        );
        final next = RentalCart.fromJson(
          await BackendRepository.putRentalCartItemForOwner(
            owner: owner.sessionOwner!,
            id: id,
            listingId: item.id,
            startDate: _rentalDate(range.start),
            endDate: _rentalDate(range.end),
            projectId: projectId,
          ),
        );
        await owner.assertCurrent();
        final matches = next.items
            .where((entry) => _sameRentalCartIntent(
                  entry,
                  listingId: item.id,
                  startDate: range.start,
                  endDate: range.end,
                ))
            .toList(growable: false);
        if (matches.length != 1 ||
            matches.single.id != id ||
            matches.single.projectId != projectId) {
          throw StateError(
              'Speichern des Mietkorb-Artikels konnte nicht bestätigt werden.');
        }
        return next;
      });
    }
    return _rentalCartMutationQueue.run(() async {
      await owner.assertCurrent();
      final cart = (await _assertReadableLocalRentalCart(principal)).cart;
      final existing = _existingExactRentalCartIntent(
        cart,
        listingId: item.id,
        startDate: range.start,
        endDate: range.end,
      );
      if (existing != null) return existing;
      if (cart.items.length >= 100) {
        throw StateError('Der Mietkorb kann höchstens 100 Artikel enthalten.');
      }
      final id = _rentalCartIntentClientId(
        listingId: item.id,
        startDate: range.start,
        endDate: range.end,
      );
      final next = RentalCart(
        revision: cart.revision + 1,
        reservationCreated: false,
        localDeviceOnly: true,
        projects: cart.projects,
        items: <RentalCartItem>[
          ...cart.items,
          RentalCartItem(
            id: id,
            listingId: item.id,
            projectId: projectId,
            startDate: range.start,
            endDate: range.end,
            sortOrder: cart.items.length,
            quoteStatus: 'needs_recheck',
            listing: item.toJson(),
          ),
        ],
      );
      await owner.assertCurrent();
      await _writeLocalRentalCart(principal, next);
      await owner.assertCurrent();
      return next;
    });
  }

  static Future<RentalCart> removeRentalCartItem(
    String id, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final owner = expectedOwner ?? await LocalPrincipalActionOwner.capture();
    await owner.assertCurrent();
    final principal = owner.principal;
    if (BackendConfig.enabled &&
        !QaRuntimeService.isEnabled &&
        owner.sessionOwner != null) {
      final next = RentalCart.fromJson(
        await BackendRepository.deleteRentalCartItemForOwner(
            owner: owner.sessionOwner!, id: id),
      );
      await owner.assertCurrent();
      return next;
    }
    return _rentalCartMutationQueue.run(() async {
      await owner.assertCurrent();
      final cart = (await _assertReadableLocalRentalCart(principal)).cart;
      final next = RentalCart(
        revision: cart.revision + 1,
        reservationCreated: false,
        localDeviceOnly: true,
        projects: cart.projects,
        items: cart.items.where((item) => item.id != id).toList(),
      );
      await owner.assertCurrent();
      await _writeLocalRentalCart(principal, next);
      await owner.assertCurrent();
      return next;
    });
  }

  static Future<RentalCart> assignRentalCartItemToProject({
    required String itemId,
    String? projectId,
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final owner = expectedOwner ?? await LocalPrincipalActionOwner.capture();
    await owner.assertCurrent();
    final principal = owner.principal;
    final hasBackendSession = await _hasBackendSession();
    await owner.assertCurrent();
    if (hasBackendSession) {
      final cart = await getRentalCart(expectedOwner: owner);
      final item = cart.items.firstWhere(
        (entry) => entry.id == itemId,
        orElse: () => throw StateError('Mietkorb-Artikel nicht gefunden.'),
      );
      if (projectId != null &&
          !cart.projects.any((project) => project.id == projectId)) {
        throw StateError('Mietkorb-Projekt nicht gefunden.');
      }
      await owner.assertCurrent();
      final next =
          RentalCart.fromJson(await BackendRepository.putRentalCartItemForOwner(
        owner: owner.sessionOwner!,
        id: item.id,
        listingId: item.listingId,
        startDate: _rentalDate(item.startDate),
        endDate: _rentalDate(item.endDate),
        projectId: projectId,
        sortOrder: item.sortOrder,
      ));
      await owner.assertCurrent();
      return next;
    }
    return _rentalCartMutationQueue.run(() async {
      await owner.assertCurrent();
      final cart = (await _assertReadableLocalRentalCart(principal)).cart;
      await owner.assertCurrent();
      cart.items.firstWhere(
        (entry) => entry.id == itemId,
        orElse: () => throw StateError('Mietkorb-Artikel nicht gefunden.'),
      );
      if (projectId != null &&
          !cart.projects.any((project) => project.id == projectId)) {
        throw StateError('Mietkorb-Projekt nicht gefunden.');
      }
      final next = RentalCart(
        revision: cart.revision + 1,
        reservationCreated: false,
        localDeviceOnly: true,
        projects: cart.projects,
        items: cart.items
            .map((entry) => entry.id == itemId
                ? RentalCartItem(
                    id: entry.id,
                    listingId: entry.listingId,
                    projectId: projectId,
                    startDate: entry.startDate,
                    endDate: entry.endDate,
                    sortOrder: entry.sortOrder,
                    quoteStatus: entry.quoteStatus,
                    quoteErrorCode: entry.quoteErrorCode,
                    quoteRecheckedAt: entry.quoteRecheckedAt,
                    quote: entry.quote,
                    listing: entry.listing,
                  )
                : entry)
            .toList(),
      );
      await owner.assertCurrent();
      await _writeLocalRentalCart(principal, next);
      await owner.assertCurrent();
      return next;
    });
  }

  static Future<RentalCartProject> addRentalCartProject({
    required String title,
    Map<String, dynamic> answers = const <String, dynamic>{},
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final normalized = title.trim();
    if (normalized.isEmpty || normalized.length > 120) {
      throw ArgumentError.value(title, 'title', 'Ungültiger Projektname');
    }
    final owner = expectedOwner ?? await LocalPrincipalActionOwner.capture();
    await owner.assertCurrent();
    final principal = owner.principal;
    final project = RentalCartProject(
      id: _rentalCartClientId('project'),
      title: normalized,
      answers: answers,
    );
    if (BackendConfig.enabled &&
        !QaRuntimeService.isEnabled &&
        owner.sessionOwner != null) {
      await syncGuestRentalCartAfterAuthentication(expectedOwner: owner);
      await owner.assertCurrent();
      final cart = RentalCart.fromJson(
        await BackendRepository.putRentalCartProjectForOwner(
          owner: owner.sessionOwner!,
          id: project.id,
          title: project.title,
          answers: project.answers,
        ),
      );
      await owner.assertCurrent();
      return cart.projects.firstWhere((entry) => entry.id == project.id);
    }
    return _rentalCartMutationQueue.run(() async {
      await owner.assertCurrent();
      final cart = (await _assertReadableLocalRentalCart(principal)).cart;
      if (cart.projects.length >= 20) {
        throw StateError('Der Mietkorb kann höchstens 20 Projekte enthalten.');
      }
      final nextProject = RentalCartProject(
        id: project.id,
        title: project.title,
        answers: project.answers,
        sortOrder: cart.projects.length,
      );
      await owner.assertCurrent();
      await _writeLocalRentalCart(
          principal,
          RentalCart(
            revision: cart.revision + 1,
            reservationCreated: false,
            localDeviceOnly: true,
            projects: <RentalCartProject>[...cart.projects, nextProject],
            items: cart.items,
          ));
      await owner.assertCurrent();
      return nextProject;
    });
  }

  static Future<RentalCart> removeRentalCartProject(
    String id, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final owner = expectedOwner ?? await LocalPrincipalActionOwner.capture();
    await owner.assertCurrent();
    final principal = owner.principal;
    if (BackendConfig.enabled &&
        !QaRuntimeService.isEnabled &&
        owner.sessionOwner != null) {
      final next = RentalCart.fromJson(
        await BackendRepository.deleteRentalCartProjectForOwner(
            owner: owner.sessionOwner!, id: id),
      );
      await owner.assertCurrent();
      return next;
    }
    return _rentalCartMutationQueue.run(() async {
      await owner.assertCurrent();
      final cart = (await _assertReadableLocalRentalCart(principal)).cart;
      final next = RentalCart(
        revision: cart.revision + 1,
        reservationCreated: false,
        localDeviceOnly: true,
        projects: cart.projects.where((project) => project.id != id).toList(),
        items: cart.items
            .map((item) => item.projectId == id
                ? RentalCartItem(
                    id: item.id,
                    listingId: item.listingId,
                    startDate: item.startDate,
                    endDate: item.endDate,
                    sortOrder: item.sortOrder,
                    quoteStatus: item.quoteStatus,
                    quoteErrorCode: item.quoteErrorCode,
                    quoteRecheckedAt: item.quoteRecheckedAt,
                    quote: item.quote,
                    listing: item.listing,
                  )
                : item)
            .toList(),
      );
      await owner.assertCurrent();
      await _writeLocalRentalCart(principal, next);
      await owner.assertCurrent();
      return next;
    });
  }

  static Future<RentalCart> recheckRentalCart({
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final owner = expectedOwner ?? await LocalPrincipalActionOwner.capture();
    await owner.assertCurrent();
    final principal = owner.principal;
    if (BackendConfig.enabled &&
        !QaRuntimeService.isEnabled &&
        owner.sessionOwner != null) {
      await syncGuestRentalCartAfterAuthentication(expectedOwner: owner);
      await owner.assertCurrent();
      final next = RentalCart.fromJson(
          await BackendRepository.recheckRentalCartForOwner(
              owner.sessionOwner!));
      await owner.assertCurrent();
      return next;
    }
    return _rentalCartMutationQueue.run(() async {
      await owner.assertCurrent();
      final cart = (await _assertReadableLocalRentalCart(principal)).cart;
      final checked = <RentalCartItem>[];
      for (final item in cart.items) {
        await owner.assertCurrent();
        final available = await checkAvailability(
          itemId: item.listingId,
          start: item.startDate,
          end: item.endDate,
        );
        await owner.assertCurrent();
        checked.add(RentalCartItem(
          id: item.id,
          listingId: item.listingId,
          projectId: item.projectId,
          startDate: item.startDate,
          endDate: item.endDate,
          sortOrder: item.sortOrder,
          quoteStatus: available ? 'needs_recheck' : 'unavailable',
          quoteErrorCode: available ? null : 'booking_period_unavailable',
          quoteRecheckedAt: DateTime.now(),
          listing: item.listing,
        ));
      }
      final next = RentalCart(
        revision: cart.revision + 1,
        reservationCreated: false,
        localDeviceOnly: true,
        projects: cart.projects,
        items: checked,
      );
      await owner.assertCurrent();
      await _writeLocalRentalCart(principal, next);
      await owner.assertCurrent();
      return next;
    });
  }

  /// Returns only the local saved-item state that belongs in a user-requested
  /// privacy export. Server-side cart data is part of the backend account
  /// export; this section also covers any not-yet-synced guest cart.
  static Future<Map<String, dynamic>> exportSavedItemsForPrivacy() async {
    final principal = await _currentLocalPrincipal();
    final prefs = await SharedPreferences.getInstance();
    final wishlistSnapshot = await _wishlistMutationQueue.run(() async {
      final state = _readWishlistState(prefs, principal);
      return _LocalWishlistState(
        revision: state.revision,
        lists: state.lists
            .map((entry) => Map<String, dynamic>.from(entry))
            .toList(),
        assignments: Map<String, String>.from(state.assignments),
        savedItemIds: Set<String>.from(state.savedItemIds),
      );
    });
    final wishlistState = wishlistSnapshot;
    final savedItemIds = wishlistState.savedItemIds.toList()..sort();
    final cartBucket = await _rentalCartMutationQueue.run(
      () => _readLocalRentalCartBucketUnlocked(principal),
    );
    final localCartVisible = cartBucket.syncOwnerToken == null ||
        cartBucket.syncOwnerToken == principal.token;
    return <String, dynamic>{
      'schemaVersion': 1,
      'scope': 'local-principal',
      'principalScope':
          principal.authenticated ? 'authenticated-account' : 'guest-device',
      'terminology': 'Gemerkt',
      'binding': 'non-binding-no-reservation',
      'storageKeys': const <String>[
        _wishlistPrincipalStateKey,
        _rentalCartPrincipalStateKey,
        _savedItemsKey,
        _wishlistStateKey,
        _wishlistsMetaKey,
        _wishlistAssignKey,
        _rentalCartKey,
        _projectCartKey,
        _rentalCartSyncOwnerKey,
      ],
      'legacySavedItemIds': savedItemIds,
      'lists': wishlistState.lists,
      'itemAssignments': wishlistState.assignments,
      'persistentRentalCart': true,
      'persistentProjectCart': true,
      'rentalCart': localCartVisible
          ? cartBucket.cart.toJson()
          : const RentalCart(
              reservationCreated: false,
              localDeviceOnly: true,
              syncPending: true,
            ).toJson(),
      'syncPending': cartBucket.syncOwnerToken != null,
    };
  }

  /// Device-local listing cache entries owned by the current authenticated
  /// account. Public listings owned by other accounts remain on-device but are
  /// excluded from this account-scoped export.
  static Future<Map<String, dynamic>> exportOwnedListingsForPrivacy() async {
    final current = await _requireCurrentOperationalUser();
    return _listingMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final owned = _readListingsStrict(prefs)
          .where((item) => item.ownerId == current.id)
          .map((item) => item.toJson())
          .toList();
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      return <String, dynamic>{
        'schemaVersion': 1,
        'scope': 'current-authenticated-account',
        'accountId': current.id,
        'storageKey': _itemsKey,
        'listings': owned,
        'otherAccountsPublicCacheExcluded': true,
      };
    });
  }

  /// Local operational records attributable to the current signed-in account.
  /// Shared booking, timeline and handover records are exported only when the
  /// current account is a participant; unattributed legacy notifications are
  /// preserved on-device but cannot be assigned to an account export.
  static Future<Map<String, dynamic>>
      exportOperationalRecordsForPrivacy() async {
    final current = await _requireCurrentOperationalUser();
    final prefs = await SharedPreferences.getInstance();
    final bookingSelections = await _withCurrentBookingSelectionBucket(
      (_, __, ___, bucket) async => Map<String, dynamic>.from(bucket),
    );

    final rentalRequests = await _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(current.id);
      final raw = prefs.getString(_rentalRequestsKey);
      return raw == null ? <RentalRequest>[] : _decodeRentalRequestsStrict(raw);
    });
    final participantRequests = rentalRequests
        .where((request) => _isRequestParticipant(request, current.id))
        .toList();
    final requestIds = participantRequests.map((request) => request.id).toSet();

    final operational = await _operationalMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(current.id);
      final messageRaw = prefs.getString(_messageThreadsKey);
      final notificationRaw = prefs.getString(_notificationsKey);
      final timelineRaw = prefs.getString(_timelineEventsKey);
      final readRaw = prefs.getString(_readRequestsKey);
      final lastSeenRaw = prefs.getString(_requestsLastSeenKey);
      final threads = messageRaw == null
          ? <MessageThread>[]
          : _decodeMessageThreadsStrict(messageRaw);
      final notifications = notificationRaw == null
          ? <Map<String, dynamic>>[]
          : _decodeNotificationsStrict(notificationRaw);
      final timeline = timelineRaw == null
          ? <Map<String, dynamic>>[]
          : _decodeTimelineStrict(timelineRaw);
      final readMarkers = readRaw == null
          ? <String, dynamic>{}
          : _decodeReadRequestsStrict(readRaw);
      final lastSeen = lastSeenRaw == null
          ? <String, dynamic>{}
          : _decodeRequestsLastSeenStrict(lastSeenRaw);
      return <String, dynamic>{
        'messageThreads': threads
            .where((thread) => _isThreadParticipant(thread, current.id))
            .map((thread) => thread.toJson())
            .toList(),
        'notifications': notifications
            .where(
              (notification) =>
                  (notification['userId'] ?? '').toString().trim() ==
                  current.id,
            )
            .toList(),
        'timeline': timeline
            .where((event) => requestIds.contains(event['requestId']))
            .toList(),
        'readRequestIds': List<String>.from(
          readMarkers[current.id] as List? ?? const <String>[],
        ),
        'ownerRequestsLastSeenAt': lastSeen[current.id],
      };
    });

    final handover = await _handoverMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(current.id);
      final all = await _getHandoverReturnStateMap();
      final failRaw = prefs.getString(_handoverFailCountsKey);
      final bannerRaw = prefs.getString(_handoverBannersKey);
      final failCounts = failRaw == null
          ? <String, dynamic>{}
          : _decodeHandoverFailCountsStrict(failRaw);
      final banners = bannerRaw == null
          ? <String, dynamic>{}
          : _decodeHandoverBannersStrict(bannerRaw);
      return <String, dynamic>{
        'handoverReturnState': <String, dynamic>{
          for (final entry in all.entries)
            if (requestIds.contains(entry.key)) entry.key: entry.value,
        },
        'pickupFailCounts': <String, dynamic>{
          for (final entry in failCounts.entries)
            if (requestIds.contains(entry.key)) entry.key: entry.value,
        },
        'handoverBanners': <String, dynamic>{
          for (final entry in banners.entries)
            if (requestIds.contains(entry.key)) entry.key: entry.value,
        },
      };
    });

    await _assertCurrentOperationalUserId(current.id);
    return <String, dynamic>{
      'schemaVersion': 1,
      'scope': 'current-authenticated-account',
      'accountId': current.id,
      'rentalRequests':
          participantRequests.map((request) => request.toJson()).toList(),
      'bookingSelections': bookingSelections,
      ...operational,
      ...handover,
      'unattributedLegacyNotificationsExcluded': true,
    };
  }

  /// Removes account-scoped device convenience data after an account-deletion
  /// decision. Shared booking/timeline/handover records remain retained for
  /// counterparty and legal/audit continuity; threads receive a per-user
  /// deletion tombstone instead of being erased for both participants.
  static Future<void> clearOperationalRecordsForAccountDeletion(
    String userId,
  ) async {
    await _requireCurrentOperationalUser(requestedUserId: userId);
    await _clearOperationalRecordsForAccountDeletion(
      userId,
      requireCurrentAccount: true,
    );
  }

  /// Applies a server-confirmed deletion receipt to Account A records by
  /// explicit user/principal identity. It is safe after Account B has become
  /// current and never selects B through a device-global "current" lookup.
  static Future<void> clearOperationalRecordsForConfirmedAccountDeletion(
    String userId,
  ) async {
    final normalized = userId.trim();
    if (normalized.isEmpty) {
      throw ArgumentError.value(userId, 'userId');
    }
    await _clearOperationalRecordsForAccountDeletion(
      normalized,
      requireCurrentAccount: false,
    );
  }

  static Future<void> _clearOperationalRecordsForAccountDeletion(
    String userId, {
    required bool requireCurrentAccount,
  }) async {
    await _operationalMutationQueue.run(() async {
      if (requireCurrentAccount) {
        await _assertCurrentOperationalUserId(userId);
      }
      final prefs = await SharedPreferences.getInstance();

      final messageRaw = prefs.getString(_messageThreadsKey);
      if (messageRaw != null) {
        final threads = _decodeMessageThreadsStrict(messageRaw);
        var mutated = false;
        for (var index = 0; index < threads.length; index++) {
          final thread = threads[index];
          if (!_isThreadParticipant(thread, userId)) continue;
          final archived = <String>{...thread.archivedForUserIds, userId};
          final deleted = <String>{...thread.deletedForUserIds, userId};
          if (archived.length != thread.archivedForUserIds.length ||
              deleted.length != thread.deletedForUserIds.length) {
            threads[index] = thread.copyWith(
              archivedForUserIds: archived.toList()..sort(),
              deletedForUserIds: deleted.toList()..sort(),
            );
            mutated = true;
          }
        }
        if (mutated) {
          await _persistMessageThreads(
            prefs,
            threads.map((thread) => thread.toJson()).toList(),
          );
        }
      }

      final notificationRaw = prefs.getString(_notificationsKey);
      if (notificationRaw != null) {
        final notifications = _decodeNotificationsStrict(notificationRaw)
          ..removeWhere(
            (notification) =>
                (notification['userId'] ?? '').toString().trim() == userId,
          );
        await _persistNotifications(prefs, notifications);
      }

      final readRaw = prefs.getString(_readRequestsKey);
      if (readRaw != null) {
        final markers = _decodeReadRequestsStrict(readRaw)..remove(userId);
        await _writePreferenceString(
          prefs,
          _readRequestsKey,
          jsonEncode(markers),
        );
      }

      final lastSeenRaw = prefs.getString(_requestsLastSeenKey);
      if (lastSeenRaw != null) {
        final markers = _decodeRequestsLastSeenStrict(lastSeenRaw)
          ..remove(userId);
        await _writePreferenceString(
          prefs,
          _requestsLastSeenKey,
          jsonEncode(markers),
        );
      }
    });
    final principal = LocalPrincipalIdentity(
      token: LocalPrincipalScope.tokenForUserId(userId),
      authenticated: true,
    );
    await _bookingSelectionMutationQueue.run(() async {
      final prefs = await SharedPreferences.getInstance();
      final registry = _readBookingSelectionRegistry(prefs);
      final removed = registry.principals.remove(principal.token) != null;
      final quarantineRemoved =
          registry.quarantinedPrincipals.remove(principal.token) != null;
      if (!removed && !quarantineRemoved) return;
      final encoded = jsonEncode(<String, dynamic>{
        'schemaVersion': 1,
        'revision': max(1, registry.revision + 1),
        'legacyGuestQuarantined': registry.legacyGuestQuarantined,
        'principals': registry.principals,
        'quarantinedPrincipals': registry.quarantinedPrincipals,
      });
      await _writePreferenceString(
        prefs,
        _bookingSelectionPrincipalStateKey,
        encoded,
      );
    });
  }

  /// Removes only local Gemerkt data after account deletion has already been
  /// confirmed. Unrelated device preferences remain untouched.
  static Future<void> clearSavedItemsForAccountDeletion() async {
    final principal = await _currentLocalPrincipal();
    await _clearSavedItemsForAccountDeletionPrincipal(principal);
  }

  /// Removes only the opaque Account A bucket named by a server-confirmed
  /// deletion. A successor Account B may be current without being selected.
  static Future<void> clearSavedItemsForConfirmedAccountDeletion(
    String userId,
  ) async {
    final normalized = userId.trim();
    if (normalized.isEmpty) {
      throw ArgumentError.value(userId, 'userId');
    }
    await _clearSavedItemsForAccountDeletionPrincipal(
      LocalPrincipalIdentity(
        token: LocalPrincipalScope.tokenForUserId(normalized),
        authenticated: true,
      ),
    );
  }

  static Future<void> _clearSavedItemsForAccountDeletionPrincipal(
    LocalPrincipalIdentity principal,
  ) async {
    await _wishlistMutationQueue.run(() async {
      final prefs = await SharedPreferences.getInstance();
      final registry = _readWishlistRegistry(prefs);
      registry.principals.remove(principal.token);
      registry.quarantinedPrincipals.remove(principal.token);
      await _writePreferenceString(
        prefs,
        _wishlistPrincipalStateKey,
        jsonEncode(<String, dynamic>{
          'schemaVersion': 1,
          'revision': max(1, registry.revision + 1),
          'legacyGuestQuarantined': registry.legacyGuestQuarantined,
          'principals': <String, dynamic>{
            for (final entry in registry.principals.entries)
              entry.key: <String, dynamic>{
                'revision': entry.value.revision,
                'lists': entry.value.lists,
                'assignments': entry.value.assignments,
                'savedItemIds': entry.value.savedItemIds.toList()..sort(),
              },
            for (final entry in registry.quarantinedPrincipals.entries)
              entry.key: entry.value,
          },
        }),
      );
      if (!principal.authenticated) {
        await prefs.remove(_savedItemsKey);
        await prefs.remove(_wishlistStateKey);
        await prefs.remove(_wishlistsMetaKey);
        await prefs.remove(_wishlistAssignKey);
      }
      SharedPersistenceSync.notify(SharedPersistenceSync.wishlistStateKey);
      SharedPersistenceSync.notify(SharedPersistenceSync.savedItemsKey);
    });
    await _rentalCartMutationQueue.run(() async {
      final prefs = await SharedPreferences.getInstance();
      final registry = await _readLocalRentalCartRegistry(prefs);
      registry.principals.remove(principal.token);
      registry.quarantinedPrincipals.remove(principal.token);
      final guest = registry.principals[LocalPrincipalIdentity.guest.token];
      if (principal.authenticated && guest?.syncOwnerToken == principal.token) {
        registry.principals.remove(LocalPrincipalIdentity.guest.token);
        await prefs.remove(_rentalCartKey);
        await prefs.remove(_projectCartKey);
        await prefs.remove(_rentalCartSyncOwnerKey);
      } else if (!principal.authenticated) {
        await prefs.remove(_rentalCartKey);
        await prefs.remove(_projectCartKey);
        await prefs.remove(_rentalCartSyncOwnerKey);
      }
      await _writePreferenceString(
        prefs,
        _rentalCartPrincipalStateKey,
        jsonEncode(<String, dynamic>{
          'schemaVersion': 1,
          'revision': max(1, registry.revision + 1),
          'legacyGuestQuarantined': registry.legacyGuestQuarantined,
          'principals': <String, dynamic>{
            for (final entry in registry.principals.entries)
              entry.key: <String, dynamic>{
                'cart': entry.value.cart.toJson(),
                'syncOwnerToken': entry.value.syncOwnerToken,
              },
            for (final entry in registry.quarantinedPrincipals.entries)
              entry.key: entry.value,
          },
        }),
      );
      SharedPersistenceSync.notify(SharedPersistenceSync.rentalCartKey);
    });
  }

  static Future<Set<String>> getSavedItemIds() async {
    return _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = await _readWishlistStateWithDefaults(prefs, principal);
      return <String>{...state.savedItemIds, ...state.assignments.keys};
    });
  }

  static Future<void> toggleSavedItem(String itemId) async {
    await _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = _readWishlistState(prefs, principal);
      final current = Set<String>.from(state.savedItemIds);
      if (!current.add(itemId)) {
        current.remove(itemId);
      }
      await _writeWishlistState(
        prefs,
        principal,
        _LocalWishlistState(
          revision: state.revision + 1,
          lists: state.lists,
          assignments: state.assignments,
          savedItemIds: current,
        ),
      );
    });
  }

  // ===== Wishlists (manual selection) =====
  /// IDs for the three predefined system wishlists
  static const String wlSoonId = 'wl_soon'; // Demnächst benötigt
  static const String wlLaterId = 'wl_later'; // Für später
  static const String wlAgainId = 'wl_again'; // Wieder mieten

  static List<Map<String, dynamic>> _decodeWishlistMetadata(String? raw) {
    if (raw == null) return <Map<String, dynamic>>[];
    if (raw.isEmpty) {
      throw const FormatException('Invalid saved-list metadata');
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      throw const FormatException('Invalid saved-list metadata');
    }
    if (decoded is! List) {
      throw const FormatException('Invalid saved-list metadata');
    }
    final out = <Map<String, dynamic>>[];
    final ids = <String>{};
    for (final entry in decoded) {
      if (entry is! Map) {
        throw const FormatException('Invalid saved-list entry');
      }
      final map = Map<String, dynamic>.from(entry);
      final id = map['id'];
      final name = map['name'];
      final system = map['system'];
      if (id is! String ||
          id.trim().isEmpty ||
          name is! String ||
          name.trim().isEmpty ||
          system is! bool ||
          !ids.add(id)) {
        throw const FormatException('Invalid saved-list entry');
      }
      out.add(map);
    }
    return out;
  }

  static Map<String, String> _decodeWishlistAssignments(String? raw) {
    if (raw == null) return <String, String>{};
    if (raw.isEmpty) {
      throw const FormatException('Invalid saved-item assignments');
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      throw const FormatException('Invalid saved-item assignments');
    }
    if (decoded is! Map) {
      throw const FormatException('Invalid saved-item assignments');
    }
    final out = <String, String>{};
    for (final entry in decoded.entries) {
      if (entry.key is! String ||
          (entry.key as String).trim().isEmpty ||
          entry.value is! String ||
          (entry.value as String).trim().isEmpty) {
        throw const FormatException('Invalid saved-item assignment');
      }
      out[entry.key as String] = entry.value as String;
    }
    return out;
  }

  static void _validateWishlistAssignmentTargets(
    Map<String, String> assignments,
    List<Map<String, dynamic>> lists,
  ) {
    final listIds = lists.map((entry) => entry['id'] as String).toSet();
    if (assignments.values.any((listId) => !listIds.contains(listId))) {
      throw const FormatException('Unknown saved-list assignment target');
    }
  }

  static _LocalWishlistState _readLegacyWishlistState(
    SharedPreferences prefs,
  ) {
    final canonicalRaw = prefs.getString(_wishlistStateKey);
    if (canonicalRaw == null) {
      return _LocalWishlistState(
        revision: 0,
        lists: _decodeWishlistMetadata(prefs.getString(_wishlistsMetaKey)),
        assignments: _decodeWishlistAssignments(
          prefs.getString(_wishlistAssignKey),
        ),
      );
    }
    if (canonicalRaw.isEmpty) {
      throw const FormatException('Invalid saved-state document');
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(canonicalRaw);
    } catch (_) {
      throw const FormatException('Invalid saved-state document');
    }
    if (decoded is! Map ||
        decoded['schemaVersion'] != 1 ||
        decoded['revision'] is! int ||
        (decoded['revision'] as int) < 1 ||
        decoded['lists'] is! List ||
        decoded['assignments'] is! Map) {
      throw const FormatException('Invalid saved-state document');
    }
    final state = _LocalWishlistState(
      revision: decoded['revision'] as int,
      lists: _decodeWishlistMetadata(jsonEncode(decoded['lists'])),
      assignments: _decodeWishlistAssignments(
        jsonEncode(decoded['assignments']),
      ),
      savedItemIds:
          (prefs.getStringList(_savedItemsKey) ?? const <String>[]).toSet(),
    );
    _validateWishlistAssignmentTargets(state.assignments, state.lists);
    return state;
  }

  static Set<String> _decodeSavedItemIds(dynamic raw) {
    if (raw == null) return <String>{};
    if (raw is! List) {
      throw const FormatException('Invalid saved-item ID list');
    }
    final ids = <String>{};
    for (final value in raw) {
      if (value is! String || value.trim().isEmpty || !ids.add(value)) {
        throw const FormatException('Invalid saved-item ID');
      }
    }
    return ids;
  }

  static _LocalWishlistRegistry _readWishlistRegistry(
    SharedPreferences prefs,
  ) {
    final raw = prefs.getString(_wishlistPrincipalStateKey);
    if (raw == null) {
      try {
        final legacy = _readLegacyWishlistState(prefs);
        return _LocalWishlistRegistry(
          revision: 0,
          principals: <String, _LocalWishlistState>{
            LocalPrincipalIdentity.guest.token: _LocalWishlistState(
              revision: legacy.revision,
              lists: legacy.lists,
              assignments: legacy.assignments,
              savedItemIds:
                  (prefs.getStringList(_savedItemsKey) ?? const <String>[])
                      .toSet(),
            ),
          },
        );
      } on FormatException {
        return _LocalWishlistRegistry(
          revision: 0,
          principals: <String, _LocalWishlistState>{},
          legacyGuestQuarantined: true,
        );
      }
    }
    if (raw.isEmpty) {
      throw const FormatException('Invalid principal saved-state registry');
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      throw const FormatException('Invalid principal saved-state registry');
    }
    if (decoded is! Map ||
        decoded['schemaVersion'] != 1 ||
        decoded['revision'] is! int ||
        (decoded['revision'] as int) < 1 ||
        decoded['principals'] is! Map ||
        decoded['legacyGuestQuarantined'] is! bool) {
      throw const FormatException('Invalid principal saved-state registry');
    }
    final principals = <String, _LocalWishlistState>{};
    final quarantinedPrincipals = <String, dynamic>{};
    for (final entry in (decoded['principals'] as Map).entries) {
      final token = entry.key;
      final bucket = entry.value;
      if (token is! String ||
          (token != LocalPrincipalIdentity.guest.token &&
              !RegExp(r'^p_[a-f0-9]{64}$').hasMatch(token))) {
        throw const FormatException('Invalid principal saved-state bucket');
      }
      try {
        if (bucket is! Map ||
            bucket['revision'] is! int ||
            (bucket['revision'] as int) < 0 ||
            bucket['lists'] is! List ||
            bucket['assignments'] is! Map) {
          throw const FormatException('Invalid principal saved-state bucket');
        }
        final state = _LocalWishlistState(
          revision: bucket['revision'] as int,
          lists: _decodeWishlistMetadata(jsonEncode(bucket['lists'])),
          assignments: _decodeWishlistAssignments(
            jsonEncode(bucket['assignments']),
          ),
          savedItemIds: _decodeSavedItemIds(bucket['savedItemIds']),
        );
        _validateWishlistAssignmentTargets(state.assignments, state.lists);
        principals[token] = state;
      } catch (_) {
        quarantinedPrincipals[token] = bucket;
      }
    }
    return _LocalWishlistRegistry(
      revision: decoded['revision'] as int,
      principals: principals,
      quarantinedPrincipals: quarantinedPrincipals,
      legacyGuestQuarantined: decoded['legacyGuestQuarantined'] as bool,
    );
  }

  static _LocalWishlistState _readWishlistState(
    SharedPreferences prefs,
    LocalPrincipalIdentity principal,
  ) {
    final registry = _readWishlistRegistry(prefs);
    if (!principal.authenticated && registry.legacyGuestQuarantined) {
      throw const FormatException(
        'Unattributed legacy saved state is quarantined',
      );
    }
    if (registry.quarantinedPrincipals.containsKey(principal.token)) {
      throw const FormatException('Principal saved state is quarantined');
    }
    if (!registry.principals.containsKey(principal.token) &&
        registry.principals.length + registry.quarantinedPrincipals.length >=
            _maxLocalStageAPrincipals) {
      throw StateError('Local principal capacity reached.');
    }
    final state = registry.principals[principal.token];
    if (state == null) {
      return _LocalWishlistState(
        revision: 0,
        lists: <Map<String, dynamic>>[],
        assignments: <String, String>{},
        savedItemIds: <String>{},
      );
    }
    return _LocalWishlistState(
      revision: state.revision,
      lists:
          state.lists.map((entry) => Map<String, dynamic>.from(entry)).toList(),
      assignments: Map<String, String>.from(state.assignments),
      savedItemIds: Set<String>.from(state.savedItemIds),
    );
  }

  static bool _addDefaultWishlists(List<Map<String, dynamic>> list) {
    final ids = list.map((entry) => entry['id'] as String).toSet();
    var mutated = false;
    if (!ids.contains(wlSoonId)) {
      list.add({
        'id': wlSoonId,
        'name': 'Demnächst benötigt',
        'system': true,
      });
      mutated = true;
    }
    if (!ids.contains(wlLaterId)) {
      list.add({'id': wlLaterId, 'name': 'Für später', 'system': true});
      mutated = true;
    }
    if (!ids.contains(wlAgainId)) {
      list.add({'id': wlAgainId, 'name': 'Wieder mieten', 'system': true});
      mutated = true;
    }
    return mutated;
  }

  static Future<_LocalWishlistState> _writeWishlistState(
    SharedPreferences prefs,
    LocalPrincipalIdentity principal,
    _LocalWishlistState state, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    if (expectedOwner != null) await expectedOwner.assertCurrent();
    _validateWishlistAssignmentTargets(state.assignments, state.lists);
    final revision = max(1, state.revision);
    final registry = _readWishlistRegistry(prefs);
    if (!principal.authenticated && registry.legacyGuestQuarantined) {
      throw const FormatException(
        'Unattributed legacy saved state is quarantined',
      );
    }
    if (registry.quarantinedPrincipals.containsKey(principal.token)) {
      throw const FormatException('Principal saved state is quarantined');
    }
    if (!registry.principals.containsKey(principal.token) &&
        registry.principals.length + registry.quarantinedPrincipals.length >=
            _maxLocalStageAPrincipals) {
      throw StateError('Local principal capacity reached.');
    }
    registry.principals[principal.token] = _LocalWishlistState(
      revision: revision,
      lists: state.lists,
      assignments: state.assignments,
      savedItemIds: state.savedItemIds,
    );
    final principalDocument = jsonEncode(<String, dynamic>{
      'schemaVersion': 1,
      'revision': max(1, registry.revision + 1),
      'legacyGuestQuarantined': registry.legacyGuestQuarantined,
      'principals': <String, dynamic>{
        for (final entry in registry.principals.entries)
          entry.key: <String, dynamic>{
            'revision': entry.value.revision,
            'lists': entry.value.lists,
            'assignments': entry.value.assignments,
            'savedItemIds': entry.value.savedItemIds.toList()..sort(),
          },
        for (final entry in registry.quarantinedPrincipals.entries)
          entry.key: entry.value,
      },
    });
    await _writePreferenceString(
      prefs,
      _wishlistPrincipalStateKey,
      principalDocument,
    );

    // Unscoped V1/V2 compatibility keys mirror the guest bucket only. An
    // authenticated account is never copied into a device-global key.
    if (principal.authenticated) {
      SharedPersistenceSync.notify(SharedPersistenceSync.wishlistStateKey);
      return _LocalWishlistState(
        revision: revision,
        lists: state.lists,
        assignments: state.assignments,
        savedItemIds: state.savedItemIds,
      );
    }
    final canonical = jsonEncode(<String, dynamic>{
      'schemaVersion': 1,
      'revision': revision,
      'lists': state.lists,
      'assignments': state.assignments,
    });
    await _writePreferenceString(prefs, _wishlistStateKey, canonical);
    final savedIds = state.savedItemIds.toList()..sort();
    final savedIdsMirrored =
        await prefs.setStringList(_savedItemsKey, savedIds);

    // These two keys remain rollback-compatible mirrors. The canonical value
    // above is the sole read source once present, so an interruption here
    // cannot create a torn visible state or turn a successful commit into a
    // reported failure.
    final metadataMirrored = await prefs.setString(
      _wishlistsMetaKey,
      jsonEncode(state.lists),
    );
    final assignmentsMirrored = await prefs.setString(
      _wishlistAssignKey,
      jsonEncode(state.assignments),
    );
    if (!metadataMirrored || !assignmentsMirrored || !savedIdsMirrored) {
      debugPrint(
        '[DataService] saved-state compatibility mirror remains stale; '
        'canonical revision $revision is authoritative',
      );
    }
    SharedPersistenceSync.notify(SharedPersistenceSync.wishlistStateKey);
    return _LocalWishlistState(
      revision: revision,
      lists: state.lists,
      assignments: state.assignments,
      savedItemIds: state.savedItemIds,
    );
  }

  static Future<_LocalWishlistState> _readWishlistStateWithDefaults(
    SharedPreferences prefs,
    LocalPrincipalIdentity principal, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    if (expectedOwner != null) await expectedOwner.assertCurrent();
    var state = _readWishlistState(prefs, principal);
    final addedDefaults = _addDefaultWishlists(state.lists);
    _validateWishlistAssignmentTargets(state.assignments, state.lists);
    if (addedDefaults) {
      state = await _writeWishlistState(
        prefs,
        principal,
        _LocalWishlistState(
          revision: state.revision + 1,
          lists: state.lists,
          assignments: state.assignments,
          savedItemIds: state.savedItemIds,
        ),
        expectedOwner: expectedOwner,
      );
    }
    return state;
  }

  /// Returns all wishlists, with system lists first in the canonical order.
  static Future<List<Map<String, dynamic>>> getWishlists({
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final out = await _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = await _readWishlistStateWithDefaults(prefs, principal,
          expectedOwner: expectedOwner);
      return state.lists
          .map((entry) => Map<String, dynamic>.from(entry))
          .toList();
    }, expectedOwner: expectedOwner);
    // Sort: system first in order soon, later, again; then custom by name
    out.sort((a, b) {
      final as = a['system'] == true;
      final bs = b['system'] == true;
      if (as && !bs) return -1;
      if (!as && bs) return 1;
      if (as && bs) {
        int rank(String id) => id == wlSoonId
            ? 0
            : (id == wlLaterId ? 1 : (id == wlAgainId ? 2 : 99));
        return rank(
          (a['id'] ?? '').toString(),
        ).compareTo(rank((b['id'] ?? '').toString()));
      }
      return ((a['name'] ?? '').toString()).toLowerCase().compareTo(
            ((b['name'] ?? '').toString()).toLowerCase(),
          );
    });
    return out;
  }

  /// Adds a new custom wishlist with the provided [name]. Returns the new id.
  static Future<String> addCustomWishlist(
    String name, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final normalized = name.trim();
    if (normalized.isEmpty || normalized.length > 120) {
      throw ArgumentError.value(name, 'name', 'Ungültiger Merklistenname');
    }
    return _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = _readWishlistState(prefs, principal);
      _addDefaultWishlists(state.lists);
      _validateWishlistAssignmentTargets(state.assignments, state.lists);
      final id = _rentalCartClientId('wl');
      state.lists.add({'id': id, 'name': normalized, 'system': false});
      await _writeWishlistState(
        prefs,
        principal,
        _LocalWishlistState(
          revision: state.revision + 1,
          lists: state.lists,
          assignments: state.assignments,
          savedItemIds: state.savedItemIds,
        ),
        expectedOwner: expectedOwner,
      );
      return id;
    }, expectedOwner: expectedOwner);
  }

  /// Deletes a custom wishlist by id (no-op for system lists). Also clears its assignments.
  static Future<void> deleteCustomWishlist(
    String id, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    if (id == wlSoonId || id == wlLaterId || id == wlAgainId) {
      return; // cannot delete system
    }
    await _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = _readWishlistState(prefs, principal);
      _addDefaultWishlists(state.lists);
      _validateWishlistAssignmentTargets(state.assignments, state.lists);
      final originalLength = state.lists.length;
      state.lists.removeWhere((entry) => entry['id'] == id);
      if (state.lists.length == originalLength) return;
      state.assignments.removeWhere((_, listId) => listId == id);
      await _writeWishlistState(
        prefs,
        principal,
        _LocalWishlistState(
          revision: state.revision + 1,
          lists: state.lists,
          assignments: state.assignments,
          savedItemIds: state.savedItemIds,
        ),
        expectedOwner: expectedOwner,
      );
    }, expectedOwner: expectedOwner);
  }

  /// Renames a custom wishlist. No-op for system lists.
  static Future<void> renameCustomWishlist({
    required String id,
    required String newName,
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    if (id == wlSoonId || id == wlLaterId || id == wlAgainId) {
      return; // cannot rename system
    }
    final normalized = newName.trim();
    if (normalized.isEmpty || normalized.length > 120) {
      throw ArgumentError.value(
        newName,
        'newName',
        'Ungültiger Merklistenname',
      );
    }
    await _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = _readWishlistState(prefs, principal);
      _addDefaultWishlists(state.lists);
      _validateWishlistAssignmentTargets(state.assignments, state.lists);
      var mutated = false;
      for (final entry in state.lists) {
        if (entry['id'] == id) {
          if (entry['system'] != true) {
            entry['name'] = normalized;
            mutated = true;
          }
          break;
        }
      }
      if (mutated) {
        await _writeWishlistState(
          prefs,
          principal,
          _LocalWishlistState(
            revision: state.revision + 1,
            lists: state.lists,
            assignments: state.assignments,
            savedItemIds: state.savedItemIds,
          ),
          expectedOwner: expectedOwner,
        );
      }
    }, expectedOwner: expectedOwner);
  }

  /// Returns the wishlist id the item currently belongs to, or null.
  static Future<String?> getWishlistForItem(
    String itemId, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    return _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = await _readWishlistStateWithDefaults(prefs, principal,
          expectedOwner: expectedOwner);
      return state.assignments[itemId];
    }, expectedOwner: expectedOwner);
  }

  /// Assigns an item to a wishlist (one list at a time).
  static Future<void> setItemWishlist(
    String itemId,
    String listId, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    if (itemId.trim().isEmpty || listId.trim().isEmpty) {
      throw ArgumentError('Item and saved-list IDs must not be empty.');
    }
    await _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = _readWishlistState(prefs, principal);
      _addDefaultWishlists(state.lists);
      _validateWishlistAssignmentTargets(state.assignments, state.lists);
      if (!state.lists.any((entry) => entry['id'] == listId)) {
        throw StateError('Saved-list target does not exist.');
      }
      state.assignments[itemId] = listId;
      await _writeWishlistState(
        prefs,
        principal,
        _LocalWishlistState(
          revision: state.revision + 1,
          lists: state.lists,
          assignments: state.assignments,
          savedItemIds: state.savedItemIds,
        ),
        expectedOwner: expectedOwner,
      );
    }, expectedOwner: expectedOwner);
  }

  /// Removes an item from any wishlist.
  static Future<void> removeItemFromWishlist(
    String itemId, {
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    await _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = _readWishlistState(prefs, principal);
      _addDefaultWishlists(state.lists);
      _validateWishlistAssignmentTargets(state.assignments, state.lists);
      if (state.assignments.remove(itemId) != null) {
        await _writeWishlistState(
          prefs,
          principal,
          _LocalWishlistState(
            revision: state.revision + 1,
            lists: state.lists,
            assignments: state.assignments,
            savedItemIds: state.savedItemIds,
          ),
          expectedOwner: expectedOwner,
        );
      }
    }, expectedOwner: expectedOwner);
  }

  /// Returns items grouped by wishlist id.
  static Future<Map<String, List<Item>>> getItemsByWishlist({
    LocalPrincipalActionOwner? expectedOwner,
  }) async {
    final Map<String, List<Item>> out = {};
    final items = expectedOwner == null
        ? await getItems()
        : await _getSavedCartItemsForOwner(expectedOwner);
    final map = await _runWishlistForCurrentPrincipal((principal) async {
      final prefs = await SharedPreferences.getInstance();
      final state = await _readWishlistStateWithDefaults(prefs, principal,
          expectedOwner: expectedOwner);
      return Map<String, String>.from(state.assignments);
    }, expectedOwner: expectedOwner);
    for (final it in items) {
      final id = map[it.id] ?? '';
      if (id.isEmpty) continue;
      out.putIfAbsent(id, () => []).add(it);
    }
    return out;
  }

  static Future<void> _initializeSampleData() async {
    final prefs = await SharedPreferences.getInstance();

    final categories = _buildDemoCategories();
    await prefs.setString(
      _categoriesKey,
      jsonEncode(categories.map((c) => c.toJson()).toList()),
    );

    final users = _buildDemoUsers();
    final items = _buildDemoItems(users, categories);
    final reviews = _buildDemoReviews(users);

    // Ensure stored review counts reflect actual demo reviews for consistency across the app.
    final reviewCounts = <String, int>{};
    for (final review in reviews) {
      reviewCounts.update(
        review.reviewedUserId,
        (value) => value + 1,
        ifAbsent: () => 1,
      );
    }

    final usersWithCounts = [
      for (final user in users)
        user.copyWith(reviewCount: reviewCounts[user.id] ?? user.reviewCount),
    ];

    await prefs.setString(
      _usersKey,
      jsonEncode(usersWithCounts.map((u) => u.toJson()).toList()),
    );
    await prefs.setString(
      _itemsKey,
      jsonEncode(items.map((i) => i.toJson()).toList()),
    );
    await prefs.setString(
      _reviewsKey,
      jsonEncode(reviews.map((r) => r.toJson()).toList()),
    );

    // Sample-data bootstrap must not auto-auth a current user.
    // currentUser should only be established by real login/session hydration.
    await prefs.remove(_currentUserKey);
    // Ensure wishlists are initialized once demo data is set up.
    try {
      await getWishlists();
    } catch (e) {
      debugPrint(
        '[DataService] ensureDefaultWishlists failed: $e',
      );
    }
  }

  // Cities and coordinates (Germany)
  static const Map<String, (double lat, double lng)> _cities = {
    'Berlin': (52.5200, 13.4050),
    'Hamburg': (53.5511, 9.9937),
    'München': (48.1351, 11.5820),
    'Köln': (50.9375, 6.9603),
    'Frankfurt am Main': (50.1109, 8.6821),
    'Stuttgart': (48.7758, 9.1829),
    'Düsseldorf': (51.2277, 6.7735),
    'Leipzig': (51.3397, 12.3731),
    'Hannover': (52.3759, 9.7320),
    'Nürnberg': (49.4521, 11.0767),
    'Bremen': (53.0793, 8.8017),
    'Dortmund': (51.5136, 7.4653),
    'Essen': (51.4556, 7.0116),
    'Duisburg': (51.4344, 6.7623),
    'Bochum': (51.4818, 7.2162),
    'Wuppertal': (51.2562, 7.1508),
    'Bielefeld': (52.0302, 8.5325),
    'Bonn': (50.7374, 7.0982),
    'Münster': (51.9607, 7.6261),
    'Karlsruhe': (49.0069, 8.4037),
    'Mannheim': (49.4875, 8.4660),
    'Augsburg': (48.3705, 10.8978),
    'Wiesbaden': (50.0782, 8.2398),
    'Gelsenkirchen': (51.5177, 7.0857),
    'Mönchengladbach': (51.1805, 6.4428),
    'Braunschweig': (52.2689, 10.5268),
    'Kiel': (54.3233, 10.1228),
    'Aachen': (50.7753, 6.0839),
    'Dresden': (51.0504, 13.7373),
    'Chemnitz': (50.8278, 12.9214),
    'Halle (Saale)': (51.4968, 11.9689),
    'Magdeburg': (52.1205, 11.6276),
    'Freiburg im Breisgau': (47.9990, 7.8421),
    'Krefeld': (51.3388, 6.5853),
    'Lübeck': (53.8655, 10.6866),
    'Oberhausen': (51.4963, 6.8516),
    'Erfurt': (50.9848, 11.0299),
    'Mainz': (49.9929, 8.2473),
    'Rostock': (54.0924, 12.0991),
    'Kassel': (51.3127, 9.4797),
    'Hagen': (51.3671, 7.4633),
    'Saarbrücken': (49.2402, 6.9969),
    'Hamm': (51.6739, 7.8160),
    'Potsdam': (52.3906, 13.0645),
    'Ludwigshafen am Rhein': (49.4774, 8.4452),
    'Oldenburg': (53.1435, 8.2146),
    'Leverkusen': (51.0459, 7.0192),
    'Osnabrück': (52.2799, 8.0472),
    'Solingen': (51.1652, 7.0671),
    'Heidelberg': (49.3988, 8.6724),
    'Herne': (51.5380, 7.2257),
  };

  static Map<String, (double lat, double lng)> getCities() =>
      Map.unmodifiable(_cities);

  // Returns the closest known city name for a given coordinate.
  static String nearestCityName(double lat, double lng) {
    String nearest = _cities.keys.first;
    double best = double.infinity;
    for (final entry in _cities.entries) {
      final d = _haversine(lat, lng, entry.value.$1, entry.value.$2);
      if (d < best) {
        best = d;
        nearest = entry.key;
      }
    }
    return nearest;
  }

  static double _haversine(double lat1, double lon1, double lat2, double lon2) {
    const R = 6371.0;
    final dLat = _deg2rad(lat2 - lat1);
    final dLon = _deg2rad(lon2 - lon1);
    final a = (sin(dLat / 2) * sin(dLat / 2)) +
        (cos(_deg2rad(lat1)) *
            cos(_deg2rad(lat2)) *
            sin(dLon / 2) *
            sin(dLon / 2));
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return R * c;
  }

  static double _deg2rad(double deg) => deg * (pi / 180.0);

  // Delivery helpers
  static double estimateDistanceKm(
    double fromLat,
    double fromLng,
    double toLat,
    double toLng,
  ) {
    return _haversine(fromLat, fromLng, toLat, toLng);
  }

  static double estimateDistanceKmToCity(
    double fromLat,
    double fromLng,
    String cityName,
  ) {
    final cityPos = _cities[cityName];
    if (cityPos == null) return 0.0;
    return _haversine(fromLat, fromLng, cityPos.$1, cityPos.$2);
  }

  static double deliveryFeeForDistanceKm(double km) {
    // Charged for both ways (Hin- & Rückweg): km × 2 × 0.30 €
    final fee = km * 2 * 0.30; // €0.30 per km, round trip
    return fee < 3.0 ? 3.0 : double.parse(fee.toStringAsFixed(2));
  }

  // Coarse category groups (ordered) for simplified display in UI
  static const List<String> coarseCategoryOrder = [
    'Technik & Elektronik',
    'Werkzeuge & Kleingeräte',
    'Haushalt & Wohnen',
    'Sport & Hobbys',
    'Auto & Mobilität',
    'Garten & Outdoor',
    'Events & Feiern',
    'Baby & Familie',
    'Reisen & Camping',
    'Kleidung & Anlässe',
    'Büro & Lernen',
    'Sonstiges',
  ];

  /// Maps a fine-grained category name (e.g., "Elektronik", "Kameras & Foto")
  /// to a coarse, simplified group used for display. Defaults to "Sonstiges".
  static String coarseCategoryFor(String name) {
    final n = name.toLowerCase();
    // Known mappings from demo data to coarse buckets
    if (n.contains('elektronik') ||
        n.contains('computer') ||
        n.contains('kamera') ||
        n.contains('audio') ||
        n.contains('mikro') ||
        n.contains('drohn') ||
        n.contains('gaming') ||
        n.contains('vr') ||
        n.contains('smart')) {
      return 'Technik & Elektronik';
    }
    if (n.contains('werkzeug') ||
        n.contains('maschinen') ||
        n.contains('handwerk') ||
        n.contains('bohr') ||
        n.contains('säge') ||
        n.contains('saege')) {
      return 'Werkzeuge & Kleingeräte';
    }
    if (n.contains('haushalt') ||
        n.contains('haushalts') ||
        n.contains('möbel') ||
        n.contains('moebel') ||
        n.contains('wohnen') ||
        n.contains('beleuchtung') ||
        n.contains('licht')) {
      return 'Haushalt & Wohnen';
    }
    if (n.contains('freizeit') ||
        n.contains('sport') ||
        n.contains('fitness') ||
        n.contains('hobby')) {
      return 'Sport & Hobbys';
    }
    if (n.contains('fahrzeug') ||
        n.contains('teile') ||
        n.contains('fahrräder') ||
        n.contains('fahrraeder') ||
        n.contains('mobilität') ||
        n.contains('mobilitaet') ||
        n.contains('e-mobility') ||
        n.contains('bike') ||
        n.contains('e-scooter') ||
        n.contains('scooter') ||
        n.contains('auto') ||
        n.contains('wagen')) {
      return 'Auto & Mobilität';
    }
    if (n.contains('garten') ||
        n.contains('heimwerken') ||
        n.contains('grill') ||
        n.contains('rasen') ||
        n.contains('outdoor')) {
      return 'Garten & Outdoor';
    }
    if (n.contains('event') ||
        n.contains('feier') ||
        n.contains('party') ||
        n.contains('hochzeit') ||
        n.contains('geburtstag') ||
        n.contains('festival')) {
      return 'Events & Feiern';
    }
    if (n.contains('baby') ||
        n.contains('kinder') ||
        n.contains('familie') ||
        n.contains('spielzeug')) {
      return 'Baby & Familie';
    }
    if (n.contains('camping') ||
        n.contains('zelt') ||
        n.contains('reise') ||
        n.contains('urlaub') ||
        n.contains('rucksack') ||
        n.contains('koffer')) {
      return 'Reisen & Camping';
    }
    if (n.contains('mode') ||
        n.contains('accessoires') ||
        n.contains('schmuck') ||
        n.contains('uhren') ||
        n.contains('kleidung') ||
        n.contains('anzug') ||
        n.contains('kleid') ||
        n.contains('kostüm') ||
        n.contains('kostuem')) {
      return 'Kleidung & Anlässe';
    }
    if (n.contains('büro') ||
        n.contains('buero') ||
        n.contains('gewerbe') ||
        n.contains('office') ||
        n.contains('lernen') ||
        n.contains('schule') ||
        n.contains('studium')) {
      return 'Büro & Lernen';
    }
    if (n.contains('haustier')) {
      return 'Sonstiges';
    }
    return 'Sonstiges';
  }

  static Future<Map<String, dynamic>?> getSavedDeliverySelection(
    String itemId,
  ) async {
    final id = itemId.trim();
    if (id.isEmpty) return null;
    return _withCurrentBookingSelectionBucket((_, __, ___, bucket) async {
      final entry = bucket[id];
      if (entry is! Map || entry['delivery'] is! Map) return null;
      final selection =
          Map<String, dynamic>.from(entry['delivery'] as Map<dynamic, dynamic>);
      // Compatibility defaults are a read-only view and never rewrite raw
      // storage or silently claim a legacy field for another principal.
      selection.putIfAbsent('addressLine', () => '');
      selection.putIfAbsent('city', () => '');
      selection.putIfAbsent('lat', () => null);
      selection.putIfAbsent('lng', () => null);
      selection.putIfAbsent('express', () => false);
      selection.putIfAbsent(
        'deliveryAddressLine',
        () => selection['addressLine'] ?? '',
      );
      selection.putIfAbsent('deliveryCity', () => selection['city'] ?? '');
      selection.putIfAbsent('deliveryLat', () => selection['lat']);
      selection.putIfAbsent('deliveryLng', () => selection['lng']);
      selection.putIfAbsent(
        'returnAddressLine',
        () => selection['addressLine'] ?? '',
      );
      selection.putIfAbsent('returnCity', () => selection['city'] ?? '');
      selection.putIfAbsent('returnLat', () => selection['lat']);
      selection.putIfAbsent('returnLng', () => selection['lng']);
      return selection;
    });
  }

  static Future<void> setSavedDeliverySelection(
    String itemId, {
    required bool hinweg,
    required bool rueckweg,
    String? addressCity,
    String addressLine = '',
    bool express = false,
    double? lat,
    double? lng,
    String? deliveryAddressLine,
    String? deliveryCity,
    double? deliveryLat,
    double? deliveryLng,
    String? returnAddressLine,
    String? returnCity,
    double? returnLat,
    double? returnLng,
  }) async {
    final id = itemId.trim();
    if (id.isEmpty || id.length > 256) {
      throw ArgumentError('Invalid local booking delivery selection.');
    }
    await _withCurrentBookingSelectionBucket(
      (prefs, registry, principal, bucket) async {
        final existing = bucket[id] is Map
            ? Map<String, dynamic>.from(bucket[id] as Map)
            : <String, dynamic>{};
        existing['delivery'] = <String, dynamic>{
          'hinweg': hinweg,
          'rueckweg': rueckweg,
          'city': addressCity ?? '',
          'addressLine': addressLine,
          'express': express,
          'lat': lat,
          'lng': lng,
          'deliveryAddressLine': deliveryAddressLine ?? addressLine,
          'deliveryCity': deliveryCity ?? addressCity ?? '',
          'deliveryLat': deliveryLat ?? lat,
          'deliveryLng': deliveryLng ?? lng,
          'returnAddressLine': returnAddressLine ?? addressLine,
          'returnCity': returnCity ?? addressCity ?? '',
          'returnLat': returnLat ?? lat,
          'returnLng': returnLng ?? lng,
        };
        bucket[id] = existing;
        await _writeBookingSelectionBucket(
          prefs,
          registry,
          principal,
          bucket,
        );
      },
    );
  }

  // Extract a known city from a freeform address string, or return empty if not found
  static String deriveCityFromAddress(String address) {
    final a = address.toLowerCase();
    for (final c in _cities.keys) {
      if (a.contains(c.toLowerCase())) return c;
    }
    return '';
  }

  // Estimate distance based on a freeform address by resolving it to the nearest known city token.
  // This is a placeholder until a Maps API is connected; it provides a reasonable local demo.
  static double estimateDistanceKmFromAddressLine(
    double fromLat,
    double fromLng,
    String addressLine,
  ) {
    final city = deriveCityFromAddress(addressLine);
    if (city.isNotEmpty) {
      return estimateDistanceKmToCity(fromLat, fromLng, city);
    }
    // Fallback: use the nearest city to the item coordinate as a proxy (0 km)
    // so that we don't block checkout without maps integration.
    return 0.0;
  }

  static String _rentalDate(DateTime value) {
    final local = value.toLocal();
    return '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  }

  // The backend is authoritative in normal operation. The local lane remains
  // only for explicit QA fixtures where no backend is connected.
  static Future<bool> checkAvailability({
    required String itemId,
    required DateTime start,
    required DateTime end,
  }) async {
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      return BackendRepository.checkListingAvailability(
        listingId: itemId,
        startDate: _rentalDate(start),
        endDate: _rentalDate(end),
      );
    }
    // Quick delay to emulate IO
    await Future<void>.delayed(const Duration(milliseconds: 120));
    // Load all requests and block overlaps with accepted or running bookings
    final all = await _getAllRentalRequests();
    for (final r in all) {
      if (r.itemId != itemId) continue;
      if (r.status != 'accepted' && r.status != 'running') continue;
      // Overlap if requested start < existing.end and requested end > existing.start
      final bool overlap = start.isBefore(r.end) && end.isAfter(r.start);
      if (overlap) return false;
    }
    return true;
  }

  // Ranges that are already booked for an item. A day is considered booked
  // when it is >= start and < end (end-exclusive). Used by the calendar to
  // render red blocked days and prevent overlapping selections.
  static Future<List<DateTimeRange>> getUnavailableRangesForItem(
    String itemId,
  ) async {
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final now = DateTime.now();
      final through = DateTime(now.year + 1, now.month, now.day + 1);
      final availability = await BackendRepository.getListingAvailability(
        listingId: itemId,
        fromDate: _rentalDate(now),
        toDate: _rentalDate(through),
      );
      final entries = availability['unavailable'];
      if (entries is! List) return <DateTimeRange>[];
      return entries.whereType<Map>().map((entry) {
        final start = DateTime.parse(entry['start'].toString()).toLocal();
        final end = DateTime.parse(entry['end'].toString()).toLocal();
        return DateTimeRange(start: start, end: end);
      }).toList();
    }
    final all = await _getAllRentalRequests();
    final ranges = <DateTimeRange>[];
    for (final r in all) {
      if (r.itemId != itemId) continue;
      if (r.status != 'accepted' && r.status != 'running') continue;
      ranges.add(DateTimeRange(start: r.start, end: r.end));
    }
    return ranges;
  }

  static List<Category> _buildDemoCategories() {
    final now = DateTime.now();
    final List<
        (
          String id,
          String name,
          String slug,
          String iconName,
          List<String> subs
        )> data = [
      (
        'cat1',
        'Elektronik',
        'elektronik',
        'devices',
        ['Smartphones', 'Tablets', 'Wearables', 'Audio', 'Zubehör'],
      ),
      (
        'cat2',
        'Computer & IT',
        'computer-it',
        'computer',
        ['Laptops', 'Desktops', 'Monitore', 'Drucker', 'Netzwerk'],
      ),
      (
        'cat3',
        'Kameras & Foto',
        'kameras-foto',
        'camera_alt',
        ['Kameras', 'Objektive', 'Stative', 'Licht'],
      ),
      (
        'cat4',
        'Gaming & VR',
        'gaming-vr',
        'sports_esports',
        ['Konsolen', 'Gaming-PC', 'VR', 'Lenkräder', 'Retro'],
      ),
      (
        'cat5',
        'Haushaltsgeräte',
        'haushaltsgeraete',
        'kitchen',
        [
          'Staubsauger',
          'Mixer',
          'Kaffeemaschinen',
          'Waschmaschinen',
          'Trockner',
        ],
      ),
      (
        'cat6',
        'Möbel & Wohnen',
        'moebel-wohnen',
        'weekend',
        ['Sofas', 'Tische', 'Stühle', 'Beleuchtung', 'Deko'],
      ),
      (
        'cat7',
        'Garten & Heimwerken',
        'garten-heimwerken',
        'grass',
        [
          'Rasenmäher',
          'Heckenscheren',
          'Gartengeräte',
          'Bewässerung',
          'Pflanzkisten',
        ],
      ),
      (
        'cat8',
        'Werkzeuge & Maschinen',
        'werkzeuge-maschinen',
        'construction',
        [
          'Handwerkzeuge',
          'Elektrowerkzeuge',
          'Bohrmaschinen',
          'Sägen',
          'Schleifer',
        ],
      ),
      (
        'cat9',
        'Fahrräder & E-Mobility',
        'fahrraeder-e-mobility',
        'pedal_bike',
        ['Citybikes', 'MTB', 'E-Bikes', 'E-Scooter', 'Zubehör'],
      ),
      (
        'cat10',
        'Fahrzeuge & Teile',
        'fahrzeuge-teile',
        'directions_car',
        ['Kleinwagen', 'SUV', 'Transporter', 'Wohnmobil', 'Anhänger'],
      ),
      (
        'cat11',
        'Freizeit, Sport & Outdoor',
        'freizeit-sport-outdoor',
        'sports_soccer',
        ['Fitness', 'Teamsport', 'Racketsport', 'Radsport', 'Wassersport'],
      ),
      (
        'cat12',
        'Mode & Accessoires',
        'mode-accessoires',
        'checkroom',
        ['Kleidung', 'Taschen', 'Schuhe', 'Schmuck', 'Uhren'],
      ),
      (
        'cat13',
        'Baby, Kinder & Spielzeug',
        'baby-kinder-spielzeug',
        'child_friendly',
        ['Kinderwagen', 'Sitze', 'Spielzeug', 'Tragen', 'Sicherheit'],
      ),
      (
        'cat14',
        'Musikinstrumente & DJ',
        'musikinstrumente-dj',
        'music_note',
        ['Gitarren', 'Tastaturen', 'Schlagzeug', 'Blasinstrumente', 'Studio'],
      ),
      (
        'cat15',
        'Bücher, Filme & Medien',
        'buecher-filme-medien',
        'menu_book',
        ['Bücher', 'Filme', 'Spiele', 'Hörbücher', 'Magazine'],
      ),
      (
        'cat16',
        'Schmuck & Uhren',
        'schmuck-uhren',
        'watch',
        ['Ringe', 'Ketten', 'Uhren', 'Ohrringe', 'Sets'],
      ),
      (
        'cat17',
        'Kunst & Sammlerstücke',
        'kunst-sammlerstuecke',
        'palette',
        ['Gemälde', 'Skulpturen', 'Drucke', 'Figuren', 'Seltenes'],
      ),
      (
        'cat18',
        'Beauty & Gesundheit',
        'beauty-gesundheit',
        'spa',
        ['Kosmetik', 'Pflege', 'Wellness', 'Medizin', 'Zubehör'],
      ),
      (
        'cat19',
        'Haustierbedarf',
        'haustierbedarf',
        'pets',
        ['Hunde', 'Katzen', 'Kleintiere', 'Aquaristik', 'Zubehör'],
      ),
      (
        'cat20',
        'Büro & Gewerbe',
        'buero-gewerbe',
        'business_center',
        ['Bürotechnik', 'Präsentation', 'Werkstatt', 'Lager', 'Zubehör'],
      ),
      (
        'cat22',
        'Events & Feiern',
        'events-feiern',
        'celebration',
        [
          'Party-Deko',
          'Eventtechnik',
          'Tische & Stühle',
          'Pavillons',
          'Buffet & Catering',
        ],
      ),
      (
        'cat23',
        'Reisen & Camping',
        'reisen-camping',
        'travel_explore',
        [
          'Zelte',
          'Schlafsäcke',
          'Rucksäcke & Koffer',
          'Campingküche',
          'Outdoor-Zubehör',
        ],
      ),
      ('cat21', 'Sonstiges', 'sonstiges', 'more_horiz', ['Diverses']),
    ];
    return [
      for (final d in data)
        Category(
          id: d.$1,
          name: d.$2,
          slug: d.$3,
          iconName: d.$4,
          subcategories: d.$5,
          createdAt: now,
        ),
    ];
  }

  static const List<(String id, String name, String photo)> _userSeeds = [
    (
      'u1',
      'Walid Chraibi',
      'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u2',
      'Max Mustermann',
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u3',
      'Sarah Schmidt',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u4',
      'Thomas Weber',
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u5',
      'Julia Wagner',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u6',
      'David König',
      'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u7',
      'Anna Keller',
      'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u8',
      'Laura Krüger',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u9',
      'Daniel Hoffmann',
      'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u10',
      'Sophie Lehmann',
      'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u11',
      'Jonas Maier',
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u12',
      'Lea Schuster',
      'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u13',
      'Felix Braun',
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u14',
      'Mia Sauer',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u15',
      'Tobias Busch',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u16',
      'Nina Scholz',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u17',
      'Sebastian Hartmann',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u18',
      'Eva Fuchs',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u19',
      'Paul Engel',
      'https://images.unsplash.com/photo-1531891437562-4301cf35b7e4?w=150&h=150&fit=crop&crop=face',
    ),
    (
      'u20',
      'Clara Wolf',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face',
    ),
  ];

  static List<User> _buildDemoUsers() {
    final now = DateTime.now();
    final cities = _cities.keys.toList();
    final rnd = Random(42);
    return [
      for (final entry in _userSeeds)
        User(
          id: entry.$1,
          displayName: entry.$2,
          email: '${entry.$1}@shareittoo.demo',
          city: cities[rnd.nextInt(cities.length)],
          country: 'Deutschland',
          preferredLanguage: 'de-DE',
          isVerified: rnd.nextDouble() < 0.7,
          isBanned: false,
          role: 'user',
          avgRating: 4.0 + rnd.nextDouble() * 0.8,
          reviewCount: 0,
          createdAt: now.subtract(Duration(days: rnd.nextInt(1200))),
          photoURL: entry.$3,
          languages: const ['Deutsch'],
        ),
    ];
  }

  static List<Item> _buildDemoItems(
    List<User> users,
    List<Category> categories,
  ) {
    final rnd = Random(99);
    final now = DateTime.now();
    final List<(String city, (double, double) pos)> cities = [
      for (final e in _cities.entries) (e.key, (e.value.$1, e.value.$2)),
    ];

    // Title seeds by category
    final Map<String, List<String>> titles = {
      'cat1': [
        'iPhone 14 Pro',
        'Samsung Galaxy S23',
        'iPad Pro 11"',
        'Kindle Paperwhite',
        'Sony WH-1000XM5',
      ],
      'cat2': [
        'MacBook Air M2',
        '27" Monitor',
        'WiFi 6 Router',
        'QNAP NAS',
        'Laserdrucker',
      ],
      'cat3': [
        'Canon EOS R5',
        'Sony A7 IV',
        'Canon RF 70-200mm',
        'Fujifilm X-T5',
        'Nikon Z6 II',
      ],
      'cat4': [
        'PS5 Konsole',
        'Gaming-PC',
        'VR Headset',
        'Nintendo Switch',
        'Rennlenkrad',
      ],
      'cat5': [
        'Dyson Staubsauger',
        'KitchenAid Mixer',
        'Jura Kaffeemaschine',
        'Miele Waschmaschine',
        'Bosch Trockner',
      ],
      'cat6': [
        'Samt-Sofa 3-Sitzer',
        'Esstisch Eiche',
        'Design-Lampe',
        'Barhocker',
        'Sideboard',
      ],
      'cat7': [
        'Rasenmäher',
        'Heckenschere',
        'Hochdruckreiniger',
        'Gartenhäcksler',
        'Schubkarre',
      ],
      'cat8': [
        'Bosch Bohrmaschine',
        'Makita Akkuschrauber',
        'DeWalt Kreissäge',
        'Einhell Winkelschleifer',
        'Metabo Stichsäge',
      ],
      'cat9': [
        'E-Bike Trekking',
        'Mountainbike',
        'E-Scooter',
        'Citybike',
        'Rennrad',
      ],
      'cat10': [
        'VW Golf',
        'BMW 3er',
        'Mercedes Sprinter',
        'Wohnmobil Ducato',
        'Dachbox',
      ],
      'cat11': [
        'SUP-Board',
        'Kletterausrüstung',
        '2-Personen Zelt',
        'Ski-Set',
        'Inlineskates',
      ],
      'cat12': [
        'Abendkleid',
        'Ledertasche',
        'Sneaker',
        'Armbanduhr',
        'Sonnenbrille',
      ],
      'cat13': [
        'Kinderwagen',
        'Kindersitz',
        'Laufrad',
        'Babyphone',
        'Tragehilfe',
      ],
      'cat14': [
        'Akustikgitarre',
        'E-Piano',
        'DJ Controller',
        'Saxophon',
        'Studio-Mikrofon',
      ],
      'cat15': [
        'Buchpaket Sci-Fi',
        'Blu-ray Sammlung',
        'Brettspiele',
        'Hörbuch-Set',
        'Manga-Box',
      ],
      'cat16': [
        'Armbanduhr',
        'Halskette',
        'Ohrringe',
        'Perlenkette',
        'Uhrenbox',
      ],
      'cat17': [
        'Gemälde Öl',
        'Skulptur',
        'Vintage Figur',
        'Posterlimit',
        'Vinyl Sammlung',
      ],
      'cat18': [
        'Massagepistole',
        'Infrarotlampe',
        'Haartrockner',
        'Glätteisen',
        'Ionenluftreiniger',
      ],
      'cat19': [
        'Hundetransportbox',
        'Kratzbaum',
        'Aquarien-Set',
        'Hundebuggy',
        'Futterautomat',
      ],
      'cat20': [
        'Beamer',
        'Flipchart',
        'Bohrhammer',
        'Industriesauger',
        'Messestand',
      ],
      'cat21': ['Werkzeugkoffer', 'Überraschungspaket', 'Diverse Dinge'],
    };

    int idCounter = 1;
    final List<Item> items = [];
    final int targetCount = 160 + rnd.nextInt(40); // 160–199

    List<String> photosFor(String key, int seed, String catId) {
      // Use category-specific images with reliable sources
      final Map<String, List<String>> categoryImages = {
        'cat1': [
          // Elektronik
          'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1545127398-14699f92334b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1483736762161-1d107f3c78e1?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=800&h=800&fit=crop',
        ],
        'cat2': [
          // Computer & IT
          'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1587831990711-23ca6441447b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1484788984921-03950022c9ef?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1616628188540-26abf1d75b5b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1587831990711-23ca6441447b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1484788984921-03950022c9ef?w=800&h=800&fit=crop',
        ],
        'cat3': [
          // Kameras & Foto
          'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1486401899868-0e435ed85128?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1495592822108-9e6261896da8?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800&h=800&fit=crop',
        ],
        'cat4': [
          // Gaming & VR
          'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1592840331013-9c57c6f3a3b8?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1574292384054-9a63e9c5cfb0?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1592840331013-9c57c6f3a3b8?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=800&fit=crop',
        ],
        'cat5': [
          // Haushaltsgeräte
          'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1556909202-f6d704471045?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1556909202-f6d704471045?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=800&fit=crop',
        ],
        'cat8': [
          // Werkzeuge & Maschinen
          'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1609205842104-8e045f7e3e3c?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1544716278-e513176f20a5?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1611269154421-4e27233ac5c7?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1609205842104-8e045f7e3e3c?w=800&h=800&fit=crop',
        ],
        'cat9': [
          // Fahrräder & E-Mobility
          'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1502744688674-c619d1586c9e?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1544191696-15693074e8b5?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1502744688674-c619d1586c9e?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1544191696-15693074e8b5?w=800&h=800&fit=crop',
          'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&h=800&fit=crop',
        ],
      };

      final images = categoryImages[catId] ??
          [
            'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=800&fit=crop',
            'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=800&fit=crop',
            'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&h=800&fit=crop',
            'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=800&h=800&fit=crop',
            'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=800&fit=crop',
            'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=800&fit=crop',
            'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&h=800&fit=crop',
            'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=800&h=800&fit=crop',
            'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=800&fit=crop',
          ];

      return images;
    }

    for (int i = 0; i < targetCount; i++) {
      final cat = categories[rnd.nextInt(categories.length)];
      final city = cities[rnd.nextInt(cities.length)];
      final owner = users[rnd.nextInt(users.length)];
      final titleList = titles[cat.id] ?? ['Top Angebot'];
      final title = titleList[rnd.nextInt(titleList.length)];

      // distance around city center (±20km)
      final dLat = (rnd.nextDouble() - 0.5) * 0.36; // rough ~40km span
      final dLng = (rnd.nextDouble() - 0.5) * 0.56;
      final lat = city.$2.$1 + dLat;
      final lng = city.$2.$2 + dLng;

      // price ranges per category (rough realistic €)
      final basePrice = switch (cat.id) {
        'cat1' => 12 + rnd.nextInt(30), // Elektronik
        'cat2' => 8 + rnd.nextInt(25), // Computer & IT
        'cat3' => 35 + rnd.nextInt(100), // Kameras & Foto
        'cat4' => 10 + rnd.nextInt(35), // Gaming & VR
        'cat5' => 10 + rnd.nextInt(35), // Haushaltsgeräte
        'cat6' => 10 + rnd.nextInt(30), // Möbel & Wohnen
        'cat7' => 7 + rnd.nextInt(20), // Garten & Heimwerken
        'cat8' => 8 + rnd.nextInt(20), // Werkzeuge & Maschinen
        'cat9' => 8 + rnd.nextInt(22), // Fahrräder & E-Mobility
        'cat10' => 40 + rnd.nextInt(120), // Fahrzeuge & Teile
        'cat11' => 6 + rnd.nextInt(25), // Freizeit, Sport & Outdoor
        'cat12' => 4 + rnd.nextInt(20), // Mode & Accessoires
        'cat13' => 5 + rnd.nextInt(18), // Baby, Kinder & Spielzeug
        'cat14' => 8 + rnd.nextInt(30), // Musikinstrumente & DJ
        'cat15' => 3 + rnd.nextInt(10), // Bücher, Filme & Medien
        'cat16' => 6 + rnd.nextInt(24), // Schmuck & Uhren
        'cat17' => 8 + rnd.nextInt(27), // Kunst & Sammlerstücke
        'cat18' => 5 + rnd.nextInt(17), // Beauty & Gesundheit
        'cat19' => 4 + rnd.nextInt(14), // Haustierbedarf
        'cat20' => 12 + rnd.nextInt(38), // Büro & Gewerbe
        'cat21' => 10 + rnd.nextInt(30), // Sonstiges
        _ => 10 + rnd.nextInt(30),
      };

      final isNewish = i < 80; // ensure at least 80 latest
      final createdAt = now.subtract(
        Duration(days: isNewish ? rnd.nextInt(10) : 10 + rnd.nextInt(350)),
      );
      final verified = rnd.nextDouble() < 0.6; // ~60%

      // Determine demo delivery offerings
      final bool offerDropoff = rnd.nextDouble() < 0.5; // ~50%
      final bool offerPickup = rnd.nextDouble() < 0.5; // ~50%
      double? maxDropKm;
      double? maxReturnKm;
      if (offerDropoff && rnd.nextBool()) {
        const opts = [5, 7, 10, 12, 15, 20, 25, 30];
        maxDropKm = opts[rnd.nextInt(opts.length)].toDouble();
      }
      if (offerPickup && rnd.nextBool()) {
        const opts = [5, 7, 10, 12, 15, 20, 25, 30];
        maxReturnKm = opts[rnd.nextInt(opts.length)].toDouble();
      }

      final item = Item(
        id: '${idCounter++}',
        ownerId: owner.id,
        title: title,
        description: 'Gut gepflegt, sofort verfügbar. ${cat.name} • ${city.$1}',
        categoryId: cat.id,
        subcategory:
            cat.subcategories.isNotEmpty ? cat.subcategories.first : '-',
        tags: [cat.slug, city.$1],
        pricePerDay: basePrice.toDouble(),
        currency: 'EUR',
        priceUnit: 'day',
        priceRaw: basePrice.toDouble(),
        photos: photosFor(cat.slug, i, cat.id),
        locationText: '${city.$1}-${[
          'Mitte',
          'Nord',
          'Süd',
          'Ost',
          'West'
        ][rnd.nextInt(5)]}',
        lat: lat,
        lng: lng,
        geohash: 'u'
            '${rnd.nextInt(9)}'
            '${rnd.nextInt(9)}'
            '${rnd.nextInt(9)}'
            '${rnd.nextInt(9)}',
        condition: ['new', 'like-new', 'good', 'acceptable'][rnd.nextInt(4)],
        minDays: [null, 1, 2].elementAt(rnd.nextInt(3)),
        maxDays: [null, 7, 14, 30].elementAt(rnd.nextInt(4)),
        createdAt: createdAt,
        isActive: true,
        verificationStatus: verified ? 'approved' : 'pending',
        city: city.$1,
        country: 'Deutschland',
        timesLent: rnd.nextInt(220),
        offersDeliveryAtDropoff: offerDropoff,
        offersPickupAtReturn: offerPickup,
        offersExpressAtDropoff: offerDropoff && rnd.nextBool(),
        // In ~50% of offerings, show a max km (demo)
        maxDeliveryKmAtDropoff: maxDropKm,
        maxPickupKmAtReturn: maxReturnKm,
        cancellationPolicy: ['flexible', 'moderate', 'strict'][rnd.nextInt(3)],
      );
      items.add(item);
    }

    // Ensure at least 60 items have >=9 photos (already 9 by design) and mark them newest
    items.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return items;
  }

  static List<Item> _buildFiveShowcaseItems(
    List<User> users,
  ) {
    final now = DateTime.now();
    // Pick a stable owner and cities
    final owner = users.isNotEmpty
        ? users.first
        : User(
            id: 'u1',
            displayName: 'Demo User',
            email: 'demo@demo',
            city: 'Berlin',
            country: 'Deutschland',
            preferredLanguage: 'de-DE',
            isVerified: true,
            isBanned: false,
            role: 'user',
            avgRating: 4.8,
            reviewCount: 12,
            createdAt: now,
            photoURL: '',
            languages: const ['Deutsch'],
          );
    final berlin = _cities['Berlin'] ?? (52.52, 13.405);
    String gh(int i) => 'u${i}3${i}h$i';

    List<Item> items = [
      // 1) E-Bike with delivery at dropoff up to 10km
      Item(
        id: '1',
        ownerId: owner.id,
        title: 'E-Bike Trekking 28"',
        description: 'Top gepflegt, Akku 500Wh, sofort verfügbar.',
        categoryId: 'cat9',
        subcategory: 'E-Bikes',
        tags: const ['bike', 'e-bike', 'berlin'],
        pricePerDay: 19.0,
        currency: 'EUR',
        priceUnit: 'day',
        priceRaw: 19.0,
        photos: const [
          'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&h=800&fit=crop',
        ],
        locationText: 'Berlin-Mitte',
        lat: berlin.$1,
        lng: berlin.$2,
        geohash: gh(1),
        condition: 'like-new',
        minDays: 1,
        maxDays: 14,
        createdAt: now.subtract(const Duration(hours: 2)),
        isActive: true,
        verificationStatus: 'approved',
        city: 'Berlin',
        country: 'Deutschland',
        timesLent: 42,
        offersDeliveryAtDropoff: true,
        offersPickupAtReturn: false,
        offersExpressAtDropoff: true,
        maxDeliveryKmAtDropoff: 10,
        cancellationPolicy: 'flexible',
      ),
      // 2) Kamera mit Abholung bei Rückgabe bis 12km
      Item(
        id: '2',
        ownerId: owner.id,
        title: 'Canon EOS R6 + 24-105mm',
        description: 'Spitzenzustand, inkl. 2 Akkus und Ladegerät.',
        categoryId: 'cat3',
        subcategory: 'Kameras',
        tags: const ['kamera', 'canon', 'berlin'],
        pricePerDay: 45.0,
        currency: 'EUR',
        priceUnit: 'day',
        priceRaw: 45.0,
        photos: const [
          'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&h=800&fit=crop',
        ],
        locationText: 'Berlin-Prenzlauer Berg',
        lat: berlin.$1 + 0.01,
        lng: berlin.$2 + 0.01,
        geohash: gh(2),
        condition: 'like-new',
        minDays: 1,
        maxDays: 7,
        createdAt: now.subtract(const Duration(hours: 3)),
        isActive: true,
        verificationStatus: 'approved',
        city: 'Berlin',
        country: 'Deutschland',
        timesLent: 31,
        offersDeliveryAtDropoff: false,
        offersPickupAtReturn: true,
        maxPickupKmAtReturn: 12,
        cancellationPolicy: 'moderate',
      ),
      // 3) PS5 – zeigt keine Lieferoption (reines Selbstabholen)
      Item(
        id: '3',
        ownerId: owner.id,
        title: 'PlayStation 5 Digital Edition',
        description:
            'Mit zweitem Controller, sehr leise, ideal fürs Wochenende.',
        categoryId: 'cat4',
        subcategory: 'Konsolen',
        tags: const ['gaming', 'ps5', 'berlin'],
        pricePerDay: 18.0,
        currency: 'EUR',
        priceUnit: 'day',
        priceRaw: 18.0,
        photos: const [
          'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&h=800&fit=crop',
        ],
        locationText: 'Berlin-Friedrichshain',
        lat: berlin.$1 - 0.01,
        lng: berlin.$2 - 0.01,
        geohash: gh(3),
        condition: 'good',
        minDays: 1,
        maxDays: 10,
        createdAt: now.subtract(const Duration(hours: 5)),
        isActive: true,
        verificationStatus: 'approved',
        city: 'Berlin',
        country: 'Deutschland',
        timesLent: 27,
        cancellationPolicy: 'strict',
      ),
      // 4) Dyson Staubsauger – Lieferung und Abholung mit je 5km
      Item(
        id: '4',
        ownerId: owner.id,
        title: 'Dyson Akku-Staubsauger V11',
        description: 'Sehr sauber, mit Wandhalterung und Extra-Düsen.',
        categoryId: 'cat5',
        subcategory: 'Staubsauger',
        tags: const ['haushalt', 'dyson', 'berlin'],
        pricePerDay: 12.0,
        currency: 'EUR',
        priceUnit: 'day',
        priceRaw: 12.0,
        photos: const [
          'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=800&fit=crop',
        ],
        locationText: 'Berlin-Charlottenburg',
        lat: berlin.$1 + 0.015,
        lng: berlin.$2 - 0.015,
        geohash: gh(4),
        condition: 'like-new',
        minDays: 1,
        maxDays: 14,
        createdAt: now.subtract(const Duration(hours: 7)),
        isActive: true,
        verificationStatus: 'approved',
        city: 'Berlin',
        country: 'Deutschland',
        timesLent: 15,
        offersDeliveryAtDropoff: true,
        offersPickupAtReturn: true,
        offersExpressAtDropoff: true,
        maxDeliveryKmAtDropoff: 5,
        maxPickupKmAtReturn: 5,
        cancellationPolicy: 'moderate',
      ),
      // 5) Bosch Bohrmaschine – Lieferung bis 7km, keine Abholung
      Item(
        id: '5',
        ownerId: owner.id,
        title: 'Bosch Bohrmaschine Professional',
        description: 'Robust, inkl. Koffer und Bohrer-Set.',
        categoryId: 'cat8',
        subcategory: 'Bohrmaschinen',
        tags: const ['werkzeug', 'bosch', 'berlin'],
        pricePerDay: 10.0,
        currency: 'EUR',
        priceUnit: 'day',
        priceRaw: 10.0,
        photos: const [
          'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&h=800&fit=crop',
        ],
        locationText: 'Berlin-Neukölln',
        lat: berlin.$1 - 0.02,
        lng: berlin.$2 + 0.01,
        geohash: gh(5),
        condition: 'good',
        minDays: 1,
        maxDays: 10,
        createdAt: now.subtract(const Duration(hours: 8)),
        isActive: true,
        verificationStatus: 'approved',
        city: 'Berlin',
        country: 'Deutschland',
        timesLent: 22,
        offersDeliveryAtDropoff: true,
        offersPickupAtReturn: false,
        offersExpressAtDropoff: true,
        maxDeliveryKmAtDropoff: 7,
        cancellationPolicy: 'flexible',
      ),
    ];

    // Ensure order: newest first
    items.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return items;
  }

  static List<Review> _buildDemoReviews(List<User> users) {
    final now = DateTime.now();
    final existingIds = {for (final u in users) u.id};
    final List<Review> out = [];

    void add(
      String reviewerId,
      String reviewedUserId,
      double rating,
      String comment, {
      int daysAgo = 0,
      int hoursAgo = 0,
    }) {
      if (!existingIds.contains(reviewerId) ||
          !existingIds.contains(reviewedUserId) ||
          reviewerId == reviewedUserId) {
        return;
      }
      out.add(
        Review(
          id: 'r${out.length + 1}',
          reviewerId: reviewerId,
          reviewedUserId: reviewedUserId,
          rating: rating,
          comment: comment,
          createdAt: now.subtract(Duration(days: daysAgo, hours: hoursAgo)),
        ),
      );
    }

    add(
      'u1',
      'u2',
      4.9,
      'Werkzeug war in Top-Zustand, Übergabe super flexibel.',
      daysAgo: 6,
      hoursAgo: 3,
    );
    add(
      'u7',
      'u2',
      5.0,
      'Sehr hilfsbereit und schnelle Antworten auf Rückfragen.',
      daysAgo: 20,
      hoursAgo: 6,
    );
    add(
      'u11',
      'u3',
      4.8,
      'Abholung lief reibungslos, würde wieder bei Sarah mieten.',
      daysAgo: 9,
      hoursAgo: 2,
    );
    add(
      'u5',
      'u3',
      4.7,
      'Kamera war wie beschrieben, inklusive voll geladenem Akku.',
      daysAgo: 32,
      hoursAgo: 4,
    );
    add(
      'u10',
      'u6',
      5.0,
      'David hat sich Zeit für eine kurze Einweisung genommen, top.',
      daysAgo: 12,
      hoursAgo: 5,
    );
    add(
      'u12',
      'u6',
      4.9,
      'Sehr freundlich und flexibel bei der Rückgabe.',
      daysAgo: 45,
      hoursAgo: 7,
    );
    add(
      'u9',
      'u8',
      4.8,
      'Laura hat den Zustand des E-Bikes genau erklärt, alles bestens.',
      daysAgo: 3,
      hoursAgo: 1,
    );
    add(
      'u14',
      'u8',
      5.0,
      'Super Kommunikation und perfektes Zubehör dabei.',
      daysAgo: 14,
      hoursAgo: 8,
    );
    add(
      'u17',
      'u10',
      4.7,
      'Konsole war sauber und sofort einsatzbereit.',
      daysAgo: 27,
      hoursAgo: 6,
    );
    add(
      'u18',
      'u10',
      4.9,
      'Schnelle Übergabe und sehr sympathisch.',
      daysAgo: 58,
      hoursAgo: 3,
    );
    add(
      'u19',
      'u9',
      4.8,
      'MacBook in neuwertigem Zustand, gerne wieder.',
      daysAgo: 16,
      hoursAgo: 2,
    );
    add(
      'u20',
      'u9',
      4.6,
      'Abholung pünktlich und unkompliziert organisiert.',
      daysAgo: 70,
      hoursAgo: 5,
    );
    add(
      'u15',
      'u4',
      4.9,
      'Thomas hat alles ausführlich erklärt, super Service.',
      daysAgo: 22,
      hoursAgo: 4,
    );
    add(
      'u13',
      'u4',
      4.8,
      'Sehr zuverlässige Abstimmung und faire Konditionen.',
      daysAgo: 90,
      hoursAgo: 6,
    );
    add(
      'u8',
      'u5',
      4.7,
      'Julia hat schnell auf Nachrichten reagiert und war flexibel.',
      daysAgo: 11,
      hoursAgo: 7,
    );
    add(
      'u6',
      'u5',
      4.9,
      'Produkt top gepflegt, klare Empfehlung.',
      daysAgo: 61,
      hoursAgo: 2,
    );

    return out;
  }

  static Future<List<Review>> _getAllReviews() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_reviewsKey);
    if (raw == null) return const <Review>[];
    return _decodeClassicReviewsStrict(raw);
  }

  static String _requiredReviewString(
    Map<String, dynamic> entry,
    String key, {
    int maxLength = 256,
  }) {
    final value = entry[key];
    if (value is! String || value.trim().isEmpty || value.length > maxLength) {
      throw const FormatException('Invalid local review document');
    }
    return value;
  }

  static DateTime _requiredReviewDate(Map<String, dynamic> entry) {
    final raw = _requiredReviewString(entry, 'createdAt', maxLength: 64);
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) {
      throw const FormatException('Invalid local review document');
    }
    return parsed;
  }

  static List<Review> _decodeClassicReviewsStrict(String raw) {
    if (utf8.encode(raw).length > _maxLocalReviewDocumentBytes) {
      throw const FormatException('Invalid local review document');
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List || decoded.length > _maxLocalReviews) {
        throw const FormatException('Invalid local review document');
      }
      final ids = <String>{};
      final reviews = <Review>[];
      for (final value in decoded) {
        if (value is! Map) {
          throw const FormatException('Invalid local review document');
        }
        final entry = Map<String, dynamic>.from(value);
        final id = _requiredReviewString(entry, 'id');
        final reviewerId = _requiredReviewString(entry, 'reviewerId');
        final reviewedUserId = _requiredReviewString(entry, 'reviewedUserId');
        final rating = entry['rating'];
        final comment = entry['comment'];
        final createdAt = _requiredReviewDate(entry);
        if (!ids.add(id) ||
            reviewerId == reviewedUserId ||
            rating is! num ||
            !rating.toDouble().isFinite ||
            rating.toDouble() < 1 ||
            rating.toDouble() > 5 ||
            comment is! String ||
            comment.length > 20000) {
          throw const FormatException('Invalid local review document');
        }
        reviews.add(Review(
          id: id,
          reviewerId: reviewerId,
          reviewedUserId: reviewedUserId,
          rating: rating.toDouble(),
          comment: comment,
          createdAt: createdAt,
        ));
      }
      return reviews;
    } catch (error) {
      if (error is FormatException) rethrow;
      throw const FormatException('Invalid local review document');
    }
  }

  // ===== Multi-criteria reviews (immutable, local storage) =====
  static Future<List<MultiCriteriaReview>> _getAllMultiReviews() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_multiReviewsKey);
    if (raw == null) return const <MultiCriteriaReview>[];
    return _decodeMultiReviewsStrict(raw);
  }

  static List<MultiCriteriaReview> _decodeMultiReviewsStrict(String raw) {
    if (utf8.encode(raw).length > _maxLocalReviewDocumentBytes) {
      throw const FormatException('Invalid local multi-review document');
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List || decoded.length > _maxLocalReviews) {
        throw const FormatException('Invalid local multi-review document');
      }
      final ids = <String>{};
      final contexts = <String>{};
      final reviews = <MultiCriteriaReview>[];
      for (final value in decoded) {
        if (value is! Map) {
          throw const FormatException('Invalid local multi-review document');
        }
        final entry = Map<String, dynamic>.from(value);
        final id = _requiredReviewString(entry, 'id');
        final requestId = _requiredReviewString(entry, 'requestId');
        final itemId = _requiredReviewString(entry, 'itemId');
        final reviewerId = _requiredReviewString(entry, 'reviewerId');
        final reviewedUserId = _requiredReviewString(entry, 'reviewedUserId');
        final direction = _requiredReviewString(entry, 'direction');
        final createdAt = _requiredReviewDate(entry);
        final rawCriteria = entry['criteria'];
        if (!ids.add(id) ||
            !contexts.add('$requestId\u0000$reviewerId') ||
            reviewerId == reviewedUserId ||
            !const <String>{
              ReviewMetricsService.renterToOwner,
              ReviewMetricsService.ownerToRenter,
            }.contains(direction) ||
            rawCriteria is! List ||
            rawCriteria.length != 4) {
          throw const FormatException('Invalid local multi-review document');
        }
        final criteria = <ReviewCriterion>[];
        final criterionKeys = <String>{};
        for (final rawCriterion in rawCriteria) {
          if (rawCriterion is! Map) {
            throw const FormatException('Invalid local multi-review document');
          }
          final criterion = Map<String, dynamic>.from(rawCriterion);
          final key = _requiredReviewString(criterion, 'key', maxLength: 64);
          final stars = criterion['stars'];
          final note = criterion['note'];
          if (!criterionKeys.add(key) ||
              stars is! int ||
              stars < 1 ||
              stars > 5 ||
              (note != null &&
                  (note is! String ||
                      note.length > _maxLocalReviewNoteLength))) {
            throw const FormatException('Invalid local multi-review document');
          }
          criteria.add(ReviewCriterion(
            key: key,
            stars: stars,
            note: note as String?,
          ));
        }
        final review = MultiCriteriaReview(
          id: id,
          requestId: requestId,
          itemId: itemId,
          reviewerId: reviewerId,
          reviewedUserId: reviewedUserId,
          direction: direction,
          criteria: criteria,
          createdAt: createdAt,
        );
        if (!ReviewMetricsService.isRegularCompleteReview(review)) {
          throw const FormatException('Invalid local multi-review document');
        }
        reviews.add(review);
      }
      return reviews;
    } catch (error) {
      if (error is FormatException) rethrow;
      throw const FormatException('Invalid local multi-review document');
    }
  }

  static Future<void> _persistMultiReviews(
    SharedPreferences prefs,
    List<MultiCriteriaReview> list,
  ) async {
    if (list.length > _maxLocalReviews) {
      throw StateError('Der lokale Bewertungsspeicher ist voll.');
    }
    final encoded = jsonEncode(list.map((entry) => entry.toJson()).toList());
    _decodeMultiReviewsStrict(encoded);
    final previous = prefs.getString(_multiReviewsKey);
    try {
      if (_failNextReviewPersistenceForTesting) {
        _failNextReviewPersistenceForTesting = false;
        throw StateError('Synthetic local review persistence failure.');
      }
      await _writePreferenceString(prefs, _multiReviewsKey, encoded);
    } catch (_) {
      final current = prefs.getString(_multiReviewsKey);
      if (current != previous) {
        final restored = previous == null
            ? await prefs.remove(_multiReviewsKey)
            : await prefs.setString(_multiReviewsKey, previous);
        if (!restored || prefs.getString(_multiReviewsKey) != previous) {
          throw StateError(
            'Lokale Bewertungen konnten nicht gespeichert oder wiederhergestellt werden.',
          );
        }
      }
      rethrow;
    }
    SharedPersistenceSync.notify(SharedPersistenceSync.reviewReputationKey);
  }

  @visibleForTesting
  static void failNextReviewPersistenceForTesting() {
    _failNextReviewPersistenceForTesting = true;
  }

  static Future<bool> hasSubmittedReview({
    required String requestId,
    required String reviewerId,
  }) async {
    final current = await _requireCurrentOperationalUser(
      requestedUserId: reviewerId,
    );
    return _reviewMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_multiReviewsKey);
      final all = raw == null
          ? const <MultiCriteriaReview>[]
          : _decodeMultiReviewsStrict(raw);
      return all.any(
        (review) =>
            review.requestId == requestId && review.reviewerId == current.id,
      );
    });
  }

  static Future<MultiCriteriaReview> addMultiReview({
    required String requestId,
    required String itemId,
    required String reviewerId,
    required String reviewedUserId,
    required String direction,
    required List<ReviewCriterion> criteria,
  }) async {
    final current = await _requireCurrentOperationalUser(
      requestedUserId: reviewerId,
    );
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final requestRaw = prefs.getString(_rentalRequestsKey);
      final requests = requestRaw == null
          ? const <RentalRequest>[]
          : _decodeRentalRequestsStrict(requestRaw);
      RentalRequest? request;
      for (final candidate in requests) {
        if (candidate.id == requestId) {
          request = candidate;
          break;
        }
      }
      if (request == null || request.status != 'completed') {
        throw StateError('Reviews require a completed booking.');
      }
      if (request.needsReview) {
        throw StateError(
            'Reviews are blocked while this booking is under review.');
      }
      final reviewerMatchesDirection =
          (direction == ReviewMetricsService.renterToOwner &&
                  request.renterId == current.id &&
                  request.ownerId == reviewedUserId) ||
              (direction == ReviewMetricsService.ownerToRenter &&
                  request.ownerId == current.id &&
                  request.renterId == reviewedUserId);
      if (!reviewerMatchesDirection || request.itemId != itemId) {
        throw StateError(
            'Review context does not match the completed booking.');
      }

      return _reviewMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(
          current.id,
          expectedEmail: current.email,
        );
        final raw = prefs.getString(_multiReviewsKey);
        final all = raw == null
            ? <MultiCriteriaReview>[]
            : _decodeMultiReviewsStrict(raw);
        if (all.length >= _maxLocalReviews) {
          throw StateError('Der lokale Bewertungsspeicher ist voll.');
        }
        if (all.any(
          (entry) =>
              entry.requestId == requestId && entry.reviewerId == current.id,
        )) {
          throw StateError('Review already exists for this booking context.');
        }
        final ids = all.map((entry) => entry.id).toSet();
        var nextNumericId = all.fold<int>(
              0,
              (previous, entry) => max(previous, int.tryParse(entry.id) ?? 0),
            ) +
            1;
        while (ids.contains('$nextNumericId')) {
          nextNumericId++;
        }
        final normalizedCriteria = ReviewMetricsService.normalizeCriteria(
          criteria,
          direction: direction,
        );
        final review = MultiCriteriaReview(
          id: '$nextNumericId',
          requestId: requestId,
          itemId: itemId,
          reviewerId: current.id,
          reviewedUserId: reviewedUserId,
          direction: direction,
          criteria: normalizedCriteria,
          createdAt: DateTime.now().toUtc(),
        );
        if (!ReviewMetricsService.isRegularCompleteReview(review) ||
            review.criteria.any(
              (criterion) =>
                  (criterion.note?.length ?? 0) > _maxLocalReviewNoteLength,
            )) {
          throw ArgumentError('Review is incomplete or invalid.');
        }

        final latestRequestRaw = prefs.getString(_rentalRequestsKey);
        if (latestRequestRaw != requestRaw) {
          throw StateError('Review context changed before persistence.');
        }
        await _assertCurrentOperationalUserId(
          current.id,
          expectedEmail: current.email,
        );
        await _persistMultiReviews(
          prefs,
          <MultiCriteriaReview>[...all, review],
        );
        return review;
      });
    });
  }

  /// Account-scoped local review data for a user-requested privacy export.
  /// Public reviews are shared counterparty records and remain retained after
  /// local account deletion; unrelated public cache entries are excluded.
  static Future<Map<String, dynamic>> exportReviewRecordsForPrivacy() async {
    final current = await _requireCurrentOperationalUser();
    return _reviewMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      final prefs = await SharedPreferences.getInstance();
      final classicRaw = prefs.getString(_reviewsKey);
      final multiRaw = prefs.getString(_multiReviewsKey);
      final classic = classicRaw == null
          ? const <Review>[]
          : _decodeClassicReviewsStrict(classicRaw);
      final multi = multiRaw == null
          ? const <MultiCriteriaReview>[]
          : _decodeMultiReviewsStrict(multiRaw);
      await _assertCurrentOperationalUserId(
        current.id,
        expectedEmail: current.email,
      );
      return <String, dynamic>{
        'schemaVersion': 1,
        'scope': 'current-authenticated-account',
        'accountId': current.id,
        'storageKeys': const <String>[_reviewsKey, _multiReviewsKey],
        'authoredClassicReviews': classic
            .where((entry) => entry.reviewerId == current.id)
            .map((entry) => entry.toJson())
            .toList(),
        'receivedClassicReviews': classic
            .where((entry) => entry.reviewedUserId == current.id)
            .map((entry) => entry.toJson())
            .toList(),
        'authoredMultiReviews': multi
            .where((entry) => entry.reviewerId == current.id)
            .map((entry) => entry.toJson())
            .toList(),
        'receivedMultiReviews': multi
            .where((entry) => entry.reviewedUserId == current.id)
            .map((entry) => entry.toJson())
            .toList(),
        'otherAccountsPublicReviewsExcluded': true,
        'sharedPublicReviewsRetainedAfterDeletion': true,
      };
    });
  }

  static Future<List<MultiCriteriaReview>> getMultiReviewsForUser(
    String userId,
  ) async {
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final remote = await BackendRepository.getUserReviews(userId);
      return remote
          .map((entry) => MultiCriteriaReview.fromJson({
                ...entry,
                'requestId': entry['bookingId'],
              }))
          .toList();
    }
    final all = await _getAllMultiReviews();
    final filtered = all.where((e) => e.reviewedUserId == userId).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return filtered;
  }

  static Future<List<MultiCriteriaReview>> getMultiReviewsForUserByItem(
    String userId,
    String itemId,
  ) async {
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final all = await getMultiReviewsForUser(userId);
      return all.where((entry) => entry.itemId == itemId).toList();
    }
    final all = await _getAllMultiReviews();
    final filtered = all
        .where((e) => e.reviewedUserId == userId && e.itemId == itemId)
        .toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return filtered;
  }

  static Future<List<Review>> getReviewsForUser(String userId) async {
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final remote = await BackendRepository.getUserReviews(userId);
      return remote.map((entry) {
        final notes = (entry['criteria'] as List? ?? const [])
            .whereType<Map>()
            .map((criterion) => criterion['note']?.toString() ?? '')
            .where((note) => note.isNotEmpty)
            .join('\n');
        return Review(
          id: entry['id']?.toString() ?? '',
          reviewerId: entry['reviewerId']?.toString() ?? '',
          reviewedUserId: entry['reviewedUserId']?.toString() ?? userId,
          rating: (entry['rating'] as num?)?.toDouble() ?? 0,
          comment: notes,
          createdAt: DateTime.tryParse(entry['createdAt']?.toString() ?? '') ??
              DateTime.now(),
        );
      }).toList();
    }
    final all = await _getAllReviews();
    final filtered = all
        .where((review) => review.reviewedUserId == userId)
        .toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return filtered;
  }

  static const Map<String, String> _demoReviewItemIdByReviewId = {
    'r1': '5',
    'r2': '1',
    'r3': '2',
    'r4': '2',
    'r5': '4',
    'r6': '4',
    'r7': '1',
    'r8': '1',
    'r9': '3',
    'r10': '3',
    'r11': '2',
    'r12': '2',
    'r13': '5',
    'r14': '5',
    'r15': '4',
    'r16': '4',
  };

  static final Map<String, List<ReviewCriterion>>
      _demoReviewCriteriaByReviewId = {
    'r1': const [
      ReviewCriterion(
        key: 'communication',
        stars: 5,
        note: 'Schnelle Rückmeldung',
      ),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(
        key: 'article_as_described',
        stars: 5,
        note: 'Genau wie beschrieben',
      ),
      ReviewCriterion(
        key: 'handover_return',
        stars: 5,
        note: 'Sehr gepflegt übergeben',
      ),
    ],
    'r2': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r3': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r4': const [
      ReviewCriterion(key: 'communication', stars: 4),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 4),
    ],
    'r5': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r6': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 4),
    ],
    'r7': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 4),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r8': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r9': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r10': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r11': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r12': const [
      ReviewCriterion(key: 'communication', stars: 4),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 4),
      ReviewCriterion(key: 'handover_return', stars: 4),
    ],
    'r13': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r14': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r15': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 4),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
    'r16': const [
      ReviewCriterion(key: 'communication', stars: 5),
      ReviewCriterion(key: 'reliability', stars: 5),
      ReviewCriterion(key: 'article_as_described', stars: 5),
      ReviewCriterion(key: 'handover_return', stars: 5),
    ],
  };

  static MultiCriteriaReview? _buildSyntheticMultiReviewForClassic(
    Review review,
  ) {
    final criteria = _demoReviewCriteriaByReviewId[review.id];
    if (criteria == null) return null;
    return MultiCriteriaReview(
      id: 'seed_${review.id}',
      requestId: 'seed_${review.id}',
      itemId: _demoReviewItemIdByReviewId[review.id] ?? '',
      reviewerId: review.reviewerId,
      reviewedUserId: review.reviewedUserId,
      direction: criteria.any(
        (c) =>
            c.key == 'condition_dropoff' ||
            c.key == 'description_accuracy' ||
            c.key == 'value_for_money',
      )
          ? 'renter_to_owner'
          : 'owner_to_renter',
      criteria: criteria,
      createdAt: review.createdAt,
    );
  }

  static Future<List<ReviewWithUser>> _buildReviewSummaryEntries({
    required List<User> users,
    List<Item> items = const [],
    String? reviewedUserId,
  }) async {
    final classic = await _getAllReviews();
    final multi = await _getAllMultiReviews();
    final byId = {for (final u in users) u.id: u};
    final itemsById = {for (final item in items) item.id: item};
    final entries = <ReviewWithUser>[];

    for (final review in classic) {
      if (reviewedUserId != null && review.reviewedUserId != reviewedUserId) {
        continue;
      }
      final synthetic = _buildSyntheticMultiReviewForClassic(review);
      final normalizedSynthetic = synthetic == null
          ? null
          : ReviewMetricsService.normalizeReview(synthetic);
      final correctedRating = normalizedSynthetic == null
          ? ReviewMetricsService.roundToSingleDecimal(review.rating)
          : (ReviewMetricsService.calculateReviewScore(normalizedSynthetic) ??
              ReviewMetricsService.roundToSingleDecimal(review.rating));
      entries.add(
        ReviewWithUser(
          review: review.copyWith(rating: correctedRating),
          reviewer: byId[review.reviewerId],
          item: itemsById[_demoReviewItemIdByReviewId[review.id] ?? ''],
          requestId: normalizedSynthetic?.requestId,
          multiReview: normalizedSynthetic,
        ),
      );
    }

    for (final review in multi) {
      if (reviewedUserId != null && review.reviewedUserId != reviewedUserId) {
        continue;
      }
      final normalizedReview = ReviewMetricsService.normalizeReview(review);
      final previewComment = _buildCompactReviewPreview(
        normalizedReview.criteria,
      );
      final rating =
          ReviewMetricsService.calculateReviewScore(normalizedReview) ?? 0.0;
      entries.add(
        ReviewWithUser(
          review: Review(
            id: 'mc_${review.id}',
            reviewerId: review.reviewerId,
            reviewedUserId: review.reviewedUserId,
            rating: rating,
            comment: previewComment,
            createdAt: review.createdAt,
          ),
          reviewer: byId[review.reviewerId],
          item: itemsById[review.itemId],
          requestId: review.requestId,
          multiReview: normalizedReview,
        ),
      );
    }

    return ReviewMetricsService.normalizeReviewEntries(entries);
  }

  static Future<List<User>> _applyCentralReviewStatsToUsers(
    List<User> users,
  ) async {
    if (users.isEmpty) return users;
    final entries = await _buildReviewSummaryEntries(users: users);
    final grouped = <String, List<ReviewWithUser>>{};
    for (final entry in entries) {
      grouped
          .putIfAbsent(entry.review.reviewedUserId, () => <ReviewWithUser>[])
          .add(entry);
    }
    return [
      for (final user in users)
        (() {
          final summary = ReviewMetricsService.calculateUserSummary(
            grouped[user.id] ?? const <ReviewWithUser>[],
          );
          return user.copyWith(
            avgRating: summary.averageRating,
            reviewCount: summary.reviewCount,
          );
        })(),
    ];
  }

  static Future<List<ReviewWithUser>> getReviewSummariesForUser(
    String userId,
  ) async {
    final users = await getUsers();
    final items = await getItems();
    return _buildReviewSummaryEntries(
      users: users,
      items: items,
      reviewedUserId: userId,
    );
  }

  static String _buildCompactReviewPreview(
    List<ReviewCriterion> criteria, {
    String? generalComment,
  }) {
    final normalizedGeneralComment = generalComment?.trim();
    if (normalizedGeneralComment != null &&
        normalizedGeneralComment.isNotEmpty) {
      return normalizedGeneralComment;
    }

    const previewOrder = <String>[
      'reliability',
      'article_as_described',
      'handover_return',
      'communication',
    ];

    for (final key in previewOrder) {
      for (final criterion in criteria) {
        if (criterion.key != key) continue;
        final note = criterion.note?.trim();
        if (note != null && note.isNotEmpty) {
          return note;
        }
      }
    }

    return '';
  }

  // Quick helpers
  /// The saved-cart flow must not write an A-specific catalog read to the
  /// device-global catalog cache or continue its prerequisite read as B.
  static Future<List<Item>> _getSavedCartItemsForOwner(
    LocalPrincipalActionOwner owner,
  ) async {
    await owner.assertCurrent();
    final items = BackendConfig.enabled && !QaRuntimeService.isEnabled
        ? _decodeListingsStrict(
            jsonEncode(await BackendRepository.getListingsForSavedCart(owner)))
        : await getItems();
    await owner.assertCurrent();
    return items;
  }

  static Future<Item?> getItemByIdForSavedCart(String id,
      {required LocalPrincipalActionOwner expectedOwner}) async {
    final items = await _getSavedCartItemsForOwner(expectedOwner);
    await expectedOwner.assertCurrent();
    for (final item in items) {
      if (item.id == id) return item;
    }
    return null;
  }

  static Future<Item?> getItemById(String id) async {
    final items = await getItems();
    try {
      return items.firstWhere((e) => e.id.toString() == id.toString());
    } catch (_) {
      return null;
    }
  }

  static Future<User?> getUserById(String id) async {
    try {
      final users = await getUsers();
      return users.firstWhere((e) => e.id.toString() == id.toString());
    } on FormatException catch (error) {
      // A corrupt legacy cache must remain byte-for-byte untouched for account
      // and privacy operations, but it must not prevent an independent public
      // profile read from using the server as its source of truth.
      debugPrint(
        '[DataService] local public profile cache unavailable '
        '(${error.runtimeType})',
      );
    } on StateError {
      // No matching local public profile. The remote lookup below remains the
      // authoritative path when the backend is enabled.
    }
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      try {
        final remote = await BackendRepository.getPublicProfile(id);
        if (remote != null) {
          return User.fromJson(remote);
        }
      } catch (error) {
        debugPrint('[DataService] public profile load failed: $error');
      }
    }
    return null;
  }

  // Rental requests storage (demo, persisted locally)
  static Future<List<RentalRequest>> _getAllRentalRequests() async {
    SharedPreferences prefs;
    try {
      prefs = await SharedPreferences.getInstance();
    } catch (e) {
      debugPrint(
        '[DataService] _getAllRentalRequests: SharedPreferences unavailable: $e',
      );
      rethrow;
    }

    String? raw;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      try {
        final remote = await BackendRepository.getRentalRequests();
        raw = jsonEncode(remote);
        _decodeRentalRequestsStrict(raw);
        await _writePreferenceString(prefs, _rentalRequestsKey, raw);
      } catch (error) {
        debugPrint('[DataService] remote request load failed: $error');
        // In a backend-enabled runtime the server is authoritative. A cached
        // document must never make an unavailable or malformed server look
        // like current empty or successful booking truth.
        rethrow;
      }
    }
    raw ??= prefs.getString(_rentalRequestsKey);
    if (raw == null) {
      return const <RentalRequest>[];
    }
    if (raw.trim().isEmpty) {
      throw const FormatException('Ungültiger lokaler Buchungsverlauf.');
    }
    try {
      return _decodeRentalRequestsStrict(raw);
    } catch (e) {
      debugPrint(
        '[DataService] _getAllRentalRequests: failed to decode JSON: $e',
      );
      if (e is FormatException) rethrow;
      throw FormatException('Ungültiger lokaler Buchungsverlauf.', e);
    }
  }

  static List<RentalRequest> _decodeRentalRequestsStrict(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! List || decoded.length > _maxLocalRentalRequests) {
      throw const FormatException('Ungültiger lokaler Buchungsverlauf.');
    }
    final parsed = decoded
        .map(
          (entry) => RentalRequest.fromJson(
            Map<String, dynamic>.from(entry as Map),
          ),
        )
        .toList();
    final ids = parsed.map((entry) => entry.id).toSet();
    if (ids.length != parsed.length ||
        ids.any((id) => id.trim().isEmpty || id.length > 256)) {
      throw const FormatException('Ungültiger lokaler Buchungsverlauf.');
    }
    return parsed;
  }

  static Future<void> _saveAllRentalRequests(List<RentalRequest> list) async {
    if (list.length > _maxLocalRentalRequests ||
        list.map((entry) => entry.id).toSet().length != list.length) {
      throw StateError('Der lokale Buchungsverlauf ist ungültig oder voll.');
    }
    final prefs = await SharedPreferences.getInstance();
    var maps = list.map((entry) => entry.toJson()).toList();
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      maps = await BackendRepository.syncRentalRequests(maps);
    }
    final encoded = jsonEncode(maps);
    _decodeRentalRequestsStrict(encoded);
    await _writePreferenceString(
      prefs,
      _rentalRequestsKey,
      encoded,
    );
    SharedPersistenceSync.notify(SharedPersistenceSync.rentalRequestsKey);
  }

  static Future<List<RentalRequest>> getRentalRequestsForOwner(
    String ownerId, {
    String? status,
  }) async {
    await _requireCurrentOperationalUser(requestedUserId: ownerId);
    await _sweepExpressTimeouts();
    final all = await _getAllRentalRequests();
    final filtered = all
        .where(
          (r) => r.ownerId == ownerId && (status == null || r.status == status),
        )
        .toList();
    await _requireCurrentOperationalUser(requestedUserId: ownerId);
    // Sort newest first
    filtered.sort((a, b) => b.start.compareTo(a.start));
    return filtered;
  }

  static Map<String, dynamic> _decodeRequestsLastSeenStrict(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! Map || decoded.length > 1000) {
      throw const FormatException('Ungültige lokale Anfragemarker.');
    }
    final map = Map<String, dynamic>.from(decoded);
    for (final entry in map.entries) {
      if (entry.key.trim().isEmpty ||
          entry.key.length > 256 ||
          entry.value is! String ||
          DateTime.tryParse(entry.value as String) == null) {
        throw const FormatException('Ungültige lokale Anfragemarker.');
      }
    }
    return map;
  }

  static Map<String, dynamic> _decodeReadRequestsStrict(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! Map || decoded.length > 1000) {
      throw const FormatException('Ungültige lokale Lesemarker.');
    }
    final map = Map<String, dynamic>.from(decoded);
    for (final entry in map.entries) {
      if (entry.key.trim().isEmpty ||
          entry.key.length > 256 ||
          entry.value is! List ||
          (entry.value as List).length > 1000 ||
          (entry.value as List).any(
            (value) =>
                value is! String || value.trim().isEmpty || value.length > 256,
          )) {
        throw const FormatException('Ungültige lokale Lesemarker.');
      }
      final values = (entry.value as List).cast<String>();
      if (values.toSet().length != values.length) {
        throw const FormatException('Ungültige lokale Lesemarker.');
      }
    }
    return map;
  }

  /// Returns true if there exists at least one PENDING request that is newer
  /// than the last time the owner viewed the Anfragen tab.
  static Future<bool> hasNewOwnerRequests(String ownerId) async {
    if (ownerId.isEmpty) return false;
    await _requireCurrentOperationalUser(requestedUserId: ownerId);
    final prefs = await SharedPreferences.getInstance();
    DateTime? lastSeen;
    final raw = prefs.getString(_requestsLastSeenKey);
    if (raw != null) {
      final map = _decodeRequestsLastSeenStrict(raw);
      final value = map[ownerId];
      if (value is String) lastSeen = DateTime.parse(value);
    }

    final pending = await getRentalRequestsForOwner(ownerId, status: 'pending');
    if (pending.isEmpty) return false;
    // Latest by createdAt
    pending.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    final latest = pending.first.createdAt;
    if (lastSeen == null) return true;
    return latest.isAfter(lastSeen);
  }

  /// Marks all current requests as seen for the owner. We store the timestamp
  /// of the newest request at the time the tab is opened, so future requests
  /// created after that will be considered "new".
  static Future<void> markOwnerRequestsSeen(String ownerId) async {
    if (ownerId.isEmpty) return;
    await _requireCurrentOperationalUser(requestedUserId: ownerId);
    final pending = await getRentalRequestsForOwner(
      ownerId,
    ); // include all statuses
    DateTime nowMarker;
    if (pending.isEmpty) {
      nowMarker = DateTime.now();
    } else {
      // Use the latest createdAt among all requests so we don't miss any
      pending.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      nowMarker = pending.first.createdAt;
    }
    await _operationalMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(ownerId);
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_requestsLastSeenKey);
      final map = raw == null
          ? <String, dynamic>{}
          : _decodeRequestsLastSeenStrict(raw);
      if (!map.containsKey(ownerId) && map.length >= 1000) {
        throw StateError('Die lokalen Anfragemarker sind voll.');
      }
      map[ownerId] = nowMarker.toIso8601String();
      await _writePreferenceString(
        prefs,
        _requestsLastSeenKey,
        jsonEncode(map),
      );
    });
  }

  /// Marks a specific rental request as read by a user (owner or renter).
  /// Used to track which individual requests have been viewed.
  static Future<void> markRequestAsRead({
    required String userId,
    required String requestId,
  }) async {
    if (userId.isEmpty || requestId.isEmpty) return;
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    final participant = await _requireCurrentRequestParticipant(requestId);
    if (participant.$1.id != current.id) {
      throw StateError('Die lokale Buchung gehört zu einem anderen Konto.');
    }
    try {
      await _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString(_readRequestsKey);
        final map =
            raw == null ? <String, dynamic>{} : _decodeReadRequestsStrict(raw);
        if (!map.containsKey(userId) && map.length >= 1000) {
          throw StateError('Die lokalen Lesemarker sind voll.');
        }
        final readRaw = map[userId];
        if (readRaw != null && readRaw is! List) {
          throw const FormatException('Ungültige lokale Lesemarker.');
        }
        final readSet = (readRaw as List? ?? const <dynamic>[])
            .map((entry) => entry.toString())
            .toSet();
        if (!readSet.contains(requestId) && readSet.length >= 1000) {
          throw StateError('Die lokalen Lesemarker sind voll.');
        }
        if (readSet.add(requestId)) {
          map[userId] = readSet.toList()..sort();
          await _writePreferenceString(
            prefs,
            _readRequestsKey,
            jsonEncode(map),
          );
        }
      });
    } catch (e) {
      debugPrint('[DataService] markRequestAsRead error: $e');
      rethrow;
    }
  }

  /// Checks if a specific request has been read by a user.
  static Future<bool> isRequestRead({
    required String userId,
    required String requestId,
  }) async {
    if (userId.isEmpty || requestId.isEmpty) return false;
    await _requireCurrentOperationalUser(requestedUserId: userId);
    await _requireCurrentRequestParticipant(requestId);
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_readRequestsKey);
      if (raw == null) return false;

      final map = _decodeReadRequestsStrict(raw);
      final readRaw = map[userId];
      if (readRaw != null && readRaw is! List) {
        throw const FormatException('Ungültige lokale Lesemarker.');
      }
      final readList = (readRaw as List<dynamic>?) ?? [];
      final readSet = readList.map((e) => e.toString()).toSet();

      return readSet.contains(requestId);
    } catch (e) {
      debugPrint('[DataService] isRequestRead error: $e');
      rethrow;
    }
  }

  /// Returns count of unread requests for a user in a specific category.
  /// Category can be: 'ongoing', 'upcoming', 'requests', 'pending', 'completed'
  static Future<int> getUnreadCountForCategory({
    required String userId,
    required String category,
    required List<RentalRequest> requests,
  }) async {
    if (userId.isEmpty) return 0;
    await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      int unreadCount = 0;
      for (final req in requests) {
        final isRead = await isRequestRead(userId: userId, requestId: req.id);
        if (!isRead) unreadCount++;
      }
      return unreadCount;
    } catch (e) {
      debugPrint('[DataService] getUnreadCountForCategory error: $e');
      rethrow;
    }
  }

  static Future<RentalRequest?> getRentalRequestById(String id) async {
    final current = await _requireCurrentOperationalUser();
    await _sweepExpressTimeouts();
    final all = await _getAllRentalRequests();
    await _requireCurrentOperationalUser(requestedUserId: current.id);
    RentalRequest? request;
    for (final candidate in all) {
      if (candidate.id == id) {
        request = candidate;
        break;
      }
    }
    if (request == null) return null;
    if (!_isRequestParticipant(request, current.id)) {
      throw StateError('Die lokale Buchung gehört zu einem anderen Konto.');
    }
    return request;
  }

  static Future<RentalRequest> addRentalRequest(
    RentalRequest req, {
    Map<String, dynamic>? checkoutQuote,
  }) async {
    await _requireCurrentOperationalUser(requestedUserId: req.renterId);
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(req.renterId);
      return _addRentalRequestUnlocked(
        req,
        checkoutQuote: checkoutQuote,
      );
    });
  }

  static Future<RentalRequest> _addRentalRequestUnlocked(
    RentalRequest req, {
    Map<String, dynamic>? checkoutQuote,
  }) async {
    final all = await _getAllRentalRequests();
    final nextId = BackendConfig.enabled && !QaRuntimeService.isEnabled
        ? 'request_${DateTime.now().microsecondsSinceEpoch}'
        : (all.fold<int>(
                  0,
                  (p, e) => (int.tryParse(e.id) ?? 0) > p
                      ? (int.tryParse(e.id) ?? 0)
                      : p,
                ) +
                1)
            .toString();
    final now = DateTime.now();
    // Snapshot current delivery selection for this item so booking details remain accurate
    Map<String, dynamic>? deliverySel;
    try {
      deliverySel = await getSavedDeliverySelection(req.itemId);
    } catch (_) {
      deliverySel = null;
    }
    final bool ownerDelivers = (deliverySel?['hinweg'] == true);
    final bool ownerPicksUp = (deliverySel?['rueckweg'] == true);
    // Compute renter-facing quoted total and subtitle exactly as seen at booking time
    double? quotedTotal;
    String? quotedSub;
    try {
      final item = await getItemById(req.itemId);
      if (item != null) {
        final breakdown = priceBreakdownForRequest(
          item: item,
          req: req,
          deliverySel: deliverySel,
        );
        final bool expressSelectedTransient = (deliverySel?['express'] == true);
        final bool expressAccepted =
            req.expressRequested && (req.expressStatus == 'accepted');
        final bool priority =
            expressSelectedTransient || req.expressRequested || expressAccepted;
        quotedTotal = breakdown.totalRenter;
        quotedSub = TotalSubtitleHelper.build(
          delivery: ownerDelivers,
          pickup: ownerPicksUp,
          priority: priority,
        );
      }
    } catch (e) {
      debugPrint(
        '[DataService] addRentalRequest: failed to compute quoted total: $e',
      );
    }
    var toStore = RentalRequest(
      id: nextId,
      itemId: req.itemId,
      ownerId: req.ownerId,
      renterId: req.renterId,
      start: req.start,
      end: req.end,
      status: req.status,
      message: req.message,
      expressRequested: req.expressRequested,
      expressStatus: req.expressStatus,
      expressFee: req.expressFee,
      ownerDeliversAtDropoffChosen: req.simulationOnly ? false : ownerDelivers,
      ownerPicksUpAtReturnChosen: req.simulationOnly ? false : ownerPicksUp,
      deliveryAddressLine: req.simulationOnly
          ? null
          : (deliverySel?['deliveryAddressLine'] as String?) ??
              (deliverySel?['addressLine'] as String?),
      deliveryCity: req.simulationOnly
          ? null
          : (deliverySel?['deliveryCity'] as String?) ??
              (deliverySel?['city'] as String?),
      deliveryLat: req.simulationOnly
          ? null
          : (deliverySel?['deliveryLat'] as num?)?.toDouble() ??
              (deliverySel?['lat'] as num?)?.toDouble(),
      deliveryLng: req.simulationOnly
          ? null
          : (deliverySel?['deliveryLng'] as num?)?.toDouble() ??
              (deliverySel?['lng'] as num?)?.toDouble(),
      returnAddressLine: req.simulationOnly
          ? null
          : (deliverySel?['returnAddressLine'] as String?),
      returnCity:
          req.simulationOnly ? null : (deliverySel?['returnCity'] as String?),
      returnLat: req.simulationOnly
          ? null
          : (deliverySel?['returnLat'] as num?)?.toDouble(),
      returnLng: req.simulationOnly
          ? null
          : (deliverySel?['returnLng'] as num?)?.toDouble(),
      createdAt: now,
      bindingExpiresAt: req.bindingExpiresAt,
      expressRequestedAt: req.expressRequested ? now : null,
      expressConfirmedAt: null,
      quotedTotalRenter: quotedTotal,
      quotedSubtitle: quotedSub,
      privateStatusConfirmed: req.privateStatusConfirmed,
      simulationOnly: req.simulationOnly,
      quotedQuoteVersion: req.quotedQuoteVersion,
      quotedDays: req.quotedDays,
      quotedPricePerDayMinor: req.quotedPricePerDayMinor,
      quotedBaseRentalMinor: req.quotedBaseRentalMinor,
      quotedDiscountPercent: req.quotedDiscountPercent,
      quotedDiscountId: req.quotedDiscountId,
      quotedDiscountLabel: req.quotedDiscountLabel,
      quotedDiscountFundingSource: req.quotedDiscountFundingSource,
      quotedDiscountThresholdDays: req.quotedDiscountThresholdDays,
      quotedDiscountMinor: req.quotedDiscountMinor,
      quotedRentalSubtotalMinor: req.quotedRentalSubtotalMinor,
      quotedPlatformFeeMinor: req.quotedPlatformFeeMinor,
      quotedTotalMinor: req.quotedTotalMinor,
      quotedOwnerPayoutMinor: req.quotedOwnerPayoutMinor,
      quotedCurrency: req.quotedCurrency,
      legalDeclarations: req.legalDeclarations,
      platformContract: req.platformContract,
      returnState: req.returnState,
      returnT0: req.returnT0,
      returnReportDeadline: req.returnReportDeadline,
      returnClarificationDeadline: req.returnClarificationDeadline,
      returnCaseOpenedAt: req.returnCaseOpenedAt,
      returnCaseClosedAt: req.returnCaseClosedAt,
      reviewEvidenceReferences: req.reviewEvidenceReferences,
      contestedAuthorizedMinor: req.contestedAuthorizedMinor,
      allegedDamageMinorRecordedOnly: req.allegedDamageMinorRecordedOnly,
    );
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final createPayload = toStore.toJson();
      createPayload['clientBuild'] = PrivatePilotConfig.v52ClientBuild;
      if (toStore.simulationOnly) {
        createPayload['simulationAcknowledged'] = true;
      } else {
        final freshQuote = checkoutQuote == null
            ? await BackendRepository.quoteBooking(createPayload)
            : Map<String, dynamic>.from(checkoutQuote);
        final quoteId = freshQuote['quoteId'] as String?;
        final quoteHash = freshQuote['quoteHash'] as String?;
        final expiresAt = DateTime.tryParse(
          freshQuote['expiresAt']?.toString() ?? '',
        );
        if (quoteId == null ||
            quoteHash == null ||
            expiresAt == null ||
            !expiresAt.isAfter(DateTime.now().toUtc())) {
          throw StateError('Der Server hat kein bindendes Angebot geliefert.');
        }
        createPayload['quoteId'] = quoteId;
        createPayload['quoteHash'] = quoteHash;
      }
      final remote = await BackendRepository.createBooking(
        createPayload,
        idempotencyKey: 'create_$nextId',
      );
      toStore = RentalRequest.fromJson(remote);
      all.removeWhere((entry) => entry.id == toStore.id);
      all.add(toStore);
      final prefs = await SharedPreferences.getInstance();
      await _writePreferenceString(
        prefs,
        _rentalRequestsKey,
        jsonEncode(all.map((entry) => entry.toJson()).toList()),
      );
      SharedPersistenceSync.notify(SharedPersistenceSync.rentalRequestsKey);
    } else {
      all.add(toStore);
      await _saveAllRentalRequests(all);
    }
    debugPrint(
      '[DataService] addRentalRequest stored id=$nextId ownerDeliversAtDropoffChosen=$ownerDelivers ownerPicksUpAtReturnChosen=$ownerPicksUp expressRequested=${toStore.expressRequested}',
    );

    try {
      final item = await getItemById(toStore.itemId);
      final renter = await getUserById(toStore.renterId);
      if (item != null) {
        await _addStructuredNotification(
          userId: toStore.ownerId,
          category: 'bookings',
          priority: 2,
          title: toStore.simulationOnly
              ? 'Neue Test-Mietanfrage'
              : 'Neue Mietanfrage eingegangen',
          body: toStore.simulationOnly
              ? '${renter?.displayName ?? 'Ein Tester'} möchte den unverbindlichen Pilotablauf für „${item.title}“ testen. Es entstehen kein Vertrag, keine Reservierung und keine Zahlung.'
              : '${renter?.displayName ?? 'Ein Mieter'} möchte „${item.title}“ vom ${toStore.start.day.toString().padLeft(2, '0')}.${toStore.start.month.toString().padLeft(2, '0')}.${toStore.start.year} bis ${toStore.end.day.toString().padLeft(2, '0')}.${toStore.end.month.toString().padLeft(2, '0')}.${toStore.end.year} mieten.',
          entityType: 'booking',
          entityId: toStore.id,
          ctaLabel: 'Anfrage prüfen',
          payload: {
            'requestId': toStore.id,
            'listingId': toStore.itemId,
            'counterpartyUserId': toStore.renterId,
            'counterpartyName': renter?.displayName ?? '',
            'role': 'owner',
            'simulationOnly': toStore.simulationOnly,
          },
        );
      }
    } catch (e) {
      debugPrint('[DataService] pending-request notification failed: $e');
    }

    // Start 30-minute express confirmation timer if applicable (runtime only)
    _scheduleExpressTimerIfNeeded(toStore);
    return toStore;
  }

  static Future<void> updateRentalRequestStatus({
    required String requestId,
    required String status,
    List<Map<String, dynamic>>? legalDeclarations,
  }) async {
    final participant = await _requireCurrentRequestParticipant(requestId);
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(participant.$1.id);
      return _updateRentalRequestStatusUnlocked(
        requestId: requestId,
        status: status,
        legalDeclarations: legalDeclarations,
      );
    });
  }

  static Future<void> _updateRentalRequestStatusUnlocked({
    required String requestId,
    required String status,
    List<Map<String, dynamic>>? legalDeclarations,
  }) async {
    final all = await _getAllRentalRequests();
    bool mutated = false;
    RentalRequest? updatedRequest;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final index = all.indexWhere((entry) => entry.id == requestId);
      if (index >= 0) {
        final current = all[index];
        final remote = await BackendRepository.transitionBooking(
          bookingId: requestId,
          status: status,
          idempotencyKey: 'transition_${requestId}_${current.status}_$status',
          legalDeclarations: legalDeclarations,
        );
        updatedRequest = RentalRequest.fromJson(remote);
        all[index] = updatedRequest;
        mutated = true;
      }
    } else {
      for (int i = 0; i < all.length; i++) {
        if (all[i].id == requestId) {
          all[i] = all[i].copyWith(
            status: status,
            legalDeclarations: legalDeclarations == null
                ? all[i].legalDeclarations
                : [...all[i].legalDeclarations, ...legalDeclarations],
          );
          if (status == 'accepted' && all[i].acceptedAt == null) {
            all[i] = all[i].copyWith(acceptedAt: DateTime.now());
          }
          updatedRequest = all[i];
          mutated = true;
          break;
        }
      }
    }
    if (mutated) {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final prefs = await SharedPreferences.getInstance();
        await _writePreferenceString(
          prefs,
          _rentalRequestsKey,
          jsonEncode(all.map((entry) => entry.toJson()).toList()),
        );
        SharedPersistenceSync.notify(SharedPersistenceSync.rentalRequestsKey);
      } else {
        await _saveAllRentalRequests(all);
      }

      // Wenn die Anfrage angenommen wurde, erstelle einen Message Thread
      if (status == 'accepted' && updatedRequest != null) {
        try {
          await _createMessageThreadForRequest(updatedRequest);

          // Create in-app notifications for both parties.
          try {
            final item = await getItemById(updatedRequest.itemId);
            if (item != null) {
              // For renter
              await _addStructuredNotification(
                userId: updatedRequest.renterId,
                category: 'bookings',
                priority: 2,
                title: updatedRequest.simulationOnly
                    ? 'Test-Mietanfrage angenommen'
                    : 'Mietanfrage angenommen',
                body: updatedRequest.simulationOnly
                    ? 'Deine Pilot-Simulation für „${item.title}“ wurde angenommen. Es entstehen kein Vertrag, keine Reservierung und keine Zahlung.'
                    : 'Deine Anfrage für „${item.title}“ wurde angenommen. Öffne die Buchung für Details.',
                entityType: 'booking',
                entityId: updatedRequest.id,
                ctaLabel: 'Zur Buchung',
                payload: {
                  'requestId': updatedRequest.id,
                  'listingId': updatedRequest.itemId,
                  'counterpartyUserId': updatedRequest.ownerId,
                  'role': 'renter',
                  'simulationOnly': updatedRequest.simulationOnly,
                },
              );
              // For owner
              await _addStructuredNotification(
                userId: updatedRequest.ownerId,
                category: 'bookings',
                priority: 2,
                title: updatedRequest.simulationOnly
                    ? 'Pilot-Simulation bestätigt'
                    : 'Buchung bestätigt',
                body: updatedRequest.simulationOnly
                    ? 'Du hast den unverbindlichen Test für „${item.title}“ angenommen. Öffne ihn, um den weiteren Ablauf und den Chat zu testen.'
                    : 'Du hast die Anfrage für „${item.title}“ angenommen. Öffne die Vermietung für Übergabe & Rückgabe.',
                entityType: 'booking',
                entityId: updatedRequest.id,
                ctaLabel: 'Zur Vermietung',
                payload: {
                  'requestId': updatedRequest.id,
                  'listingId': updatedRequest.itemId,
                  'counterpartyUserId': updatedRequest.renterId,
                  'role': 'owner',
                  'simulationOnly': updatedRequest.simulationOnly,
                },
              );
            }
          } catch (e) {
            debugPrint('[DataService] booking notifications failed: $e');
          }
        } catch (e) {
          debugPrint('[DataService] Failed to create message thread: $e');
        }
      }
    }
  }

  /// Update status and optionally set the actor who cancelled.
  /// If [status] is 'cancelled' and [cancelledBy] is provided, we persist it.
  static Future<void> updateRentalRequestStatusWithActor({
    required String requestId,
    required String status,
    String? cancelledBy,
  }) async {
    final participant = await _requireCurrentRequestParticipant(requestId);
    final expectedActor =
        participant.$1.id == participant.$2.ownerId ? 'owner' : 'renter';
    if (cancelledBy != null && cancelledBy != expectedActor) {
      throw StateError('Die Storno-Rolle passt nicht zum aktuellen Konto.');
    }
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      await updateRentalRequestStatus(requestId: requestId, status: status);
      return;
    }
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(participant.$1.id);
      return _updateRentalRequestStatusWithActorUnlocked(
        requestId: requestId,
        status: status,
        cancelledBy: cancelledBy ?? expectedActor,
      );
    });
  }

  static Future<void> _updateRentalRequestStatusWithActorUnlocked({
    required String requestId,
    required String status,
    String? cancelledBy,
  }) async {
    final all = await _getAllRentalRequests();
    bool mutated = false;
    for (int i = 0; i < all.length; i++) {
      if (all[i].id == requestId) {
        Map<String, dynamic>? cancellationOutcome;
        if (status == 'cancelled') {
          final current = all[i];
          final actor = cancelledBy == 'owner'
              ? PrivatePilotCancellationActor.owner
              : PrivatePilotCancellationActor.renter;
          final outcome = PrivatePilotCancellationPolicy.evaluate(
            rentalStartAt: current.start,
            cancelAt: DateTime.now(),
            actor: actor,
            contractConfirmedAt: current.acceptedAt,
          );
          final rentalSubtotalMinor = current.quotedRentalSubtotalMinor ?? 0;
          final platformFeeMinor = current.quotedPlatformFeeMinor ?? 0;
          final basisPoints = outcome.refundBasisPoints;
          final rentRefundMinor = basisPoints == null
              ? null
              : ((rentalSubtotalMinor * basisPoints) + 5000) ~/ 10000;
          final rentRetainedMinor = rentRefundMinor == null
              ? null
              : rentalSubtotalMinor - rentRefundMinor;
          final sitFeeRetainedMinor = rentRetainedMinor == null
              ? null
              : (((rentRetainedMinor * 1000) + 5000) ~/ 10000)
                  .clamp(0, platformFeeMinor);
          final sitFeeRefundMinor = sitFeeRetainedMinor == null
              ? null
              : platformFeeMinor - sitFeeRetainedMinor;
          cancellationOutcome = {
            'calculationStatus': outcome.calculationStatus,
            'refundBasisPoints': basisPoints,
            'requiresActualLossAssessment':
                outcome.requiresActualLossAssessment,
            'rentRefund': {
              'type': 'rent_refund',
              'debtorRole': 'owner',
              'status': basisPoints == null
                  ? 'pending_actual_loss_assessment'
                  : 'required',
              'amountMinor': rentRefundMinor,
              'maximumMinor': rentalSubtotalMinor,
            },
            'sitFeeRefund': {
              'type': 'sit_fee_refund',
              'debtorRole': 'sit',
              'status': basisPoints == null
                  ? 'pending_actual_loss_assessment'
                  : 'required',
              'amountMinor': sitFeeRefundMinor,
              'maximumMinor': platformFeeMinor,
            },
            if (rentRefundMinor != null && sitFeeRefundMinor != null)
              'refundMinor': rentRefundMinor + sitFeeRefundMinor,
            if (rentRetainedMinor != null && sitFeeRetainedMinor != null)
              'retainedMinor': rentRetainedMinor + sitFeeRetainedMinor,
            'reasonCode': outcome.reasonCode,
            'freeCancellationUntil':
                outcome.freeCancellationUntil?.toIso8601String(),
            'calculatedAt': DateTime.now().toIso8601String(),
            'modelVersion': PrivatePilotConfig.documentVersion,
          };
        }
        all[i] = all[i].copyWith(
          status: status,
          cancelledBy: (status == 'cancelled')
              ? (cancelledBy ?? all[i].cancelledBy)
              : all[i].cancelledBy,
          cancellationOutcome:
              cancellationOutcome ?? all[i].cancellationOutcome,
        );
        mutated = true;
        break;
      }
    }
    if (mutated) await _saveAllRentalRequests(all);
  }

  static Future<void> recordRentalRequestConfirmation({
    required String requestId,
    required bool isReturn,
    required String method,
    required String confirmedByRole,
    required String confirmedByUserId,
    bool counterpartyConfirmed = false,
  }) async {
    final current = await _requireCurrentOperationalUser(
      requestedUserId: confirmedByUserId,
    );
    final participant = await _requireCurrentRequestParticipant(requestId);
    if (participant.$1.id != current.id) {
      throw StateError('Die lokale Buchung gehört zu einem anderen Konto.');
    }
    final expectedRole = participant.$2.ownerId == current.id
        ? HandoverCodeService.presenterOwner
        : HandoverCodeService.presenterRenter;
    if (confirmedByRole != expectedRole) {
      throw StateError(
          'Die Bestätigungsrolle passt nicht zum aktuellen Konto.');
    }
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(current.id);
      return _recordRentalRequestConfirmationUnlocked(
        requestId: requestId,
        isReturn: isReturn,
        method: method,
        confirmedByRole: confirmedByRole,
        confirmedByUserId: confirmedByUserId,
        counterpartyConfirmed: counterpartyConfirmed,
      );
    });
  }

  static Future<void> _recordRentalRequestConfirmationUnlocked({
    required String requestId,
    required bool isReturn,
    required String method,
    required String confirmedByRole,
    required String confirmedByUserId,
    bool counterpartyConfirmed = false,
  }) async {
    final id = requestId.trim();
    final userId = confirmedByUserId.trim();
    if (id.isEmpty || userId.isEmpty) return;
    final all = await _getAllRentalRequests();
    bool mutated = false;
    final payload = <String, dynamic>{
      'method': method,
      'confirmedByRole': confirmedByRole,
      'confirmedByUserId': userId,
      'confirmedAt': DateTime.now().toIso8601String(),
    };
    for (int i = 0; i < all.length; i++) {
      if (all[i].id == id) {
        if (isReturn) {
          final existing = all[i].returnConfirmation == null
              ? <String, dynamic>{}
              : Map<String, dynamic>.from(all[i].returnConfirmation!);
          final confirmedAt = payload['confirmedAt'];
          if (confirmedByRole == 'owner') {
            existing['ownerConfirmedAt'] = confirmedAt;
            if (counterpartyConfirmed) {
              existing['renterConfirmedAt'] = confirmedAt;
            }
          } else if (confirmedByRole == 'renter') {
            existing['renterConfirmedAt'] = confirmedAt;
            if (counterpartyConfirmed) {
              existing['ownerConfirmedAt'] = confirmedAt;
            }
          }
          payload.addAll(existing);
        }
        all[i] = all[i].copyWith(
          handoverConfirmation:
              isReturn ? all[i].handoverConfirmation : payload,
          returnConfirmation: isReturn ? payload : all[i].returnConfirmation,
        );
        mutated = true;
        break;
      }
    }
    if (mutated) {
      await _saveAllRentalRequests(all);
      if (isReturn) {
        await _refreshPrivatePilotReturnStateUnlocked(
          requestId,
          actualReturnAt: DateTime.now(),
        );
      }
    }
  }

  static Future<Map<String, dynamic>?> issueBookingConfirmationChallenge({
    required String requestId,
    required String segment,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty ||
        !const <String>{
          HandoverCodeService.segmentPickup,
          HandoverCodeService.segmentReturn,
        }.contains(segment)) {
      return null;
    }
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      return BackendRepository.issueBookingConfirmationChallenge(
        bookingId: id,
        segment: segment,
      );
    }
    RentalRequest? request;
    try {
      request = await getRentalRequestById(id);
    } on StateError {
      return null;
    }
    final current = await getCurrentUser();
    final item = request == null ? null : await getItemById(request.itemId);
    if (request == null || current == null || item == null) return null;
    final presenterRole = current.id == request.ownerId
        ? HandoverCodeService.presenterOwner
        : current.id == request.renterId
            ? HandoverCodeService.presenterRenter
            : null;
    if (presenterRole == null) return null;
    final expectedPresenterRole = segment == HandoverCodeService.segmentPickup
        ? HandoverCodeService.presenterOwner
        : HandoverCodeService.presenterRenter;
    if (presenterRole != expectedPresenterRole) return null;
    final code = HandoverCodeService.codeForTitleAndStart(
      title: item.title,
      start: request.start,
      bookingId: request.id,
      segment: segment,
      presenterRole: presenterRole,
    );
    return <String, dynamic>{
      'id': 'local-${request.id}-$segment-$presenterRole',
      'bookingId': request.id,
      'segment': segment,
      'presenterRole': presenterRole,
      'code': code,
      'qrPayload': HandoverCodeService.qrPayload(
        segment: segment,
        presenterRole: presenterRole,
        code: code,
        bookingId: request.id,
      ),
      'issuedAt': DateTime.now().toIso8601String(),
      'expiresAt':
          DateTime.now().add(const Duration(minutes: 10)).toIso8601String(),
    };
  }

  static Future<bool> verifyBookingConfirmationChallenge({
    required String requestId,
    required String segment,
    required String presenterRole,
    String? qrPayload,
    String? code,
    String? challengeId,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return false;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final response =
          await BackendRepository.verifyBookingConfirmationChallenge(
        bookingId: id,
        qrPayload: qrPayload,
        challengeId: challengeId,
        code: code,
        segment: segment,
        presenterRole: presenterRole,
      );
      return response['confirmation'] is Map || response['replayed'] == true;
    }
    RentalRequest? request;
    try {
      request = await getRentalRequestById(id);
    } on StateError {
      return false;
    }
    final current = await getCurrentUser();
    final item = request == null ? null : await getItemById(request.itemId);
    if (request == null || current == null || item == null) return false;
    final expectedPresenterRole = segment == HandoverCodeService.segmentPickup
        ? HandoverCodeService.presenterOwner
        : segment == HandoverCodeService.segmentReturn
            ? HandoverCodeService.presenterRenter
            : null;
    if (presenterRole != expectedPresenterRole) return false;
    final expectedVerifierId =
        presenterRole == HandoverCodeService.presenterOwner
            ? request.renterId
            : request.ownerId;
    if (current.id != expectedVerifierId) return false;
    final expected = HandoverCodeService.codeForTitleAndStart(
      title: item.title,
      start: request.start,
      bookingId: request.id,
      segment: segment,
      presenterRole: presenterRole,
    );
    if (qrPayload != null && qrPayload.trim().isNotEmpty) {
      return HandoverCodeService.isExpectedQrPayload(
        qrPayload,
        segment: segment,
        presenterRole: presenterRole,
        code: expected,
        bookingId: request.id,
      );
    }
    return code?.trim() == expected;
  }

  static Future<RentalRequest?> refreshPrivatePilotReturnState(
    String requestId, {
    DateTime? actualReturnAt,
    DateTime? now,
  }) async {
    final participant = await _requireCurrentRequestParticipant(requestId);
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(participant.$1.id);
      return _refreshPrivatePilotReturnStateUnlocked(
        requestId,
        actualReturnAt: actualReturnAt,
        now: now,
      );
    });
  }

  static Future<RentalRequest?> _refreshPrivatePilotReturnStateUnlocked(
    String requestId, {
    DateTime? actualReturnAt,
    DateTime? now,
  }) async {
    final all = await _getAllRentalRequests();
    final index = all.indexWhere((entry) => entry.id == requestId.trim());
    if (index < 0) return null;
    final current = all[index];
    final confirmation = current.returnConfirmation ?? const {};
    final ownerConfirmed = confirmation['ownerConfirmedAt'] != null;
    final renterConfirmed = confirmation['renterConfirmedAt'] != null;
    final timeline = PrivatePilotReturnPolicy.evaluate(
      scheduledReturnAt: current.end,
      mutuallyConfirmedActualReturnAt: actualReturnAt ?? current.returnT0,
      ownerConfirmed: ownerConfirmed,
      renterConfirmed: renterConfirmed,
      substantiatedCaseOpenedAt: current.returnCaseOpenedAt,
      now: now,
    );
    final updated = current.copyWith(
      returnState: timeline.state.storageValue,
      returnT0: timeline.t0,
      returnReportDeadline: timeline.reportDeadline,
      returnClarificationDeadline: timeline.clarificationDeadline,
      needsReview: timeline.state == PrivatePilotReturnState.needsReview,
    );
    all[index] = updated;
    await _saveAllRentalRequests(all);
    return updated;
  }

  static Future<Map<String, dynamic>?> recordPlatformWithdrawal({
    String? requestId,
    required String userId,
    required String scope,
  }) async {
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    if (scope == 'booking_contract') {
      final participant = await _requireCurrentRequestParticipant(
        requestId?.trim() ?? '',
      );
      if (participant.$1.id != current.id ||
          participant.$2.renterId != current.id) {
        return null;
      }
    }
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(current.id);
      return _recordPlatformWithdrawalUnlocked(
        requestId: requestId,
        userId: userId,
        scope: scope,
      );
    });
  }

  static Future<Map<String, dynamic>?> _recordPlatformWithdrawalUnlocked({
    String? requestId,
    required String userId,
    required String scope,
  }) async {
    final normalizedRequestId = requestId?.trim() ?? '';
    final normalizedUserId = userId.trim();
    if (normalizedUserId.isEmpty ||
        !{'account_contract', 'booking_contract'}.contains(scope) ||
        (scope == 'booking_contract' && normalizedRequestId.isEmpty)) {
      return null;
    }
    final all = await _getAllRentalRequests();
    final index = scope == 'booking_contract'
        ? all.indexWhere((entry) => entry.id == normalizedRequestId)
        : -1;
    if (scope == 'booking_contract' &&
        (index < 0 || all[index].renterId != normalizedUserId)) {
      return null;
    }
    final receivedAt = DateTime.now();
    Map<String, dynamic> result;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      result = await BackendRepository.recordPlatformWithdrawal(
        bookingId: scope == 'booking_contract' ? normalizedRequestId : null,
        scope: scope,
        idempotencyKey:
            'withdrawal_${scope}_${normalizedRequestId.isEmpty ? normalizedUserId : normalizedRequestId}_${receivedAt.microsecondsSinceEpoch}',
      );
    } else {
      final withdrawalId = 'withdrawal_${receivedAt.microsecondsSinceEpoch}';
      RentalRequest? updated;
      Map<String, dynamic>? rentRefund;
      Map<String, dynamic>? sitFeeRefund;
      var effectPhase = 'account_only';
      if (scope == 'booking_contract') {
        final current = all[index];
        final beforeHandover =
            !{'running', 'completed'}.contains(current.status);
        effectPhase = beforeHandover ? 'before_handover' : 'after_handover';
        final rentalMinor = current.quotedRentalSubtotalMinor ?? 0;
        final feeMinor = current.quotedPlatformFeeMinor ?? 0;
        rentRefund = <String, dynamic>{
          'type': 'rent_refund',
          'debtorRole': 'owner',
          'status': beforeHandover ? 'required' : 'calculation_pending',
          'amountDueMinor': beforeHandover ? rentalMinor : null,
          'maximumMinor': rentalMinor,
        };
        sitFeeRefund = <String, dynamic>{
          'type': 'sit_fee_refund',
          'debtorRole': 'sit',
          'status': 'required',
          'amountDueMinor': feeMinor,
          'maximumMinor': feeMinor,
        };
        final withdrawalSnapshot = <String, dynamic>{
          'id': withdrawalId,
          'receivedAt': receivedAt.toIso8601String(),
          'phase': effectPhase,
          'returnRequired': !beforeHandover,
          'rentRefund': rentRefund,
          'sitFeeRefund': sitFeeRefund,
        };
        updated = current.copyWith(
          status: beforeHandover ? 'cancelled' : current.status,
          cancelledBy: beforeHandover ? 'renter' : current.cancelledBy,
          workflowStatus:
              beforeHandover ? 'cancelled' : 'withdrawalReturnRequired',
          platformWithdrawal: withdrawalSnapshot,
        );
        all[index] = updated;
        await _saveAllRentalRequests(all);
      }
      result = <String, dynamic>{
        'withdrawal': <String, dynamic>{
          'id': withdrawalId,
          'scope': scope,
          'bookingId': scope == 'booking_contract' ? normalizedRequestId : null,
          'actorName': (await getCurrentUser())?.displayName ?? 'SIT-Nutzer',
          'electronicChannel': 'in_app_download',
          'effectPhase': effectPhase,
          'submittedAt': receivedAt.toIso8601String(),
          'receipt': null,
        },
        if (updated != null) 'booking': updated.toJson(),
        'rentRefund': rentRefund,
        'sitFeeRefund': sitFeeRefund,
        'replayed': false,
      };
    }
    if (scope == 'account_contract') return result;
    await addTimelineEvent(
      requestId: normalizedRequestId,
      type: 'platform_withdrawal_received',
      note: 'Widerruf des SIT-Plattformvertrags eingegangen.',
    );
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) {
      final updated = all[index];
      await _addStructuredNotification(
        userId: updated.ownerId,
        category: 'bookings',
        priority: 3,
        title: 'Vertragswiderruf eingegangen',
        body: updated.status == 'cancelled'
            ? 'Die Buchung wurde kostenfrei beendet.'
            : 'Die dokumentierte Rückgabe ist jetzt erforderlich.',
        entityType: 'booking',
        entityId: normalizedRequestId,
        ctaLabel: 'Buchung öffnen',
        payload: {'requestId': normalizedRequestId, 'role': 'owner'},
      );
    }
    return result;
  }

  static Future<RentalRequestTransitionResult> confirmPickupTransition({
    required String requestId,
    required String confirmedByUserId,
    required String method,
    required bool confirmationContextVerified,
    required bool galleryAcknowledged,
  }) async {
    final id = requestId.trim();
    final userId = confirmedByUserId.trim();
    if (id.isEmpty || userId.isEmpty) {
      return const RentalRequestTransitionResult.failure(
        'Übergabe-Bestätigung konnte nicht verarbeitet werden.',
      );
    }
    RentalRequest? request;
    try {
      request = await getRentalRequestById(id);
    } on StateError {
      return const RentalRequestTransitionResult.failure(
        'Bitte melde dich mit dem bestätigenden Konto an.',
      );
    }
    if (request == null) {
      return const RentalRequestTransitionResult.failure(
        'Übergabe-Daten fehlen.',
      );
    }
    final currentUser = await getCurrentUser();
    if (currentUser == null || currentUser.id != userId) {
      return const RentalRequestTransitionResult.failure(
        'Bitte melde dich mit dem bestätigenden Konto an.',
      );
    }
    if (request.renterId != userId) {
      return const RentalRequestTransitionResult.failure(
        'Diese Bestätigung ist nur für den Mieter möglich.',
      );
    }
    if (request.status != 'accepted') {
      return const RentalRequestTransitionResult.failure(
        'Übergabe ist gerade nicht verfügbar.',
      );
    }
    if (!confirmationContextVerified) {
      return const RentalRequestTransitionResult.failure(
        'Übergabe-Bestätigung konnte nicht verifiziert werden.',
      );
    }
    final state = await getHandoverReturnState(id);
    if (state['handoverActive'] != true) {
      return const RentalRequestTransitionResult.failure(
        'Bitte starte die Übergabe zuerst im Chat.',
      );
    }
    final evidence = await getConditionEvidenceSummary(
      requestId: id,
      segment: 'pickup',
    );
    final handoverPhotos = (evidence['presenterPhotos'] as num?)?.toInt() ?? 0;
    if (handoverPhotos < minimumRequiredPhotos) {
      return const RentalRequestTransitionResult.failure(
        'Der Vermieter muss die Übergabe zuerst mit mindestens 4 Fotos dokumentieren.',
      );
    }
    final confirmation = evidence['counterpartyConfirmation'];
    if (confirmation is! Map ||
        confirmation['verifierUserId']?.toString() != userId) {
      return const RentalRequestTransitionResult.failure(
        'Bitte bestätige zuerst den geschützten Fotosatz oder dokumentiere eine Abweichung.',
      );
    }
    final galleryUsed = evidence['presenterNonCameraUsed'] == true;
    if (galleryUsed && !galleryAcknowledged) {
      return const RentalRequestTransitionResult.failure(
        'Bitte bestätige bewusst die Galerie-Dokumentation, bevor du fortfährst.',
      );
    }

    await updateRentalRequestStatus(requestId: id, status: 'running');
    await recordRentalRequestConfirmation(
      requestId: id,
      isReturn: false,
      method: method,
      confirmedByRole: 'renter',
      confirmedByUserId: userId,
    );
    await clearHandoverActive(id);
    return const RentalRequestTransitionResult.success();
  }

  static Future<RentalRequestTransitionResult> confirmReturnTransition({
    required String requestId,
    required String confirmedByUserId,
    required String method,
    required bool confirmationContextVerified,
    required bool galleryAcknowledged,
    required String reviewPauseSource,
  }) async {
    final id = requestId.trim();
    final userId = confirmedByUserId.trim();
    if (id.isEmpty || userId.isEmpty) {
      return const RentalRequestTransitionResult.failure(
        'Rückgabe-Bestätigung konnte nicht verarbeitet werden.',
      );
    }
    RentalRequest? request;
    try {
      request = await getRentalRequestById(id);
    } on StateError {
      return const RentalRequestTransitionResult.failure(
        'Bitte melde dich mit dem bestätigenden Konto an.',
      );
    }
    if (request == null) {
      return const RentalRequestTransitionResult.failure(
        'Rückgabe-Daten fehlen.',
      );
    }
    final requestSnapshot = request;
    final currentUser = await getCurrentUser();
    if (currentUser == null || currentUser.id != userId) {
      return const RentalRequestTransitionResult.failure(
        'Bitte melde dich mit dem bestätigenden Konto an.',
      );
    }
    if (request.ownerId != userId) {
      return const RentalRequestTransitionResult.failure(
        'Diese Bestätigung ist nur für den Vermieter möglich.',
      );
    }
    if (request.status != 'running') {
      return const RentalRequestTransitionResult.failure(
        'Rückgabe ist gerade nicht verfügbar.',
      );
    }
    if (!confirmationContextVerified) {
      return const RentalRequestTransitionResult.failure(
        'Rückgabe-Bestätigung konnte nicht verifiziert werden.',
      );
    }
    final state = await getHandoverReturnState(id);
    if (state['returnActive'] != true) {
      return const RentalRequestTransitionResult.failure(
        'Bitte starte die Rückgabe zuerst im Chat.',
      );
    }
    final evidence = await getConditionEvidenceSummary(
      requestId: id,
      segment: 'return',
    );
    final returnPhotos = (evidence['presenterPhotos'] as num?)?.toInt() ?? 0;
    if (returnPhotos < minimumRequiredPhotos) {
      return const RentalRequestTransitionResult.failure(
        'Der Mieter muss die Rückgabe zuerst mit mindestens 4 Fotos dokumentieren.',
      );
    }
    final confirmation = evidence['counterpartyConfirmation'];
    if (confirmation is! Map ||
        confirmation['verifierUserId']?.toString() != userId) {
      return const RentalRequestTransitionResult.failure(
        'Bitte bestätige zuerst den geschützten Fotosatz oder dokumentiere eine Abweichung.',
      );
    }
    final galleryUsed = evidence['presenterNonCameraUsed'] == true;
    if (galleryUsed && !galleryAcknowledged) {
      return const RentalRequestTransitionResult.failure(
        'Bitte bestätige bewusst die Galerie-Dokumentation, bevor du fortfährst.',
      );
    }
    final pausedForReview = await pauseReturnCompletionIfNeedsReview(
      id,
      source: reviewPauseSource,
    );
    if (pausedForReview) {
      return const RentalRequestTransitionResult.paused(
        'Zu dieser Buchung liegt eine Rückmeldung vor. Wir prüfen den Vorgang sorgfältig und schließen die Buchung danach vollständig ab. Danke für dein Verständnis.',
      );
    }

    await updateRentalRequestStatus(requestId: id, status: 'completed');
    await recordRentalRequestConfirmation(
      requestId: id,
      isReturn: true,
      method: method,
      confirmedByRole: 'owner',
      confirmedByUserId: userId,
      counterpartyConfirmed: true,
    );
    if ((!BackendConfig.enabled || QaRuntimeService.isEnabled) &&
        request.workflowStatus == 'withdrawalReturnRequired') {
      await _rentalRequestMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(userId);
        final all = await _getAllRentalRequests();
        final index = all.indexWhere((entry) => entry.id == id);
        if (index < 0) return;
        final current = all[index];
        final confirmedReturnAt = DateTime.now();
        final startMs = requestSnapshot.start.millisecondsSinceEpoch;
        final endMs = requestSnapshot.end.millisecondsSinceEpoch;
        final effectiveReturnMs =
            confirmedReturnAt.millisecondsSinceEpoch.clamp(startMs, endMs);
        final rentalMinor = requestSnapshot.quotedRentalSubtotalMinor ?? 0;
        final durationMs = (endMs - startMs).clamp(1, 1 << 62);
        final usedMs = effectiveReturnMs - startMs;
        final usedRentMinor =
            ((rentalMinor * usedMs) + durationMs - 1) ~/ durationMs;
        final rentRefund = <String, dynamic>{
          'type': 'rent_refund',
          'debtorRole': 'owner',
          'status': 'required',
          'amountDueMinor': rentalMinor - usedRentMinor,
          'maximumMinor': rentalMinor,
          'calculationBasis': <String, dynamic>{
            'confirmedReturnAt': confirmedReturnAt.toIso8601String(),
            'usedRentMinor': usedRentMinor,
            'source': 'verified_return_transition',
          },
        };
        final withdrawal = <String, dynamic>{
          ...?current.platformWithdrawal,
          'returnRequired': false,
          'rentRefund': rentRefund,
        };
        all[index] = current.copyWith(
          workflowStatus: 'completed',
          platformWithdrawal: withdrawal,
        );
        await _saveAllRentalRequests(all);
      });
    }
    final refreshed = await getRentalRequestById(id);
    if (refreshed?.needsReview == true) {
      return const RentalRequestTransitionResult.paused(
        'Zu dieser Buchung liegt ein belegter Fall vor. Der Abschluss bleibt für die Prüfung markiert; unstrittige Beträge bleiben davon getrennt.',
      );
    }
    await clearReturnActive(id);
    await addTimelineEvent(
      requestId: id,
      type: 'completed',
      note: method == 'manual'
          ? 'Rückgabe manuell bestätigt'
          : 'Rückgabe abgeschlossen',
    );
    return const RentalRequestTransitionResult.success();
  }

  // Update times and express choice for an existing request (edit flow)
  static Future<void> updateRentalRequestTimes({
    required String requestId,
    required DateTime start,
    required DateTime end,
    bool? expressRequested,
  }) async {
    final participant = await _requireCurrentRequestParticipant(requestId);
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(participant.$1.id);
      return _updateRentalRequestTimesUnlocked(
        requestId: requestId,
        start: start,
        end: end,
        expressRequested: expressRequested,
      );
    });
  }

  static Future<void> _updateRentalRequestTimesUnlocked({
    required String requestId,
    required DateTime start,
    required DateTime end,
    bool? expressRequested,
  }) async {
    final all = await _getAllRentalRequests();
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final index = all.indexWhere((entry) => entry.id == requestId);
      if (index < 0) return;
      final current = all[index];
      // Pickup/return appointment times are stored in their dedicated flow
      // metadata. The authoritative rental occupancy may only be amended while
      // the request is still pending.
      if (current.status != 'pending') return;
      final exp = expressRequested ?? current.expressRequested;
      final amended = current.copyWith(
        start: start,
        end: end,
        expressRequested: exp,
        expressStatus: exp ? 'pending' : null,
        expressRequestedAt: exp ? DateTime.now() : null,
        expressConfirmedAt: null,
      );
      final remote = await BackendRepository.amendBooking(
        amended.toJson(),
        bookingId: requestId,
        idempotencyKey:
            'amend_${requestId}_${_rentalDate(start)}_${_rentalDate(end)}',
      );
      all[index] = RentalRequest.fromJson(remote);
      final prefs = await SharedPreferences.getInstance();
      await _writePreferenceString(
        prefs,
        _rentalRequestsKey,
        jsonEncode(all.map((entry) => entry.toJson()).toList()),
      );
      SharedPersistenceSync.notify(SharedPersistenceSync.rentalRequestsKey);
      return;
    }
    bool mutated = false;
    for (int i = 0; i < all.length; i++) {
      if (all[i].id == requestId) {
        final bool exp = expressRequested ?? all[i].expressRequested;
        // If express requested now, set status to pending again; otherwise clear
        all[i] = all[i].copyWith(
          start: start,
          end: end,
          expressRequested: exp,
          expressStatus: exp ? 'pending' : null,
          expressRequestedAt: exp ? DateTime.now() : null,
          expressConfirmedAt: null,
        );
        mutated = true;
        // Schedule/clear runtime express timer accordingly
        if (exp) {
          _scheduleExpressTimerIfNeeded(all[i]);
        } else {
          try {
            _expressTimers[requestId]?.cancel();
            _expressTimers.remove(requestId);
          } catch (_) {}
        }
        break;
      }
    }
    if (mutated) await _saveAllRentalRequests(all);
  }

  // Update express confirmation status for a request
  static Future<void> updateRentalRequestExpress({
    required String requestId,
    required bool accept,
  }) async {
    final participant = await _requireCurrentRequestParticipant(requestId);
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(participant.$1.id);
      return _updateRentalRequestExpressUnlocked(
        requestId: requestId,
        accept: accept,
      );
    });
  }

  static Future<void> _updateRentalRequestExpressUnlocked({
    required String requestId,
    required bool accept,
  }) async {
    final all = await _getAllRentalRequests();
    bool mutated = false;
    for (int i = 0; i < all.length; i++) {
      if (all[i].id == requestId) {
        final newStatus = accept ? 'accepted' : 'declined';
        all[i] = all[i].copyWith(
          expressStatus: newStatus,
          expressConfirmedAt:
              accept ? DateTime.now() : all[i].expressConfirmedAt,
        );
        mutated = true;
        // If accepted/declined, cancel any scheduled timer
        try {
          _expressTimers[requestId]?.cancel();
          _expressTimers.remove(requestId);
        } catch (_) {}
        break;
      }
    }
    if (mutated) await _saveAllRentalRequests(all);
  }

  static Future<bool> pauseReturnCompletionIfNeedsReview(
    String requestId, {
    required String source,
  }) async {
    try {
      final request = await getRentalRequestById(requestId);
      if (request == null || !request.needsReview) return false;
      try {
        await addTimelineEvent(
          requestId: requestId,
          type: 'return_completion_paused_review',
          note: 'Rückgabeabschluss pausiert: Fall ist zur Prüfung markiert.',
        );
      } catch (e) {
        debugPrint(
          '[DataService] pauseReturnCompletionIfNeedsReview timeline failed: $e',
        );
      }
      try {
        await addNotification(
          title: 'Prüfung erforderlich',
          body:
              'Diese Rückgabe ist zur Prüfung markiert. Der Abschluss bleibt pausiert.',
        );
      } catch (e) {
        debugPrint(
          '[DataService] pauseReturnCompletionIfNeedsReview notification failed: $e',
        );
      }
      return true;
    } catch (e) {
      debugPrint('[DataService] pauseReturnCompletionIfNeedsReview failed: $e');
      return false;
    }
  }

  static Future<bool> markRentalRequestNeedsReview(
    String requestId, {
    required String reason,
    required String source,
    required String reasonCode,
    List<String> evidenceUploadIds = const [],
    List<String> localEvidenceReferences = const [],
    int contestedAuthorizedMinor = 0,
  }) async {
    final participant = await _requireCurrentRequestParticipant(requestId);
    return _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(participant.$1.id);
      return _markRentalRequestNeedsReviewUnlocked(
        requestId,
        reason: reason,
        source: source,
        reasonCode: reasonCode,
        evidenceUploadIds: evidenceUploadIds,
        localEvidenceReferences: localEvidenceReferences,
        contestedAuthorizedMinor: contestedAuthorizedMinor,
      );
    });
  }

  /// Local/QA return-case mutation bound to the exact authenticated session
  /// captured by the caller. The Staging backend path must use the dedicated
  /// owner-bound server endpoint instead of this cache mutation.
  static Future<bool> markRentalRequestNeedsReviewForOwner(
    String requestId, {
    required AuthSessionOwner owner,
    required String expectedUserId,
    required String reason,
    required String source,
    required String reasonCode,
    List<String> localEvidenceReferences = const [],
    int contestedAuthorizedMinor = 0,
  }) async {
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      throw StateError('Der Server-Prüffall benötigt den autorisierten Pfad.');
    }
    final normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || contestedAuthorizedMinor <= 0) {
      return false;
    }
    if (localEvidenceReferences.isEmpty) return false;

    final opened = await _rentalRequestMutationQueue.run(() async {
      await _assertSessionOwnerOperationalUser(owner, expectedUserId);
      final prefs = await SharedPreferences.getInstance();
      await _assertSessionOwnerOperationalUser(owner, expectedUserId);
      final raw = prefs.getString(_rentalRequestsKey);
      if (raw == null || raw.trim().isEmpty) {
        throw StateError('Die lokale Buchung wurde nicht gefunden.');
      }
      final all = _decodeRentalRequestsStrict(raw);
      final request = _requireCachedRequestParticipant(
        all,
        requestId: requestId,
        userId: expectedUserId,
      );
      final authorizedBookingMinor = request.quotedTotalMinor ?? 0;
      if (authorizedBookingMinor <= 0 ||
          contestedAuthorizedMinor > authorizedBookingMinor) {
        return false;
      }
      final requestedAt = DateTime.now();
      final returnT0 = request.returnT0 ?? request.end;
      final reportDeadline = returnT0.add(
        const Duration(hours: PrivatePilotConfig.returnReportWindowHours),
      );
      if (requestedAt.isBefore(returnT0) ||
          requestedAt.isAfter(reportDeadline)) {
        return false;
      }
      final split = PrivatePilotReturnPolicy.splitAuthorizedAmount(
        authorizedBookingMinor: authorizedBookingMinor,
        contestedAuthorizedMinor: contestedAuthorizedMinor,
        allegedDamageMinor: 0,
      );
      final index = all.indexWhere((candidate) => candidate.id == requestId);
      all[index] = request.copyWith(
        needsReview: true,
        reviewReason: normalizedReason,
        reviewSource: source,
        reviewRequestedAt: requestedAt,
        reviewEvidenceReferences: localEvidenceReferences,
        returnState: PrivatePilotReturnState.needsReview.storageValue,
        returnCaseOpenedAt: requestedAt,
        returnT0: returnT0,
        returnReportDeadline: reportDeadline,
        returnClarificationDeadline: returnT0.add(
          const Duration(
            days: PrivatePilotConfig.missingReturnConfirmationDays,
          ),
        ),
        contestedAuthorizedMinor: split.contestedAuthorizedMinor,
        allegedDamageMinorRecordedOnly: split.allegedDamageMinorRecordedOnly,
      );
      final encoded = jsonEncode(all.map((entry) => entry.toJson()).toList());
      _decodeRentalRequestsStrict(encoded);
      await _assertSessionOwnerOperationalUser(owner, expectedUserId);
      await _writePreferenceString(prefs, _rentalRequestsKey, encoded);
      SharedPersistenceSync.notify(SharedPersistenceSync.rentalRequestsKey);
      return true;
    });
    if (!opened) return false;

    try {
      await addTimelineEventForOwner(
        owner: owner,
        expectedUserId: expectedUserId,
        requestId: requestId,
        type: 'review_required',
        note: 'Manuelle Prüfung markiert ($source): $reason',
      );
    } catch (error) {
      debugPrint(
        '[DataService] owner-bound review timeline failed: $error',
      );
    }
    try {
      await addNotificationForOwner(
        owner: owner,
        expectedUserId: expectedUserId,
        title: 'Prüfung erforderlich',
        body: 'Eine Buchung wurde zur manuellen Prüfung markiert.',
      );
    } catch (error) {
      debugPrint(
        '[DataService] owner-bound review notification failed: $error',
      );
    }
    return true;
  }

  static Future<bool> _markRentalRequestNeedsReviewUnlocked(
    String requestId, {
    required String reason,
    required String source,
    required String reasonCode,
    List<String> evidenceUploadIds = const [],
    List<String> localEvidenceReferences = const [],
    int contestedAuthorizedMinor = 0,
  }) async {
    final normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || contestedAuthorizedMinor <= 0) {
      return false;
    }
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      if (evidenceUploadIds.isEmpty) return false;
      await BackendRepository.openV52ReturnCase(
        bookingId: requestId,
        reasonCode: reasonCode,
        details: normalizedReason,
        evidenceUploadIds: evidenceUploadIds,
        contestedAuthorizedMinor: contestedAuthorizedMinor,
        idempotencyKey:
            'v52_return_case_${requestId}_${evidenceUploadIds.first}',
      );
      await _getAllRentalRequests();
      return true;
    }
    if (localEvidenceReferences.isEmpty) return false;
    final all = await _getAllRentalRequests();
    bool mutated = false;
    RentalRequest? updatedRequest;
    final requestedAt = DateTime.now();
    for (int i = 0; i < all.length; i++) {
      if (all[i].id == requestId) {
        final request = all[i];
        final authorizedBookingMinor = request.quotedTotalMinor ?? 0;
        if (authorizedBookingMinor <= 0 ||
            contestedAuthorizedMinor > authorizedBookingMinor) {
          return false;
        }
        final reportDeadline = (request.returnT0 ?? request.end).add(
          const Duration(hours: PrivatePilotConfig.returnReportWindowHours),
        );
        if (requestedAt.isAfter(reportDeadline)) return false;
        final split = PrivatePilotReturnPolicy.splitAuthorizedAmount(
          authorizedBookingMinor: authorizedBookingMinor,
          contestedAuthorizedMinor: contestedAuthorizedMinor,
          allegedDamageMinor: 0,
        );
        all[i] = all[i].copyWith(
          needsReview: true,
          reviewReason: normalizedReason,
          reviewSource: source,
          reviewRequestedAt: requestedAt,
          reviewEvidenceReferences: localEvidenceReferences,
          returnState: PrivatePilotReturnState.needsReview.storageValue,
          returnCaseOpenedAt: requestedAt,
          returnT0: request.returnT0 ?? request.end,
          returnReportDeadline: reportDeadline,
          returnClarificationDeadline: (request.returnT0 ?? request.end).add(
            const Duration(
              days: PrivatePilotConfig.missingReturnConfirmationDays,
            ),
          ),
          contestedAuthorizedMinor: split.contestedAuthorizedMinor,
          allegedDamageMinorRecordedOnly: split.allegedDamageMinorRecordedOnly,
        );
        updatedRequest = all[i];
        mutated = true;
        break;
      }
    }
    if (!mutated || updatedRequest == null) return false;

    await _saveAllRentalRequests(all);
    try {
      await addTimelineEvent(
        requestId: requestId,
        type: 'review_required',
        note: 'Manuelle Prüfung markiert ($source): $reason',
      );
    } catch (e) {
      debugPrint(
        '[DataService] markRentalRequestNeedsReview timeline failed: $e',
      );
    }
    try {
      await addNotification(
        title: 'Prüfung erforderlich',
        body: 'Eine Buchung wurde zur manuellen Prüfung markiert.',
      );
    } catch (e) {
      debugPrint(
        '[DataService] markRentalRequestNeedsReview notification failed: $e',
      );
    }
    return true;
  }

  // Schedules a 30-minute timer for express confirmation. If the app is closed,
  // the sweep will enforce the timeout on next load.
  static void _scheduleExpressTimerIfNeeded(RentalRequest r) {
    if (!r.expressRequested) return;
    if (r.expressStatus == 'accepted') return;
    final started = r.expressRequestedAt ?? r.createdAt;
    final deadline = started.add(const Duration(minutes: 30));
    final delay = deadline.difference(DateTime.now());
    if (delay.isNegative) {
      // Past due; run sweep soon.
      scheduleMicrotask(() => _sweepExpressTimeouts());
      return;
    }
    _expressTimers[r.id]?.cancel();
    _expressTimers[r.id] = Timer(delay, () async {
      await _sweepExpressTimeouts();
    });
  }

  /// Checks all requests for express confirmation timeouts and auto-downgrades
  /// to Standard if not confirmed within 30 minutes. Also logs a timeline event.
  static Future<void> _sweepExpressTimeouts() async {
    try {
      final current = await _requireCurrentOperationalUser();
      await _rentalRequestMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        await _sweepExpressTimeoutsUnlocked(current.id);
      });
    } catch (e) {
      debugPrint('[DataService] sweepExpressTimeouts failed: $e');
    }
  }

  static Future<void> _sweepExpressTimeoutsUnlocked(
      String currentUserId) async {
    final all = await _getAllRentalRequests();
    bool mutated = false;
    final now = DateTime.now();
    for (int i = 0; i < all.length; i++) {
      final r = all[i];
      if (!_isRequestParticipant(r, currentUserId)) continue;
      if (!r.expressRequested) continue;
      if (r.expressStatus == 'accepted') continue;
      final started = r.expressRequestedAt ?? r.createdAt;
      final deadline = started.add(const Duration(minutes: 30));
      if (now.isAfter(deadline)) {
        all[i] = r.copyWith(
          expressRequested: false,
          expressStatus: null,
          expressRequestedAt: null,
          expressConfirmedAt: null,
        );
        mutated = true;
        debugPrint(
          '[DataService] Express timeout -> auto-switch to Standard for request ${r.id}',
        );
        try {
          await addTimelineEvent(
            requestId: r.id,
            type: 'express_timeout_refund',
            note: 'Priorität abgelaufen; auf Standard umgestellt',
          );
        } catch (_) {}
        // Cancel any pending timer for safety
        try {
          _expressTimers[r.id]?.cancel();
          _expressTimers.remove(r.id);
        } catch (_) {}
      } else {
        // Still pending; ensure a timer is scheduled for runtime
        _scheduleExpressTimerIfNeeded(r);
      }
    }
    if (mutated) await _saveAllRentalRequests(all);
  }

  // New: requests where the current viewer is the renter
  static Future<List<RentalRequest>> getRentalRequestsForRenter(
    String renterId, {
    String? status,
  }) async {
    await _requireCurrentOperationalUser(requestedUserId: renterId);
    await _sweepExpressTimeouts();
    final all = await _getAllRentalRequests();
    final filtered = all
        .where(
          (r) =>
              r.renterId == renterId && (status == null || r.status == status),
        )
        .toList();
    await _requireCurrentOperationalUser(requestedUserId: renterId);
    filtered.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return filtered;
  }

  // Timeline events (simple local storage)
  static Future<void> addTimelineEvent({
    required String requestId,
    required String type,
    String? note,
  }) async {
    final participant = await _requireCurrentRequestParticipant(requestId);
    final normalizedType = type.trim();
    final normalizedNote = note?.trim() ?? '';
    if (normalizedType.isEmpty ||
        normalizedType.length > 128 ||
        normalizedNote.length > 5000) {
      throw ArgumentError('Ungültiger lokaler Timeline-Eintrag.');
    }
    await _operationalMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(participant.$1.id);
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_timelineEventsKey);
      final list =
          raw == null ? <Map<String, dynamic>>[] : _decodeTimelineStrict(raw);
      if (list.length >= _maxLocalTimelineEvents) {
        throw StateError('Der lokale Buchungsverlauf ist voll.');
      }
      list.add({
        'requestId': requestId,
        'type': normalizedType,
        'note': normalizedNote,
        'ts': DateTime.now().toIso8601String(),
      });
      await _writePreferenceString(
        prefs,
        _timelineEventsKey,
        jsonEncode(list),
      );
    });
  }

  static Future<void> addTimelineEventForOwner({
    required AuthSessionOwner owner,
    required String expectedUserId,
    required String requestId,
    required String type,
    String? note,
  }) async {
    final normalizedType = type.trim();
    final normalizedNote = note?.trim() ?? '';
    if (normalizedType.isEmpty ||
        normalizedType.length > 128 ||
        normalizedNote.length > 5000) {
      throw ArgumentError('Ungültiger lokaler Timeline-Eintrag.');
    }
    await _operationalMutationQueue.run(() async {
      await _assertSessionOwnerOperationalUser(owner, expectedUserId);
      final prefs = await SharedPreferences.getInstance();
      await _assertSessionOwnerOperationalUser(owner, expectedUserId);
      final requestsRaw = prefs.getString(_rentalRequestsKey);
      if (requestsRaw == null || requestsRaw.trim().isEmpty) {
        throw StateError('Die lokale Buchung wurde nicht gefunden.');
      }
      _requireCachedRequestParticipant(
        _decodeRentalRequestsStrict(requestsRaw),
        requestId: requestId,
        userId: expectedUserId,
      );
      final raw = prefs.getString(_timelineEventsKey);
      final list =
          raw == null ? <Map<String, dynamic>>[] : _decodeTimelineStrict(raw);
      if (list.length >= _maxLocalTimelineEvents) {
        throw StateError('Der lokale Buchungsverlauf ist voll.');
      }
      list.add({
        'requestId': requestId,
        'type': normalizedType,
        'note': normalizedNote,
        'ts': DateTime.now().toIso8601String(),
      });
      await _assertSessionOwnerOperationalUser(owner, expectedUserId);
      await _writePreferenceString(
        prefs,
        _timelineEventsKey,
        jsonEncode(list),
      );
    });
  }

  static Future<List<Map<String, dynamic>>> getTimelineForRequest(
    String requestId,
  ) async {
    final participant = await _requireCurrentRequestParticipant(requestId);
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_timelineEventsKey);
    if (raw == null) return [];
    try {
      final timeline = _decodeTimelineStrict(raw)
          .where((e) => e['requestId'] == requestId)
          .toList();
      await _requireCurrentOperationalUser(
        requestedUserId: participant.$1.id,
      );
      await _requireCurrentRequestParticipant(requestId);
      return timeline;
    } catch (e) {
      debugPrint('[DataService] getTimelineForRequest error: $e');
      rethrow;
    }
  }

  static List<Map<String, dynamic>> _decodeTimelineStrict(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! List ||
        decoded.length > _maxLocalTimelineEvents ||
        decoded.any((entry) => entry is! Map)) {
      throw const FormatException('Ungültiger lokaler Buchungsverlauf.');
    }
    final entries = decoded
        .map((entry) => Map<String, dynamic>.from(entry as Map))
        .toList();
    for (final entry in entries) {
      final requestId = entry['requestId'];
      final type = entry['type'];
      final note = entry['note'];
      final ts = entry['ts'];
      if (requestId is! String ||
          requestId.trim().isEmpty ||
          requestId.length > 256 ||
          type is! String ||
          type.trim().isEmpty ||
          type.length > 128 ||
          note is! String ||
          note.length > 5000 ||
          ts is! String ||
          DateTime.tryParse(ts) == null) {
        throw const FormatException('Ungültiger lokaler Buchungsverlauf.');
      }
    }
    return entries;
  }

  // Notifications (demo)
  static Future<void> addNotification({
    required String title,
    required String body,
  }) async {
    final current = await _requireCurrentOperationalUser();
    await _addStructuredNotification(
      userId: current.id,
      expectedCurrentUserId: current.id,
      category: 'platform',
      priority: 5,
      title: title,
      body: body,
    );
  }

  static Future<void> addNotificationForOwner({
    required AuthSessionOwner owner,
    required String expectedUserId,
    required String title,
    required String body,
  }) =>
      _addStructuredNotification(
        userId: expectedUserId,
        expectedCurrentUserId: expectedUserId,
        expectedSessionOwner: owner,
        category: 'platform',
        priority: 5,
        title: title,
        body: body,
      );

  // ===== Notifications (structured feed, local) =====
  // NOTE: Stored as a list of map entries under [_notificationsKey]. We keep
  // legacy entries compatible by backfilling missing fields at read time.
  static Future<void> _addStructuredNotification({
    required String userId,
    String? expectedCurrentUserId,
    AuthSessionOwner? expectedSessionOwner,
    required String
        category, // important | bookings | messages | reviews | platform
    required String title,
    required String body,
    int priority =
        2, // 1=important, 2=bookings, 3=messages, 4=reviews, 5=platform
    String? entityType, // booking | thread | payment | review | system
    String? entityId,
    String? ctaLabel,
    Map<String, dynamic>? payload,
    List<Map<String, String>>? actions,
    DateTime? timestamp,
    bool critical = false,
  }) async {
    final normalizedUserId = userId.trim();
    final normalizedCategory = category.trim();
    final normalizedTitle = title.trim();
    final normalizedBody = body.trim();
    if (normalizedUserId.isEmpty ||
        normalizedUserId.length > 256 ||
        normalizedCategory.isEmpty ||
        normalizedCategory.length > 64 ||
        normalizedTitle.isEmpty ||
        normalizedTitle.length > 500 ||
        normalizedBody.length > 5000 ||
        priority < 1 ||
        priority > 5) {
      throw ArgumentError('Ungültige lokale Benachrichtigung.');
    }
    await _operationalMutationQueue.run(() async {
      if (expectedSessionOwner != null && expectedCurrentUserId != null) {
        await _assertSessionOwnerOperationalUser(
          expectedSessionOwner,
          expectedCurrentUserId,
        );
      } else if (expectedCurrentUserId != null) {
        await _assertCurrentOperationalUserId(expectedCurrentUserId);
      }
      final prefs = await SharedPreferences.getInstance();
      if (expectedSessionOwner != null && expectedCurrentUserId != null) {
        await _assertSessionOwnerOperationalUser(
          expectedSessionOwner,
          expectedCurrentUserId,
        );
      }
      final raw = prefs.getString(_notificationsKey);
      final list = raw == null
          ? <Map<String, dynamic>>[]
          : _decodeNotificationsStrict(raw);
      if (list.length >= _maxLocalNotifications) {
        throw StateError('Der lokale Benachrichtigungsverlauf ist voll.');
      }
      final now = timestamp ?? DateTime.now();
      final existingIds =
          list.map((entry) => (entry['id'] ?? '').toString()).toSet();
      final baseId = 'n_${now.microsecondsSinceEpoch}';
      var notificationId = baseId;
      var suffix = 1;
      while (existingIds.contains(notificationId)) {
        notificationId = '${baseId}_$suffix';
        suffix++;
      }
      final entry = <String, dynamic>{
        ...?payload,
        'id': notificationId,
        'userId': normalizedUserId,
        'category': normalizedCategory,
        'priority': priority,
        'title': normalizedTitle,
        'body': normalizedBody,
        'entityType': entityType,
        'entityId': entityId,
        'ctaLabel': ctaLabel,
        'actions': actions,
        'critical': critical,
        'archived': false,
        'ts': now.toIso8601String(),
        'read': false,
      };
      list.add(entry);
      if (expectedSessionOwner != null && expectedCurrentUserId != null) {
        await _assertSessionOwnerOperationalUser(
          expectedSessionOwner,
          expectedCurrentUserId,
        );
      }
      await _persistNotifications(prefs, list);
    });
  }

  static List<Map<String, dynamic>> _decodeNotificationsStrict(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! List ||
        decoded.length > _maxLocalNotifications ||
        decoded.any((entry) => entry is! Map)) {
      throw const FormatException(
          'Ungültiger lokaler Benachrichtigungsverlauf.');
    }
    final list = decoded
        .map((entry) => Map<String, dynamic>.from(entry as Map))
        .toList();
    final ids = <String>{};
    for (final entry in list) {
      final id = (entry['id'] ?? '').toString().trim();
      final userId = (entry['userId'] ?? '').toString().trim();
      final ts = (entry['ts'] ?? entry['createdAt'] ?? '').toString().trim();
      if (id.isEmpty ||
          id.length > 256 ||
          !ids.add(id) ||
          userId.length > 256 ||
          DateTime.tryParse(ts) == null ||
          entry['title'] is! String ||
          entry['body'] is! String ||
          (entry['title'] as String).length > 500 ||
          (entry['body'] as String).length > 5000) {
        throw const FormatException(
            'Ungültiger lokaler Benachrichtigungsverlauf.');
      }
    }
    return list;
  }

  static Future<void> _persistNotifications(
    SharedPreferences prefs,
    List<Map<String, dynamic>> notifications,
  ) async {
    final encoded = jsonEncode(notifications);
    _decodeNotificationsStrict(encoded);
    await _writePreferenceString(prefs, _notificationsKey, encoded);
  }

  static Map<String, dynamic> _normalizeNotification(
    Map<String, dynamic> raw, {
    required String userId,
  }) {
    final out = Map<String, dynamic>.from(raw);
    final id = (out['id'] ?? '').toString().trim();
    final ownerId = (out['userId'] ?? '').toString().trim();
    if (id.isEmpty || ownerId != userId) {
      throw const FormatException(
          'Ungültiger lokaler Benachrichtigungsverlauf.');
    }
    out['id'] = id;
    out['userId'] = ownerId;
    final String cat = (out['category'] ?? '').toString();
    if (cat.isEmpty) {
      // Legacy entries: assume platform unless title suggests something else.
      out['category'] = 'platform';
    }
    out['priority'] = (out['priority'] is num)
        ? (out['priority'] as num).toInt()
        : _priorityForCategory((out['category'] ?? 'platform').toString());
    out['title'] = (out['title'] ?? '').toString();
    out['body'] = (out['body'] ?? '').toString();
    out['entityType'] = (out['entityType'] as String?);
    out['entityId'] = (out['entityId'] as String?);
    out['ctaLabel'] = (out['ctaLabel'] as String?);
    out['requestId'] = (out['requestId'] as String?);
    out['listingId'] = (out['listingId'] as String?);
    out['counterpartyUserId'] = (out['counterpartyUserId'] as String?);
    out['counterpartyName'] = (out['counterpartyName'] as String?);
    out['role'] = (out['role'] as String?);
    if (out['actions'] is List) {
      try {
        out['actions'] = (out['actions'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .map(
              (e) => {
                'id': (e['id'] ?? '').toString(),
                'label': (e['label'] ?? '').toString(),
              },
            )
            .where(
              (e) =>
                  (e['id'] ?? '').toString().isNotEmpty &&
                  (e['label'] ?? '').toString().isNotEmpty,
            )
            .toList();
      } catch (_) {
        out.remove('actions');
      }
    }
    out['critical'] = (out['critical'] == true);
    out['archived'] = (out['archived'] == true);
    out['read'] = (out['read'] == true);
    final tsStr = (out['ts'] ?? out['createdAt'] ?? '').toString();
    if (DateTime.tryParse(tsStr) == null) {
      throw const FormatException(
          'Ungültiger lokaler Benachrichtigungsverlauf.');
    }
    out['ts'] = tsStr;
    return out;
  }

  static int _priorityForCategory(String category) {
    switch (category) {
      case 'important':
        return 1;
      case 'bookings':
        return 2;
      case 'messages':
        return 3;
      case 'reviews':
        return 4;
      case 'platform':
      default:
        return 5;
    }
  }

  static bool _isVisibleDemoNotification(Map<String, dynamic> notification) {
    String lower(Object? value) =>
        value == null ? '' : value.toString().trim().toLowerCase();
    final title = lower(notification['title']);
    final body = lower(notification['body']);
    final entityType = lower(notification['entityType']);
    final entityId = lower(notification['entityId']);

    const seededPrefixes = <String>{
      'welcome_',
      'security_tip_',
      'review_tip_',
      'chat_tip_',
      'demo_message_',
    };
    if (seededPrefixes.any(entityId.startsWith)) return true;

    if (entityType == 'system' && title == 'willkommen bei shareittoo') {
      return true;
    }
    if (entityType == 'system' && title == 'sicherheits‑check') return true;
    if (entityType == 'system' && title == 'bewertungen sammeln') return true;
    if (entityType == 'system' && title == 'tipp: schnelle abstimmung') {
      return true;
    }
    if (entityType == 'system' &&
        title == 'neue nachricht' &&
        body == 'du hast eine neue nachricht – antworte direkt aus dem feed.') {
      return true;
    }
    if (entityType == 'payment' &&
        title == 'zahlungsmethode hinzufügen' &&
        entityId == 'payment_methods') {
      return true;
    }

    return false;
  }

  static Future<List<Map<String, dynamic>>> getNotificationFeedForUser(
    String userId, {
    bool includeArchived = false,
  }) async {
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      final prefs = await SharedPreferences.getInstance();
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final remote = await BackendRepository.getNotifications();
        final scopedRemote = remote
            .map(
              (entry) => <String, dynamic>{
                ...entry,
                'userId':
                    (entry['userId']?.toString().trim().isNotEmpty ?? false)
                        ? entry['userId']
                        : current.id,
              },
            )
            .toList();
        await _persistNotifications(prefs, scopedRemote);
      }
      await _requireCurrentOperationalUser(requestedUserId: current.id);
      final raw = prefs.getString(_notificationsKey);
      if (raw == null) return [];
      final list = _decodeNotificationsStrict(raw);
      final out = <Map<String, dynamic>>[];
      for (final e in list) {
        final m = Map<String, dynamic>.from(e);
        final uid = (m['userId'] ?? '').toString().trim();
        if (uid != userId) continue;
        final norm = _normalizeNotification(m, userId: userId);
        if (_isVisibleDemoNotification(norm)) continue;
        if (norm['archived'] == true && !includeArchived) continue;
        out.add(norm);
      }
      out.sort((a, b) {
        final at = DateTime.tryParse((a['ts'] ?? '').toString()) ??
            DateTime.fromMillisecondsSinceEpoch(0);
        final bt = DateTime.tryParse((b['ts'] ?? '').toString()) ??
            DateTime.fromMillisecondsSinceEpoch(0);
        return bt.compareTo(at);
      });
      await _requireCurrentOperationalUser(requestedUserId: current.id);
      return out;
    } catch (e) {
      debugPrint(
        '[DataService] getNotificationFeedForUser failed: $e',
      );
      rethrow;
    }
  }

  static Future<void> markNotificationRead({
    required String userId,
    required String notificationId,
  }) async {
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        await BackendRepository.updateNotification(
          id: notificationId,
          read: true,
        );
      }
      await _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString(_notificationsKey);
        if (raw == null) return;
        final list = _decodeNotificationsStrict(raw);
        bool mutated = false;
        for (int i = 0; i < list.length; i++) {
          final m = Map<String, dynamic>.from(list[i] as Map);
          final uid = (m['userId'] ?? '').toString().trim();
          if (uid != userId) continue;
          if ((m['id'] ?? '').toString() == notificationId) {
            if (m['read'] != true) {
              m['read'] = true;
              list[i] = m;
              mutated = true;
            }
            break;
          }
        }
        if (mutated) {
          await _persistNotifications(prefs, list);
        }
      });
    } catch (e) {
      debugPrint('[DataService] markNotificationRead failed: $e');
      rethrow;
    }
  }

  static Future<void> markAllNotificationsRead(String userId) async {
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        await BackendRepository.markAllNotificationsRead();
      }
      await _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString(_notificationsKey);
        if (raw == null) return;
        final list = _decodeNotificationsStrict(raw);
        bool mutated = false;
        for (int i = 0; i < list.length; i++) {
          final m = Map<String, dynamic>.from(list[i] as Map);
          final uid = (m['userId'] ?? '').toString().trim();
          if (uid != userId) continue;
          if (m['read'] != true) {
            m['read'] = true;
            list[i] = m;
            mutated = true;
          }
        }
        if (mutated) {
          await _persistNotifications(prefs, list);
        }
      });
    } catch (e) {
      debugPrint(
        '[DataService] markAllNotificationsRead failed: $e',
      );
      rethrow;
    }
  }

  static Future<void> archiveNotification({
    required String userId,
    required String notificationId,
  }) async {
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        await BackendRepository.updateNotification(
          id: notificationId,
          archived: true,
        );
      }
      await _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString(_notificationsKey);
        if (raw == null) return;
        final list = _decodeNotificationsStrict(raw);
        bool mutated = false;
        for (int i = 0; i < list.length; i++) {
          final m = Map<String, dynamic>.from(list[i] as Map);
          final uid = (m['userId'] ?? '').toString().trim();
          if (uid != userId) continue;
          if ((m['id'] ?? '').toString() == notificationId) {
            final critical = (m['critical'] == true);
            if (!critical && m['archived'] != true) {
              m['archived'] = true;
              list[i] = m;
              mutated = true;
            }
            break;
          }
        }
        if (mutated) {
          await _persistNotifications(prefs, list);
        }
      });
    } catch (e) {
      debugPrint('[DataService] archiveNotification failed: $e');
      rethrow;
    }
  }

  // ===== Review reminder scheduling (local, lightweight) =====
  static Future<void> scheduleReviewReminder({
    required String requestId,
    required String itemId,
    required String reviewerId,
    required String reviewedUserId,
    required String direction, // 'renter_to_owner' | 'owner_to_renter'
    required DateTime dueAt,
  }) async {
    try {
      final req = await getRentalRequestById(requestId);
      if (req != null && req.needsReview) return;
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_reviewRemindersKey);
      List<dynamic> list = [];
      if (raw != null && raw.isNotEmpty) {
        try {
          list = jsonDecode(raw);
        } catch (_) {
          list = [];
        }
      }
      final id = DateTime.now().microsecondsSinceEpoch.toString();
      list.add({
        'id': id,
        'requestId': requestId,
        'itemId': itemId,
        'reviewerId': reviewerId,
        'reviewedUserId': reviewedUserId,
        'direction': direction,
        'dueAt': dueAt.toIso8601String(),
        'createdAt': DateTime.now().toIso8601String(),
      });
      await prefs.setString(_reviewRemindersKey, jsonEncode(list));
    } catch (e) {
      debugPrint(
        '[DataService] scheduleReviewReminder failed: $e',
      );
    }
  }

  static Future<Map<String, dynamic>?> takeDueReviewReminder({
    required String reviewerId,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_reviewRemindersKey);
      if (raw == null || raw.isEmpty) return null;
      List list;
      try {
        list = jsonDecode(raw);
      } catch (_) {
        return null;
      }
      final now = DateTime.now();
      int idx = -1;
      Map<String, dynamic>? hit;
      for (int i = 0; i < list.length; i++) {
        try {
          final map = Map<String, dynamic>.from(list[i] as Map);
          final rid = (map['reviewerId'] ?? '').toString();
          if (rid != reviewerId) continue;
          final dueStr = (map['dueAt'] ?? '').toString();
          final due = DateTime.tryParse(dueStr);
          if (due != null && !now.isBefore(due)) {
            idx = i;
            hit = map;
            break;
          }
        } catch (_) {
          /* skip */
        }
      }
      if (idx >= 0 && hit != null) {
        list.removeAt(idx);
        await prefs.setString(_reviewRemindersKey, jsonEncode(list));
        final requestId = (hit['requestId'] ?? '').toString();
        if (requestId.isNotEmpty) {
          final req = await getRentalRequestById(requestId);
          if (req != null && req.needsReview) return null;
        }
        return hit;
      }
      return null;
    } catch (e) {
      debugPrint('[DataService] takeDueReviewReminder failed: $e');
      return null;
    }
  }

  static Future<void> postponeReviewReminder({
    required Map<String, dynamic> reminder,
    required Duration by,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_reviewRemindersKey);
      List<dynamic> list = [];
      if (raw != null && raw.isNotEmpty) {
        try {
          list = jsonDecode(raw);
        } catch (_) {
          list = [];
        }
      }
      // Add a new entry with a new id and new dueAt
      final dueStr = (reminder['dueAt'] ?? '').toString();
      final oldDue = DateTime.tryParse(dueStr) ?? DateTime.now();
      final newDue = DateTime.now().isAfter(oldDue)
          ? DateTime.now().add(by)
          : oldDue.add(by);
      list.add({
        'id': DateTime.now().microsecondsSinceEpoch.toString(),
        'requestId': reminder['requestId'],
        'itemId': reminder['itemId'],
        'reviewerId': reminder['reviewerId'],
        'reviewedUserId': reminder['reviewedUserId'],
        'direction': reminder['direction'],
        'dueAt': newDue.toIso8601String(),
        'createdAt': DateTime.now().toIso8601String(),
      });
      await prefs.setString(_reviewRemindersKey, jsonEncode(list));
    } catch (e) {
      debugPrint(
        '[DataService] postponeReviewReminder failed: $e',
      );
    }
  }

  static Future<List<Map<String, dynamic>>> getNotifications() async {
    final current = await _requireCurrentOperationalUser();
    return getNotificationFeedForUser(
      current.id,
      includeArchived: true,
    );
  }

  // Feedback (stored locally; when backend is connected, migrate to server)
  static Future<int> countFeedbacksToday({required String userId}) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_feedbacksKey);
    if (raw == null || raw.isEmpty) return 0;
    try {
      final List list = jsonDecode(raw);
      final now = DateTime.now();
      int count = 0;
      for (final e in list) {
        try {
          final map = Map<String, dynamic>.from(e as Map);
          final uid = (map['userId'] ?? '').toString();
          if (uid != userId) continue;
          final tsStr = map['ts']?.toString();
          if (tsStr == null || tsStr.isEmpty) continue;
          final ts = DateTime.tryParse(tsStr);
          if (ts == null) continue;
          if (ts.year == now.year &&
              ts.month == now.month &&
              ts.day == now.day) {
            count++;
          }
        } catch (_) {
          /* skip corrupted entry */
        }
      }
      return count;
    } catch (_) {
      return 0;
    }
  }

  static Future<void> addFeedback({
    required String userId,
    required String text,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_feedbacksKey);
    List<dynamic> list = [];
    if (raw != null && raw.isNotEmpty) {
      try {
        list = jsonDecode(raw);
      } catch (_) {
        list = [];
      }
    }
    list.add({
      'id': DateTime.now().microsecondsSinceEpoch.toString(),
      'userId': userId,
      'text': text,
      'ts': DateTime.now().toIso8601String(),
    });
    await prefs.setString(_feedbacksKey, jsonEncode(list));
  }

  // ===== Cancellation policy helpers (Unified) =====
  /// Human-readable policy title (DE) – unified across the app
  static String policyName([String? ignored]) => 'Einheitliche Stornobedingung';

  /// Exact V5.1 deadline. For a normal booking the free deadline is 24 hours
  /// before start. A short-notice booking receives the centrally configured
  /// grace period from contract confirmation, capped at rental start.
  static DateTime? freeCancellationUntil({
    required String policy,
    required DateTime start,
    required DateTime createdAt,
  }) {
    final grace = PrivatePilotCancellationPolicy.shortNoticeGraceDeadline(
      contractConfirmedAt: createdAt,
      rentalStartAt: start,
    );
    return grace ?? start.subtract(const Duration(hours: 24));
  }

  /// V5.1 refund ratio for renter cancellation before start. After start or
  /// no-show, the outcome remains pending for an actual-loss assessment.
  static double? refundRatio({
    required String policy,
    required DateTime start,
    required DateTime cancelAt,
    DateTime? createdAt,
  }) {
    final outcome = PrivatePilotCancellationPolicy.evaluate(
      rentalStartAt: start,
      cancelAt: cancelAt,
      actor: PrivatePilotCancellationActor.renter,
      contractConfirmedAt: createdAt,
    );
    final basisPoints = outcome.refundBasisPoints;
    return basisPoints == null ? null : basisPoints / 10000;
  }

  /// Developer-QA-only destructive reset. Release/account deletion must use the
  /// account-scoped retention path instead of deleting shared counterparty data.
  static Future<void> clearAllRentalsAndBookings() async {
    if (!QaRuntimeService.isEnabled) {
      throw StateError(
        'Der globale Buchungsreset ist ausschließlich im lokalen QA-Modus erlaubt.',
      );
    }
    final current = await _requireCurrentOperationalUser();
    for (final timer in _expressTimers.values) {
      timer.cancel();
    }
    _expressTimers.clear();

    await _rentalRequestMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(current.id);
      final prefs = await SharedPreferences.getInstance();
      await _removePreferenceKey(prefs, _rentalRequestsKey);
      await _removePreferenceKey(prefs, _reviewRemindersKey);
    });
    await _operationalMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(current.id);
      final prefs = await SharedPreferences.getInstance();
      await _removePreferenceKey(prefs, _timelineEventsKey);
      await _removePreferenceKey(prefs, _requestsLastSeenKey);
      await _removePreferenceKey(prefs, _readRequestsKey);
    });
    await _handoverMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(current.id);
      final prefs = await SharedPreferences.getInstance();
      await _removePreferenceKey(prefs, _handoverReturnStateKey);
      await _removePreferenceKey(prefs, _handoverFailCountsKey);
      await _removePreferenceKey(prefs, _handoverBannersKey);
    });
    await _bookingSelectionMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(current.id);
      final prefs = await SharedPreferences.getInstance();
      await _removePreferenceKey(prefs, _bookingSelectionsKey);
      await _removePreferenceKey(prefs, _bookingSelectionPrincipalStateKey);
    });
    SharedPersistenceSync.notify(SharedPersistenceSync.rentalRequestsKey);
    SharedPersistenceSync.notify(SharedPersistenceSync.handoverReturnStateKey);
    debugPrint(
      '[DataService] Cleared local QA rentals/bookings and related caches',
    );
  }

  // ===== Message Threads =====

  static Future<bool> _isCurrentUserParticipantForRequestId(
    String requestId,
  ) async {
    final normalizedRequestId = requestId.trim();
    if (normalizedRequestId.isEmpty) return false;

    final currentUser = await getCurrentUser();
    if (currentUser == null) return false;

    final request = await getRentalRequestById(normalizedRequestId);
    if (request == null) return false;

    return request.ownerId == currentUser.id ||
        request.renterId == currentUser.id;
  }

  /// Returns the message thread linked to a rental request, if any.
  static Future<MessageThread?> getMessageThreadByRequestId(
    String requestId,
  ) async {
    final normalizedRequestId = requestId.trim();
    if (normalizedRequestId.isEmpty) return null;

    try {
      final participant =
          await _requireCurrentRequestParticipant(normalizedRequestId);

      final prefs = await SharedPreferences.getInstance();
      final raw = await _readMessageThreads(prefs);
      await _requireCurrentOperationalUser(
        requestedUserId: participant.$1.id,
      );
      await _requireCurrentRequestParticipant(normalizedRequestId);
      if (raw == null) return null;
      for (final thread in _decodeMessageThreadsStrict(raw)) {
        if (thread.requestId == normalizedRequestId &&
            _isThreadParticipant(thread, participant.$1.id) &&
            !thread.deletedForUserIds.contains(participant.$1.id)) {
          return thread;
        }
      }
      return null;
    } on StateError catch (e) {
      debugPrint('[DataService] getMessageThreadByRequestId denied: $e');
      return null;
    } catch (e) {
      debugPrint('[DataService] getMessageThreadByRequestId error: $e');
      rethrow;
    }
  }

  /// Creates (if missing) and returns a message thread for an existing request.
  ///
  /// This is a local/demo helper to ensure the communication hub can always open
  /// from booking screens.
  static Future<MessageThread?> createOrGetThreadForRequest(
    String requestId,
  ) async {
    final normalizedRequestId = requestId.trim();
    if (normalizedRequestId.isEmpty) return null;

    try {
      final isParticipant = await _isCurrentUserParticipantForRequestId(
        normalizedRequestId,
      );
      if (!isParticipant) return null;

      final existing = await getMessageThreadByRequestId(normalizedRequestId);
      if (existing != null) return existing;
      final req = await getRentalRequestById(normalizedRequestId);
      if (req == null) return null;

      // Mirror the internal creation used on accept.
      await _createMessageThreadForRequest(req);
      return await getMessageThreadByRequestId(normalizedRequestId);
    } on StateError catch (e) {
      debugPrint('[DataService] createOrGetThreadForRequest denied: $e');
      return null;
    } catch (e) {
      debugPrint('[DataService] createOrGetThreadForRequest failed: $e');
      rethrow;
    }
  }

  /// Updates the booking status snapshot stored on a thread.
  ///
  /// If a real [RentalRequest] exists for [requestId], prefer updating that
  /// request via [updateRentalRequestStatus] instead.
  static Future<void> updateMessageThreadBookingStatus({
    required String threadId,
    required String status,
  }) async {
    if (threadId.trim().isEmpty) return;
    final current = await _requireCurrentOperationalUser();
    try {
      await _operationalMutationQueue.run(() async {
        final prefs = await SharedPreferences.getInstance();
        final raw = await _readMessageThreads(prefs);
        if (raw == null) return;
        final threads = _decodeMessageThreadsStrict(raw);
        final index = threads.indexWhere((entry) => entry.id == threadId);
        if (index < 0) return;
        final thread = threads[index];
        if (!_isThreadParticipant(thread, current.id) ||
            thread.deletedForUserIds.contains(current.id)) {
          throw StateError(
              'Der Nachrichtenverlauf gehört zu einem anderen Konto.');
        }
        threads[index] = thread.copyWith(bookingStatus: status);
        await _persistMessageThreads(
          prefs,
          threads.map((entry) => entry.toJson()).toList(),
        );
      });
    } catch (e) {
      debugPrint('[DataService] updateMessageThreadBookingStatus error: $e');
      rethrow;
    }
  }

  /// Appends a system message to a thread.
  static Future<void> addSystemMessageToThread({
    required String threadId,
    required String text,
  }) async {
    if (threadId.trim().isEmpty) return;
    final t = text.trim();
    if (t.isEmpty) return;
    await addMessageToThread(threadId: threadId, senderId: 'system', text: t);
  }

  // ===== Handover/Return lightweight state (local) =====

  static const String _handoverReturnStateKey = 'handover_return_state_v1';

  static Future<Map<String, dynamic>> _getHandoverReturnStateMap() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_handoverReturnStateKey);
    if (raw == null) return <String, dynamic>{};
    if (raw.trim().isEmpty) {
      throw const FormatException('Ungültige lokale Übergabedaten.');
    }
    final decoded = jsonDecode(raw);
    if (decoded is! Map || decoded.length > 1000) {
      throw const FormatException('Ungültige lokale Übergabedaten.');
    }
    final map = decoded.map((key, value) => MapEntry(key.toString(), value));
    if (map.keys.any((key) => key.trim().isEmpty || key.length > 256) ||
        map.values.any((value) => value is! Map)) {
      throw const FormatException('Ungültige lokale Übergabedaten.');
    }
    return map;
  }

  static Future<void> _setHandoverReturnStateMap(
    Map<String, dynamic> map, {
    bool announce = true,
  }) async {
    if (map.length > 1000 ||
        map.keys.any((key) => key.trim().isEmpty || key.length > 256) ||
        map.values.any((value) => value is! Map)) {
      throw const FormatException('Ungültige lokale Übergabedaten.');
    }
    final prefs = await SharedPreferences.getInstance();
    await _writePreferenceString(
      prefs,
      _handoverReturnStateKey,
      jsonEncode(map),
    );
    if (announce) {
      SharedPersistenceSync.notify(
        SharedPersistenceSync.handoverReturnStateKey,
      );
    }
  }

  static Map<String, dynamic> _emptyHandoverReturnState() => <String, dynamic>{
        'handoverActive': false,
        'returnActive': false,
        'handoverPhotos': 0,
        'returnPhotos': 0,
        'pickupPresenterPhotos': 0,
        'pickupDeviationPhotos': 0,
        'pickupPresenterNonCameraUsed': false,
        'pickupCounterpartyConfirmation': null,
        'returnPresenterPhotos': 0,
        'returnDeviationPhotos': 0,
        'returnPresenterNonCameraUsed': false,
        'returnCounterpartyConfirmation': null,
        'handoverTimeRequested': '',
        'returnTimeRequested': '',
        'handoverTimeIso': '',
        'returnTimeIso': '',
        'handoverTimeRequestedByUserId': '',
        'returnTimeRequestedByUserId': '',
        'handoverTimeConfirmed': false,
        'returnTimeConfirmed': false,
        'handoverTimeConfirmedByUserId': '',
        'returnTimeConfirmedByUserId': '',
        'handoverTimeConfirmedAt': '',
        'returnTimeConfirmedAt': '',
        'handoverLocationLat': '',
        'handoverLocationLng': '',
        'handoverLocationLabel': '',
        'handoverLocationMapsUrl': '',
        'handoverLocationSharedByUserId': '',
        'handoverLocationSharedByName': '',
        'handoverLocationSharedByRole': '',
        'handoverLocationAcceptedAs': 'handoverLocation',
        'returnLocationLat': '',
        'returnLocationLng': '',
        'returnLocationLabel': '',
        'returnLocationMapsUrl': '',
        'returnLocationSharedByUserId': '',
        'returnLocationSharedByName': '',
        'returnLocationSharedByRole': '',
        'returnLocationAcceptedAs': 'returnLocation',
        'returnLocationReusePromptDismissed': false,
      };

  /// Returns state for a request: {handoverActive, returnActive, handoverPhotos, returnPhotos}
  static Future<Map<String, dynamic>> getHandoverReturnState(
    String requestId,
  ) async {
    final id = requestId.trim();
    if (id.isEmpty) return _emptyHandoverReturnState();
    String currentUserId;
    try {
      currentUserId = (await _requireCurrentRequestParticipant(id)).$1.id;
    } on StateError {
      return _emptyHandoverReturnState();
    }
    Map<String, dynamic> map;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      try {
        final remote = await BackendRepository.getBookingFlowTime(id);
        await _requireCurrentOperationalUser(
          requestedUserId: currentUserId,
        );
        await _requireCurrentRequestParticipant(id);
        map = await _handoverMutationQueue.run(() async {
          await _assertCurrentOperationalUserId(currentUserId);
          final latest = await _getHandoverReturnStateMap();
          final existing = (latest[id] is Map)
              ? Map<String, dynamic>.from(latest[id] as Map)
              : <String, dynamic>{};
          existing.addAll(remote);
          latest[id] = existing;
          await _setHandoverReturnStateMap(latest, announce: false);
          return latest;
        });
      } catch (error) {
        debugPrint('[DataService] remote flow-time load failed: $error');
        try {
          await _requireCurrentOperationalUser(
            requestedUserId: currentUserId,
          );
          await _requireCurrentRequestParticipant(id);
        } on StateError {
          return _emptyHandoverReturnState();
        }
        map = await _handoverMutationQueue.run(() async {
          await _assertCurrentOperationalUserId(currentUserId);
          return _getHandoverReturnStateMap();
        });
      }
    } else {
      map = await _handoverMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(currentUserId);
        return _getHandoverReturnStateMap();
      });
    }
    final entry = map[id];
    if (entry is Map) {
      final e = entry.map((k, v) => MapEntry(k.toString(), v));
      return {
        'handoverActive': e['handoverActive'] == true,
        'returnActive': e['returnActive'] == true,
        'handoverPhotos': (e['handoverPhotos'] is num)
            ? (e['handoverPhotos'] as num).toInt()
            : 0,
        'returnPhotos':
            (e['returnPhotos'] is num) ? (e['returnPhotos'] as num).toInt() : 0,
        'pickupPresenterPhotos':
            (e['pickupPresenterPhotos'] as num?)?.toInt() ?? 0,
        'pickupDeviationPhotos':
            (e['pickupDeviationPhotos'] as num?)?.toInt() ?? 0,
        'pickupPresenterNonCameraUsed':
            e['pickupPresenterNonCameraUsed'] == true,
        'pickupCounterpartyConfirmation': e['pickupCounterpartyConfirmation'],
        'returnPresenterPhotos':
            (e['returnPresenterPhotos'] as num?)?.toInt() ?? 0,
        'returnDeviationPhotos':
            (e['returnDeviationPhotos'] as num?)?.toInt() ?? 0,
        'returnPresenterNonCameraUsed':
            e['returnPresenterNonCameraUsed'] == true,
        'returnCounterpartyConfirmation': e['returnCounterpartyConfirmation'],
        'handoverTimeRequested': (e['handoverTimeRequested'] as String?) ?? '',
        'returnTimeRequested': (e['returnTimeRequested'] as String?) ?? '',
        'handoverTimeIso': (e['handoverTimeIso'] as String?) ?? '',
        'returnTimeIso': (e['returnTimeIso'] as String?) ?? '',
        'handoverTimeRequestedByUserId':
            (e['handoverTimeRequestedByUserId'] as String?) ?? '',
        'returnTimeRequestedByUserId':
            (e['returnTimeRequestedByUserId'] as String?) ?? '',
        'handoverTimeConfirmed': e['handoverTimeConfirmed'] == true,
        'returnTimeConfirmed': e['returnTimeConfirmed'] == true,
        'handoverTimeConfirmedByUserId':
            (e['handoverTimeConfirmedByUserId'] as String?) ?? '',
        'returnTimeConfirmedByUserId':
            (e['returnTimeConfirmedByUserId'] as String?) ?? '',
        'handoverTimeConfirmedAt':
            (e['handoverTimeConfirmedAt'] as String?) ?? '',
        'returnTimeConfirmedAt': (e['returnTimeConfirmedAt'] as String?) ?? '',
        'handoverLocationLat': (e['handoverLocationLat'] as String?) ?? '',
        'handoverLocationLng': (e['handoverLocationLng'] as String?) ?? '',
        'handoverLocationLabel': (e['handoverLocationLabel'] as String?) ?? '',
        'handoverLocationMapsUrl':
            (e['handoverLocationMapsUrl'] as String?) ?? '',
        'handoverLocationSharedByUserId':
            (e['handoverLocationSharedByUserId'] as String?) ?? '',
        'handoverLocationSharedByName':
            (e['handoverLocationSharedByName'] as String?) ?? '',
        'handoverLocationSharedByRole':
            (e['handoverLocationSharedByRole'] as String?) ?? '',
        'handoverLocationAcceptedAs':
            (e['handoverLocationAcceptedAs'] as String?) ?? 'handoverLocation',
        'returnLocationLat': (e['returnLocationLat'] as String?) ?? '',
        'returnLocationLng': (e['returnLocationLng'] as String?) ?? '',
        'returnLocationLabel': (e['returnLocationLabel'] as String?) ?? '',
        'returnLocationMapsUrl': (e['returnLocationMapsUrl'] as String?) ?? '',
        'returnLocationSharedByUserId':
            (e['returnLocationSharedByUserId'] as String?) ?? '',
        'returnLocationSharedByName':
            (e['returnLocationSharedByName'] as String?) ?? '',
        'returnLocationSharedByRole':
            (e['returnLocationSharedByRole'] as String?) ?? '',
        'returnLocationAcceptedAs':
            (e['returnLocationAcceptedAs'] as String?) ?? 'returnLocation',
        'returnLocationReusePromptDismissed':
            e['returnLocationReusePromptDismissed'] == true,
      };
    }
    return _emptyHandoverReturnState();
  }

  /// Server-authoritative exact-address visibility. A configured backend
  /// fails closed; the local branch exists only for demo/QA runtimes.
  static Future<Map<String, dynamic>> getBookingAddressReveal({
    required RentalRequest request,
    required String localExactAddress,
    String segment = 'pickup',
    DateTime? now,
  }) async {
    (User, RentalRequest) participant;
    try {
      participant = await _requireCurrentRequestParticipant(request.id);
    } on StateError {
      return {
        'version': 'v52_booking_address_reveal_v1',
        'segment': segment,
        'result': 'hidden',
        'reason': 'current_participant_required',
        'exactAddressReturned': false,
      };
    }
    final authorizedRequest = participant.$2;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      try {
        return await BackendRepository.getBookingAddressReveal(
          bookingId: authorizedRequest.id,
          segment: segment,
        );
      } catch (error) {
        debugPrint(
            '[DataService] booking address reveal failed closed: $error');
        return {
          'version': 'v52_booking_address_reveal_v1',
          'segment': segment,
          'result': 'hidden',
          'reason': 'server_authority_unavailable',
          'exactAddressReturned': false,
        };
      }
    }

    final state = await getHandoverReturnState(authorizedRequest.id);
    final prefix = segment == 'return' ? 'return' : 'handover';
    final appointment = DateTime.tryParse(
      (state['${prefix}TimeIso'] as String?) ?? '',
    );
    final requestedBy =
        ((state['${prefix}TimeRequestedByUserId'] as String?) ?? '').trim();
    final confirmedBy =
        ((state['${prefix}TimeConfirmedByUserId'] as String?) ?? '').trim();
    final participants = {
      authorizedRequest.ownerId,
      authorizedRequest.renterId,
    };
    final counterpartyConfirmed = state['${prefix}TimeConfirmed'] == true &&
        participants.contains(requestedBy) &&
        participants.contains(confirmedBy) &&
        requestedBy != confirmedBy;
    final expectedDate = segment == 'return'
        ? authorizedRequest.endDate
        : authorizedRequest.startDate;
    final appointmentMatches = appointment != null &&
        _rentalDate(appointment.toLocal()) == expectedDate;
    final eligible = const {
      'accepted',
      'payment_pending',
      'confirmed',
      'active',
      'running',
      'returned',
    }.contains(authorizedRequest.workflowStatus ?? authorizedRequest.status);
    final reveal = counterpartyConfirmed &&
        appointmentMatches &&
        eligible &&
        AddressPrivacy.shouldRevealExactAddressForLocalDemoOrQa(
          handoverAt: appointment,
          now: now,
        );
    return {
      'version': 'v52_booking_address_reveal_v1',
      'segment': segment,
      'result': reveal ? 'revealed' : 'hidden',
      'reason': reveal
          ? 'local_qa_counterparty_confirmed_window_open'
          : 'local_qa_fail_closed',
      'exactAddressReturned': reveal,
      if (reveal) 'exactAddress': localExactAddress.trim(),
      'source': 'local_demo_or_qa_only',
    };
  }

  static Future<bool> setHandoverActive(
    String requestId, {
    required bool active,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return false;
    (User, RentalRequest) participant;
    try {
      participant = await _requireCurrentRequestParticipant(id);
    } on StateError {
      return false;
    }
    return _runHandoverForParticipant(
      participant,
      () => _setHandoverActiveUnlocked(
        id,
        active: active,
        currentUser: participant.$1,
        request: participant.$2,
      ),
    );
  }

  static Future<bool> _setHandoverActiveUnlocked(
    String id, {
    required bool active,
    required User currentUser,
    required RentalRequest request,
  }) async {
    final map = await _getHandoverReturnStateMap();
    final existing = (map[id] is Map)
        ? Map<String, dynamic>.from(map[id] as Map)
        : <String, dynamic>{};
    if (active) {
      if (currentUser.id != request.ownerId) return false;
      if (!canStartHandover(
        requestStatus: request.status,
        viewerIsOwner: true,
        handoverTimeConfirmed: existing['handoverTimeConfirmed'] == true,
        handoverActive: existing['handoverActive'] == true,
        needsReview: request.needsReview,
      )) {
        return false;
      }
    }
    existing['handoverActive'] = active;
    if (active) existing['returnActive'] = false;
    existing['handoverPhotos'] = (existing['handoverPhotos'] is num)
        ? (existing['handoverPhotos'] as num).toInt()
        : 0;
    existing['returnPhotos'] = (existing['returnPhotos'] is num)
        ? (existing['returnPhotos'] as num).toInt()
        : 0;
    map[id] = existing;
    await _setHandoverReturnStateMap(map);
    return active;
  }

  static Future<bool> setReturnActive(
    String requestId, {
    required bool active,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return false;
    (User, RentalRequest) participant;
    try {
      participant = await _requireCurrentRequestParticipant(id);
    } on StateError {
      return false;
    }
    return _runHandoverForParticipant(
      participant,
      () => _setReturnActiveUnlocked(
        id,
        active: active,
        currentUser: participant.$1,
        request: participant.$2,
      ),
    );
  }

  static Future<bool> _setReturnActiveUnlocked(
    String id, {
    required bool active,
    required User currentUser,
    required RentalRequest request,
  }) async {
    final map = await _getHandoverReturnStateMap();
    final existing = (map[id] is Map)
        ? Map<String, dynamic>.from(map[id] as Map)
        : <String, dynamic>{};
    if (active) {
      if (currentUser.id != request.renterId) return false;
      if (!canStartReturn(
        requestStatus: request.status,
        viewerIsOwner: false,
        returnTimeConfirmed: existing['returnTimeConfirmed'] == true,
        returnActive: existing['returnActive'] == true,
      )) {
        return false;
      }
    }
    existing['returnActive'] = active;
    if (active) existing['handoverActive'] = false;
    existing['handoverPhotos'] = (existing['handoverPhotos'] is num)
        ? (existing['handoverPhotos'] as num).toInt()
        : 0;
    existing['returnPhotos'] = (existing['returnPhotos'] is num)
        ? (existing['returnPhotos'] as num).toInt()
        : 0;
    map[id] = existing;
    await _setHandoverReturnStateMap(map);
    return active;
  }

  static Future<void> clearHandoverActive(String requestId) async {
    await setHandoverActive(requestId, active: false);
  }

  static Future<void> clearReturnActive(String requestId) async {
    await setReturnActive(requestId, active: false);
  }

  static Future<void> incrementHandoverPhotos(
    String requestId, {
    int max = 4,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return;
    final participant = await _requireCurrentRequestParticipant(id);
    await _runHandoverForParticipant(participant, () async {
      final map = await _getHandoverReturnStateMap();
      final existing = (map[id] is Map)
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      final cur = (existing['handoverPhotos'] is num)
          ? (existing['handoverPhotos'] as num).toInt()
          : 0;
      existing['handoverPhotos'] = (cur + 1).clamp(0, max);
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static Future<void> incrementReturnPhotos(
    String requestId, {
    int max = 4,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return;
    final participant = await _requireCurrentRequestParticipant(id);
    await _runHandoverForParticipant(participant, () async {
      final map = await _getHandoverReturnStateMap();
      final existing = (map[id] is Map)
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      final cur = (existing['returnPhotos'] is num)
          ? (existing['returnPhotos'] as num).toInt()
          : 0;
      existing['returnPhotos'] = (cur + 1).clamp(0, max);
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static Future<Map<String, dynamic>> getConditionEvidenceSummary({
    required String requestId,
    required String segment,
  }) async {
    final id = requestId.trim();
    final normalizedSegment = segment == 'return' ? 'return' : 'pickup';
    if (id.isEmpty) {
      return <String, dynamic>{
        'segment': normalizedSegment,
        'presenterPhotos': 0,
        'deviationPhotos': 0,
        'presenterNonCameraUsed': false,
        'counterpartyConfirmation': null,
      };
    }
    try {
      await _requireCurrentRequestParticipant(id);
    } on StateError {
      return <String, dynamic>{
        'segment': normalizedSegment,
        'presenterPhotos': 0,
        'deviationPhotos': 0,
        'presenterNonCameraUsed': false,
        'counterpartyConfirmation': null,
      };
    }
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      return BackendRepository.getConditionEvidenceSummary(
        bookingId: id,
        segment: normalizedSegment,
      );
    }
    final state = await getHandoverReturnState(id);
    final prefix = normalizedSegment == 'return' ? 'return' : 'pickup';
    return <String, dynamic>{
      'segment': normalizedSegment,
      'presenterPhotos':
          (state['${prefix}PresenterPhotos'] as num?)?.toInt() ?? 0,
      'deviationPhotos':
          (state['${prefix}DeviationPhotos'] as num?)?.toInt() ?? 0,
      'presenterNonCameraUsed':
          state['${prefix}PresenterNonCameraUsed'] == true,
      'counterpartyConfirmation': state['${prefix}CounterpartyConfirmation'],
    };
  }

  static Future<void> addConditionEvidencePhoto({
    required String requestId,
    required Uint8List bytes,
    required String filename,
    required String segment,
    required String kind,
    required String source,
    required String semanticSlot,
  }) async {
    final id = requestId.trim();
    final normalizedSegment = segment == 'return' ? 'return' : 'pickup';
    final normalizedKind = kind.trim();
    final normalizedSource = source.trim();
    if (id.isEmpty || bytes.isEmpty) {
      throw StateError('condition_evidence_photo_missing');
    }
    if (!const {'camera', 'gallery', 'browser_picker'}
        .contains(normalizedSource)) {
      throw StateError('invalid_condition_evidence_source');
    }
    final request = await getRentalRequestById(id);
    final currentUser = await getCurrentUser();
    if (request == null || currentUser == null) {
      throw StateError('condition_evidence_booking_missing');
    }
    final presenterId =
        normalizedSegment == 'pickup' ? request.ownerId : request.renterId;
    final verifierId =
        normalizedSegment == 'pickup' ? request.renterId : request.ownerId;
    final expectedKind = currentUser.id == presenterId
        ? 'presenter_photo'
        : currentUser.id == verifierId
            ? 'counterparty_deviation'
            : '';
    if (normalizedKind != expectedKind) {
      throw StateError('condition_evidence_role_mismatch');
    }
    final flowState = await getHandoverReturnState(id);
    if (normalizedSegment == 'pickup' &&
        (request.status != 'accepted' || flowState['handoverActive'] != true)) {
      throw StateError('condition_evidence_wrong_booking_state');
    }
    if (normalizedSegment == 'return' &&
        (request.status != 'running' || flowState['returnActive'] != true)) {
      throw StateError('condition_evidence_wrong_booking_state');
    }

    final thread = await createOrGetThreadForRequest(id);
    if (thread == null) throw StateError('condition_evidence_thread_missing');
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      final upload = await BackendRepository.uploadMessageAttachment(
        bytes: bytes,
        filename: filename,
        threadId: thread.id,
        purpose: normalizedSegment == 'pickup'
            ? 'handover_evidence'
            : 'return_evidence',
      );
      await BackendRepository.sendThreadMessage(
        threadId: thread.id,
        text: normalizedKind == 'presenter_photo'
            ? '${normalizedSegment == 'pickup' ? 'Übergabe' : 'Rückgabe'}-Zustandsfoto'
            : 'Abweichungsfoto der Gegenpartei',
        idempotencyKey:
            'condition_${thread.id}_${DateTime.now().microsecondsSinceEpoch}',
        attachmentIds: [upload['id'].toString()],
        conditionEvidence: <String, dynamic>{
          'segment': normalizedSegment,
          'kind': normalizedKind,
          'source': normalizedSource,
          'semanticSlot': semanticSlot,
        },
      );
      final prefs = await SharedPreferences.getInstance();
      final remote = await BackendRepository.getMessageThreads();
      await _persistMessageThreads(prefs, remote);
      return;
    }

    await addMessageToThread(
      threadId: thread.id,
      senderId: currentUser.id,
      text: normalizedKind == 'presenter_photo'
          ? '${normalizedSegment == 'pickup' ? 'Übergabe' : 'Rückgabe'}-Zustandsfoto (geschützt)'
          : 'Abweichungsfoto der Gegenpartei (geschützt)',
    );
    await _handoverMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(currentUser.id);
      final map = await _getHandoverReturnStateMap();
      final existing = map[id] is Map
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      final prefix = normalizedSegment == 'return' ? 'return' : 'pickup';
      final key = normalizedKind == 'presenter_photo'
          ? '${prefix}PresenterPhotos'
          : '${prefix}DeviationPhotos';
      existing[key] = ((existing[key] as num?)?.toInt() ?? 0) + 1;
      if (normalizedKind == 'presenter_photo' && normalizedSource != 'camera') {
        existing['${prefix}PresenterNonCameraUsed'] = true;
      }
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static Future<void> recordConditionConfirmation({
    required String requestId,
    required String segment,
    required String decision,
  }) async {
    final id = requestId.trim();
    final normalizedSegment = segment == 'return' ? 'return' : 'pickup';
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      await BackendRepository.recordConditionConfirmation(
        bookingId: id,
        segment: normalizedSegment,
        decision: decision,
      );
      return;
    }
    final request = await getRentalRequestById(id);
    final currentUser = await getCurrentUser();
    if (request == null || currentUser == null) {
      throw StateError('condition_confirmation_booking_missing');
    }
    final verifierId =
        normalizedSegment == 'pickup' ? request.renterId : request.ownerId;
    if (currentUser.id != verifierId) {
      throw StateError('condition_confirmation_counterparty_required');
    }
    final summary = await getConditionEvidenceSummary(
      requestId: id,
      segment: normalizedSegment,
    );
    final presenterPhotos = (summary['presenterPhotos'] as num?)?.toInt() ?? 0;
    final deviationPhotos = (summary['deviationPhotos'] as num?)?.toInt() ?? 0;
    if (presenterPhotos < minimumRequiredPhotos) {
      throw StateError('presenter_photo_set_incomplete');
    }
    if (decision == 'deviation_recorded' && deviationPhotos < 1) {
      throw StateError('deviation_photo_required');
    }
    if (decision == 'confirmed' && deviationPhotos > 0) {
      throw StateError('deviation_decision_required');
    }
    await _handoverMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(currentUser.id);
      final map = await _getHandoverReturnStateMap();
      final existing = map[id] is Map
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      final prefix = normalizedSegment == 'return' ? 'return' : 'pickup';
      existing['${prefix}CounterpartyConfirmation'] = <String, dynamic>{
        'decision': decision,
        'verifierUserId': currentUser.id,
        'presenterPhotoCount': presenterPhotos,
        'deviationPhotoCount': deviationPhotos,
        'createdAt': DateTime.now().toIso8601String(),
      };
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static const int minimumRequiredPhotos = 4;

  static Future<int> getHandoverPhotoCount(String requestId) async {
    final state = await getHandoverReturnState(requestId);
    return (state['handoverPhotos'] is num)
        ? (state['handoverPhotos'] as num).toInt()
        : 0;
  }

  static Future<int> getReturnPhotoCount(String requestId) async {
    final state = await getHandoverReturnState(requestId);
    return (state['returnPhotos'] is num)
        ? (state['returnPhotos'] as num).toInt()
        : 0;
  }

  static Future<void> markHandoverGalleryUsed(String requestId) async {
    final id = requestId.trim();
    if (id.isEmpty) return;
    final participant = await _requireCurrentRequestParticipant(id);
    await _runHandoverForParticipant(participant, () async {
      final map = await _getHandoverReturnStateMap();
      final existing = (map[id] is Map)
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      existing['handoverGalleryUsed'] = true;
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static Future<void> markReturnGalleryUsed(String requestId) async {
    final id = requestId.trim();
    if (id.isEmpty) return;
    final participant = await _requireCurrentRequestParticipant(id);
    await _runHandoverForParticipant(participant, () async {
      final map = await _getHandoverReturnStateMap();
      final existing = (map[id] is Map)
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      existing['returnGalleryUsed'] = true;
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static Future<bool> wasHandoverGalleryUsed(String requestId) async {
    final state = await getHandoverReturnState(requestId);
    return state['handoverGalleryUsed'] == true;
  }

  static Future<bool> wasReturnGalleryUsed(String requestId) async {
    final state = await getHandoverReturnState(requestId);
    return state['returnGalleryUsed'] == true;
  }

  static Future<void> requestFlowTime({
    required String requestId,
    required bool isReturn,
    required String label,
    required DateTime time,
    required String requestedByUserId,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return;
    await _requireCurrentOperationalUser(requestedUserId: requestedByUserId);
    final participant = await _requireCurrentRequestParticipant(id);
    await _runHandoverForParticipant(participant, () async {
      final canonicalTime = participant.$2.flowTimeAt(
        isReturn: isReturn,
        hour: time.hour,
        minute: time.minute,
      );
      final localDate = participant.$2.flowTimeDate(isReturn: isReturn);
      final localTime =
          '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
      const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      final canonicalLabel =
          '${weekdays[canonicalTime.weekday - 1]}, $localTime';
      final map = await _getHandoverReturnStateMap();
      final existing = (map[id] is Map)
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final remote = await BackendRepository.updateBookingFlowTime(
          bookingId: id,
          action: 'propose',
          segment: isReturn ? 'return' : 'pickup',
          label: label == canonicalLabel ? label : canonicalLabel,
          time: canonicalTime,
          localDate: localDate,
          localTime: localTime,
        );
        existing.addAll(remote);
        map[id] = existing;
        await _setHandoverReturnStateMap(map);
        return;
      }
      final prefix = isReturn ? 'return' : 'handover';
      existing['${prefix}TimeRequested'] =
          label == canonicalLabel ? label : canonicalLabel;
      existing['${prefix}TimeIso'] = canonicalTime.toIso8601String();
      existing['${prefix}TimeRequestedByUserId'] = requestedByUserId;
      existing['${prefix}TimeConfirmed'] = false;
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static Future<void> setFlowLocation({
    required String requestId,
    required bool isReturn,
    required String latitude,
    required String longitude,
    required String label,
    required String mapsUrl,
    required String sharedByUserId,
    required String sharedByName,
    required String sharedByRole,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return;
    await _requireCurrentOperationalUser(requestedUserId: sharedByUserId);
    final participant = await _requireCurrentRequestParticipant(id);
    await _runHandoverForParticipant(participant, () async {
      final map = await _getHandoverReturnStateMap();
      final existing = (map[id] is Map)
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      final prefix = isReturn ? 'return' : 'handover';
      existing['${prefix}LocationLat'] = latitude.trim();
      existing['${prefix}LocationLng'] = longitude.trim();
      existing['${prefix}LocationLabel'] = label.trim();
      existing['${prefix}LocationMapsUrl'] = mapsUrl.trim();
      existing['${prefix}LocationSharedByUserId'] = sharedByUserId.trim();
      existing['${prefix}LocationSharedByName'] = sharedByName.trim();
      existing['${prefix}LocationSharedByRole'] = sharedByRole.trim();
      existing['${prefix}LocationAcceptedAs'] =
          isReturn ? 'returnLocation' : 'handoverLocation';
      if (isReturn) {
        existing['returnLocationReusePromptDismissed'] = false;
      }
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static Future<void> copyHandoverLocationToReturn({
    required String requestId,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return;
    final participant = await _requireCurrentRequestParticipant(id);
    await _runHandoverForParticipant(participant, () async {
      final map = await _getHandoverReturnStateMap();
      final existing = (map[id] is Map)
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      existing['returnLocationLat'] =
          (existing['handoverLocationLat'] as String?) ?? '';
      existing['returnLocationLng'] =
          (existing['handoverLocationLng'] as String?) ?? '';
      existing['returnLocationLabel'] =
          (existing['handoverLocationLabel'] as String?) ?? '';
      existing['returnLocationMapsUrl'] =
          (existing['handoverLocationMapsUrl'] as String?) ?? '';
      existing['returnLocationSharedByUserId'] =
          (existing['handoverLocationSharedByUserId'] as String?) ?? '';
      existing['returnLocationSharedByName'] =
          (existing['handoverLocationSharedByName'] as String?) ?? '';
      existing['returnLocationSharedByRole'] =
          (existing['handoverLocationSharedByRole'] as String?) ?? '';
      existing['returnLocationAcceptedAs'] = 'returnLocation';
      existing['returnLocationReusePromptDismissed'] = false;
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static Future<void> dismissReturnLocationReusePrompt({
    required String requestId,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return;
    final participant = await _requireCurrentRequestParticipant(id);
    await _runHandoverForParticipant(participant, () async {
      final map = await _getHandoverReturnStateMap();
      final existing = (map[id] is Map)
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      existing['returnLocationReusePromptDismissed'] = true;
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
  }

  static Future<void> confirmFlowTime({
    required String requestId,
    required bool isReturn,
    required String confirmedByUserId,
  }) async {
    final id = requestId.trim();
    if (id.isEmpty) return;
    await _requireCurrentOperationalUser(requestedUserId: confirmedByUserId);
    final participant = await _requireCurrentRequestParticipant(id);
    DateTime? parsed;
    await _runHandoverForParticipant(participant, () async {
      final map = await _getHandoverReturnStateMap();
      final existing = (map[id] is Map)
          ? Map<String, dynamic>.from(map[id] as Map)
          : <String, dynamic>{};
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final remote = await BackendRepository.updateBookingFlowTime(
          bookingId: id,
          action: 'confirm',
          segment: isReturn ? 'return' : 'pickup',
        );
        existing.addAll(remote);
        map[id] = existing;
        await _setHandoverReturnStateMap(map);
        return;
      }
      final prefix = isReturn ? 'return' : 'handover';
      final iso = (existing['${prefix}TimeIso'] as String?) ?? '';
      parsed = iso.isNotEmpty ? DateTime.tryParse(iso) : null;
      existing['${prefix}TimeConfirmed'] = true;
      existing['${prefix}TimeConfirmedByUserId'] = confirmedByUserId;
      existing['${prefix}TimeConfirmedAt'] = DateTime.now().toIso8601String();
      map[id] = existing;
      await _setHandoverReturnStateMap(map);
    });
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) return;

    final confirmedTime = parsed;
    if (confirmedTime != null) {
      final req = await getRentalRequestById(id);
      if (req != null) {
        if (isReturn) {
          await updateRentalRequestTimes(
            requestId: id,
            start: req.start,
            end: DateTime(
              req.end.year,
              req.end.month,
              req.end.day,
              confirmedTime.hour,
              confirmedTime.minute,
            ),
            expressRequested: req.expressRequested,
          );
        } else {
          await updateRentalRequestTimes(
            requestId: id,
            start: DateTime(
              req.start.year,
              req.start.month,
              req.start.day,
              confirmedTime.hour,
              confirmedTime.minute,
            ),
            end: req.end,
            expressRequested: req.expressRequested,
          );
        }
      }
    }
  }

  /// Erstellt automatisch einen Message Thread wenn eine Anfrage angenommen wird
  static Future<void> _createMessageThreadForRequest(
    RentalRequest request,
  ) async {
    try {
      final participant = await _requireCurrentRequestParticipant(request.id);
      final expectedCurrentUserId = participant.$1.id;
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final remote = await BackendRepository.createOrGetBookingThread(
          request.id,
        );
        await _operationalMutationQueue.run(() async {
          await _assertCurrentOperationalUserId(expectedCurrentUserId);
          final prefs = await SharedPreferences.getInstance();
          final currentRaw = prefs.getString(_messageThreadsKey);
          final current = currentRaw == null
              ? <dynamic>[]
              : _decodeMessageThreadsStrict(currentRaw)
                  .map((entry) => entry.toJson())
                  .toList();
          current.removeWhere(
            (entry) =>
                entry is Map &&
                ((entry['id']?.toString() == remote['id']?.toString()) ||
                    (entry['requestId']?.toString() == request.id)),
          );
          current.add(remote);
          await _persistMessageThreads(prefs, current);
        });
        return;
      }
      final item = await getItemById(request.itemId);
      if (item == null) return;

      final renter = await getUserById(request.renterId);
      final owner = await getUserById(request.ownerId);
      if (renter == null || owner == null) return;

      var threadId = '';
      final created = await _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(expectedCurrentUserId);
        final prefs = await SharedPreferences.getInstance();
        final raw = await _readMessageThreads(prefs);
        final threads =
            raw == null ? <MessageThread>[] : _decodeMessageThreadsStrict(raw);
        if (threads.any((thread) => thread.requestId == request.id)) {
          return false;
        }
        if (threads.length >= _maxLocalMessageThreads) {
          throw StateError('Der lokale Nachrichtenverlauf ist voll.');
        }

        final now = DateTime.now();
        threadId = 'thread_${now.microsecondsSinceEpoch}';
        final initialMessage = Message(
          id: 'msg_${now.microsecondsSinceEpoch}',
          senderId: 'system',
          text:
              'Starte einen Chat mit ${owner.displayName}, um eine Uhrzeit für Übergabe und Rückgabe zu vereinbaren.',
          timestamp: now,
          isRead: false,
        );
        threads.add(
          MessageThread(
            id: threadId,
            requestId: request.id,
            itemId: request.itemId,
            itemTitle: item.title,
            user1Id: request.renterId,
            user2Id: request.ownerId,
            archivedForUserIds: const <String>[],
            messages: [initialMessage],
            createdAt: now,
            lastMessageAt: now,
          ),
        );
        await _persistMessageThreads(
          prefs,
          threads.map((entry) => entry.toJson()).toList(),
        );
        return true;
      });
      if (!created) return;
      debugPrint(
        '[DataService] Created message thread for request ${request.id}',
      );

      // Create message notifications for both parties pointing directly into the thread.
      try {
        await _addStructuredNotification(
          userId: request.renterId,
          expectedCurrentUserId: expectedCurrentUserId,
          category: 'messages',
          priority: 3,
          title: 'Neuer Chat',
          body:
              'Du kannst jetzt mit ${owner.displayName} zu „${item.title}“ chatten.',
          entityType: 'thread',
          entityId: threadId,
          ctaLabel: 'Chat öffnen',
        );
        await _addStructuredNotification(
          userId: request.ownerId,
          expectedCurrentUserId: expectedCurrentUserId,
          category: 'messages',
          priority: 3,
          title: 'Neuer Chat',
          body:
              'Du kannst jetzt mit ${renter.displayName} zu „${item.title}“ chatten.',
          entityType: 'thread',
          entityId: threadId,
          ctaLabel: 'Chat öffnen',
        );
      } catch (e) {
        debugPrint('[DataService] thread notifications failed: $e');
      }
    } catch (e) {
      debugPrint('[DataService] _createMessageThreadForRequest error: $e');
    }
  }

  /// Gibt alle Message Threads für einen User zurück
  static Future<List<MessageThread>> getMessageThreadsForUser(
    String userId,
  ) async {
    await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = await _readMessageThreads(prefs);
      await _requireCurrentOperationalUser(requestedUserId: userId);
      if (raw == null || raw.isEmpty) {
        debugPrint(
          '[DataService] message thread seed skipped (demo seed disabled)',
        );
        return [];
      }
      final threads = _decodeMessageThreadsStrict(raw)
          .where(
            (thread) =>
                _isThreadParticipant(thread, userId) &&
                !thread.archivedForUserIds.contains(userId) &&
                !thread.deletedForUserIds.contains(userId),
          )
          .toList();

      // Sortiere nach letzter Nachricht (neueste zuerst)
      threads.sort((a, b) {
        final aTime = a.lastMessageAt ?? a.createdAt;
        final bTime = b.lastMessageAt ?? b.createdAt;
        return bTime.compareTo(aTime);
      });

      return threads;
    } catch (e) {
      debugPrint('[DataService] getMessageThreadsForUser error: $e');
      rethrow;
    }
  }

  /// Ensures at least one openable thread exists for the given user.
  ///
  /// Rationale: In preview/developer builds, demo seeding can be disabled.
  /// That can leave the Messages tab empty, making it impossible to QA the chat
  /// detail UI. This method seeds a minimal *support* thread **only when the
  /// store is empty**. It does not touch booking/payment/QR/review logic.
  static Future<bool> ensureSeededMessageThreadsForUser(String userId) async {
    if (!QaRuntimeService.isEnabled) return false;
    await _requireCurrentOperationalUser(requestedUserId: userId);
    return _operationalMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(userId);
      final prefs = await SharedPreferences.getInstance();
      final raw = await _readMessageThreads(prefs);
      final threads =
          raw == null ? <MessageThread>[] : _decodeMessageThreadsStrict(raw);
      if (threads.isNotEmpty) return false;

      final now = DateTime.now();
      final threadId = 'seed_support_${now.microsecondsSinceEpoch}';
      final messages = <Message>[
        Message(
          id: 'seed_msg_${now.microsecondsSinceEpoch}',
          senderId: 'support',
          text:
              'Hi! Das ist ein lokaler Demo-Chat, damit du das UI testen kannst.',
          timestamp: now.subtract(const Duration(minutes: 18)),
          isRead: false,
        ),
        Message(
          id: 'seed_msg_${now.microsecondsSinceEpoch + 1}',
          senderId: userId,
          text: 'Perfekt — ich prüfe gerade den Composer und den Send-Button.',
          timestamp: now.subtract(const Duration(minutes: 12)),
          isRead: true,
        ),
        Message(
          id: 'seed_msg_${now.microsecondsSinceEpoch + 2}',
          senderId: 'support',
          text:
              'Super. Schreib einfach eine Testnachricht — nichts wird extern gesendet.',
          timestamp: now.subtract(const Duration(minutes: 8)),
          isRead: false,
        ),
      ];

      final thread = MessageThread(
        id: threadId,
        requestId: 'seed_support_request_$userId',
        itemId: 'support',
        itemTitle: 'Support',
        user1Id: userId,
        user2Id: 'support',
        threadType: 'support',
        otherUserOnline: true,
        messages: messages,
        createdAt: now.subtract(const Duration(hours: 2)),
        lastMessageAt: messages.last.timestamp,
        archivedForUserIds: const <String>[],
      );

      await _persistMessageThreads(prefs, <dynamic>[thread.toJson()]);
      debugPrint('[DataService] Seeded minimal local QA support thread');
      return true;
    });
  }

  /// Returns threads that were archived by the user.
  static Future<List<MessageThread>> getArchivedMessageThreadsForUser(
    String userId,
  ) async {
    await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      final prefs = await SharedPreferences.getInstance();
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final remote = await BackendRepository.getMessageThreads(
          includeArchived: true,
        );
        await _persistMessageThreads(
          prefs,
          remote,
          announceChange: shouldAnnounceMessageThreadCacheWrite(
            readOnlyRemoteRefresh: true,
          ),
        );
      }
      await _requireCurrentOperationalUser(requestedUserId: userId);
      final raw = BackendConfig.enabled && !QaRuntimeService.isEnabled
          ? prefs.getString(_messageThreadsKey)
          : await _readMessageThreads(prefs);
      if (raw == null || raw.isEmpty) return [];
      final threads = _decodeMessageThreadsStrict(raw)
          .where(
            (thread) =>
                _isThreadParticipant(thread, userId) &&
                thread.archivedForUserIds.contains(userId) &&
                !thread.deletedForUserIds.contains(userId),
          )
          .toList();
      threads.sort((a, b) {
        final aTime = a.lastMessageAt ?? a.createdAt;
        final bTime = b.lastMessageAt ?? b.createdAt;
        return bTime.compareTo(aTime);
      });
      return threads;
    } catch (e) {
      debugPrint('[DataService] getArchivedMessageThreadsForUser error: $e');
      rethrow;
    }
  }

  static Future<void> archiveMessageThreadForUser({
    required String threadId,
    required String userId,
    AuthSessionOwner? sessionOwner,
  }) async {
    if (threadId.isEmpty || userId.isEmpty) return;
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final owner = sessionOwner;
        if (owner == null) {
          throw StateError('Die Kontositzung der Aktion fehlt.');
        }
        await BackendRepository.setThreadArchivedForOwner(
          owner: owner,
          threadId: threadId,
          archived: true,
        );
        final prefs = await SharedPreferences.getInstance();
        final remote = await BackendRepository.getMessageThreadsForOwner(owner);
        if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          throw StateError(
              'Die Kontositzung hat während der Aktion gewechselt.');
        }
        await _assertCurrentOperationalUserId(current.id);
        await _persistMessageThreads(prefs, remote);
        return;
      }
      await _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        final prefs = await SharedPreferences.getInstance();
        final raw = await _readMessageThreads(prefs);
        if (raw == null || raw.isEmpty) return;
        final threads = _decodeMessageThreadsStrict(raw);
        final index = threads.indexWhere((thread) => thread.id == threadId);
        if (index < 0) return;
        final thread = threads[index];
        if (!_isThreadParticipant(thread, current.id)) {
          throw StateError(
              'Der Nachrichtenverlauf gehört zu einem anderen Konto.');
        }
        final archived =
            <String>{...thread.archivedForUserIds, current.id}.toList()..sort();
        threads[index] = thread.copyWith(archivedForUserIds: archived);
        await _persistMessageThreads(
          prefs,
          threads.map((entry) => entry.toJson()).toList(growable: false),
        );
      });
    } catch (e) {
      debugPrint('[DataService] archiveMessageThreadForUser error: $e');
      rethrow;
    }
  }

  static Future<void> unarchiveMessageThreadForUser({
    required String threadId,
    required String userId,
    AuthSessionOwner? sessionOwner,
  }) async {
    if (threadId.isEmpty || userId.isEmpty) return;
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final owner = sessionOwner;
        if (owner == null) {
          throw StateError('Die Kontositzung der Aktion fehlt.');
        }
        await BackendRepository.setThreadArchivedForOwner(
          owner: owner,
          threadId: threadId,
          archived: false,
        );
        final prefs = await SharedPreferences.getInstance();
        final remote = await BackendRepository.getMessageThreadsForOwner(owner);
        if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          throw StateError(
              'Die Kontositzung hat während der Aktion gewechselt.');
        }
        await _assertCurrentOperationalUserId(current.id);
        await _persistMessageThreads(prefs, remote);
        return;
      }
      await _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        final prefs = await SharedPreferences.getInstance();
        final raw = await _readMessageThreads(prefs);
        if (raw == null || raw.isEmpty) return;
        final threads = _decodeMessageThreadsStrict(raw);
        final index = threads.indexWhere((thread) => thread.id == threadId);
        if (index < 0) return;
        final thread = threads[index];
        if (!_isThreadParticipant(thread, current.id)) {
          throw StateError(
              'Der Nachrichtenverlauf gehört zu einem anderen Konto.');
        }
        final archived = <String>{...thread.archivedForUserIds}
          ..remove(current.id);
        threads[index] = thread.copyWith(
          archivedForUserIds: archived.toList()..sort(),
        );
        await _persistMessageThreads(
          prefs,
          threads.map((entry) => entry.toJson()).toList(growable: false),
        );
      });
    } catch (e) {
      debugPrint('[DataService] unarchiveMessageThreadForUser error: $e');
      rethrow;
    }
  }

  /// Hides a local thread only for the explicitly captured participant.
  static Future<void> deleteMessageThreadForUser({
    required String threadId,
    required String userId,
    AuthSessionOwner? sessionOwner,
  }) async {
    if (threadId.isEmpty || userId.isEmpty) return;
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final owner = sessionOwner;
        if (owner == null) {
          throw StateError('Die Kontositzung der Aktion fehlt.');
        }
        await BackendRepository.setThreadArchivedForOwner(
          owner: owner,
          threadId: threadId,
          archived: true,
        );
        final prefs = await SharedPreferences.getInstance();
        final remote = await BackendRepository.getMessageThreadsForOwner(owner);
        if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          throw StateError(
              'Die Kontositzung hat während der Aktion gewechselt.');
        }
        await _assertCurrentOperationalUserId(current.id);
        await _persistMessageThreads(prefs, remote);
        return;
      }
      await _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        final prefs = await SharedPreferences.getInstance();
        final raw = await _readMessageThreads(prefs);
        if (raw == null || raw.isEmpty) return;
        final threads = _decodeMessageThreadsStrict(raw);
        final index = threads.indexWhere((thread) => thread.id == threadId);
        if (index < 0) return;
        final thread = threads[index];
        if (!_isThreadParticipant(thread, current.id)) {
          throw StateError(
              'Der Nachrichtenverlauf gehört zu einem anderen Konto.');
        }
        final deleted =
            <String>{...thread.deletedForUserIds, current.id}.toList()..sort();
        threads[index] = thread.copyWith(deletedForUserIds: deleted);
        await _persistMessageThreads(
          prefs,
          threads.map((entry) => entry.toJson()).toList(growable: false),
        );
      });
    } catch (e) {
      debugPrint('[DataService] deleteMessageThreadForUser error: $e');
      rethrow;
    }
  }

  static Future<int> getUnreadThreadCountForUser(String userId) async {
    final threads = await getMessageThreadsForUser(userId);
    int count = 0;
    for (final t in threads) {
      final hasUnread = t.messages.any(
        (m) => m.senderId != userId && !m.isRead,
      );
      if (hasUnread) count++;
    }
    return count;
  }

  /// Opens the local, read-only presentation for a server-confirmed case.
  /// A local support thread must never be created as a fallback for a failed
  /// or unconfirmed canonical intake.
  static Future<MessageThread?> createSupportThread({
    required String userId,
    required String canonicalCaseNumber,
  }) async {
    try {
      final current =
          await _requireCurrentOperationalUser(requestedUserId: userId);
      if (!RegExp(r'^SIT-[A-HJ-NP-Z2-9]{12}$')
          .hasMatch(canonicalCaseNumber.trim())) {
        debugPrint(
          '[DataService] createSupportThread: canonical receipt required',
        );
        return null;
      }
      return _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        final prefs = await SharedPreferences.getInstance();
        final raw = await _readMessageThreads(prefs);
        final threads =
            raw == null ? <MessageThread>[] : _decodeMessageThreadsStrict(raw);

        for (final thread in threads) {
          final isSupport =
              (thread.threadType ?? '').toLowerCase() == 'support';
          final belongsToUser =
              (thread.user1Id == current.id && thread.user2Id == 'support') ||
                  (thread.user2Id == current.id && thread.user1Id == 'support');
          if (isSupport &&
              belongsToUser &&
              !thread.deletedForUserIds.contains(current.id)) {
            debugPrint(
                '[DataService] createSupportThread: reusing local thread');
            return thread;
          }
        }
        if (threads.length >= _maxLocalMessageThreads) {
          throw StateError('Der lokale Nachrichtenverlauf ist voll.');
        }

        final now = DateTime.now();
        final supportThread = MessageThread(
          id: 'thread_support_${now.microsecondsSinceEpoch}',
          requestId: '',
          itemId: '',
          itemTitle: 'SIT Support',
          user1Id: current.id,
          user2Id: 'support',
          threadType: 'support',
          archivedForUserIds: const <String>[],
          messages: const <Message>[],
          createdAt: now,
        );

        threads.add(supportThread);
        await _persistMessageThreads(
          prefs,
          threads.map((entry) => entry.toJson()).toList(),
        );
        debugPrint('[DataService] createSupportThread: created local thread');
        return supportThread;
      });
    } catch (e) {
      debugPrint('[DataService] createSupportThread error: $e');
      rethrow;
    }
  }

  /// Findet einen Thread anhand der Thread-ID
  static Future<MessageThread?> getMessageThreadById(
    String threadId, {
    Duration remoteTimeout = const Duration(seconds: 20),
  }) async {
    final normalizedThreadId = threadId.trim();
    if (normalizedThreadId.isEmpty) return null;

    try {
      final current = await _requireCurrentOperationalUser();
      final prefs = await SharedPreferences.getInstance();
      final raw = await _readMessageThreads(
        prefs,
        remoteTimeout: remoteTimeout,
      );
      await _requireCurrentOperationalUser(requestedUserId: current.id);
      if (raw == null) return null;

      for (final thread in _decodeMessageThreadsStrict(raw)) {
        if (thread.id != normalizedThreadId) continue;
        if (!_isThreadParticipant(thread, current.id) ||
            thread.deletedForUserIds.contains(current.id)) {
          return null;
        }
        return thread;
      }
      return null;
    } on StateError catch (e) {
      debugPrint('[DataService] getMessageThreadById denied: $e');
      return null;
    } catch (e) {
      debugPrint('[DataService] getMessageThreadById error: $e');
      rethrow;
    }
  }

  /// Fügt eine Nachricht zu einem Thread hinzu
  static Future<void> addMessageToThread({
    required String threadId,
    required String senderId,
    required String text,
  }) async {
    final normalizedThreadId = threadId.trim();
    final normalizedSenderId = senderId.trim();
    final normalizedText = text.trim();
    if (normalizedThreadId.isEmpty ||
        normalizedSenderId.isEmpty ||
        normalizedText.isEmpty) {
      return;
    }
    if (normalizedText.length > 20000) {
      throw ArgumentError('Die Nachricht ist zu lang.');
    }

    final currentUser = await _requireCurrentOperationalUser();

    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      if (normalizedSenderId == 'system' ||
          normalizedSenderId != currentUser.id) {
        return;
      }
      await BackendRepository.sendThreadMessage(
        threadId: normalizedThreadId,
        text: normalizedText,
        idempotencyKey:
            'message_${normalizedThreadId}_${DateTime.now().microsecondsSinceEpoch}',
      );
      final prefs = await SharedPreferences.getInstance();
      final remote = await BackendRepository.getMessageThreads();
      await _assertCurrentOperationalUserId(currentUser.id);
      await _persistMessageThreads(prefs, remote);
      return;
    }

    await _operationalMutationQueue.run(() async {
      await _assertCurrentOperationalUserId(currentUser.id);
      final prefs = await SharedPreferences.getInstance();
      final raw = await _readMessageThreads(prefs);
      if (raw == null) return;
      final threads = _decodeMessageThreadsStrict(raw);
      final index =
          threads.indexWhere((thread) => thread.id == normalizedThreadId);
      if (index < 0) return;
      final thread = threads[index];
      final isParticipant = _isThreadParticipant(thread, currentUser.id);
      final senderIsAllowed = normalizedSenderId == 'system' ||
          normalizedSenderId == currentUser.id;
      if (!isParticipant ||
          !senderIsAllowed ||
          thread.deletedForUserIds.contains(currentUser.id)) {
        return;
      }
      if (thread.messages.length >= _maxMessagesPerThread) {
        throw StateError('Der lokale Nachrichtenverlauf ist voll.');
      }
      final now = DateTime.now();
      final existingIds = thread.messages.map((message) => message.id).toSet();
      final baseId = 'msg_${now.microsecondsSinceEpoch}';
      var messageId = baseId;
      var suffix = 1;
      while (existingIds.contains(messageId)) {
        messageId = '${baseId}_$suffix';
        suffix++;
      }
      final newMessage = Message(
        id: messageId,
        senderId: normalizedSenderId,
        text: normalizedText,
        timestamp: now,
        isRead: false,
      );
      threads[index] = thread.copyWith(
        messages: [...thread.messages, newMessage],
        lastMessageAt: now,
      );
      await _persistMessageThreads(
        prefs,
        threads.map((entry) => entry.toJson()).toList(),
      );
    });
  }

  static Future<void> addMessageAttachmentToThread({
    required String threadId,
    required Uint8List bytes,
    required String filename,
    String text = 'Foto hinzugefügt',
  }) async {
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) {
      await addMessageToThread(
        threadId: threadId,
        senderId: 'system',
        text: text,
      );
      return;
    }
    final current = await _requireCurrentOperationalUser();
    final thread = await getMessageThreadById(threadId);
    if (thread == null || !_isThreadParticipant(thread, current.id)) {
      throw StateError(
        'Der Nachrichtenverlauf gehört zu einem anderen Konto.',
      );
    }
    final upload = await BackendRepository.uploadMessageAttachment(
      bytes: bytes,
      filename: filename,
      threadId: threadId,
    );
    await BackendRepository.sendThreadMessage(
      threadId: threadId,
      text: text,
      idempotencyKey:
          'attachment_${threadId}_${DateTime.now().microsecondsSinceEpoch}',
      attachmentIds: [upload['id'].toString()],
    );
    final prefs = await SharedPreferences.getInstance();
    final remote = await BackendRepository.getMessageThreads();
    await _assertCurrentOperationalUserId(current.id);
    await _persistMessageThreads(prefs, remote);
  }

  /// Markiert alle Nachrichten in einem Thread als gelesen für einen User
  static Future<void> markThreadMessagesAsRead({
    required String threadId,
    required String userId,
    AuthSessionOwner? sessionOwner,
  }) async {
    final current =
        await _requireCurrentOperationalUser(requestedUserId: userId);
    try {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final owner = sessionOwner;
        if (owner == null) {
          throw StateError('Die Kontositzung der Aktion fehlt.');
        }
        await BackendRepository.markThreadReadForOwner(
          owner: owner,
          threadId: threadId,
        );
        final prefs = await SharedPreferences.getInstance();
        final remote = await BackendRepository.getMessageThreadsForOwner(owner);
        if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
          throw StateError(
              'Die Kontositzung hat während der Aktion gewechselt.');
        }
        await _assertCurrentOperationalUserId(current.id);
        await _persistMessageThreads(prefs, remote);
        return;
      }
      await _operationalMutationQueue.run(() async {
        await _assertCurrentOperationalUserId(current.id);
        final prefs = await SharedPreferences.getInstance();
        final raw = await _readMessageThreads(prefs);
        if (raw == null) return;
        final threads = _decodeMessageThreadsStrict(raw);
        final index = threads.indexWhere((thread) => thread.id == threadId);
        if (index < 0) return;
        final thread = threads[index];
        if (!_isThreadParticipant(thread, current.id) ||
            thread.deletedForUserIds.contains(current.id)) {
          throw StateError(
              'Der Nachrichtenverlauf gehört zu einem anderen Konto.');
        }
        var mutated = false;
        final updatedMessages = thread.messages.map((message) {
          if (message.senderId != current.id && !message.isRead) {
            mutated = true;
            return message.copyWith(isRead: true);
          }
          return message;
        }).toList();
        if (!mutated) return;
        threads[index] = thread.copyWith(messages: updatedMessages);
        await _persistMessageThreads(
          prefs,
          threads.map((entry) => entry.toJson()).toList(),
        );
      });
    } catch (e) {
      debugPrint('[DataService] markThreadMessagesAsRead error: $e');
      rethrow;
    }
  }
}
