import 'package:flutter/foundation.dart' show debugPrint, protected;
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';
import 'package:lendify/services/session_transition_service.dart';

class AccountDeletionBlocker {
  final String id;
  final String label;
  final int count;

  const AccountDeletionBlocker(
      {required this.id, required this.label, required this.count});
}

class AccountDeletionRetainedRecord {
  final String id;
  final String label;
  final int count;

  const AccountDeletionRetainedRecord(
      {required this.id, required this.label, required this.count});
}

class AccountDeletionPreflightResult {
  final bool canDelete;
  final List<AccountDeletionBlocker> blockers;
  final List<AccountDeletionRetainedRecord> retainedRecords;

  const AccountDeletionPreflightResult({
    required this.canDelete,
    required this.blockers,
    required this.retainedRecords,
  });
}

enum AccountDeletionPreflightFailureKind {
  unavailable,
  invalidResponse,
}

class AccountDeletionPreflightFailure implements Exception {
  final AccountDeletionPreflightFailureKind kind;

  const AccountDeletionPreflightFailure._(this.kind);

  const AccountDeletionPreflightFailure.unavailable()
      : this._(AccountDeletionPreflightFailureKind.unavailable);

  const AccountDeletionPreflightFailure.invalidResponse()
      : this._(AccountDeletionPreflightFailureKind.invalidResponse);
}

enum AccountDeletionFailureKind {
  rejected,
  localFinalizationFailed,
  confirmedLocalFinalizationFailed,
  outcomeUnknown,
}

class AccountDeletionFailure implements Exception {
  final AccountDeletionFailureKind kind;
  final bool serverDeletionConfirmed;
  final AccountDeletionCompletion? localCompletion;

  bool get localSessionDefinitelyCleared =>
      localCompletion?.localSessionDefinitelyCleared == true;

  const AccountDeletionFailure._(
    this.kind, {
    required this.serverDeletionConfirmed,
    this.localCompletion,
  });

  const AccountDeletionFailure.rejected()
      : this._(
          AccountDeletionFailureKind.rejected,
          serverDeletionConfirmed: false,
        );

  const AccountDeletionFailure.confirmedLocalFinalizationFailed({
    AccountDeletionCompletion? localCompletion,
  }) : this._(
          AccountDeletionFailureKind.confirmedLocalFinalizationFailed,
          serverDeletionConfirmed: true,
          localCompletion: localCompletion,
        );

  const AccountDeletionFailure.localFinalizationFailed({
    AccountDeletionCompletion? localCompletion,
  }) : this._(
          AccountDeletionFailureKind.localFinalizationFailed,
          serverDeletionConfirmed: false,
          localCompletion: localCompletion,
        );

  const AccountDeletionFailure.outcomeUnknown({
    AccountDeletionCompletion? localCompletion,
  }) : this._(
          AccountDeletionFailureKind.outcomeUnknown,
          serverDeletionConfirmed: false,
          localCompletion: localCompletion,
        );
}

class AccountDeletionContext {
  final User user;
  final SessionTransitionOwner owner;

  const AccountDeletionContext({
    required this.user,
    required this.owner,
  });
}

class AccountDeletionCompletion {
  final int completionEpoch;
  final bool localSessionDefinitelyCleared;

  const AccountDeletionCompletion({
    required this.completionEpoch,
    required this.localSessionDefinitelyCleared,
  });
}

class AccountDeletionPrincipalChanged implements Exception {
  const AccountDeletionPrincipalChanged();
}

/// Local-only MVP account deletion flow.
///
/// - Performs a preflight check (bookings/payments/conflicts) before allowing deletion.
/// - When allowed, anonymizes user data and deactivates listings.
/// - Designed so it can be swapped to a backend implementation later.
class AccountDeletionService {
  final SessionTransitionService _sessionTransitions;

  const AccountDeletionService({
    SessionTransitionService sessionTransitions =
        const SessionTransitionService(),
  }) : _sessionTransitions = sessionTransitions;

