import 'package:flutter/foundation.dart';

import 'private_pilot_config.dart';

/// G3 multi-item work remains a closed-pilot technical path.
///
/// A release build can expose it only inside the exact signed Stage-A
/// Internal/Staging envelope. Public activation remains impossible.
class BookingGroupTechnicalConfig {
  static const bool enabled = bool.fromEnvironment(
    'SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED',
    defaultValue: false,
  );

  static const bool publicReleaseAllowed = bool.fromEnvironment(
    'SIT_BOOKING_GROUPS_PUBLIC_RELEASE_ALLOWED',
    defaultValue: false,
  );

  static bool get available => availableForMode(releaseMode: kReleaseMode);

  @visibleForTesting
  static bool availableForMode({required bool releaseMode}) {
    return availableForConfiguration(
      featureEnabled: enabled,
      releaseMode: releaseMode,
      signedStageAInternalEnvelope:
          PrivatePilotConfig.signedStageAInternalEnvelopeEnabled,
    );
  }

  @visibleForTesting
  static bool availableForConfiguration({
    required bool featureEnabled,
    required bool releaseMode,
    required bool signedStageAInternalEnvelope,
  }) {
    return !publicReleaseAllowed &&
        PrivatePilotConfig.technicalSurfaceAvailableFor(
          featureEnabled: featureEnabled,
          releaseMode: releaseMode,
          signedStageAInternalEnvelope: signedStageAInternalEnvelope,
        );
  }
}
