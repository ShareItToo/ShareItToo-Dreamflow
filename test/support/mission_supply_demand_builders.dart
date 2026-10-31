import 'package:lendify/models/mission_supply_demand.dart';

const String testMissionSupplyDemandId =
    'mission_demand_11111111-1111-4111-8111-111111111111';
const String testMissionSupplyReleaseId =
    'mission_release_22222222-2222-4222-8222-222222222222';
const String testMissionSupplyMissionId =
    'mission_need_33333333-3333-4333-8333-333333333333';
const String testMissionSupplyResolutionId =
    'mission_inventory_44444444-4444-4444-8444-444444444444';
const String testMissionSupplySlotKey = 'required:plant_container_equipment:2';

Map<String, dynamic> testMissionSupplyDemandJson({
  MissionSupplyDemandRole role = MissionSupplyDemandRole.requester,
  MissionSupplyDemandStatus status = MissionSupplyDemandStatus.pending,
  int revision = 1,
  String demandId = testMissionSupplyDemandId,
  String resolutionId = testMissionSupplyResolutionId,
  String slotKey = testMissionSupplySlotKey,
}) {
  final hasRelease = status == MissionSupplyDemandStatus.released ||
      status == MissionSupplyDemandStatus.revoked;
  final statusName = switch (status) {
    MissionSupplyDemandStatus.pending => 'pending',
    MissionSupplyDemandStatus.rejected => 'rejected',
    MissionSupplyDemandStatus.released => 'released',
    MissionSupplyDemandStatus.revoked => 'revoked',
    MissionSupplyDemandStatus.expiredNoResponse => 'expired_no_response',
  };
  return <String, dynamic>{
    'demandId': demandId,
    'domainVersion': missionSupplyDemandDomainVersion,
    'participantRole': role.name,
    if (role == MissionSupplyDemandRole.requester) ...<String, dynamic>{
      'missionNeedId': testMissionSupplyMissionId,
      'resolutionId': resolutionId,
      'resolutionRevision': 1,
      'slotKey': slotKey,
    },
    'need': <String, dynamic>{
      'needKey': 'plant_container_equipment',
      'necessity': 'required',
      'quantity': 1,
    },
    'period': <String, dynamic>{
      'startDate': '2026-11-10',
      'endDate': '2026-11-12',
    },
    'region': <String, dynamic>{
      'sourceType': 'owner_confirmed_search_origin',
      'radiusKm': 25,
      'exactCoordinatesStored': false,
    },
    'purpose': missionSupplyDemandPurpose,
    'revision': revision,
    'status': statusName,
    'expiresAt': '2026-11-09T12:00:00.000Z',
    'requestBoundRelease': hasRelease
        ? <String, dynamic>{
            'releaseId': testMissionSupplyReleaseId,
            'purpose': missionSupplyDemandPurpose,
            'expiresAt': '2026-11-09T12:00:00.000Z',
            'visibilityStatus': status == MissionSupplyDemandStatus.revoked
                ? 'revoked'
                : 'active',
            'createdAt': '2026-10-01T12:05:00.000Z',
          }
        : null,
    'createdAt': '2026-10-01T12:00:00.000Z',
    'updatedAt': '2026-10-01T12:05:00.000Z',
    'publicShelfCreated': false,
    'publicListingCreated': false,
    'marketingContactCreated': false,
    'notificationCreated': false,
    'providerNotificationSent': false,
    'automaticPublicationPerformed': false,
    'reservationCreated': false,
    'bookingCreated': false,
    'contractCreated': false,
    'paymentCreated': false,
    'externalGenerativeAiUsed': false,
  };
}
