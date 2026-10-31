import 'package:lendify/models/mission_supply_demand.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';

class MissionSupplyDemandWriteResult {
  const MissionSupplyDemandWriteResult({
    required this.demand,
    required this.replayed,
  });

  final MissionSupplyDemand demand;
  final bool replayed;
}

abstract class MissionSupplyDemandGateway {
  Future<List<MissionSupplyDemand>> list(AuthSessionOwner owner);

  Future<MissionSupplyDemand> load({
    required AuthSessionOwner owner,
    required String demandId,
  });

  Future<MissionSupplyDemandWriteResult> create({
    required AuthSessionOwner owner,
    required MissionSupplyDemandCreateContext context,
    required DateTime expiresAt,
    required String idempotencyKey,
  });

  Future<MissionSupplyDemandWriteResult> respond({
    required AuthSessionOwner owner,
    required MissionSupplyDemand demand,
    required MissionSupplyDemandDecision decision,
    required String idempotencyKey,
  });

  Future<MissionSupplyDemandWriteResult> revoke({
    required AuthSessionOwner owner,
    required MissionSupplyDemand demand,
    required String idempotencyKey,
  });
}

typedef MissionSupplyDemandOwnerCheck = Future<bool> Function(
  AuthSessionOwner owner,
);

class BackendMissionSupplyDemandGateway implements MissionSupplyDemandGateway {
  const BackendMissionSupplyDemandGateway({
    MissionSupplyDemandOwnerCheck ownerCheck =
        AuthService.isSessionOwnerDefinitelyCurrent,
  }) : _ownerCheck = ownerCheck;

  final MissionSupplyDemandOwnerCheck _ownerCheck;

  Future<void> _requireCurrent(AuthSessionOwner owner) async {
    if (!await _ownerCheck(owner)) {
      throw const BackendException(409, 'principal_changed');
    }
  }

  @override
  Future<List<MissionSupplyDemand>> list(AuthSessionOwner owner) async {
    await _requireCurrent(owner);
    final rows = await BackendRepository.getMissionSupplyDemandsForOwner(owner);
    await _requireCurrent(owner);
    final demands =
        rows.map(MissionSupplyDemand.fromJson).toList(growable: false);
    if (demands.map((entry) => entry.demandId).toSet().length !=
        demands.length) {
      throw const FormatException('mission_supply_demand_list_invalid');
    }
    return demands;
  }

  @override
  Future<MissionSupplyDemand> load({
    required AuthSessionOwner owner,
    required String demandId,
  }) async {
    await _requireCurrent(owner);
    final value = await BackendRepository.getMissionSupplyDemandForOwner(
      owner: owner,
      demandId: demandId,
    );
    await _requireCurrent(owner);
    final demand = MissionSupplyDemand.fromJson(value);
    if (demand.demandId != demandId) {
      throw const FormatException('mission_supply_demand_read_binding_invalid');
    }
    return demand;
  }

  @override
  Future<MissionSupplyDemandWriteResult> create({
    required AuthSessionOwner owner,
    required MissionSupplyDemandCreateContext context,
    required DateTime expiresAt,
    required String idempotencyKey,
  }) async {
    final payload = <String, dynamic>{
      'resolutionRevision': context.resolutionRevision,
      'slotKey': context.slotKey,
      'purpose': missionSupplyDemandPurpose,
      'expiresAt': expiresAt.toUtc().toIso8601String(),
    };
    await _requireCurrent(owner);
    final response = await BackendRepository.createMissionSupplyDemandForOwner(
      owner: owner,
      resolutionId: context.resolutionId,
      payload: payload,
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    final result = _writeResult(response);
    final demand = result.demand;
    if (demand.role != MissionSupplyDemandRole.requester ||
        demand.resolutionId != context.resolutionId ||
        demand.resolutionRevision != context.resolutionRevision ||
        demand.slotKey != context.slotKey ||
        demand.needKey != context.needKey ||
        demand.necessity != context.necessity ||
        demand.quantity != 1 ||
        demand.status != MissionSupplyDemandStatus.pending ||
        demand.expiresAt != expiresAt.toUtc()) {
      throw const FormatException(
          'mission_supply_demand_create_binding_invalid');
    }
    return result;
  }

  @override
  Future<MissionSupplyDemandWriteResult> respond({
    required AuthSessionOwner owner,
    required MissionSupplyDemand demand,
    required MissionSupplyDemandDecision decision,
    required String idempotencyKey,
  }) async {
    if (!demand.mayRespond) {
      throw const FormatException('mission_supply_demand_response_invalid');
    }
    await _requireCurrent(owner);
    final response =
        await BackendRepository.respondToMissionSupplyDemandForOwner(
      owner: owner,
      demandId: demand.demandId,
      payload: <String, dynamic>{
        'expectedRevision': demand.revision,
        'decision': decision.name,
      },
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    final result = _writeResult(response);
    if (result.demand.demandId != demand.demandId ||
        result.demand.role != MissionSupplyDemandRole.recipient ||
        result.demand.revision != demand.revision + 1 ||
        result.demand.status !=
            (decision == MissionSupplyDemandDecision.release
                ? MissionSupplyDemandStatus.released
                : MissionSupplyDemandStatus.rejected)) {
      throw const FormatException(
          'mission_supply_demand_response_binding_invalid');
    }
    return result;
  }

  @override
  Future<MissionSupplyDemandWriteResult> revoke({
    required AuthSessionOwner owner,
    required MissionSupplyDemand demand,
    required String idempotencyKey,
  }) async {
    if (!demand.mayRevoke) {
      throw const FormatException('mission_supply_demand_revoke_invalid');
    }
    await _requireCurrent(owner);
    final response = await BackendRepository.revokeMissionSupplyDemandForOwner(
      owner: owner,
      demandId: demand.demandId,
      payload: <String, dynamic>{'expectedRevision': demand.revision},
      idempotencyKey: idempotencyKey,
    );
    await _requireCurrent(owner);
    final result = _writeResult(response);
    if (result.demand.demandId != demand.demandId ||
        result.demand.role != MissionSupplyDemandRole.recipient ||
        result.demand.revision != demand.revision + 1 ||
        result.demand.status != MissionSupplyDemandStatus.revoked) {
      throw const FormatException(
          'mission_supply_demand_revoke_binding_invalid');
    }
    return result;
  }

  MissionSupplyDemandWriteResult _writeResult(Map<String, dynamic> response) {
    if (response.length != 2 ||
        response['demand'] is! Map ||
        response['replayed'] is! bool) {
      throw const FormatException('mission_supply_demand_write_result_invalid');
    }
    return MissionSupplyDemandWriteResult(
      demand: MissionSupplyDemand.fromJson(response['demand']),
      replayed: response['replayed'] as bool,
    );
  }
}
