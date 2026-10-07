/// Compile-time safety envelope for the isolated synthetic booking lane.
///
/// The lane is never enabled by a default or by a runtime response. A build
/// must opt in explicitly and must also be backed by the isolated local QA
/// endpoint used by the canonical local candidate.
abstract final class SyntheticCloneConfig {
  static const String isolatedLocalQaEndpoint =
      'http://127.0.0.1:18080/api/v1';

  static const bool requested = bool.fromEnvironment(
    'SIT_SYNTHETIC_CLONE_BOOKING_LANE',
    defaultValue: false,
  );

  static const bool backendEnabled = bool.fromEnvironment(
    'SIT_BACKEND_ENABLED',
    defaultValue: false,
  );

  static const String releaseChannel = String.fromEnvironment(
    'SIT_RELEASE_CHANNEL',
    defaultValue: 'development',
  );

  static const String apiBaseUrl = String.fromEnvironment(
    'SIT_API_BASE_URL',
    defaultValue: 'https://shareittoo.com/api/v1',
  );

  static bool configurationAllowed({
    required bool requested,
    required bool backendEnabled,
    required String releaseChannel,
    required String apiBaseUrl,
  }) {
    if (!requested) return true;
    if (!backendEnabled) return false;
    if (releaseChannel.trim().toLowerCase() != 'internal') {
      return false;
    }

    return apiBaseUrl.trim() == isolatedLocalQaEndpoint;
  }

  static String? configurationErrorFor({
    required bool requested,
    required bool backendEnabled,
    required String releaseChannel,
    required String apiBaseUrl,
  }) {
    if (!requested) return null;
    if (!backendEnabled) return 'backend_required';
    if (releaseChannel.trim().toLowerCase() != 'internal') {
      return 'internal_channel_required';
    }
    if (apiBaseUrl.trim() != isolatedLocalQaEndpoint) {
      return 'isolated_local_qa_endpoint_required';
    }
    return null;
  }

  static void validateBuild({
    required bool requested,
    required bool backendEnabled,
    required String releaseChannel,
    required String apiBaseUrl,
  }) {
    final error = configurationErrorFor(
      requested: requested,
      backendEnabled: backendEnabled,
      releaseChannel: releaseChannel,
      apiBaseUrl: apiBaseUrl,
    );
    if (error != null) {
      throw StateError('Invalid synthetic clone build configuration: $error');
    }
  }

  static void validateCurrentBuild() {
    validateBuild(
      requested: requested,
      backendEnabled: backendEnabled,
      releaseChannel: releaseChannel,
      apiBaseUrl: apiBaseUrl,
    );
  }

  static bool get isSyntheticCloneNonBinding =>
      requested &&
      configurationAllowed(
        requested: requested,
        backendEnabled: backendEnabled,
        releaseChannel: releaseChannel,
        apiBaseUrl: apiBaseUrl,
      );

  static String? get configurationError => configurationErrorFor(
    requested: requested,
    backendEnabled: backendEnabled,
    releaseChannel: releaseChannel,
    apiBaseUrl: apiBaseUrl,
  );

  static bool reviewActionsAvailableFor({required bool syntheticClone}) =>
      !syntheticClone;

  static bool get reviewActionsEnabled =>
      reviewActionsAvailableFor(syntheticClone: isSyntheticCloneNonBinding);
}

/// One centralized guard for every clone-only review/rating/reminder action.
bool get isSyntheticCloneNonBinding =>
    SyntheticCloneConfig.isSyntheticCloneNonBinding;
