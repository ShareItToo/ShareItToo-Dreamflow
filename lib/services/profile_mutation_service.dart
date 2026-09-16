import 'package:flutter/foundation.dart' show protected;
import 'package:lendify/models/user.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/session_transition_service.dart';

enum ProfileMutationFailureKind {
  rejected,
  localUnavailable,
  outcomeUnknown,
  principalChanged,
}

class ProfileMutationFailure implements Exception {
  final ProfileMutationFailureKind kind;
  final String? code;
  final bool remoteAccepted;

  const ProfileMutationFailure._(
    this.kind, {
    this.code,
    this.remoteAccepted = false,
  });

  const ProfileMutationFailure.rejected(String code)
      : this._(ProfileMutationFailureKind.rejected, code: code);

  const ProfileMutationFailure.localUnavailable(
    String? code, {
    bool remoteAccepted = false,
  }) : this._(
          ProfileMutationFailureKind.localUnavailable,
          code: code,
          remoteAccepted: remoteAccepted,
        );

  const ProfileMutationFailure.outcomeUnknown([String? code])
      : this._(ProfileMutationFailureKind.outcomeUnknown, code: code);

  const ProfileMutationFailure.principalChanged({
    bool remoteAccepted = false,
  }) : this._(
          ProfileMutationFailureKind.principalChanged,
          remoteAccepted: remoteAccepted,
        );
}

class ProfileMutationContext {
  final User user;
  final SessionTransitionOwner owner;

  const ProfileMutationContext({
    required this.user,
    required this.owner,
  });
}

/// Binds one screen action to one exact loaded profile context and one local
/// action epoch. The object stores no credential or raw persistence value.
class ProfileMutationActionOwner {
  final ProfileMutationContext context;
  final int actionEpoch;

  const ProfileMutationActionOwner({
    required this.context,
    required this.actionEpoch,
  });

  bool isSynchronouslyCurrent({
    required ProfileMutationContext? context,
    required int actionEpoch,
  }) =>
      identical(this.context, context) && this.actionEpoch == actionEpoch;
}

/// Principal-bound coordinator for repository-owned profile and location
/// mutations. The exact token-free owner is captured during screen loading;
/// every mutation revalidates it immediately before and after the data layer.
class ProfileMutationService {
  final SessionTransitionService _sessionTransitions;

  const ProfileMutationService({
    SessionTransitionService sessionTransitions =
        const SessionTransitionService(),
  }) : _sessionTransitions = sessionTransitions;

  Future<ProfileMutationContext?> loadCurrentContext() async {
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
    return ProfileMutationContext(user: user, owner: owner);
  }

  Future<bool> isContextCurrent(ProfileMutationContext context) async {
    if (!await _sessionTransitions.isOwnerCurrent(context.owner)) return false;
    final current =
        await _sessionTransitions.cachedCurrentUserForOwner(context.owner);
    return current != null &&
        current.id.trim() == context.user.id.trim() &&
        current.email.trim().toLowerCase() ==
            context.user.email.trim().toLowerCase() &&
        await _sessionTransitions.isOwnerCurrent(context.owner);
  }

  static ProfileMutationFailureKind classifyBackendFailure(
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
    return rejected[error.statusCode]?.contains(error.code) == true
        ? ProfileMutationFailureKind.rejected
        : ProfileMutationFailureKind.outcomeUnknown;
  }

  @protected
  Future<AccountProfileMutationResult> performProfileMutation({
    required ProfileMutationContext context,
    required Map<CurrentUserProfileField, Object?> updates,
  }) =>
      DataService.updateCurrentUserProfileForOwner(
        owner: context.owner.authOwner,
        expectedUserId: context.user.id,
        updates: updates,
      );

  Future<AccountProfileMutationResult> updateProfile({
    required ProfileMutationContext context,
    required Map<CurrentUserProfileField, Object?> updates,
  }) async {
    if (!await isContextCurrent(context)) {
      throw const ProfileMutationFailure.principalChanged();
    }
    try {
      if (!await isContextCurrent(context)) {
        throw const ProfileMutationFailure.principalChanged();
      }
      final result = await performProfileMutation(
        context: context,
        updates: updates,
      );
      if (!await isContextCurrent(context)) {
        throw ProfileMutationFailure.principalChanged(
          remoteAccepted: result.remoteAccepted,
        );
      }
      return result;
    } on ProfileMutationFailure {
      rethrow;
    } on AccountProfileMutationFailure catch (failure) {
      throw switch (failure.kind) {
        AccountProfileMutationFailureKind.rejected =>
          ProfileMutationFailure.rejected(failure.code ?? 'rejected'),
        AccountProfileMutationFailureKind.localUnavailable =>
          ProfileMutationFailure.localUnavailable(
            failure.code,
            remoteAccepted: failure.remoteAccepted,
          ),
        AccountProfileMutationFailureKind.outcomeUnknown =>
          ProfileMutationFailure.outcomeUnknown(failure.code),
        AccountProfileMutationFailureKind.principalChanged =>
          ProfileMutationFailure.principalChanged(
            remoteAccepted: failure.remoteAccepted,
          ),
      };
    } on BackendException catch (error) {
      if (!await isContextCurrent(context)) {
        throw const ProfileMutationFailure.principalChanged();
      }
      final kind = classifyBackendFailure(error);
      if (kind == ProfileMutationFailureKind.rejected) {
        throw ProfileMutationFailure.rejected(error.code);
      }
      throw ProfileMutationFailure.outcomeUnknown(error.code);
    } catch (_) {
      if (!await isContextCurrent(context)) {
        throw const ProfileMutationFailure.principalChanged();
      }
      throw const ProfileMutationFailure.localUnavailable(
        'local_profile_mutation_failed',
      );
    }
  }
}
