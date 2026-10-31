import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/qa_runtime_service.dart';

/// Local-only blocked-users store.
///
/// Keeps a list of user ids that are blocked from contacting the current user.
/// (No backend connected.)
class BlockedUsersService {
  @visibleForTesting
  static bool shouldUseRemoteStore({
    required bool backendEnabled,
    required bool qaRuntimeEnabled,
    required bool hasAuthenticatedSession,
  }) =>
      backendEnabled && !qaRuntimeEnabled && hasAuthenticatedSession;

  static Future<bool> _useRemoteStore() async {
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) return false;
    return shouldUseRemoteStore(
      backendEnabled: true,
      qaRuntimeEnabled: false,
      hasAuthenticatedSession: await AuthService.readSession() != null,
    );
  }

  static Future<List<String>> getBlockedUserIds() async {
    if (await _useRemoteStore()) {
      final remote = await BackendRepository.getBlockedUserIds();
      await setBlockedUserIds(remote);
      return remote;
    }
    return LocalSafetyPrivacyService.getBlockedUserIds();
  }

  /// Reads the overlay for the exact principal that owns a public-catalog
  /// request. Remote results are cached only into that principal's local
  /// namespace; a delayed A response can never be stored as B's block list.
  static Future<List<String>> getBlockedUserIdsForOwner(
    LocalPrincipalActionOwner owner,
  ) async {
    await owner.assertCurrent();
    final sessionOwner = owner.sessionOwner;
    if (BackendConfig.enabled &&
        !QaRuntimeService.isEnabled &&
        sessionOwner != null) {
      final remote = await BackendRepository.getBlockedUserIdsForOwner(
        sessionOwner,
      );
      await owner.assertCurrent();
      await LocalSafetyPrivacyService.setBlockedUserIdsForPrincipal(
        owner.principal,
        remote,
      );
      await owner.assertCurrent();
      return remote;
    }

    final local = await LocalSafetyPrivacyService.getBlockedUserIdsForPrincipal(
      owner.principal,
    );
    await owner.assertCurrent();
    return local;
  }

  static Future<void> setBlockedUserIds(List<String> ids) =>
      LocalSafetyPrivacyService.setBlockedUserIds(ids);

  static Future<bool> isBlocked(String userId) async {
    final id = userId.trim();
    if (id.isEmpty) return false;
    final current = await getBlockedUserIds();
    return current.contains(id);
  }

  static Future<void> blockUser(String userId) async {
    final id = userId.trim();
    if (id.isEmpty) return;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      await BackendRepository.blockUser(id);
    }
    await LocalSafetyPrivacyService.blockUser(id);
  }

  static Future<void> unblockUser(String userId) async {
    final id = userId.trim();
    if (id.isEmpty) return;
    if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
      await BackendRepository.unblockUser(id);
    }
    await LocalSafetyPrivacyService.unblockUser(id);
  }
}
