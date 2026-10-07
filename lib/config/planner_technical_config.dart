import 'package:flutter/foundation.dart';

import 'private_pilot_config.dart';

/// G4 planner work remains a closed-pilot deterministic technical path.
///
/// G4A/G4B may be exposed only by the exact signed Stage-A Internal/Staging
/// envelope. External generative AI and public release remain unavailable.
class PlannerTechnicalConfig {
  static const bool enabled = bool.fromEnvironment(
    'SIT_PLANNER_TECHNICAL_UI_ENABLED',
    defaultValue: false,
  );

  static const bool demandEnabled = bool.fromEnvironment(
    'SIT_PLANNER_DEMAND_UI_ENABLED',
    defaultValue: false,
  );

  /// Owner participation remains a separate, explicitly opt-in technical
  /// surface. It never activates demand resolution or public release.
  static const bool supplyParticipationEnabled = bool.fromEnvironment(
    'SIT_PLANNER_SUPPLY_PARTICIPATION_UI_ENABLED',
    defaultValue: false,
  );

  static const bool publicReleaseAllowed = false;
  static const bool externalGenerativeAiAllowed = false;
  static const bool inventoryResolutionAllowed = false;

  static bool get available => availableForMode(releaseMode: kReleaseMode);
  static bool get demandAvailable =>
      demandAvailableForMode(releaseMode: kReleaseMode);
  static bool get supplyParticipationAvailable =>
      supplyParticipationAvailableForMode(releaseMode: kReleaseMode);

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
        !inventoryResolutionAllowed &&
        PrivatePilotConfig.technicalSurfaceAvailableFor(
          featureEnabled: featureEnabled,
          releaseMode: releaseMode,
          signedStageAInternalEnvelope: signedStageAInternalEnvelope,
        );
  }

  @visibleForTesting
  static bool demandAvailableForMode({required bool releaseMode}) {
    return demandAvailableForConfiguration(
      plannerFeatureEnabled: enabled,
      demandFeatureEnabled: demandEnabled,
      releaseMode: releaseMode,
      signedStageAInternalEnvelope:
          PrivatePilotConfig.signedStageAInternalEnvelopeEnabled,
    );
  }

  @visibleForTesting
  static bool demandAvailableForConfiguration({
    required bool plannerFeatureEnabled,
    required bool demandFeatureEnabled,
    required bool releaseMode,
    required bool signedStageAInternalEnvelope,
  }) {
    return demandFeatureEnabled &&
        availableForConfiguration(
          featureEnabled: plannerFeatureEnabled,
          releaseMode: releaseMode,
          signedStageAInternalEnvelope: signedStageAInternalEnvelope,
        );
  }

  @visibleForTesting
  static bool supplyParticipationAvailableForMode({required bool releaseMode}) {
    return supplyParticipationAvailableForConfiguration(
      plannerFeatureEnabled: enabled,
      demandFeatureEnabled: demandEnabled,
      supplyParticipationFeatureEnabled: supplyParticipationEnabled,
      releaseMode: releaseMode,
      signedStageAInternalEnvelope:
          PrivatePilotConfig.signedStageAInternalEnvelopeEnabled,
    );
  }

  @visibleForTesting
  static bool supplyParticipationAvailableForConfiguration({
    required bool plannerFeatureEnabled,
    required bool demandFeatureEnabled,
    required bool supplyParticipationFeatureEnabled,
    required bool releaseMode,
    required bool signedStageAInternalEnvelope,
  }) {
    return supplyParticipationFeatureEnabled &&
        demandAvailableForConfiguration(
          plannerFeatureEnabled: plannerFeatureEnabled,
          demandFeatureEnabled: demandFeatureEnabled,
          releaseMode: releaseMode,
          signedStageAInternalEnvelope: signedStageAInternalEnvelope,
        );
  }
}
