import 'package:lendify/models/mission_fit_check.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';

class MissionFitCheckWriteResult {
  const MissionFitCheckWriteResult({
    required this.fitCheck,
    required this.replayed,
  });

  final MissionFitCheck fitCheck;
  final bool replayed;
}

abstract class MissionFitCheckGateway {
  Future<List<MissionFitCheck>> list({
    required AuthSessionOwner owner,
    required String missionNeedId,
  });

  Future<MissionFitCheck> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String fitCheckId,
  });

  Future<MissionFitCheckWriteResult> create({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required MissionFitCheckDraft draft,
    required String idempotencyKey,
  });

  Future<MissionFitCheckWriteResult> correct({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String fitCheckId,
    required int expectedRevision,
    required MissionFitCheckDraft draft,
    required String idempotencyKey,
  });
}

typedef MissionFitCheckOwnerCheck = Future<bool> Function(
  AuthSessionOwner owner,
);

class BackendMissionFitCheckGateway implements MissionFitCheckGateway {
  const BackendMissionFitCheckGateway({
    MissionFitCheckOwnerCheck ownerCheck =
        AuthService.isSessionOwnerDefinitelyCurrent,
  }) : _ownerCheck = ownerCheck;

  final MissionFitCheckOwnerCheck _ownerCheck;

  Future<void> _requireCurrent(AuthSessionOwner owner) async {
    if (!await _ownerCheck(owner)) {
      throw const BackendException(409, 'principal_changed');
    }
  }

  @override
  Future<List<MissionFitCheck>> list({
    required AuthSessionOwner owner,
    required String missionNeedId,
  }) async {
    await _requireCurrent(owner);
    final rows = await BackendRepository.getMissionFitChecksForOwner(
      owner: owner,
      missionNeedId: missionNeedId,
    );
    await _requireCurrent(owner);
    final checks = rows.map(MissionFitCheck.fromJson).toList(growable: false);
    if (checks.any((check) => check.missionNeedId != missionNeedId)) {
      throw const FormatException('mission_fit_check_mission_binding_invalid');
    }
    return checks;
  }

  @override
  Future<MissionFitCheck> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String fitCheckId,
  }) async {
    await _requireCurrent(owner);
    final value = await BackendRepository.getMissionFitCheckForOwner(
      owner: owner,
      fitCheckId: fitCheckId,
    );
    await _requireCurrent(owner);
    final check = MissionFitCheck.fromJson(value);
    if (check.missionNeedId != missionNeedId) {
      throw const FormatException('mission_fit_check_mission_binding_invalid');
    }
    return check;
  }

  @override
  Future<MissionFitCheckWriteResult> create({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required MissionFitCheckDraft draft,
    required String idempotencyKey,
  }) async {
    await _requireCurrent(owner);
    final response = await BackendRepository.createMissionFitCheckForOwner(
      owner: owner,
      missionNeedId: missionNeedId,
      payload: draft.toJson(),
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    return _writeResult(
      response,
      missionNeedId: missionNeedId,
      shelfItemId: draft.shelfItemId,
    );
  }

  @override
  Future<MissionFitCheckWriteResult> correct({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String fitCheckId,
    required int expectedRevision,
    required MissionFitCheckDraft draft,
    required String idempotencyKey,
  }) async {
    await _requireCurrent(owner);
    final response = await BackendRepository.correctMissionFitCheckForOwner(
      owner: owner,
      fitCheckId: fitCheckId,
      expectedRevision: expectedRevision,
      payload: draft.toJson(),
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    return _writeResult(
      response,
      missionNeedId: missionNeedId,
      shelfItemId: draft.shelfItemId,
      fitCheckId: fitCheckId,
    );
  }

  MissionFitCheckWriteResult _writeResult(
    Map<String, dynamic> response, {
    required String missionNeedId,
    required String shelfItemId,
    String? fitCheckId,
  }) {
    if (response.length != 2 ||
        response['fitCheck'] is! Map ||
        response['replayed'] is! bool) {
      throw const FormatException('mission_fit_check_write_result_invalid');
    }
    final check = MissionFitCheck.fromJson(response['fitCheck']);
    if (check.missionNeedId != missionNeedId ||
        check.shelfItemId != shelfItemId ||
        (fitCheckId != null && check.fitCheckId != fitCheckId)) {
      throw const FormatException('mission_fit_check_write_binding_invalid');
    }
    return MissionFitCheckWriteResult(
      fitCheck: check,
      replayed: response['replayed'] as bool,
    );
  }
}
