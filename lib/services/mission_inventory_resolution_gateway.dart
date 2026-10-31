import 'package:lendify/models/mission_inventory_resolution.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';

class MissionInventoryWriteResult {
  const MissionInventoryWriteResult({
    required this.resolution,
    required this.replayed,
  });

  final MissionInventoryResolution resolution;
  final bool replayed;
}

abstract class MissionInventoryResolutionGateway {
  Future<List<MissionInventoryResolution>> list({
    required AuthSessionOwner owner,
    required String missionNeedId,
  });

  Future<MissionInventoryResolution> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String resolutionId,
  });

  Future<MissionInventoryWriteResult> create({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required MissionInventoryDraft draft,
    required String idempotencyKey,
  });

  Future<MissionInventoryWriteResult> correct({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String resolutionId,
    required MissionInventoryDraft draft,
    required String idempotencyKey,
  });
}

typedef MissionInventoryOwnerCheck = Future<bool> Function(
  AuthSessionOwner owner,
);

class BackendMissionInventoryResolutionGateway
    implements MissionInventoryResolutionGateway {
  const BackendMissionInventoryResolutionGateway({
    MissionInventoryOwnerCheck ownerCheck =
        AuthService.isSessionOwnerDefinitelyCurrent,
  }) : _ownerCheck = ownerCheck;

  final MissionInventoryOwnerCheck _ownerCheck;

  Future<void> _requireCurrent(AuthSessionOwner owner) async {
    if (!await _ownerCheck(owner)) {
      throw const BackendException(409, 'principal_changed');
    }
  }

  @override
  Future<List<MissionInventoryResolution>> list({
    required AuthSessionOwner owner,
    required String missionNeedId,
  }) async {
    await _requireCurrent(owner);
    final rows = await BackendRepository.getMissionInventoryForOwner(
      owner: owner,
      missionNeedId: missionNeedId,
    );
    await _requireCurrent(owner);
    final resolutions =
        rows.map(MissionInventoryResolution.fromJson).toList(growable: false);
    if (resolutions.length > 1 ||
        resolutions.any((entry) => entry.missionNeedId != missionNeedId)) {
      throw const FormatException('mission_inventory_list_binding_invalid');
    }
    return resolutions;
  }

  @override
  Future<MissionInventoryResolution> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String resolutionId,
  }) async {
    await _requireCurrent(owner);
    final value = await BackendRepository.getMissionInventoryResolutionForOwner(
      owner: owner,
      resolutionId: resolutionId,
    );
    await _requireCurrent(owner);
    final resolution = MissionInventoryResolution.fromJson(value);
    if (resolution.missionNeedId != missionNeedId ||
        resolution.resolutionId != resolutionId) {
      throw const FormatException('mission_inventory_read_binding_invalid');
    }
    return resolution;
  }

  @override
  Future<MissionInventoryWriteResult> create({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required MissionInventoryDraft draft,
    required String idempotencyKey,
  }) async {
    if (draft.expectedRevision != null) {
      throw const FormatException('mission_inventory_create_draft_invalid');
    }
    await _requireCurrent(owner);
    final response = await BackendRepository.createMissionInventoryForOwner(
      owner: owner,
      missionNeedId: missionNeedId,
      payload: draft.toJson(),
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    return _writeResult(
      response,
      missionNeedId: missionNeedId,
      draft: draft,
    );
  }

  @override
  Future<MissionInventoryWriteResult> correct({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String resolutionId,
    required MissionInventoryDraft draft,
    required String idempotencyKey,
  }) async {
    if (draft.expectedRevision == null) {
      throw const FormatException('mission_inventory_correction_draft_invalid');
    }
    await _requireCurrent(owner);
    final response = await BackendRepository.correctMissionInventoryForOwner(
      owner: owner,
      resolutionId: resolutionId,
      payload: draft.toJson(),
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    return _writeResult(
      response,
      missionNeedId: missionNeedId,
      resolutionId: resolutionId,
      draft: draft,
    );
  }

  MissionInventoryWriteResult _writeResult(
    Map<String, dynamic> response, {
    required String missionNeedId,
    required MissionInventoryDraft draft,
    String? resolutionId,
  }) {
    if (response.length != 2 ||
        response['resolution'] is! Map ||
        response['replayed'] is! bool) {
      throw const FormatException('mission_inventory_write_result_invalid');
    }
    final resolution = MissionInventoryResolution.fromJson(
      response['resolution'],
    );
    if (resolution.missionNeedId != missionNeedId ||
        (resolutionId != null && resolution.resolutionId != resolutionId) ||
        resolution.missionRevision != draft.missionRevision ||
        resolution.missionPayloadDigest != draft.missionPayloadDigest ||
        resolution.startDate != draft.startDate.toUtc() ||
        resolution.endDate != draft.endDate.toUtc() ||
        resolution.locationSnapshot.radiusKm != draft.radiusKm ||
        resolution.locationSnapshot.sourceVersion !=
            draft.locationSourceVersion ||
        (draft.expectedRevision != null &&
            resolution.revision != draft.expectedRevision! + 1)) {
      throw const FormatException('mission_inventory_write_binding_invalid');
    }
    return MissionInventoryWriteResult(
      resolution: resolution,
      replayed: response['replayed'] as bool,
    );
  }
}
