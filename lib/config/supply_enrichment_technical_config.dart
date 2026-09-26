import 'package:flutter/foundation.dart';

import 'private_pilot_config.dart';

/// G5A is a closed-pilot path for deterministic post-listing questions.
///
/// It may be exposed by the exact signed Stage-A Internal/Staging envelope and
/// has no external-AI or public-release switch.
class SupplyEnrichmentTechnicalConfig {
  static const bool enabled = bool.fromEnvironment(
    'SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED',
    defaultValue: false,
  );

  static const bool publicReleaseAllowed = false;
  static const bool externalGenerativeAiAllowed = false;

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
        !externalGenerativeAiAllowed &&
        PrivatePilotConfig.technicalSurfaceAvailableFor(
          featureEnabled: featureEnabled,
          releaseMode: releaseMode,
          signedStageAInternalEnvelope: signedStageAInternalEnvelope,
        );
  }
}
