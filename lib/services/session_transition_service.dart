import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/data_service.dart';

class SessionTransitionOwner {
  final AuthSessionOwner authOwner;
  final String? profileUserId;

  const SessionTransitionOwner({
    required this.authOwner,
    this.profileUserId,
  });
}

class SessionTransitionCompletion {
  final int completionEpoch;
  final bool sessionCleared;
  final bool profileCleared;

  const SessionTransitionCompletion({
    required this.completionEpoch,
    this.sessionCleared = true,
    this.profileCleared = true,
  });
}

/// Coordinates local account transitions without ever treating an unknown or
/// successor state as a successful guest transition.
///
/// The class is intentionally injectable so UI race tests can deterministically
/// move from Account A to Account B at every await boundary.
class SessionTransitionService {
  const SessionTransitionService();

  int get sessionEpoch => AuthService.sessionEpoch;

  Future<AuthSession?> readSession() => AuthService.readSession();

  SessionTransitionOwner captureOwner(
    AuthSession session, {
    String? profileUserId,
  }) =>
      SessionTransitionOwner(
        authOwner: AuthService.captureSessionOwner(session),
        profileUserId: profileUserId,
      );

  Future<bool> isOwnerCurrent(SessionTransitionOwner owner) =>
      AuthService.isSessionOwnerDefinitelyCurrent(owner.authOwner);

  Future<bool> isNoSessionEpochCurrent(int expectedEpoch) async {
    if (expectedEpoch != sessionEpoch) return false;
    final session = await readSession();
    if (session != null || expectedEpoch != sessionEpoch) return false;
    final absent = await AuthService.isStoredSessionDefinitelyAbsent();
    return absent && expectedEpoch == sessionEpoch;
  }

  Future<User?> currentUserForOwner(
    SessionTransitionOwner owner, {
    bool synchronize = false,
  }) async {
    if (!await isOwnerCurrent(owner)) return null;
    if (synchronize) {
      final synchronized =
          await DataService.syncCurrentUserForSessionOwner(owner.authOwner);
      if (synchronized == null ||
          !_profileMatchesOwner(synchronized, owner) ||
          !await isOwnerCurrent(owner)) {
        return null;
      }
      return synchronized;
    }

    final current = await DataService.readCurrentUserForSessionTransition();
    if (current != null &&
        _profileMatchesOwner(current, owner) &&
        await isOwnerCurrent(owner)) {
      return current;
    }
    final synchronized =
        await DataService.syncCurrentUserForSessionOwner(owner.authOwner);
    if (synchronized == null ||
        !_profileMatchesOwner(synchronized, owner) ||
        !await isOwnerCurrent(owner)) {
      return null;
    }
    return synchronized;
  }

  Future<User?> cachedCurrentUserForOwner(
    SessionTransitionOwner owner,
  ) async {
    if (!await isOwnerCurrent(owner)) return null;
    final current = await DataService.readCurrentUserForSessionTransition();
    if (current == null ||
        !_profileMatchesOwner(current, owner) ||
        !await isOwnerCurrent(owner)) {
      return null;
    }
    return current;
  }

  Future<SessionTransitionCompletion?> signOut(
    SessionTransitionOwner owner,
  ) async {
    if (!await isOwnerCurrent(owner)) return null;
    final receipt = await AuthService.clearSessionOwnerIfMatches(
      owner.authOwner,
    );
    if (receipt == null) return null;

    final profileId =
        (owner.profileUserId ?? owner.authOwner.userId ?? '').trim();
    var profileCleared = profileId.isEmpty;
    if (profileId.isNotEmpty) {
      profileCleared = await DataService.clearCurrentUserIfMatches(
        userId: profileId,
        email: owner.authOwner.email,
      );
    }
    return SessionTransitionCompletion(
      completionEpoch: receipt.completionEpoch,
      profileCleared: profileCleared,
    );
  }

  Future<SessionTransitionCompletion?> clearStaleSession(
    SessionTransitionOwner owner,
  ) async {
    if (!await isOwnerCurrent(owner)) return null;
    final receipt = await AuthService.clearSessionOwnerIfMatches(
      owner.authOwner,
      runLogoutCleanup: false,
    );
    if (receipt == null) return null;
    return SessionTransitionCompletion(
      completionEpoch: receipt.completionEpoch,
      profileCleared: false,
    );
  }

  /// Continues as guest only from an epoch that was already confirmed to have
  /// no session. A session appearing at any await boundary makes this a no-op.
  Future<SessionTransitionCompletion?> continueAsGuest(
    int expectedEpoch,
  ) async {
    if (expectedEpoch != sessionEpoch) return null;
    final session = await readSession();
    if (session != null ||
        expectedEpoch != sessionEpoch ||
        !await AuthService.isStoredSessionDefinitelyAbsent()) {
      return null;
    }

    final profile = await DataService.readCurrentUserForSessionTransition();
    if (expectedEpoch != sessionEpoch ||
        !await AuthService.isStoredSessionDefinitelyAbsent()) {
      return null;
    }
    var profileCleared = profile == null;
    if (profile != null) {
      profileCleared = await DataService.clearCurrentUserIfMatches(
        userId: profile.id,
        email: profile.email,
      );
    }
    if (!profileCleared ||
        expectedEpoch != sessionEpoch ||
        !await AuthService.isStoredSessionDefinitelyAbsent()) {
      return null;
    }
    return SessionTransitionCompletion(
      completionEpoch: expectedEpoch,
      sessionCleared: false,
      profileCleared: profileCleared,
    );
  }

  Future<bool> isCompletionCurrent(
    SessionTransitionCompletion completion,
  ) async {
    if (completion.completionEpoch != sessionEpoch) return false;
    final absent = await AuthService.isStoredSessionDefinitelyAbsent();
    return absent && completion.completionEpoch == sessionEpoch;
  }

  bool _profileMatchesOwner(User user, SessionTransitionOwner owner) {
    if (user.email.trim().toLowerCase() !=
        owner.authOwner.email.trim().toLowerCase()) {
      return false;
    }
    final expectedId =
        (owner.profileUserId ?? owner.authOwner.userId ?? '').trim();
    return expectedId.isEmpty || user.id.trim() == expectedId;
  }
}
