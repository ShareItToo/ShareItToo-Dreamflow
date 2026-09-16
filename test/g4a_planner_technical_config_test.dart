import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/planner_technical_config.dart';

void main() {
  test('G4A planner stays unavailable by default and in release mode', () {
    expect(PlannerTechnicalConfig.enabled, isFalse);
    expect(PlannerTechnicalConfig.publicReleaseAllowed, isFalse);
    expect(PlannerTechnicalConfig.externalGenerativeAiAllowed, isFalse);
    expect(PlannerTechnicalConfig.inventoryResolutionAllowed, isFalse);
    expect(
      PlannerTechnicalConfig.availableForMode(releaseMode: false),
      isFalse,
    );
    expect(
      PlannerTechnicalConfig.availableForMode(releaseMode: true),
      isFalse,
    );
    expect(
      PlannerTechnicalConfig.availableForConfiguration(
        featureEnabled: true,
        releaseMode: true,
        signedStageAInternalEnvelope: false,
      ),
      isFalse,
    );
    expect(
      PlannerTechnicalConfig.availableForConfiguration(
        featureEnabled: true,
        releaseMode: true,
        signedStageAInternalEnvelope: true,
      ),
      isTrue,
    );
  });
}
