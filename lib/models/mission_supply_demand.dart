const String missionSupplyDemandDomainVersion = 'P6-A-2026-10-01.1';
const String missionSupplyDemandPurpose = 'mission_gap_supply_v1';

enum MissionSupplyDemandRole { requester, recipient }

enum MissionSupplyDemandStatus {
  pending,
  rejected,
  released,
  revoked,
  expiredNoResponse,
}

enum MissionSupplyDemandDecision { reject, release }

const Set<String> _effectKeys = <String>{
  'publicShelfCreated',
  'publicListingCreated',
  'marketingContactCreated',
  'notificationCreated',
  'providerNotificationSent',
  'automaticPublicationPerformed',
  'reservationCreated',
  'bookingCreated',
  'contractCreated',
  'paymentCreated',
  'externalGenerativeAiUsed',
};

final RegExp _missionDemandIdPattern = RegExp(
  r'^mission_demand_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);
final RegExp _missionReleaseIdPattern = RegExp(
  r'^mission_release_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);

Map<String, dynamic> _object(Object? raw, String code) {
  if (raw is! Map) throw FormatException(code);
  final value = <String, dynamic>{};
  for (final entry in raw.entries) {
    if (entry.key is! String) throw FormatException(code);
    value[entry.key as String] = entry.value;
  }
  return value;
}

void _exactKeys(Map<String, dynamic> value, Set<String> expected, String code) {
  if (value.length != expected.length ||
      !value.keys.toSet().containsAll(expected)) {
    throw FormatException(code);
  }
}

String _token(Object? raw, String code, {int maximum = 240}) {
  final value = raw is String ? raw.trim() : '';
  if (value.isEmpty || value.length > maximum) throw FormatException(code);
  return value;
}

int _positiveInt(Object? raw, String code) {
  if (raw is! int || raw < 1) throw FormatException(code);
  return raw;
}

DateTime _timestamp(Object? raw, String code) {
  final value = raw is String ? raw.trim() : '';
  final parsed = DateTime.tryParse(value);
  if (parsed == null || !parsed.isUtc || parsed.toIso8601String() != value) {
    throw FormatException(code);
  }
  return parsed;
}

DateTime _date(Object? raw, String code) {
  final value = raw is String ? raw : '';
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) {
    throw FormatException(code);
  }
  final parsed = DateTime.tryParse('${value}T00:00:00.000Z');
  if (parsed == null || parsed.toIso8601String().substring(0, 10) != value) {
    throw FormatException(code);
  }
  return parsed;
}

class MissionSupplyDemandCreateContext {
  const MissionSupplyDemandCreateContext({
    required this.resolutionId,
    required this.resolutionRevision,
    required this.slotKey,
    required this.needKey,
    required this.necessity,
    required this.ordinal,
    required this.periodEnd,
  });

  final String resolutionId;
  final int resolutionRevision;
  final String slotKey;
  final String needKey;
  final String necessity;
  final int ordinal;
  final DateTime periodEnd;
}

class MissionSupplyDemandRelease {
  const MissionSupplyDemandRelease({
    required this.releaseId,
    required this.expiresAt,
    required this.visibilityStatus,
    required this.createdAt,
  });

  final String releaseId;
  final DateTime expiresAt;
  final String visibilityStatus;
  final DateTime createdAt;

  factory MissionSupplyDemandRelease.fromJson(Object? raw) {
    final value = _object(raw, 'mission_supply_release_invalid');
    _exactKeys(
        value,
        const <String>{
          'releaseId',
          'purpose',
          'expiresAt',
          'visibilityStatus',
          'createdAt',
        },
        'mission_supply_release_invalid');
    final visibility = value['visibilityStatus'];
    if (value['purpose'] != missionSupplyDemandPurpose ||
        !const <String>{'active', 'expired', 'revoked'}.contains(visibility)) {
      throw const FormatException('mission_supply_release_invalid');
    }
    final releaseId =
        _token(value['releaseId'], 'mission_supply_release_invalid');
    if (!_missionReleaseIdPattern.hasMatch(releaseId)) {
      throw const FormatException('mission_supply_release_invalid');
    }
    return MissionSupplyDemandRelease(
      releaseId: releaseId,
      expiresAt:
          _timestamp(value['expiresAt'], 'mission_supply_release_invalid'),
      visibilityStatus: visibility as String,
      createdAt:
          _timestamp(value['createdAt'], 'mission_supply_release_invalid'),
    );
  }
}

class MissionSupplyDemand {
  const MissionSupplyDemand({
    required this.demandId,
    required this.role,
    required this.missionNeedId,
    required this.resolutionId,
    required this.resolutionRevision,
    required this.slotKey,
    required this.needKey,
    required this.necessity,
    required this.quantity,
    required this.startDate,
    required this.endDate,
    required this.radiusKm,
    required this.revision,
    required this.status,
    required this.expiresAt,
    required this.release,
    required this.createdAt,
    required this.updatedAt,
  });

  final String demandId;
  final MissionSupplyDemandRole role;
  final String? missionNeedId;
  final String? resolutionId;
  final int? resolutionRevision;
  final String? slotKey;
  final String needKey;
  final String necessity;
  final int quantity;
  final DateTime startDate;
  final DateTime endDate;
  final int radiusKm;
  final int revision;
  final MissionSupplyDemandStatus status;
  final DateTime expiresAt;
  final MissionSupplyDemandRelease? release;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get mayRespond =>
      role == MissionSupplyDemandRole.recipient &&
      status == MissionSupplyDemandStatus.pending;

  bool get mayRevoke =>
      role == MissionSupplyDemandRole.recipient &&
      status == MissionSupplyDemandStatus.released &&
      release != null;

  factory MissionSupplyDemand.fromJson(Object? raw) {
    final value = _object(raw, 'mission_supply_demand_invalid');
    final role = switch (value['participantRole']) {
      'requester' => MissionSupplyDemandRole.requester,
      'recipient' => MissionSupplyDemandRole.recipient,
      _ => throw const FormatException('mission_supply_demand_invalid'),
    };
    final expected = <String>{
      'demandId',
      'domainVersion',
      'participantRole',
      'need',
      'period',
      'region',
      'purpose',
      'revision',
      'status',
      'expiresAt',
      'requestBoundRelease',
      'createdAt',
      'updatedAt',
      ..._effectKeys,
      if (role == MissionSupplyDemandRole.requester) ...<String>{
        'missionNeedId',
        'resolutionId',
        'resolutionRevision',
        'slotKey',
      },
    };
    _exactKeys(value, expected, 'mission_supply_demand_invalid');
    if (value['domainVersion'] != missionSupplyDemandDomainVersion ||
        value['purpose'] != missionSupplyDemandPurpose ||
        _effectKeys.any((key) => value[key] != false)) {
      throw const FormatException('mission_supply_demand_invalid');
    }
    final demandId = _token(value['demandId'], 'mission_supply_demand_invalid');
    if (!_missionDemandIdPattern.hasMatch(demandId)) {
      throw const FormatException('mission_supply_demand_invalid');
    }
    final need = _object(value['need'], 'mission_supply_need_invalid');
    _exactKeys(need, const <String>{'needKey', 'necessity', 'quantity'},
        'mission_supply_need_invalid');
    final necessity = need['necessity'];
    if (!const <String>{'required', 'optional'}.contains(necessity) ||
        need['quantity'] != 1) {
      throw const FormatException('mission_supply_need_invalid');
    }
    final period = _object(value['period'], 'mission_supply_period_invalid');
    _exactKeys(period, const <String>{'startDate', 'endDate'},
        'mission_supply_period_invalid');
    final start = _date(period['startDate'], 'mission_supply_period_invalid');
    final end = _date(period['endDate'], 'mission_supply_period_invalid');
    if (!end.isAfter(start) || end.difference(start).inDays > 365) {
      throw const FormatException('mission_supply_period_invalid');
    }
    final region = _object(value['region'], 'mission_supply_region_invalid');
    _exactKeys(
        region,
        const <String>{
          'sourceType',
          'radiusKm',
          'exactCoordinatesStored',
        },
        'mission_supply_region_invalid');
    if (region['sourceType'] != 'owner_confirmed_search_origin' ||
        region['exactCoordinatesStored'] != false ||
        region['radiusKm'] is! int ||
        (region['radiusKm'] as int) < 1 ||
        (region['radiusKm'] as int) > 500) {
      throw const FormatException('mission_supply_region_invalid');
    }
    final status = switch (value['status']) {
      'pending' => MissionSupplyDemandStatus.pending,
      'rejected' => MissionSupplyDemandStatus.rejected,
      'released' => MissionSupplyDemandStatus.released,
      'revoked' => MissionSupplyDemandStatus.revoked,
      'expired_no_response' => MissionSupplyDemandStatus.expiredNoResponse,
      _ => throw const FormatException('mission_supply_demand_invalid'),
    };
    final release = value['requestBoundRelease'] == null
        ? null
        : MissionSupplyDemandRelease.fromJson(value['requestBoundRelease']);
    if ((const <MissionSupplyDemandStatus>{
          MissionSupplyDemandStatus.released,
          MissionSupplyDemandStatus.revoked,
        }.contains(status)) !=
        (release != null)) {
      throw const FormatException('mission_supply_demand_invalid');
    }
    if ((status == MissionSupplyDemandStatus.revoked &&
            release?.visibilityStatus != 'revoked') ||
        (status == MissionSupplyDemandStatus.released &&
            release?.visibilityStatus == 'revoked')) {
      throw const FormatException('mission_supply_demand_invalid');
    }
    final expiresAt =
        _timestamp(value['expiresAt'], 'mission_supply_demand_invalid');
    if (release != null && release.expiresAt != expiresAt) {
      throw const FormatException('mission_supply_demand_invalid');
    }
    final createdAt =
        _timestamp(value['createdAt'], 'mission_supply_demand_invalid');
    final updatedAt =
        _timestamp(value['updatedAt'], 'mission_supply_demand_invalid');
    if (updatedAt.isBefore(createdAt)) {
      throw const FormatException('mission_supply_demand_invalid');
    }
    return MissionSupplyDemand(
      demandId: demandId,
      role: role,
      missionNeedId: role == MissionSupplyDemandRole.requester
          ? _token(value['missionNeedId'], 'mission_supply_demand_invalid')
          : null,
      resolutionId: role == MissionSupplyDemandRole.requester
          ? _token(value['resolutionId'], 'mission_supply_demand_invalid')
          : null,
      resolutionRevision: role == MissionSupplyDemandRole.requester
          ? _positiveInt(
              value['resolutionRevision'], 'mission_supply_demand_invalid')
          : null,
      slotKey: role == MissionSupplyDemandRole.requester
          ? _token(value['slotKey'], 'mission_supply_demand_invalid')
          : null,
      needKey: _token(need['needKey'], 'mission_supply_need_invalid'),
      necessity: necessity as String,
      quantity: 1,
      startDate: start,
      endDate: end,
      radiusKm: region['radiusKm'] as int,
      revision:
          _positiveInt(value['revision'], 'mission_supply_demand_invalid'),
      status: status,
      expiresAt: expiresAt,
      release: release,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}