  @protected
  bool get backendEnabled => BackendConfig.enabled;

  @protected
  Future<Map<String, dynamic>> fetchRemotePreflight() =>
      BackendRepository.accountDeletionPreflight();

  @protected
  Future<void> deleteRemoteAccount({
    required AuthSessionOwner owner,
    required String currentPassword,
  }) =>
      BackendRepository.deleteAccount(
        owner: owner,
        currentPassword: currentPassword,
      );

  Future<AccountDeletionContext?> loadCurrentContext() async {
    final session = await _sessionTransitions.readSession();
    if (session == null) return null;
    final owner = _sessionTransitions.captureOwner(
      session,
      profileUserId: session.userId,
    );
    final user = await _sessionTransitions.currentUserForOwner(owner);
    if (user == null || !await _sessionTransitions.isOwnerCurrent(owner)) {
      return null;
    }
    return AccountDeletionContext(user: user, owner: owner);
  }

  Future<bool> isContextCurrent(AccountDeletionContext context) async {
    if (!await _sessionTransitions.isOwnerCurrent(context.owner)) return false;
    final current =
        await _sessionTransitions.cachedCurrentUserForOwner(context.owner);
    return current != null &&
        current.id.trim() == context.user.id.trim() &&
        current.email.trim().toLowerCase() ==
            context.user.email.trim().toLowerCase() &&
        await _sessionTransitions.isOwnerCurrent(context.owner);
  }

  Future<void> _requireContextCurrent(AccountDeletionContext context) async {
    if (!await isContextCurrent(context)) {
      throw const AccountDeletionPrincipalChanged();
    }
  }

  Future<AccountDeletionPreflightResult> preflightCheck(
    AccountDeletionContext context,
  ) async {
    await _requireContextCurrent(context);
    try {
      if (backendEnabled) {
        final remote = await fetchRemotePreflight();
        await _requireContextCurrent(context);
        return _decodeRemotePreflight(remote);
      }
      return await _localPreflight(context);
    } on AccountDeletionPrincipalChanged {
      rethrow;
    } on FormatException catch (error) {
      debugPrint(
        '[AccountDeletionService] invalid preflight response: '
        '${error.runtimeType}',
      );
      throw const AccountDeletionPreflightFailure.invalidResponse();
    } catch (error) {
      debugPrint(
        '[AccountDeletionService] preflight unavailable: '
        '${error.runtimeType}',
      );
      throw const AccountDeletionPreflightFailure.unavailable();
    }
  }

  AccountDeletionPreflightResult _decodeRemotePreflight(
    Map<String, dynamic> remote,
  ) {
    final rawCanDelete = remote['canDelete'];
    final rawBlockers = remote['blockers'];
    final rawRetainedRecords = remote['retainedRecords'];
    if (rawCanDelete is! bool ||
        rawBlockers is! List ||
        rawRetainedRecords is! List) {
      throw const FormatException('Invalid deletion preflight shape.');
    }

    List<T> decodeEntries<T>(
      List<dynamic> raw,
      T Function(String id, String label, int count) build,
    ) {
      return raw.map((entry) {
        if (entry is! Map) {
          throw const FormatException('Invalid deletion preflight entry.');
        }
        final value = Map<String, dynamic>.from(entry);
        final id = value['id'];
        final label = value['label'];
        final rawCount = value['count'];
        final count = rawCount is num ? rawCount.toInt() : -1;
        if (id is! String ||
            id.trim().isEmpty ||
            label is! String ||
            label.trim().isEmpty ||
            count < 1) {
          throw const FormatException('Invalid deletion preflight entry.');
        }
        return build(id.trim(), label.trim(), count);
      }).toList(growable: false);
    }

    final blockers = decodeEntries<AccountDeletionBlocker>(
      rawBlockers,
      (id, label, count) => AccountDeletionBlocker(
        id: id,
        label: label,
        count: count,
      ),
    );
    final retainedRecords = decodeEntries<AccountDeletionRetainedRecord>(
      rawRetainedRecords,
      (id, label, count) => AccountDeletionRetainedRecord(
        id: id,
        label: label,
        count: count,
      ),
    );
    if (rawCanDelete && blockers.isNotEmpty) {
      throw const FormatException('Contradictory deletion preflight.');
    }
    return AccountDeletionPreflightResult(
      canDelete: rawCanDelete && blockers.isEmpty,
      blockers: blockers,
      retainedRecords: retainedRecords,
    );
  }

