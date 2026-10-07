import 'package:flutter/foundation.dart';

import 'private_pilot_config.dart';

/// G5B listing sets are a closed-pilot technical path. They may be exposed by
/// the exact signed Stage-A Internal/Staging envelope but never authorize a
/// public or Production release.
class ListingSetsTechnicalConfig {
  static const bool enabled = bool.fromEnvironment(
    'SIT_LISTING_SETS_TECHNICAL_UI_ENABLED',
    defaultValue: false,
  );

  static const bool publicReleaseAllowed = false;
  static const bool fewerHandoversRankingAllowed = true;
  static const bool businessStatusRankingAllowed = false;
  static const bool hiddenPriceManipulationAllowed = false;

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
        fewerHandoversRankingAllowed &&
        !businessStatusRankingAllowed &&
        !hiddenPriceManipulationAllowed &&
        PrivatePilotConfig.technicalSurfaceAvailableFor(
          featureEnabled: featureEnabled,
          releaseMode: releaseMode,
          signedStageAInternalEnvelope: signedStageAInternalEnvelope,
        );
  }
}
