import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mission_supply_demand.dart';

import 'support/mission_supply_demand_builders.dart';

void main() {
  test('strict requester and recipient shapes preserve role privacy', () {
    final requester =
        MissionSupplyDemand.fromJson(testMissionSupplyDemandJson());
    expect(requester.role, MissionSupplyDemandRole.requester);
    expect(requester.resolutionId, testMissionSupplyResolutionId);

    final recipient = MissionSupplyDemand.fromJson(testMissionSupplyDemandJson(
      role: MissionSupplyDemandRole.recipient,
    ));
    expect(recipient.role, MissionSupplyDemandRole.recipient);
    expect(recipient.missionNeedId, isNull);
    expect(recipient.resolutionId, isNull);
    expect(recipient.slotKey, isNull);
  });

  test('rejects private recipient additions and non-false effects', () {
    for (final key in <String>[
      'missionNeedId',
      'resolutionId',
      'slotKey',
      'recipientOwnerId',
      'shelfItemId',
      'photos',
      'coordinateDigest',
      'sourceVersion',
      'address',
    ]) {
      final value = testMissionSupplyDemandJson(
        role: MissionSupplyDemandRole.recipient,
      )..[key] = key == 'resolutionRevision' ? 1 : 'private';
      expect(() => MissionSupplyDemand.fromJson(value), throwsFormatException);
    }
    final effect = testMissionSupplyDemandJson()..['bookingCreated'] = true;
    expect(() => MissionSupplyDemand.fromJson(effect), throwsFormatException);
  });

  test('status and release truth are fail-closed', () {
    final released = MissionSupplyDemand.fromJson(testMissionSupplyDemandJson(
      role: MissionSupplyDemandRole.recipient,
      status: MissionSupplyDemandStatus.released,
      revision: 2,
    ));
    expect(released.mayRevoke, isTrue);
    expect(released.mayRespond, isFalse);
    final expired = MissionSupplyDemand.fromJson(testMissionSupplyDemandJson(
      role: MissionSupplyDemandRole.recipient,
      status: MissionSupplyDemandStatus.expiredNoResponse,
    ));
    expect(expired.mayRespond, isFalse);
    expect(expired.mayRevoke, isFalse);

    final missingRelease = testMissionSupplyDemandJson(
      status: MissionSupplyDemandStatus.released,
      revision: 2,
    )..['requestBoundRelease'] = null;
    expect(() => MissionSupplyDemand.fromJson(missingRelease),
        throwsFormatException);
  });

  test('demand and release ids require exact backend UUID forms', () {
    final malformedDemand = testMissionSupplyDemandJson()
      ..['demandId'] = 'mission_demand_11111111-1111-1111-1111-111111111111';
    expect(() => MissionSupplyDemand.fromJson(malformedDemand),
        throwsFormatException);

    final malformedRelease = testMissionSupplyDemandJson(
      role: MissionSupplyDemandRole.recipient,
      status: MissionSupplyDemandStatus.released,
      revision: 2,
    );
    (malformedRelease['requestBoundRelease']
            as Map<String, dynamic>)['releaseId'] =
        'mission_release_22222222-2222-2222-2222-222222222222';
    expect(() => MissionSupplyDemand.fromJson(malformedRelease),
        throwsFormatException);
  });

  test('period, quantity, region and timestamp contracts are exact', () {
    final cases = <void Function(Map<String, dynamic>)>[
      (value) => (value['need'] as Map<String, dynamic>)['quantity'] = 2,
      (value) => (value['region'] as Map<String, dynamic>)['radiusKm'] = 501,
      (value) => (value['region'] as Map<String, dynamic>)['latitude'] = 49.1,
      (value) =>
          (value['period'] as Map<String, dynamic>)['endDate'] = '2026-11-10',
      (value) => value['updatedAt'] = '2026-10-01T11:00:00.000Z',
    ];
    for (final mutate in cases) {
      final value = testMissionSupplyDemandJson();
      mutate(value);
      expect(() => MissionSupplyDemand.fromJson(value), throwsFormatException);
    }
  });
}
