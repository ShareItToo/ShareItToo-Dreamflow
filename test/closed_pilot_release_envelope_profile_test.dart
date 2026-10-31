import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/booking_group_technical_config.dart';
import 'package:lendify/config/listing_sets_technical_config.dart';
import 'package:lendify/config/planner_technical_config.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/config/supply_enrichment_technical_config.dart';

void main() {
  test('Stage-A checkout envelope requires exact internal Staging identity',
      () {
    const valid = <String, Object>{
      'listingAssistantEnabled': true,
      'nonBindingPilotEnabled': true,
      'pilotId': 'heilbronn_wave0',
      'releaseChannel': 'internal',
      'apiBaseUrl': 'https://staging.shareittoo.com/api/v1',
    };
    bool available(Map<String, Object> values) =>
        PrivatePilotConfig.stageANonBindingPilotAvailableFor(
          listingAssistantEnabled: values['listingAssistantEnabled']! as bool,
          nonBindingPilotEnabled: values['nonBindingPilotEnabled']! as bool,
          pilotId: values['pilotId']! as String,
          releaseChannel: values['releaseChannel']! as String,
          apiBaseUrl: values['apiBaseUrl']! as String,
        );

    expect(available(valid), isTrue);
    for (final key in valid.keys) {
      final changed = Map<String, Object>.from(valid);
      changed[key] = switch (key) {
        'listingAssistantEnabled' || 'nonBindingPilotEnabled' => false,
        'pilotId' => 'wrong_pilot',
        'releaseChannel' => 'production',
        _ => 'https://shareittoo.com/api/v1',
      };
      expect(available(changed), isFalse, reason: key);
    }
  });

  test('closed pilot profile is fail-closed or exact when explicitly selected',
      () {
    const exactProfileExpected = bool.fromEnvironment(
      'SIT_CLOSED_PILOT_PROFILE_TEST',
      defaultValue: false,
    );
    if (!exactProfileExpected) {
      expect(PrivatePilotConfig.stageAPilotId, isEmpty);
      expect(PrivatePilotConfig.blueOceanListingAssistantEnabled, isFalse);
      expect(PrivatePilotConfig.stageANonBindingPilotEnabled, isFalse);
      expect(PrivatePilotConfig.signedStageAInternalEnvelopeEnabled, isFalse);
      expect(PrivatePilotConfig.stageANonBindingPilotAvailable, isFalse);
      return;
    }

    expect(PrivatePilotConfig.stageAPilotId, 'heilbronn_wave0');
    expect(PrivatePilotConfig.blueOceanListingAssistantEnabled, isTrue);
    expect(PrivatePilotConfig.stageANonBindingPilotEnabled, isTrue);
    expect(PrivatePilotConfig.signedStageAInternalEnvelopeEnabled, isTrue);
    expect(PrivatePilotConfig.stageANonBindingPilotAvailable, isTrue);
    expect(PrivatePilotConfig.bindingCheckoutEnabled, isFalse);
    expect(PrivatePilotConfig.realPaymentsEnabled, isFalse);

    for (final available in <bool>[
      BookingGroupTechnicalConfig.availableForConfiguration(
        featureEnabled: BookingGroupTechnicalConfig.enabled,
        releaseMode: true,
        signedStageAInternalEnvelope:
            PrivatePilotConfig.signedStageAInternalEnvelopeEnabled,
      ),
      PlannerTechnicalConfig.availableForConfiguration(
        featureEnabled: PlannerTechnicalConfig.enabled,
        releaseMode: true,
        signedStageAInternalEnvelope:
            PrivatePilotConfig.signedStageAInternalEnvelopeEnabled,
      ),
      SupplyEnrichmentTechnicalConfig.availableForConfiguration(
        featureEnabled: SupplyEnrichmentTechnicalConfig.enabled,
        releaseMode: true,
        signedStageAInternalEnvelope:
            PrivatePilotConfig.signedStageAInternalEnvelopeEnabled,
      ),
      ListingSetsTechnicalConfig.availableForConfiguration(
        featureEnabled: ListingSetsTechnicalConfig.enabled,
        releaseMode: true,
        signedStageAInternalEnvelope:
            PrivatePilotConfig.signedStageAInternalEnvelopeEnabled,
      ),
    ]) {
      expect(available, isTrue);
    }

    expect(BookingGroupTechnicalConfig.publicReleaseAllowed, isFalse);
    expect(PlannerTechnicalConfig.publicReleaseAllowed, isFalse);
    expect(PlannerTechnicalConfig.externalGenerativeAiAllowed, isFalse);
    expect(SupplyEnrichmentTechnicalConfig.publicReleaseAllowed, isFalse);
    expect(
      SupplyEnrichmentTechnicalConfig.externalGenerativeAiAllowed,
      isFalse,
    );
    expect(ListingSetsTechnicalConfig.publicReleaseAllowed, isFalse);
    expect(ListingSetsTechnicalConfig.businessStatusRankingAllowed, isFalse);
    expect(ListingSetsTechnicalConfig.hiddenPriceManipulationAllowed, isFalse);
  });
}
