import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/planner_technical_config.dart';

void main() {
  test('participation stays default-off and requires every signed pilot gate',
      () {
    expect(
      PlannerTechnicalConfig.supplyParticipationAvailableForConfiguration(
        plannerFeatureEnabled: true,
        demandFeatureEnabled: true,
        supplyParticipationFeatureEnabled: false,
        releaseMode: true,
        signedStageAInternalEnvelope: true,
      ),
      isFalse,
    );
    expect(
      PlannerTechnicalConfig.supplyParticipationAvailableForConfiguration(
        plannerFeatureEnabled: true,
        demandFeatureEnabled: true,
        supplyParticipationFeatureEnabled: true,
        releaseMode: false,
        signedStageAInternalEnvelope: true,
      ),
      isTrue,
    );
    for (final values in <Map<String, bool>>[
      <String, bool>{
        'planner': false,
        'demand': true,
        'supply': true,
        'signed': true,
      },
      <String, bool>{
        'planner': true,
        'demand': false,
        'supply': true,
        'signed': true,
      },
      <String, bool>{
        'planner': true,
        'demand': true,
        'supply': true,
        'signed': false,
      },
    ]) {
      expect(
        PlannerTechnicalConfig.supplyParticipationAvailableForConfiguration(
          plannerFeatureEnabled: values['planner']!,
          demandFeatureEnabled: values['demand']!,
          supplyParticipationFeatureEnabled: values['supply']!,
          releaseMode: true,
          signedStageAInternalEnvelope: values['signed']!,
        ),
        isFalse,
      );
    }
  });
}
