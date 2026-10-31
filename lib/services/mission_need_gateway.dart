import 'package:lendify/models/mission_need.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_repository.dart';

class MissionNeedWriteResult {
  const MissionNeedWriteResult({
    required this.missionNeed,
    required this.replayed,
  });

  final MissionNeed missionNeed;
  final bool replayed;
}

abstract class MissionNeedGateway {
  Future<List<MissionNeed>> list(AuthSessionOwner owner);

  Future<MissionNeed> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
  });

  Future<MissionNeedWriteResult> create({
    required AuthSessionOwner owner,
    required MissionNeedPayload payload,
    required String idempotencyKey,
  });

  Future<MissionNeedWriteResult> correct({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required int expectedRevision,
    required MissionNeedPayload payload,
    required String idempotencyKey,
  });
}

class BackendMissionNeedGateway implements MissionNeedGateway {
  const BackendMissionNeedGateway();

  @override
  Future<List<MissionNeed>> list(AuthSessionOwner owner) async {
    final rows = await BackendRepository.getMissionNeedsForOwner(owner);
    return rows.map(MissionNeed.fromJson).toList(growable: false);
  }

  @override
  Future<MissionNeed> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
  }) async {
    final value = await BackendRepository.getMissionNeedForOwner(
      owner: owner,
      missionNeedId: missionNeedId,
    );
    return MissionNeed.fromJson(value);
  }

  @override
  Future<MissionNeedWriteResult> create({
    required AuthSessionOwner owner,
    required MissionNeedPayload payload,
    required String idempotencyKey,
  }) async {
    final response = await BackendRepository.createMissionNeedForOwner(
      owner: owner,
      payload: payload.toJson(),
      idempotencyKey: idempotencyKey,
    );
    return _writeResult(response);
  }

  @override
  Future<MissionNeedWriteResult> correct({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required int expectedRevision,
    required MissionNeedPayload payload,
    required String idempotencyKey,
  }) async {
    final response = await BackendRepository.correctMissionNeedForOwner(
      owner: owner,
      missionNeedId: missionNeedId,
      expectedRevision: expectedRevision,
      payload: payload.toJson(),
      idempotencyKey: idempotencyKey,
    );
    return _writeResult(response);
  }

  MissionNeedWriteResult _writeResult(Map<String, dynamic> response) {
    if (response['missionNeed'] is! Map || response['replayed'] is! bool) {
      throw const FormatException('mission_need_write_result_invalid');
    }
    return MissionNeedWriteResult(
      missionNeed: MissionNeed.fromJson(response['missionNeed']),
      replayed: response['replayed'] as bool,
    );
  }
}
