import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show protected;
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

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

  const ProfileMutationFailure.outcomeUnknown(
    String? code, {
    bool remoteAccepted = false,
  }) : this._(
          ProfileMutationFailureKind.outcomeUnknown,
          code: code,
          remoteAccepted: remoteAccepted,
        );

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

typedef ProfileImageUploader = Future<String> Function({
  required AuthSessionOwner owner,
  required Uint8List bytes,
  required String filename,
  required String purpose,
});

/// Principal-bound coordinator for repository-owned profile and location
/// mutations. The exact token-free owner is captured during screen loading;
/// every mutation revalidates it immediately before and after the data layer.
class ProfileMutationService {
  final SessionTransitionService _sessionTransitions;
  final ProfileImageUploader? _profileImageUploader;
  final bool? _remoteProfileImageUploadEnabled;

  const ProfileMutationService({
    SessionTransitionService sessionTransitions =
        const SessionTransitionService(),
    ProfileImageUploader? profileImageUploader,
    bool? remoteProfileImageUploadEnabled,
  })  : _sessionTransitions = sessionTransitions,
        _profileImageUploader = profileImageUploader,
        _remoteProfileImageUploadEnabled = remoteProfileImageUploadEnabled;

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
      400: <String>{
        'minimum_age_required',
        'invalid_phone',
        'profile_photo_must_be_uploaded',
        'profile_photo_not_found',
        'profile_photo_not_approved',
      },
      403: <String>{'profile_photo_forbidden'},
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

  /// Turns a freshly picked local data URL into a managed public upload before
  /// it enters the server profile document. Remote profiles must never store a
  /// truncated base64 preview; local QA keeps the data URL unchanged.
  Future<String?> persistPhotoDraft({
    required ProfileMutationContext context,
    required String? photoDraft,
  }) async {
    final draft = photoDraft?.trim();
    if (draft == null || draft.isEmpty || !draft.startsWith('data:')) {
      return draft;
    }
    final remoteUploadEnabled =
        _remoteProfileImageUploadEnabled ?? BackendConfig.enabled;
    if (!remoteUploadEnabled || QaRuntimeService.isEnabled) return draft;

    final match = RegExp(
      r'^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$',
      caseSensitive: false,
    ).firstMatch(draft);
    if (match == null) {
      throw const BackendException(400, 'profile_image_invalid');
    }
    final mime = match.group(1)!.toLowerCase();
    final bytes = Uint8List.fromList(base64Decode(match.group(2)!));
    if (bytes.isEmpty || bytes.length > 8 * 1024 * 1024) {
      throw const BackendException(413, 'profile_image_too_large');
    }
    if (!await isContextCurrent(context)) {
      throw const ProfileMutationFailure.principalChanged();
    }
    final extension = switch (mime) {
      'image/png' => 'png',
      'image/webp' => 'webp',
      _ => 'jpg',
    };
    final uploader = _profileImageUploader;
    final url = uploader == null
        ? await BackendRepository.uploadImageForOwner(
            owner: context.owner.authOwner,
            bytes: bytes,
            filename: 'profile-avatar.$extension',
            purpose: 'profile_image',
          )
        : await uploader(
            owner: context.owner.authOwner,
            bytes: bytes,
            filename: 'profile-avatar.$extension',
            purpose: 'profile_image',
          );
    if (!BackendConfig.isManagedImageUrl(url) ||
        !await isContextCurrent(context)) {
      throw const ProfileMutationFailure.principalChanged();
    }
    return url;
  }

  Future<AccountProfileMutationResult> updateProfile({
    required ProfileMutationContext context,
    required Map<CurrentUserProfileField, Object?> updates,
  }) async {
    if (!await isContextCurrent(context)) {
      throw const ProfileMutationFailure.principalChanged();
    }
    var remoteAccepted = false;
    try {
      if (!await isContextCurrent(context)) {
        throw const ProfileMutationFailure.principalChanged();
      }
      final result = await performProfileMutation(
        context: context,
        updates: updates,
      );
      remoteAccepted = result.remoteAccepted;
      var resolved = result;
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        // The PATCH response is a receipt, not the long-lived projection.
        // Read the authenticated profile back through the same session owner
        // so the URL/version consumed by every identity surface is the
        // server-owned value immediately after save and after restart.
        final refreshed = await DataService.syncCurrentUserForSessionOwner(
          context.owner.authOwner,
          notificationKey: SharedPersistenceSync.profileStateKey,
        );
        if (refreshed == null) {
          throw ProfileMutationFailure.principalChanged(
            remoteAccepted: remoteAccepted,
          );
        }
        resolved = AccountProfileMutationResult(
          user: refreshed,
          remoteAccepted: remoteAccepted,
        );
      }
      if (!await isContextCurrent(context)) {
        throw ProfileMutationFailure.principalChanged(
          remoteAccepted: resolved.remoteAccepted,
        );
      }
      return resolved;
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
          ProfileMutationFailure.outcomeUnknown(
            failure.code,
            remoteAccepted: failure.remoteAccepted,
          ),
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
      throw ProfileMutationFailure.outcomeUnknown(
        error.code,
        remoteAccepted: remoteAccepted,
      );
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