  Future<AccountDeletionPreflightResult> _localPreflight(
    AccountDeletionContext context,
  ) async {
    final user = context.user;
    final now = DateTime.now();
    final renterReqs = await DataService.getRentalRequestsForRenter(user.id);
    await _requireContextCurrent(context);
    final ownerReqs = await DataService.getRentalRequestsForOwner(user.id);
    await _requireContextCurrent(context);

    final runningBookings =
        renterReqs.where((request) => request.status == 'running').length;
    final upcomingBookings = renterReqs.where((request) {
      if (request.status == 'running' ||
          request.status == 'completed' ||
          request.status == 'declined' ||
          request.status == 'cancelled') {
        return false;
      }
      return request.start.isAfter(now);
    }).length;

    final runningRentalsAsOwner =
        ownerReqs.where((request) => request.status == 'running').length;
    final upcomingRentalsAsOwner = ownerReqs.where((request) {
      if (request.status == 'running' ||
          request.status == 'completed' ||
          request.status == 'declined' ||
          request.status == 'cancelled') {
        return false;
      }
      return request.start.isAfter(now);
    }).length;

    // Local fallback has no payment/dispute authority. These remain zero only
    // in the explicitly non-backend preview path and grant no live readiness.
    const openPayouts = 0;
    const openFees = 0;
    const paymentProcessing = 0;
    const openDisputes = 0;
    const openSupportTickets = 0;

    final blockers = <AccountDeletionBlocker>[
      if (runningBookings > 0)
        AccountDeletionBlocker(
          id: 'running_bookings',
          label:
              '$runningBookings laufende Buchung${runningBookings == 1 ? '' : 'en'}',
          count: runningBookings,
        ),
      if (upcomingBookings > 0)
        AccountDeletionBlocker(
          id: 'upcoming_bookings',
          label:
              '$upcomingBookings kommende Buchung${upcomingBookings == 1 ? '' : 'en'}',
          count: upcomingBookings,
        ),
      if (runningRentalsAsOwner > 0)
        AccountDeletionBlocker(
          id: 'running_rentals_owner',
          label:
              '$runningRentalsAsOwner laufende Anmietung${runningRentalsAsOwner == 1 ? '' : 'en'} (als Vermieter)',
          count: runningRentalsAsOwner,
        ),
      if (upcomingRentalsAsOwner > 0)
        AccountDeletionBlocker(
          id: 'upcoming_rentals_owner',
          label:
              '$upcomingRentalsAsOwner kommende Anmietung${upcomingRentalsAsOwner == 1 ? '' : 'en'} (als Vermieter)',
          count: upcomingRentalsAsOwner,
        ),
      if (openPayouts > 0)
        const AccountDeletionBlocker(
          id: 'open_payouts',
          label: 'Offene Auszahlung',
          count: openPayouts,
        ),
      if (openFees > 0)
        const AccountDeletionBlocker(
          id: 'open_fees',
          label: 'Offene Gebühren',
          count: openFees,
        ),
      if (paymentProcessing > 0)
        const AccountDeletionBlocker(
          id: 'payment_processing',
          label: 'Laufende Zahlungsabwicklung',
          count: paymentProcessing,
        ),
      if (openDisputes > 0)
        const AccountDeletionBlocker(
          id: 'open_disputes',
          label: 'Offener Streitfall',
          count: openDisputes,
        ),
      if (openSupportTickets > 0)
        const AccountDeletionBlocker(
          id: 'open_support',
          label: 'Offenes Supportticket',
          count: openSupportTickets,
        ),
    ];

    await _requireContextCurrent(context);
    return AccountDeletionPreflightResult(
      canDelete: blockers.isEmpty,
      blockers: blockers,
      retainedRecords: const <AccountDeletionRetainedRecord>[],
    );
  }

