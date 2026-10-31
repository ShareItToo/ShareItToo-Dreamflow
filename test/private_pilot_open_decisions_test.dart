import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/private_pilot_config.dart';

void main() {
  test('all six V4 questions carry an explicit V5.1 successor and source', () {
    expect(PrivatePilotConfig.openDecisions, hasLength(6));
    expect(
      PrivatePilotConfig.openDecisions.map((entry) => entry.id),
      orderedEquals(const [
        'platform_contract_and_withdrawal_timing',
        'withdrawal_effect_on_private_rental',
        'cancellation_50_100_or_30_50',
        'marketplace_psp_mechanics',
        'missing_return_confirmation_window',
        'handover_photo_workflow',
      ]),
    );
    for (final entry in PrivatePilotConfig.openDecisions) {
      expect(entry.status, 'superseded_by_v51');
      expect(entry.interimRule, isNotEmpty);
      expect(entry.updateAuthority, isNotEmpty);
      expect(entry.activeForInternalTesting, isTrue);
    }
    expect(
      PrivatePilotConfig.interimPolicyVersion,
      'V5.1-2026-08-16',
    );
    expect(
      PrivatePilotConfig.interimPolicyScope,
      'internal-and-closed-testing-only',
    );
    expect(PrivatePilotConfig.replaceInterimRulesOnUserInstruction, isTrue);
    expect(PrivatePilotConfig.realPaymentsEnabled, isFalse);
    expect(
      PrivatePilotConfig.openDecisions
          .where((entry) => entry.blocksLiveActivation)
          .map((entry) => entry.id),
      orderedEquals(const [
        'platform_contract_and_withdrawal_timing',
        'withdrawal_effect_on_private_rental',
        'cancellation_50_100_or_30_50',
        'marketplace_psp_mechanics',
      ]),
    );
  });
}
