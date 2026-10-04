import 'package:lendify/models/mission_quorum_readback.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';

abstract class MissionQuorumReadbackGateway {
  Future<MissionQuorumReadback> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String resolutionId,
    required int missionRevision,
    required int resolutionRevision,
    required String missionPayloadDigest,
    required String resolutionDigest,
  });
}

typedef MissionQuorumOwnerCheck = Future<bool> Function(
  AuthSessionOwner owner,
);

class BackendMissionQuorumReadbackGateway
    implements MissionQuorumReadbackGateway {
  const BackendMissionQuorumReadbackGateway({
    MissionQuorumOwnerCheck ownerCheck =
        AuthService.isSessionOwnerDefinitelyCurrent,
  }) : _ownerCheck = ownerCheck;

  final MissionQuorumOwnerCheck _ownerCheck;

  Future<void> _requireCurrent(AuthSessionOwner owner) async {
    if (!await _ownerCheck(owner)) {
      throw const BackendException(409, 'principal_changed');
    }
  }

  @override
  Future<MissionQuorumReadback> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String resolutionId,
    required int missionRevision,
    required int resolutionRevision,
    required String missionPayloadDigest,
    required String resolutionDigest,
  }) async {
    await _requireCurrent(owner);
    final value = await BackendRepository.getMissionQuorumReadbackForOwner(
      owner: owner,
      resolutionId: resolutionId,
    );
    await _requireCurrent(owner);
    final readback = MissionQuorumReadback.fromJson(value);
    if (readback.missionNeedId != missionNeedId ||
        readback.resolutionId != resolutionId ||
        readback.missionRevision != missionRevision ||
        readback.resolutionRevision != resolutionRevision ||
        readback.missionPayloadDigest != missionPayloadDigest ||
        readback.resolutionDigest != resolutionDigest) {
      throw const FormatException('mission_quorum_readback_binding_invalid');
    }
    return readback;
  }
}