  Future<AccountDeletionCompletion> deleteAccount({
    required AccountDeletionContext context,
    required String currentPassword,
  }) async {
    await _requireContextCurrent(context);
    if (!backendEnabled) {
      try {
        return await deleteLocalAccount(context);
      } on AccountDeletionPrincipalChanged {
        rethrow;
      } on AccountDeletionFailure {
        rethrow;
      } catch (error) {
        debugPrint(
          '[AccountDeletionService] local deletion finalization failed: '
          '${error.runtimeType}',
        );
        throw AccountDeletionFailure.localFinalizationFailed(
          localCompletion: await currentLocalCompletionOrNull(),
        );
      }
    }

    try {
      await deleteRemoteAccount(
        owner: context.owner.authOwner,
        currentPassword: currentPassword,
      );
    } on BackendException catch (error) {
      if (_isDefiniteRejection(error)) {
        throw const AccountDeletionFailure.rejected();
      }
      throw AccountDeletionFailure.outcomeUnknown(
        localCompletion: await clearExactSessionAfterUnknown(context),
      );
    } catch (error) {
      debugPrint(
        '[AccountDeletionService] deletion outcome unknown: '
        '${error.runtimeType}',
      );
      throw AccountDeletionFailure.outcomeUnknown(
        localCompletion: await clearExactSessionAfterUnknown(context),
      );
    }

    try {
      return await finalizeConfirmedDeletion(context);
    } on AccountDeletionFailure {
      rethrow;
    } catch (error) {
      debugPrint(
        '[AccountDeletionService] confirmed deletion local finalization '
        'failed: ${error.runtimeType}',
      );
      throw AccountDeletionFailure.confirmedLocalFinalizationFailed(
        localCompletion: await currentLocalCompletionOrNull(),
      );
    }
  }

  static bool _isDefiniteRejection(BackendException error) {
    const allowed = <int, Set<String>>{
      401: <String>{
        'authentication_required',
        'invalid_or_expired_session',
        'account_not_active',
        'invalid_credentials',
      },
      409: <String>{'account_deletion_blocked'},
      429: <String>{'rate_limit_exceeded'},
    };
    return allowed[error.statusCode]?.contains(error.code) == true;
  }

  @protected
  Future<AccountDeletionCompletion> deleteLocalAccount(
    AccountDeletionContext context,
  ) async {
    await _requireContextCurrent(context);
    final user = context.user;
    await DataService.deactivateAllListingsForUser(user.id);
    await _requireContextCurrent(context);
    await DataService.clearOperationalRecordsForAccountDeletion(user.id);
    await _requireContextCurrent(context);
    await DataService.clearSavedItemsForConfirmedAccountDeletion(user.id);
    await LocalSafetyPrivacyService.clearPrincipalForConfirmedAccountDeletion(
      user.id,
    );
    await _requireContextCurrent(context);
    await FirebaseRuntime.deleteInstallationForAccountDeletion();
    await DataService.finalizeProfileForConfirmedAccountDeletion(
      userId: user.id,
      email: user.email,
    );
    final receipt = await AuthService.clearSessionOwnerIfMatches(
      context.owner.authOwner,
      runLogoutCleanup: false,
    );
    if (receipt == null ||
        !await AuthService.isSessionClearReceiptCurrent(receipt)) {
      throw StateError('Local deletion session finalization failed.');
    }
    return AccountDeletionCompletion(
      completionEpoch: receipt.completionEpoch,
      localSessionDefinitelyCleared: true,
    );
  }

