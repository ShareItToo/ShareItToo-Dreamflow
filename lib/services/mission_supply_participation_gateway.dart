import 'package:lendify/models/mission_supply_participation.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';

abstract class MissionSupplyParticipationGateway {
  Future<MissionSupplyParticipationSnapshot> load(AuthSessionOwner owner);

  Future<MissionSupplyParticipationWriteResult> setParticipation({
    required AuthSessionOwner owner,
    required MissionSupplyParticipationStatus status,
    required int expectedRevision,
    required String idempotencyKey,
  });

  Future<MissionSupplyParticipationWriteResult> setItem({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required MissionSupplyParticipationAvailability availabilityStatus,
    required int expectedParticipationRevision,
    required int expectedRevision,
    required String idempotencyKey,
  });
}

typedef MissionSupplyParticipationOwnerCheck = Future<bool> Function(
  AuthSessionOwner owner,
);

class BackendMissionSupplyParticipationGateway
    implements MissionSupplyParticipationGateway {
  const BackendMissionSupplyParticipationGateway({
    MissionSupplyParticipationOwnerCheck ownerCheck =
        AuthService.isSessionOwnerDefinitelyCurrent,
  }) : _ownerCheck = ownerCheck;

  final MissionSupplyParticipationOwnerCheck _ownerCheck;

  Future<void> _requireCurrent(AuthSessionOwner owner) async {
    if (!await _ownerCheck(owner)) {
      throw const BackendException(409, 'principal_changed');
    }
  }

  @override
  Future<MissionSupplyParticipationSnapshot> load(
    AuthSessionOwner owner,
  ) async {
    await _requireCurrent(owner);
    final response =
        await BackendRepository.getMissionSupplyParticipationForOwner(owner);
    await _requireCurrent(owner);
    return MissionSupplyParticipationSnapshot.fromJson(response);
  }

  @override
  Future<MissionSupplyParticipationWriteResult> setParticipation({
    required AuthSessionOwner owner,
    required MissionSupplyParticipationStatus status,
    required int expectedRevision,
    required String idempotencyKey,
  }) async {
    await _requireCurrent(owner);
    final response =
        await BackendRepository.setMissionSupplyParticipationForOwner(
      owner: owner,
      payload: <String, dynamic>{
        'expectedRevision': expectedRevision,
        'status': status.name,
      },
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    final result = MissionSupplyParticipationWriteResult.fromJson(response);
    final participation = result.snapshot.participation;
    if (participation == null ||
        result.command.status != status.name ||
        result.command.revision != expectedRevision + 1 ||
        participation.currentRevision != expectedRevision + 1) {
      throw const FormatException(
          'mission_supply_participation_write_binding_invalid');
    }
    return result;
  }

  @override
  Future<MissionSupplyParticipationWriteResult> setItem({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required MissionSupplyParticipationAvailability availabilityStatus,
    required int expectedParticipationRevision,
    required int expectedRevision,
    required String idempotencyKey,
  }) async {
    await _requireCurrent(owner);
    final response =
        await BackendRepository.setMissionSupplyParticipationItemForOwner(
      owner: owner,
      shelfItemId: shelfItemId,
      payload: <String, dynamic>{
        'expectedParticipationRevision': expectedParticipationRevision,
        'expectedRevision': expectedRevision,
        'needKey': missionSupplyParticipationNeedKey,
        'availabilityStatus': availabilityStatus ==
                MissionSupplyParticipationAvailability.confirmedAvailable
            ? 'confirmed_available'
            : 'withdrawn',
      },
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    final result = MissionSupplyParticipationWriteResult.fromJson(response);
    final participation = result.snapshot.participation;
    MissionSupplyParticipationItem? returnedItem;
    for (final item
        in participation?.items ?? const <MissionSupplyParticipationItem>[]) {
      if (item.shelfItemId == shelfItemId &&
          item.needKey == missionSupplyParticipationNeedKey) {
        returnedItem = item;
        break;
      }
    }
    final expectedStatus = availabilityStatus ==
            MissionSupplyParticipationAvailability.confirmedAvailable
        ? 'confirmed_available'
        : 'withdrawn';
    if (participation == null ||
        result.command.shelfItemId != shelfItemId ||
        result.command.needKey != missionSupplyParticipationNeedKey ||
        result.command.status != expectedStatus ||
        result.command.revision != expectedRevision + 1 ||
        participation.currentRevision != expectedParticipationRevision ||
        returnedItem == null ||
        returnedItem.revision != expectedRevision + 1 ||
        (returnedItem.availabilityStatus ==
                    MissionSupplyParticipationAvailability.confirmedAvailable
                ? 'confirmed_available'
                : 'withdrawn') !=
            expectedStatus) {
      throw const FormatException(
          'mission_supply_participation_item_binding_invalid');
    }
    return result;
  }
}