  @protected
  Future<AccountDeletionCompletion> finalizeConfirmedDeletion(
    AccountDeletionContext context,
  ) async {
    final user = context.user;
    await DataService.clearOperationalRecordsForConfirmedAccountDeletion(
      user.id,
    );
    await DataService.clearSavedItemsForConfirmedAccountDeletion(user.id);
    await LocalSafetyPrivacyService.clearPrincipalForConfirmedAccountDeletion(
      user.id,
    );

    // A Firebase installation is device-scoped, not Account-A scoped. Delete
    // it only while A still owns the device session; a successor B must keep
    // its installation and preferences.
    if (await isContextCurrent(context)) {
      await FirebaseRuntime.deleteInstallationForAccountDeletion();
    }

    await DataService.finalizeProfileForConfirmedAccountDeletion(
      userId: user.id,
      email: user.email,
    );
    final receipt = await AuthService.clearSessionOwnerIfMatches(
      context.owner.authOwner,
      runLogoutCleanup: false,
    );
    if (receipt != null &&
        await AuthService.isSessionClearReceiptCurrent(receipt)) {
      return AccountDeletionCompletion(
        completionEpoch: receipt.completionEpoch,
        localSessionDefinitelyCleared: true,
      );
    }
    final stableLocalState = await _completionAfterDeletedOwnerDisappeared(
      context,
    );
    if (stableLocalState != null) return stableLocalState;
    throw const AccountDeletionFailure.confirmedLocalFinalizationFailed(
      localCompletion: null,
    );
  }

  @protected
  Future<AccountDeletionCompletion?> clearExactSessionAfterUnknown(
    AccountDeletionContext context,
  ) async {
    try {
      final completion = await _sessionTransitions.signOut(context.owner);
      if (completion == null ||
          !await _sessionTransitions.isCompletionCurrent(completion)) {
        return null;
      }
      return AccountDeletionCompletion(
        completionEpoch: completion.completionEpoch,
        localSessionDefinitelyCleared: true,
      );
    } catch (_) {
      return null;
    }
  }

  @protected
  Future<AccountDeletionCompletion?> currentLocalCompletionOrNull() async {
    final epoch = _sessionTransitions.sessionEpoch;
    if (!await AuthService.isStoredSessionDefinitelyAbsent() ||
        epoch != _sessionTransitions.sessionEpoch) {
      return null;
    }
    return AccountDeletionCompletion(
      completionEpoch: epoch,
      localSessionDefinitelyCleared: true,
    );
  }

  Future<AccountDeletionCompletion?> _completionAfterDeletedOwnerDisappeared(
    AccountDeletionContext context,
  ) async {
    final empty = await currentLocalCompletionOrNull();
    if (empty != null) return empty;

    final session = await _sessionTransitions.readSession();
    if (session == null) return null;
    final successor = _sessionTransitions.captureOwner(
      session,
      profileUserId: session.userId,
    );
    if (_sameAuthOwner(successor.authOwner, context.owner.authOwner) ||
        !await _sessionTransitions.isOwnerCurrent(successor)) {
      return null;
    }
    return AccountDeletionCompletion(
      completionEpoch: successor.authOwner.epoch,
      localSessionDefinitelyCleared: false,
    );
  }

  static bool _sameAuthOwner(AuthSessionOwner left, AuthSessionOwner right) =>
      left.userId?.trim() == right.userId?.trim() &&
      left.sessionId?.trim() == right.sessionId?.trim() &&
      left.email.trim().toLowerCase() == right.email.trim().toLowerCase() &&
      left.createdAt == right.createdAt;

  Future<bool> isCompletionCurrent(
    AccountDeletionCompletion completion,
  ) async {
    if (!completion.localSessionDefinitelyCleared ||
        completion.completionEpoch != _sessionTransitions.sessionEpoch) {
      return false;
    }
    final absent = await AuthService.isStoredSessionDefinitelyAbsent();
    return absent &&
        completion.completionEpoch == _sessionTransitions.sessionEpoch;
  }
}
